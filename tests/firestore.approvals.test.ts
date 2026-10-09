/**
 * Rule tests for "Needs your OK": per-currency default thresholds, an edit that brings an
 * expense under the threshold (requiresApproval may then be dropped), and the user's
 * "Ask for approval on big expenses" setting on their profile. Run with: npm run test:rules
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteField, doc, setDoc, updateDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

// alice created the group (approval on, A$100 explicit threshold); bob joined; p_cat is a placeholder.
const group = {
  id: 'g1',
  name: 'Trip',
  emoji: '🏝️',
  type: 'trip',
  currency: 'AUD',
  simplify: true,
  requireApproval: true,
  approvalThreshold: 10000,
  memberUids: ['alice', 'bob'],
  members: {
    alice: { name: 'Alice', uid: 'alice', color: '#000' },
    bob: { name: 'Bob', uid: 'bob', color: '#111' },
    p_cat: { name: 'Cat', color: '#222' },
  },
  inviteCode: 'ABCD2345',
  createdBy: 'alice',
  createdAt: 1,
  updatedAt: 1,
}
const money = (amount: number) => ({ amount, paidBy: { bob: amount }, splits: { alice: amount - Math.floor(amount / 2), bob: Math.floor(amount / 2) } })
const big = {
  id: 'e2',
  groupId: 'g1',
  description: 'Hotel',
  category: 'stay',
  date: '2026-10-01',
  createdBy: 'bob',
  createdAt: 1,
  updatedAt: 1,
  ...money(30000),
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-splitit',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(() => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await seed('groups/g1', group)
})

const db = (uid: string) => env.authenticatedContext(uid).firestore()
const exp = (uid: string, id = 'e2') => doc(db(uid), `groups/g1/expenses/${id}`)
const seed = (path: string, data: Record<string, unknown>) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data))

describe('dropping requiresApproval on edit', () => {
  beforeEach(() => seed('groups/g1/expenses/e2', { ...big, requiresApproval: true, approvals: { alice: true } }))

  it('cannot drop it while the amount is still above the threshold', async () => {
    await assertFails(updateDoc(exp('bob'), { requiresApproval: deleteField(), description: 'Hotel (2 nights)' }))
    await assertFails(updateDoc(exp('bob'), { ...money(20000), requiresApproval: deleteField() }))
    await assertFails(updateDoc(exp('bob'), { ...money(20000), requiresApproval: false }))
  })
  it('can drop it when the edit brings the amount to the threshold or below', async () => {
    await assertSucceeds(updateDoc(exp('bob'), { ...money(10000), requiresApproval: deleteField(), approvals: deleteField() }))
  })
  it('can drop it below the threshold with a full set, too', async () => {
    const { requiresApproval: _r, ...rest } = { ...big, ...money(5000), requiresApproval: true }
    await assertSucceeds(setDoc(exp('alice'), { ...rest, approvals: { alice: true } }))
  })
  it('can drop it once the group no longer asks for approval', async () => {
    await seed('groups/g1', { ...group, requireApproval: false })
    await assertSucceeds(updateDoc(exp('bob'), { requiresApproval: deleteField(), description: 'Hotel (2 nights)' }))
  })
  it('an amount change above the threshold still needs the mark', async () => {
    await seed('groups/g1/expenses/e3', { ...big, id: 'e3', ...money(5000) })
    await assertFails(updateDoc(exp('bob', 'e3'), money(40000)))
    await assertSucceeds(updateDoc(exp('bob', 'e3'), { ...money(40000), requiresApproval: true }))
  })
  it('an edit still cannot add someone else’s approval while dropping the mark', async () => {
    await assertFails(updateDoc(exp('bob'), { ...money(5000), requiresApproval: deleteField(), approvals: { alice: true, bob: true } }))
  })
})

describe('default threshold by currency (no approvalThreshold on the group)', () => {
  const { approvalThreshold: _t, ...noThreshold } = group
  it('INR: ₹2,000', async () => {
    await seed('groups/g1', { ...noThreshold, currency: 'INR' })
    // ₹1,500 needs no OK in an INR group (the old flat default, 10,000 paise, would have asked)
    await assertSucceeds(setDoc(exp('bob', 'e4'), { ...big, id: 'e4', ...money(150000) }))
    await assertFails(setDoc(exp('bob', 'e5'), { ...big, id: 'e5', ...money(200001) }))
    await assertSucceeds(setDoc(exp('bob', 'e5'), { ...big, id: 'e5', ...money(200001), requiresApproval: true }))
  })
  it('JPY: ¥10,000 (no minor digits)', async () => {
    await seed('groups/g1', { ...noThreshold, currency: 'JPY' })
    await assertSucceeds(setDoc(exp('bob', 'e4'), { ...big, id: 'e4', ...money(10000) }))
    await assertFails(setDoc(exp('bob', 'e5'), { ...big, id: 'e5', ...money(10001) }))
  })
  it('a currency off the table: the flat fallback', async () => {
    await seed('groups/g1', { ...noThreshold, currency: 'KES' })
    await assertFails(setDoc(exp('bob', 'e5'), { ...big, id: 'e5', ...money(10001) }))
    await assertSucceeds(setDoc(exp('bob', 'e4'), { ...big, id: 'e4', ...money(10000) }))
  })
  it('the INR default also decides when the mark may be dropped', async () => {
    await seed('groups/g1', { ...noThreshold, currency: 'INR' })
    await seed('groups/g1/expenses/e2', { ...big, ...money(300000), requiresApproval: true })
    await assertFails(updateDoc(exp('bob'), { ...money(250000), requiresApproval: deleteField() }))
    await assertSucceeds(updateDoc(exp('bob'), { ...money(150000), requiresApproval: deleteField() }))
  })
})

describe('users/{uid}.approvalDefault', () => {
  const profile = { uid: 'bob', displayName: 'Bob', currency: 'INR' }
  const me = () => doc(db('bob'), 'users/bob')
  it('accepts { on, amount, currency }', async () => {
    await assertSucceeds(setDoc(me(), { ...profile, approvalDefault: { on: true, amount: 200000, currency: 'INR' } }))
    await assertSucceeds(setDoc(me(), { ...profile, approvalDefault: { on: false, amount: 2000, currency: 'USD' } }, { merge: true }))
    await assertSucceeds(setDoc(me(), profile))
  })
  it('refuses a bad shape, type or size', async () => {
    await assertFails(setDoc(me(), { ...profile, approvalDefault: true }))
    await assertFails(setDoc(me(), { ...profile, approvalDefault: { on: true, amount: 200000 } }))
    await assertFails(setDoc(me(), { ...profile, approvalDefault: { on: true, amount: 200000, currency: 'INR', extra: 1 } }))
    await assertFails(setDoc(me(), { ...profile, approvalDefault: { on: 'yes', amount: 200000, currency: 'INR' } }))
    await assertFails(setDoc(me(), { ...profile, approvalDefault: { on: true, amount: 0, currency: 'INR' } }))
    await assertFails(setDoc(me(), { ...profile, approvalDefault: { on: true, amount: 12.5, currency: 'INR' } }))
    await assertFails(setDoc(me(), { ...profile, approvalDefault: { on: true, amount: 100000000001, currency: 'INR' } }))
    await assertFails(setDoc(me(), { ...profile, approvalDefault: { on: true, amount: 200000, currency: 'RUPEE' } }))
  })
  it('only on the user’s own profile', async () => {
    await assertFails(setDoc(doc(db('alice'), 'users/bob'), { ...profile, approvalDefault: { on: true, amount: 200000, currency: 'INR' } }))
  })
})
