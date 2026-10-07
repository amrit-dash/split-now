/**
 * Security-rule tests. Run with: npm run test:rules (starts the Firestore emulator; needs Java 11+).
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { arrayUnion, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

const group = {
  id: 'g1', name: 'Trip', emoji: '🏝️', type: 'trip', currency: 'AUD', simplify: true,
  memberUids: ['alice'],
  members: { alice: { name: 'Alice', uid: 'alice', color: '#000' }, p_bob: { name: 'Bob', color: '#111' } },
  inviteCode: 'ABC234', createdBy: 'alice', createdAt: 1, updatedAt: 1,
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
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'groups/g1'), group))
})

const db = (uid?: string) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore())

describe('groups', () => {
  it('members can read, others cannot', async () => {
    await assertSucceeds(getDoc(doc(db('alice'), 'groups/g1')))
    await assertFails(getDoc(doc(db('mallory'), 'groups/g1')))
    await assertFails(getDoc(doc(db(), 'groups/g1')))
  })

  it('creator must be a member', async () => {
    await assertSucceeds(setDoc(doc(db('carol'), 'groups/g2'), { ...group, id: 'g2', memberUids: ['carol'], createdBy: 'carol' }))
    await assertFails(setDoc(doc(db('carol'), 'groups/g3'), { ...group, id: 'g3', memberUids: ['alice'], createdBy: 'carol' }))
  })

  it('members cannot change the invite code', async () => {
    await assertFails(updateDoc(doc(db('alice'), 'groups/g1'), { inviteCode: 'ZZZZZZ' }))
    await assertSucceeds(updateDoc(doc(db('alice'), 'groups/g1'), { name: 'Renamed' }))
  })
})

describe('joining', () => {
  const join = (uid: string, code: string, memberId: string, extra: Record<string, unknown> = {}) =>
    updateDoc(doc(db(uid), 'groups/g1'), {
      memberUids: arrayUnion(uid),
      [`members.${memberId}`]: { name: 'Bob', uid, color: '#111' },
      joinCode: code, joinMemberId: memberId, updatedAt: 2, ...extra,
    })

  it('can claim a placeholder with the right code', async () => {
    await assertSucceeds(join('bob', 'ABC234', 'p_bob'))
  })
  it('can join as a new member', async () => {
    await assertSucceeds(join('bob', 'ABC234', 'bob'))
  })
  it('rejects a wrong code', async () => {
    await assertFails(join('bob', 'WRONG1', 'p_bob'))
  })
  it('cannot take over a claimed member', async () => {
    await assertFails(join('mallory', 'ABC234', 'alice'))
  })
  it('cannot change other fields while joining', async () => {
    await assertFails(join('bob', 'ABC234', 'p_bob', { name: 'Hijacked' }))
  })
  it('cannot add someone else’s uid', async () => {
    await assertFails(updateDoc(doc(db('bob'), 'groups/g1'), {
      memberUids: arrayUnion('bob', 'mallory'), 'members.p_bob': { name: 'Bob', uid: 'bob', color: '#111' },
      joinCode: 'ABC234', joinMemberId: 'p_bob',
    }))
  })
})

describe('expenses', () => {
  const expense = { id: 'e1', groupId: 'g1', description: 'Dinner', amount: 1000, paidBy: { alice: 1000 }, splits: { alice: 500, p_bob: 500 } }
  it('members can write, others cannot', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), 'groups/g1/expenses/e1'), expense))
    await assertFails(setDoc(doc(db('mallory'), 'groups/g1/expenses/e2'), { ...expense, id: 'e2' }))
    await assertFails(getDoc(doc(db('mallory'), 'groups/g1/expenses/e1')))
  })
  it('amount must be a positive integer (cents)', async () => {
    await assertFails(setDoc(doc(db('alice'), 'groups/g1/expenses/e3'), { ...expense, amount: 10.5 }))
    await assertFails(setDoc(doc(db('alice'), 'groups/g1/expenses/e4'), { ...expense, amount: -5 }))
  })
})

describe('users', () => {
  it('only the owner writes their profile', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), 'users/alice'), { uid: 'alice', displayName: 'A', currency: 'AUD' }))
    await assertFails(setDoc(doc(db('mallory'), 'users/alice'), { uid: 'alice', displayName: 'X', currency: 'AUD' }))
    await assertSucceeds(getDoc(doc(db('bob'), 'users/alice')))
  })
})
