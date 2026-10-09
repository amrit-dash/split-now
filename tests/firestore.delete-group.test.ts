/**
 * Deleting a whole group (repo.deleteGroup): sub-collections in batches, then activity,
 * invite and the group itself in the last batch. Run with: npm run test:rules
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, writeBatch, type DocumentReference, type Firestore } from 'firebase/firestore'

let env: RulesTestEnvironment

const group = {
  id: 'g1',
  name: 'Trip',
  emoji: '🏝️',
  type: 'trip',
  currency: 'AUD',
  simplify: true,
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
const expense = (id: string, by = 'alice') => ({
  id,
  groupId: 'g1',
  description: id,
  amount: 1000,
  category: 'food',
  date: '2026-01-01',
  paidBy: { alice: 1000 },
  splits: { alice: 500, bob: 500 },
  splitType: 'equal',
  createdBy: by,
  createdAt: 1,
  updatedAt: 1,
  importedFrom: 'splitwise',
})
const entry = (actorUid: string, targetId: string) => ({ type: 'expense.created', actorUid, actorName: actorUid, targetId, summary: 's', createdAt: 1 })

const N_EXPENSES = 520
// bob (not the creator) commented on this many different expenses: more than the 20
// document reads rules allow per batch, so the cleanup can't need one existsAfter() each
const N_COMMENTED = 30

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
    const d = ctx.firestore()
    let b = writeBatch(d)
    let n = 0
    const put = async (path: string, data: object) => {
      b.set(doc(d, path), data)
      if (++n % 450 === 0) {
        await b.commit()
        b = writeBatch(d)
      }
    }
    await put('groups/g1', group)
    await put('invites/ABCD2345', { groupId: 'g1', groupName: 'Trip', emoji: '🏝️', placeholders: { p_cat: 'Cat' } })
    await put('groups/g1/profiles/alice', { displayName: 'Alice' })
    await put('groups/g1/profiles/bob', { displayName: 'Bob' })
    for (let i = 0; i < N_EXPENSES; i++) await put(`groups/g1/expenses/e${i}`, expense(`e${i}`, i % 3 ? 'alice' : 'bob'))
    for (let i = 0; i < 20; i++)
      await put(`groups/g1/settlements/s${i}`, { id: `s${i}`, groupId: 'g1', from: 'bob', to: 'alice', amount: 100, createdBy: 'bob', createdAt: 1 })
    // bob commented on a lot of different expenses
    for (let i = 0; i < N_COMMENTED; i++)
      await put(`groups/g1/expenses/e${i}/comments/c${i}`, { text: 'hi', authorUid: 'bob', authorName: 'Bob', createdAt: 1 })
    await put('groups/g1/activity/import', { ...entry('alice', 'g1'), type: 'expense.imported' })
    for (let i = 0; i < 30; i++) await put(`groups/g1/activity/a${i}`, entry(i % 2 ? 'alice' : 'bob', `e${i}`))
    await b.commit()
  })
})

// The test SDK returns the compat type; the modular functions take the same object.
const db = (u: string) => env.authenticatedContext(u).firestore() as unknown as Firestore

/** The same writes, in the same order and batches, as firebaseRepo.deleteGroup. */
async function deleteGroupLikeTheApp(d: Firestore, limit = 450) {
  const refs: DocumentReference[] = []
  const comments: DocumentReference[] = []
  for (const sub of ['expenses', 'settlements', 'profiles']) {
    for (const s of (await getDocs(collection(d, 'groups', 'g1', sub))).docs) {
      refs.push(s.ref)
      if (sub === 'expenses') for (const c of (await getDocs(collection(d, 'groups', 'g1', 'expenses', s.id, 'comments'))).docs) comments.push(c.ref)
    }
  }
  refs.push(...comments)
  for (let i = 0; i < refs.length; i += limit) {
    const b = writeBatch(d)
    refs.slice(i, i + limit).forEach((r) => {
      b.delete(r)
    })
    await b.commit()
  }
  const activity = (await getDocs(collection(d, 'groups', 'g1', 'activity'))).docs.map((x) => x.ref)
  const invite = await getDoc(doc(d, 'invites/ABCD2345'))
  const last = writeBatch(d)
  activity.slice(0, limit - 2).forEach((r) => {
    last.delete(r)
  })
  if (invite.exists()) last.delete(invite.ref)
  last.delete(doc(d, 'groups/g1'))
  await last.commit()
}

describe('deleting a group', () => {
  it('the creator can delete a big imported group with comments', async () => {
    await assertSucceeds(deleteGroupLikeTheApp(db('alice')))
    await env.withSecurityRulesDisabled(async (ctx) => {
      expect((await getDoc(doc(ctx.firestore(), 'groups/g1'))).exists()).toBe(false)
    })
  }, 120_000)
  it('a non-creator member cannot', async () => {
    await assertFails(deleteGroupLikeTheApp(db('bob')))
  }, 120_000)
  it('works when the group has no invite doc (it is only deleted when it exists)', async () => {
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'invites/ABCD2345')))
    // deleting a missing invite is refused, and takes the whole batch with it
    const d = db('alice')
    const b = writeBatch(d)
    b.delete(doc(d, 'invites/ABCD2345'))
    b.delete(doc(d, 'groups/g1'))
    await assertFails(b.commit())
    await assertSucceeds(deleteGroupLikeTheApp(d))
  }, 120_000)
})

describe('comments', () => {
  it('the group creator may delete anyone’s comment; other members and outsiders may not', async () => {
    await assertFails(deleteDoc(doc(db('mallory'), 'groups/g1/expenses/e1/comments/c1')))
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'groups/g1/expenses/e1/comments/c_alice'), { text: 'hi', authorUid: 'alice', authorName: 'Alice', createdAt: 1 }),
    )
    await assertFails(deleteDoc(doc(db('bob'), 'groups/g1/expenses/e1/comments/c_alice')))
    await assertSucceeds(deleteDoc(doc(db('alice'), 'groups/g1/expenses/e1/comments/c1')))
  })
  it('a creator who left the group loses that right', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'groups/g1'), { ...group, memberUids: ['bob'] }))
    await assertFails(deleteDoc(doc(db('alice'), 'groups/g1/expenses/e1/comments/c1')))
  })
  it('activity stays append-only while the group exists', async () => {
    await assertFails(deleteDoc(doc(db('alice'), 'groups/g1/activity/a1')))
    await assertFails(deleteDoc(doc(db('bob'), 'groups/g1/activity/a1')))
  })
})
