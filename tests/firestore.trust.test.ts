/**
 * Rule tests for the trust features: append-only activity log, soft delete / purge,
 * disputes (flags) and approvals. Run with: npm run test:rules
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { FieldPath, collection, deleteDoc, deleteField, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch } from 'firebase/firestore'

let env: RulesTestEnvironment

// alice created the group; bob and dan joined; p_cat is a placeholder.
const group = {
  id: 'g1', name: 'Trip', emoji: '🏝️', type: 'trip', currency: 'AUD', simplify: true,
  memberUids: ['alice', 'bob', 'dan'],
  members: {
    alice: { name: 'Alice', uid: 'alice', color: '#000' },
    bob: { name: 'Bob', uid: 'bob', color: '#111' },
    dan: { name: 'Dan', uid: 'dan', color: '#333' },
    p_cat: { name: 'Cat', color: '#222' },
  },
  inviteCode: 'ABCD2345', createdBy: 'alice', createdAt: 1, updatedAt: 1,
}
// dan is not part of this expense
const expense = {
  id: 'e1', groupId: 'g1', description: 'Dinner', amount: 9000, category: 'food', date: '2026-10-01',
  paidBy: { alice: 9000 }, splits: { alice: 3000, bob: 3000, p_cat: 3000 }, createdBy: 'alice', createdAt: 1, updatedAt: 1,
}
const settlement = { id: 's1', groupId: 'g1', from: 'bob', to: 'alice', amount: 500, method: 'Cash', date: '2026-10-01', createdBy: 'bob', createdAt: 1 }
const entry = (actorUid: string, extra: Record<string, unknown> = {}) => ({
  type: 'expense.updated', actorUid, actorName: 'Someone', targetId: 'e1',
  summary: 'Someone changed amount A$80.00 → A$84.00 on “Dinner”', before: { amount: 8000 }, after: { amount: 8400 }, createdAt: 2, ...extra,
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
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore()
    await setDoc(doc(fs, 'groups/g1'), group)
    await setDoc(doc(fs, 'groups/g1/expenses/e1'), expense)
    await setDoc(doc(fs, 'groups/g1/settlements/s1'), settlement)
    await setDoc(doc(fs, 'groups/g1/activity/a0'), entry('alice'))
  })
})

const db = (uid?: string) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore())
const e1 = (uid: string, id = 'e1') => doc(db(uid), `groups/g1/expenses/${id}`)
const s1 = (uid: string) => doc(db(uid), 'groups/g1/settlements/s1')
const seed = (path: string, data: Record<string, unknown>) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data))

describe('activity log', () => {
  it('members read it; outsiders cannot', async () => {
    await assertSucceeds(getDocs(collection(db('dan'), 'groups/g1/activity')))
    await assertFails(getDocs(collection(db('mallory'), 'groups/g1/activity')))
  })
  it('members create entries only as themselves', async () => {
    await assertSucceeds(setDoc(doc(db('bob'), 'groups/g1/activity/a1'), entry('bob')))
    await assertFails(setDoc(doc(db('bob'), 'groups/g1/activity/a2'), entry('alice')))
    await assertFails(setDoc(doc(db('mallory'), 'groups/g1/activity/a3'), entry('mallory')))
  })
  it('entries are validated', async () => {
    await assertFails(setDoc(doc(db('bob'), 'groups/g1/activity/a4'), entry('bob', { extra: 1 })))
    await assertFails(setDoc(doc(db('bob'), 'groups/g1/activity/a5'), entry('bob', { summary: 'x'.repeat(501) })))
    await assertFails(setDoc(doc(db('bob'), 'groups/g1/activity/a6'), entry('bob', { createdAt: 'now' })))
    const { summary: _s, ...noSummary } = entry('bob')
    await assertFails(setDoc(doc(db('bob'), 'groups/g1/activity/a7'), noSummary))
  })
  it('entries are never edited or deleted (not even by the creator)', async () => {
    await assertFails(updateDoc(doc(db('alice'), 'groups/g1/activity/a0'), { summary: 'rewritten' }))
    await assertFails(setDoc(doc(db('alice'), 'groups/g1/activity/a0'), entry('alice', { summary: 'rewritten' })))
    await assertFails(deleteDoc(doc(db('alice'), 'groups/g1/activity/a0')))
    await assertFails(deleteDoc(doc(db('bob'), 'groups/g1/activity/a0')))
  })
  it('the creator deletes it together with the group', async () => {
    const fs = db('alice')
    const b = writeBatch(fs)
    b.delete(doc(fs, 'groups/g1/activity/a0'))
    b.delete(doc(fs, 'groups/g1'))
    await assertSucceeds(b.commit())
  })
  it('an edit and its entry commit in one batch', async () => {
    const fs = db('bob')
    const b = writeBatch(fs)
    b.set(doc(fs, 'groups/g1/expenses/e1'), { ...expense, amount: 9300, paidBy: { alice: 9300 }, splits: { alice: 3100, bob: 3100, p_cat: 3100 } })
    b.set(doc(fs, 'groups/g1/activity/a8'), entry('bob'))
    b.update(doc(fs, 'groups/g1'), { updatedAt: 3 })
    await assertSucceeds(b.commit())
  })
})

describe('soft delete (trash)', () => {
  const trash = (by: string) => ({ deletedAt: 5, deletedBy: by })
  it('any member can trash, recording themselves as deletedBy', async () => {
    await assertSucceeds(updateDoc(e1('bob'), trash('bob')))
  })
  it('cannot trash in someone else’s name, or change other fields while trashing', async () => {
    await assertFails(updateDoc(e1('bob'), trash('alice')))
    await assertFails(updateDoc(e1('bob'), { ...trash('bob'), amount: 1 }))
    await assertFails(updateDoc(e1('bob'), { deletedAt: 'yesterday', deletedBy: 'bob' }))
  })
  it('any member can restore', async () => {
    await seed('groups/g1/expenses/e1', { ...expense, ...trash('bob') })
    await assertFails(updateDoc(e1('dan'), { deletedAt: deleteField() })) // both fields go together
    await assertSucceeds(updateDoc(e1('dan'), { deletedAt: deleteField(), deletedBy: deleteField() }))
  })
  it('a normal edit cannot trash or untrash', async () => {
    await assertFails(setDoc(e1('bob'), { ...expense, ...trash('bob'), description: 'x' }))
    await seed('groups/g1/expenses/e1', { ...expense, ...trash('bob') })
    await assertFails(setDoc(e1('bob'), { ...expense, description: 'x' }))
  })
  it('cannot create an item already trashed, flagged or approved', async () => {
    await assertFails(setDoc(e1('bob', 'e2'), { ...expense, id: 'e2', createdBy: 'bob', ...trash('bob') }))
    await assertFails(setDoc(e1('bob', 'e3'), { ...expense, id: 'e3', createdBy: 'bob', approvals: { alice: true } }))
    await assertFails(setDoc(doc(db('bob'), 'groups/g1/settlements/s2'), { ...settlement, id: 's2', ...trash('bob') }))
  })
  it('comments of a trashed expense keep working', async () => {
    await seed('groups/g1/expenses/e1', { ...expense, ...trash('bob') })
    await assertSucceeds(setDoc(doc(db('bob'), 'groups/g1/expenses/e1/comments/c1'), { text: 'oops', authorUid: 'bob', authorName: 'Bob', createdAt: 1 }))
    await assertSucceeds(getDocs(collection(db('alice'), 'groups/g1/expenses/e1/comments')))
  })
  it('purge: only the deleter or the group creator', async () => {
    await seed('groups/g1/expenses/e1', { ...expense, ...trash('bob') })
    await assertFails(deleteDoc(e1('dan')))
    await assertFails(deleteDoc(e1('mallory')))
    await assertSucceeds(deleteDoc(e1('bob')))
    await seed('groups/g1/expenses/e1', { ...expense, ...trash('bob') })
    await assertSucceeds(deleteDoc(e1('alice')))
  })
  it('an expense that is not in the trash can only be hard-deleted by the creator', async () => {
    await assertFails(deleteDoc(e1('bob')))
    await assertSucceeds(deleteDoc(e1('alice')))
  })
  it('settlements: trash, restore, purge', async () => {
    await assertFails(updateDoc(s1('dan'), trash('bob')))
    await assertSucceeds(updateDoc(s1('dan'), trash('dan')))
    await assertFails(deleteDoc(s1('bob')))
    await assertSucceeds(updateDoc(s1('bob'), { deletedAt: deleteField(), deletedBy: deleteField() }))
    await assertSucceeds(updateDoc(s1('bob'), trash('bob')))
    await assertSucceeds(deleteDoc(s1('bob')))
  })
  it('a settlement edit cannot touch the trash fields', async () => {
    await assertFails(setDoc(s1('bob'), { ...settlement, ...trash('bob'), note: 'x' }))
  })
})

describe('disputes', () => {
  const flag = (uid: string, memberId: string, extra: Record<string, unknown> = {}) => ({ byUid: uid, memberId, reason: 'I wasn’t there', at: 3, ...extra })
  const setFlag = (as: string, key: string, value: unknown) => updateDoc(e1(as), new FieldPath('dispute', key), value)

  it('a member who is part of the expense can flag it', async () => {
    await assertSucceeds(setFlag('bob', 'bob', flag('bob', 'bob')))
    await assertSucceeds(setFlag('alice', 'alice', flag('alice', 'alice'))) // payer
    const d = (await getDoc(e1('alice'))).data()!
    if (Object.keys(d.dispute).length !== 2) throw new Error('both flags should be kept')
  })
  it('a member not in the expense cannot flag it', async () => {
    await assertFails(setFlag('dan', 'dan', flag('dan', 'dan')))
  })
  it('must flag as themselves', async () => {
    await assertFails(setFlag('bob', 'bob', flag('bob', 'alice'))) // someone else's member id
    await assertFails(setFlag('bob', 'bob', flag('alice', 'bob'))) // byUid mismatch
    await assertFails(setFlag('bob', 'alice', flag('alice', 'alice'))) // someone else's key
    await assertFails(setFlag('bob', 'bob', flag('bob', 'p_cat'))) // a placeholder's id
  })
  it('flags are validated', async () => {
    await assertFails(setFlag('bob', 'bob', flag('bob', 'bob', { reason: '' })))
    await assertFails(setFlag('bob', 'bob', flag('bob', 'bob', { reason: 'x'.repeat(501) })))
    await assertFails(setFlag('bob', 'bob', flag('bob', 'bob', { extra: true })))
  })
  it('flagging cannot change anything else', async () => {
    await assertFails(updateDoc(e1('bob'), { [`dispute.bob`]: flag('bob', 'bob'), amount: 1 }))
    await assertFails(updateDoc(e1('bob'), { [`dispute.bob`]: flag('bob', 'bob'), description: 'Bad dinner' }))
  })
  it('trust writes cannot change the foreign-currency original; edits still validate it', async () => {
    const original = { currency: 'THB', amount: 210000, rate: 0.0428, rateDate: '2026-10-01', source: 'ecb' }
    await assertFails(updateDoc(e1('bob'), { [`dispute.bob`]: flag('bob', 'bob'), original }))
    await assertFails(updateDoc(e1('bob'), { deletedAt: 5, deletedBy: 'bob', original }))
    await assertFails(updateDoc(e1('bob'), { original: { ...original, source: 'guess' } }))
    await assertSucceeds(updateDoc(e1('bob'), { original }))
  })
  it('only the flagger resolves (removes) their flag', async () => {
    await seed('groups/g1/expenses/e1', { ...expense, dispute: { bob: flag('bob', 'bob') } })
    await assertFails(setFlag('alice', 'bob', deleteField()))
    await assertSucceeds(setFlag('bob', 'bob', deleteField()))
  })
  it('a normal edit cannot clear or change flags, but keeps them', async () => {
    await seed('groups/g1/expenses/e1', { ...expense, dispute: { bob: flag('bob', 'bob') } })
    await assertFails(setDoc(e1('alice'), { ...expense, description: 'Dinner (fixed)' }))
    await assertFails(setDoc(e1('alice'), { ...expense, dispute: { bob: flag('bob', 'bob', { reason: 'fine' }) } }))
    await assertSucceeds(setDoc(e1('alice'), { ...expense, description: 'Dinner (fixed)', dispute: { bob: flag('bob', 'bob') } }))
  })
})

describe('approvals', () => {
  const strict = { ...group, requireApproval: true, approvalThreshold: 10000 }
  const big = { ...expense, id: 'e2', amount: 30000, paidBy: { bob: 30000 }, splits: { alice: 10000, bob: 10000, p_cat: 10000 }, createdBy: 'bob' }
  const approve = (as: string, key: string, value: unknown = true) => updateDoc(e1(as, 'e2'), new FieldPath('approvals', key), value)
  beforeEach(() => seed('groups/g1', strict))

  it('above the threshold a new expense must be marked requiresApproval', async () => {
    await assertFails(setDoc(e1('bob', 'e2'), big))
    await assertSucceeds(setDoc(e1('bob', 'e2'), { ...big, requiresApproval: true }))
  })
  it('at or below the threshold it need not be', async () => {
    await assertSucceeds(setDoc(e1('bob', 'e3'), { ...big, id: 'e3', amount: 9000, paidBy: { bob: 9000 }, splits: { alice: 4500, bob: 4500 } }))
  })
  it('raising the amount above the threshold also needs the flag', async () => {
    await assertFails(updateDoc(e1('bob'), { amount: 30000, paidBy: { alice: 30000 }, splits: { alice: 10000, bob: 10000, p_cat: 10000 } }))
  })
  it('members approve only for themselves, with true', async () => {
    await seed('groups/g1/expenses/e2', { ...big, requiresApproval: true })
    await assertFails(approve('alice', 'bob'))
    await assertFails(approve('alice', 'alice', false))
    await assertFails(updateDoc(e1('alice', 'e2'), { 'approvals.alice': true, description: 'x' }))
    await assertSucceeds(approve('alice', 'alice'))
    await assertSucceeds(approve('alice', 'alice', deleteField())) // and can take it back
  })
  it('an edit may drop approvals (money changed) but never add someone else’s or drop requiresApproval', async () => {
    await seed('groups/g1/expenses/e2', { ...big, requiresApproval: true, approvals: { alice: true } })
    await assertFails(setDoc(e1('bob', 'e2'), { ...big, approvals: { alice: true } })) // requiresApproval dropped
    await assertFails(setDoc(e1('bob', 'e2'), { ...big, requiresApproval: true, approvals: { alice: true, dan: true } }))
    await assertSucceeds(setDoc(e1('bob', 'e2'), { ...big, amount: 33000, paidBy: { bob: 33000 }, splits: { alice: 11000, bob: 11000, p_cat: 11000 }, requiresApproval: true }))
  })
})
