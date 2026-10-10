/**
 * Rule tests for "Payments need the recipient's OK" (shared/payment-ok.ts): the group setting,
 * needsOk on a new payment, the payee's OK and flag, and fields only the server writes.
 * Run with: npm run test:rules
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteField, doc, setDoc, updateDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

// alice and bob have accounts, cat is a placeholder; dan left. The group asks for the payee's OK.
const group = {
  id: 'g1',
  name: 'Flat',
  emoji: '🏠',
  type: 'home',
  currency: 'INR',
  simplify: true,
  paymentApproval: true,
  memberUids: ['alice', 'bob'],
  members: {
    alice: { name: 'Alice', uid: 'alice', color: '#000' },
    bob: { name: 'Bob', uid: 'bob', color: '#111' },
    p_cat: { name: 'Cat', color: '#222' },
    dan: { name: 'Dan', uid: 'dan', color: '#333', removedAt: 5 },
  },
  inviteCode: 'FLAT2345',
  createdBy: 'alice',
  createdAt: 1,
  updatedAt: 1,
}
/** bob says he paid alice ₹500 */
const payment = (o: Record<string, unknown> = {}) => ({
  id: 's1',
  groupId: 'g1',
  from: 'bob',
  to: 'alice',
  amount: 50000,
  method: 'UPI',
  date: '2026-10-10',
  createdBy: 'bob',
  createdAt: 1,
  ...o,
})

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
const st = (uid: string, id = 's1') => doc(db(uid), `groups/g1/settlements/${id}`)
const seed = (path: string, data: Record<string, unknown>) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data))

describe('the group setting', () => {
  it('any member may turn it on or off; it is a boolean', async () => {
    await assertSucceeds(updateDoc(doc(db('bob'), 'groups/g1'), { paymentApproval: false, updatedAt: 2 }))
    await assertSucceeds(updateDoc(doc(db('alice'), 'groups/g1'), { paymentApproval: true, updatedAt: 3 }))
    await assertFails(updateDoc(doc(db('alice'), 'groups/g1'), { paymentApproval: 'yes', updatedAt: 4 }))
  })
})

describe('a new payment', () => {
  it('recorded by the payer must wait for the payee’s OK', async () => {
    await assertFails(setDoc(st('bob'), payment()))
    await assertFails(setDoc(st('bob'), payment({ needsOk: false })))
    await assertSucceeds(setDoc(st('bob'), payment({ needsOk: true })))
  })
  it('recorded by the payee, or to a placeholder or someone who left, needs no OK (and can’t carry the mark)', async () => {
    await assertSucceeds(setDoc(st('alice'), payment({ createdBy: 'alice' })))
    await assertFails(setDoc(st('alice', 's2'), payment({ id: 's2', createdBy: 'alice', needsOk: true })))
    await assertSucceeds(setDoc(st('bob', 's3'), payment({ id: 's3', to: 'p_cat' })))
    await assertSucceeds(setDoc(st('bob', 's4'), payment({ id: 's4', to: 'dan' })))
  })
  it('with the setting off, nothing waits', async () => {
    await seed('groups/g1', { ...group, paymentApproval: false })
    await assertSucceeds(setDoc(st('bob'), payment()))
    await assertFails(setDoc(st('bob', 's2'), payment({ id: 's2', needsOk: true })))
  })
  it('an import is exempt', async () => {
    await assertSucceeds(setDoc(st('bob'), payment({ importedFrom: 'splitwise' })))
  })
  it('can’t arrive OK’d, flagged or checked; a screenshot sits at its own path', async () => {
    await assertFails(setDoc(st('bob'), payment({ needsOk: true, ok: { by: 'bob', at: 1, via: 'payee' } })))
    await assertFails(setDoc(st('bob'), payment({ needsOk: true, flag: { by: 'bob', at: 1 } })))
    await assertFails(setDoc(st('bob'), payment({ needsOk: true, aiCheck: { verdict: 'match', reasons: [], at: 1 } })))
    await assertFails(setDoc(st('bob'), payment({ needsOk: true, proofPath: 'settleproofs/g1/other.jpg' })))
    await assertSucceeds(setDoc(st('bob'), payment({ needsOk: true, proofPath: 'settleproofs/g1/s1.jpg' })))
  })
})

describe('the payee’s OK and flag', () => {
  beforeEach(() => seed('groups/g1/settlements/s1', payment({ needsOk: true })))

  it('the payee gives the OK as themselves', async () => {
    await assertSucceeds(updateDoc(st('alice'), { ok: { by: 'alice', at: 2, via: 'payee' } }))
  })
  it('nobody else can, and not as the server', async () => {
    await assertFails(updateDoc(st('bob'), { ok: { by: 'bob', at: 2, via: 'payee' } }))
    await assertFails(updateDoc(st('bob'), { ok: { by: 'alice', at: 2, via: 'payee' } }))
    await assertFails(updateDoc(st('alice'), { ok: { by: 'alice', at: 2, via: 'ai' } }))
    await assertFails(updateDoc(st('alice'), { aiCheck: { verdict: 'match', reasons: [], at: 2 } }))
  })
  it('the payee flags it (dropping an OK), and can OK it again (dropping the flag)', async () => {
    await seed('groups/g1/settlements/s1', payment({ needsOk: true, ok: { by: 'ai', at: 2, via: 'ai' } }))
    await assertFails(updateDoc(st('alice'), { flag: { by: 'alice', at: 3, reason: 'Not received' } }))
    await assertSucceeds(updateDoc(st('alice'), { flag: { by: 'alice', at: 3, reason: 'Not received' }, ok: deleteField() }))
    await assertFails(updateDoc(st('alice'), { ok: { by: 'alice', at: 4, via: 'payee' } }))
    await assertSucceeds(updateDoc(st('alice'), { ok: { by: 'alice', at: 4, via: 'payee' }, flag: deleteField() }))
  })
  it('the payer can’t clear a flag or drop the mark, and an OK can’t ride along an edit', async () => {
    await seed('groups/g1/settlements/s1', payment({ needsOk: true, flag: { by: 'alice', at: 3 } }))
    await assertFails(updateDoc(st('bob'), { flag: deleteField() }))
    await assertFails(updateDoc(st('bob'), { needsOk: deleteField() }))
    await assertFails(updateDoc(st('alice'), { ok: { by: 'alice', at: 4, via: 'payee' }, flag: deleteField(), amount: 1 }))
  })
  it('a payment that never needed an OK has nothing to decide', async () => {
    await seed('groups/g1/settlements/s2', payment({ id: 's2' }))
    await assertFails(updateDoc(st('alice', 's2'), { ok: { by: 'alice', at: 2, via: 'payee' } }))
  })
  it('either of them can still delete it (trash)', async () => {
    await assertSucceeds(updateDoc(st('bob'), { deletedAt: 5, deletedBy: 'bob' }))
  })
})

describe('activity', () => {
  it('members log settlement.approved and settlement.flagged as themselves', async () => {
    const entry = (type: string) => ({ type, actorUid: 'alice', actorName: 'Alice', targetId: 's1', summary: 'Alice OK’d Bob’s ₹500', createdAt: 2 })
    await assertSucceeds(setDoc(doc(db('alice'), 'groups/g1/activity/a1'), entry('settlement.approved')))
    await assertSucceeds(setDoc(doc(db('alice'), 'groups/g1/activity/a2'), entry('settlement.flagged')))
    await assertFails(setDoc(doc(db('alice'), 'groups/g1/activity/a3'), entry('settlement.verified')))
  })
})
