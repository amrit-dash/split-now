/**
 * Rule tests for removing members (a soft remove: the entry stays with removedAt, the uid leaves
 * memberUids), adding someone back, and old expenses that name a removed member.
 * Run with: npm run test:rules
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { arrayRemove, arrayUnion, deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

// alice created the group; bob and dan have joined; p_cat is a placeholder.
const group = {
  id: 'g1',
  name: 'Trip',
  emoji: '🏝️',
  type: 'trip',
  currency: 'INR',
  simplify: true,
  memberUids: ['alice', 'bob', 'dan'],
  members: {
    alice: { name: 'Alice', uid: 'alice', color: '#000' },
    bob: { name: 'Bob', uid: 'bob', color: '#111' },
    dan: { name: 'Dan', uid: 'dan', color: '#333' },
    p_cat: { name: 'Cat', color: '#222' },
  },
  inviteCode: 'ABCD2345',
  createdBy: 'alice',
  createdAt: 1,
  updatedAt: 1,
}
const expense = {
  id: 'e1',
  groupId: 'g1',
  description: 'Dinner',
  amount: 900,
  paidBy: { alice: 900 },
  splits: { alice: 300, bob: 300, p_cat: 300 },
  createdBy: 'alice',
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-splitit-members',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(() => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'groups/g1'), group)
    await setDoc(doc(ctx.firestore(), 'groups/g1/expenses/e1'), expense)
    await setDoc(doc(ctx.firestore(), 'invites/ABCD2345'), { groupId: 'g1', groupName: 'Trip', emoji: '🏝️', placeholders: { p_cat: 'Cat' } })
  })
})

const db = (uid: string) => env.authenticatedContext(uid).firestore()
const g1 = (uid: string) => doc(db(uid), 'groups/g1')
/** Sets up the group with `id` already removed (as the app would have written it). */
const removed = async (id: string) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    const uid = (group.members as Record<string, { uid?: string }>)[id].uid
    await updateDoc(doc(ctx.firestore(), 'groups/g1'), {
      [`members.${id}.removedAt`]: 5,
      ...(uid ? { memberUids: arrayRemove(uid) } : {}),
    })
  })

describe('marking a member as removed', () => {
  it('anyone in the group can mark a placeholder as removed', async () => {
    await assertSucceeds(updateDoc(g1('bob'), { 'members.p_cat.removedAt': 10, memberOpId: 'p_cat', updatedAt: 2 }))
  })
  it('the creator can remove someone with an account: their uid leaves memberUids', async () => {
    await assertSucceeds(updateDoc(g1('alice'), { 'members.bob.removedAt': 10, memberUids: arrayRemove('bob'), memberOpId: 'bob', updatedAt: 2 }))
  })
  it('anyone can leave (mark themselves removed)', async () => {
    await assertSucceeds(updateDoc(g1('bob'), { 'members.bob.removedAt': 10, memberUids: arrayRemove('bob'), memberOpId: 'bob', updatedAt: 2 }))
  })
  it('someone else cannot remove a member with an account', async () => {
    await assertFails(updateDoc(g1('bob'), { 'members.dan.removedAt': 10, memberUids: arrayRemove('dan'), memberOpId: 'dan', updatedAt: 2 }))
  })
  it('removing someone with an account must also take their uid out of memberUids', async () => {
    await assertFails(updateDoc(g1('alice'), { 'members.bob.removedAt': 10, memberOpId: 'bob', updatedAt: 2 }))
  })
  it('removing changes nothing else in the entry, and removedAt is a number', async () => {
    await assertFails(updateDoc(g1('bob'), { 'members.p_cat.removedAt': 10, 'members.p_cat.name': 'Mallory', memberOpId: 'p_cat' }))
    await assertFails(updateDoc(g1('bob'), { 'members.p_cat.removedAt': 'yes', memberOpId: 'p_cat' }))
    await assertFails(updateDoc(g1('bob'), { 'members.p_cat.removedAt': 10, memberOpId: 'alice' }))
  })
  it('a removed member can no longer read or write the group', async () => {
    await removed('bob')
    await assertFails(getDoc(g1('bob')))
    await assertFails(updateDoc(g1('bob'), { name: 'Mine now' }))
    await assertSucceeds(getDoc(g1('dan')))
  })
})

describe('old expenses that name a removed member', () => {
  it('stay editable', async () => {
    await removed('p_cat')
    await removed('bob')
    await assertSucceeds(updateDoc(doc(db('alice'), 'groups/g1/expenses/e1'), { description: 'Dinner at Thalassa' }))
    await assertSucceeds(
      setDoc(doc(db('dan'), 'groups/g1/settlements/s1'), {
        id: 's1',
        groupId: 'g1',
        from: 'p_cat',
        to: 'alice',
        amount: 300,
        method: 'Cash',
        date: '2026-01-01',
        createdBy: 'dan',
        createdAt: 1,
      }),
    )
  })
})

describe('adding someone back', () => {
  it('a removed placeholder comes back when removedAt is dropped', async () => {
    await removed('p_cat')
    await assertSucceeds(updateDoc(g1('dan'), { 'members.p_cat.removedAt': deleteField(), memberOpId: 'p_cat', updatedAt: 2 }))
  })
  it('a removed account comes back as a placeholder (uid dropped), never keeping their uid', async () => {
    await removed('bob')
    await assertFails(updateDoc(g1('dan'), { 'members.bob.removedAt': deleteField(), memberOpId: 'bob' }))
    await assertSucceeds(updateDoc(g1('dan'), { 'members.bob.removedAt': deleteField(), 'members.bob.uid': deleteField(), memberOpId: 'bob' }))
  })
  it('bringing someone back cannot rename them or touch anyone else', async () => {
    await removed('p_cat')
    await assertFails(updateDoc(g1('dan'), { 'members.p_cat.removedAt': deleteField(), 'members.p_cat.name': 'Mallory', memberOpId: 'p_cat' }))
    await assertFails(updateDoc(g1('dan'), { 'members.p_cat.removedAt': deleteField(), memberOpId: 'dan' }))
  })
  it('someone who left can rejoin with the invite into their own old entry; nobody else can claim it', async () => {
    await removed('bob')
    const rejoin = (uid: string) =>
      updateDoc(doc(db(uid), 'groups/g1'), {
        memberUids: arrayUnion(uid),
        'members.bob': { name: 'Bob', uid, color: '#111' },
        joinCode: 'ABCD2345',
        joinMemberId: 'bob',
        updatedAt: 3,
      })
    await assertFails(rejoin('mallory'))
    await assertSucceeds(rejoin('bob'))
  })
  it('a rejoin cannot keep the removed marker', async () => {
    await removed('bob')
    await assertFails(
      updateDoc(doc(db('bob'), 'groups/g1'), {
        memberUids: arrayUnion('bob'),
        'members.bob': { name: 'Bob', uid: 'bob', color: '#111', removedAt: 5 },
        joinCode: 'ABCD2345',
        joinMemberId: 'bob',
      }),
    )
  })
})
