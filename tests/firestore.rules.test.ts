/**
 * Security-rule tests. Run with: npm run test:rules (starts the Firestore emulator; needs Java 11+).
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch } from 'firebase/firestore'

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

describe('expense comments', () => {
  const expense = { id: 'e1', groupId: 'g1', description: 'Dinner', amount: 1000, paidBy: { alice: 1000 }, splits: { alice: 500, bob: 500 } }
  const path = 'groups/g1/expenses/e1/comments'
  const comment = (uid: string, extra: Record<string, unknown> = {}) => ({ text: 'Was tip included?', authorUid: uid, authorName: 'Someone', createdAt: 1, ...extra })

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore()
      await setDoc(doc(fs, 'groups/g1'), { ...group, memberUids: ['alice', 'bob'], members: { ...group.members, bob: { name: 'Bob', uid: 'bob', color: '#111' } } })
      await setDoc(doc(fs, 'groups/g1/expenses/e1'), expense)
      await setDoc(doc(fs, `${path}/c_alice`), comment('alice'))
    })
  })

  it('members can read and create, others cannot', async () => {
    await assertSucceeds(getDocs(collection(db('bob'), path)))
    await assertSucceeds(setDoc(doc(db('bob'), `${path}/c1`), comment('bob')))
    await assertFails(getDocs(collection(db('mallory'), path)))
    await assertFails(getDoc(doc(db('mallory'), `${path}/c_alice`)))
    await assertFails(setDoc(doc(db('mallory'), `${path}/c2`), comment('mallory')))
    await assertFails(setDoc(doc(db(), `${path}/c3`), comment('alice')))
  })

  it('cannot post as someone else', async () => {
    await assertFails(setDoc(doc(db('bob'), `${path}/c4`), comment('alice')))
  })

  it('validates the comment shape', async () => {
    await assertFails(setDoc(doc(db('bob'), `${path}/c5`), comment('bob', { text: '' })))
    await assertFails(setDoc(doc(db('bob'), `${path}/c6`), comment('bob', { text: 'x'.repeat(2001) })))
    await assertFails(setDoc(doc(db('bob'), `${path}/c7`), comment('bob', { pinned: true })))
    await assertFails(setDoc(doc(db('bob'), `${path}/c8`), comment('bob', { createdAt: 'yesterday' })))
  })

  it('comments cannot be edited', async () => {
    await assertFails(updateDoc(doc(db('alice'), `${path}/c_alice`), { text: 'edited' }))
  })

  it('only the author can delete', async () => {
    await assertFails(deleteDoc(doc(db('bob'), `${path}/c_alice`)))
    await assertFails(deleteDoc(doc(db('mallory'), `${path}/c_alice`)))
    await assertSucceeds(deleteDoc(doc(db('alice'), `${path}/c_alice`)))
  })

  it('members can remove others’ comments together with the expense', async () => {
    const fs = db('bob')
    const batch = writeBatch(fs)
    batch.delete(doc(fs, `${path}/c_alice`))
    batch.delete(doc(fs, 'groups/g1/expenses/e1'))
    await assertSucceeds(batch.commit())
  })

  it('non-members cannot use the expense-deletion path', async () => {
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'groups/g1/expenses/e1')))
    await assertFails(deleteDoc(doc(db('mallory'), `${path}/c_alice`)))
    await assertSucceeds(deleteDoc(doc(db('bob'), `${path}/c_alice`)))
  })
})

describe('recurring catch-up', () => {
  it('two members writing the same deterministic occurrence id both succeed', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'groups/g1'), { ...group, memberUids: ['alice', 'bob'] }))
    const occ = { id: 'e1_2026-02-28', groupId: 'g1', description: 'Rent', amount: 1000, recurringFrom: 'e1' }
    await assertSucceeds(setDoc(doc(db('alice'), 'groups/g1/expenses/e1_2026-02-28'), occ))
    await assertSucceeds(setDoc(doc(db('bob'), 'groups/g1/expenses/e1_2026-02-28'), occ))
  })

  it('occurrences and the advanced template commit in one batch', async () => {
    const tpl = { id: 'e1', groupId: 'g1', description: 'Rent', amount: 1000, date: '2026-01-31', recurrence: { freq: 'monthly', nextDate: '2026-02-28' } }
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'groups/g1/expenses/e1'), tpl))
    const fs = db('alice')
    const batch = writeBatch(fs)
    batch.set(doc(fs, 'groups/g1/expenses/e1_2026-02-28'), { ...tpl, id: 'e1_2026-02-28', date: '2026-02-28', recurrence: null, recurringFrom: 'e1' })
    batch.update(doc(fs, 'groups/g1/expenses/e1'), { recurrence: { freq: 'monthly', nextDate: '2026-03-31' } })
    await assertSucceeds(batch.commit())
    await assertSucceeds(updateDoc(doc(fs, 'groups/g1/expenses/e1'), { recurrence: deleteField() }))
  })
})

describe('users', () => {
  it('only the owner writes their profile', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), 'users/alice'), { uid: 'alice', displayName: 'A', currency: 'AUD' }))
    await assertFails(setDoc(doc(db('mallory'), 'users/alice'), { uid: 'alice', displayName: 'X', currency: 'AUD' }))
    await assertSucceeds(getDoc(doc(db('bob'), 'users/alice')))
  })
})
