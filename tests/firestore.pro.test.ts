/**
 * Rule tests for Pro (src/lib/pro.ts): users/{uid}.proAt and proHidden, the `pro` mark on a
 * member's own entry and on their per-group profile. Cosmetic, so the rules only keep the shape
 * and who may write it. Run with: npm run test:rules
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteField, doc, setDoc, updateDoc } from 'firebase/firestore'

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
    await setDoc(doc(ctx.firestore(), 'groups/g1'), group)
    await setDoc(doc(ctx.firestore(), 'users/bob'), { uid: 'bob', displayName: 'Bob', currency: 'AUD' })
  })
})

const db = (uid: string) => env.authenticatedContext(uid).firestore()
const me = { uid: 'bob', displayName: 'Bob', currency: 'AUD' }

describe('users/{uid}: proAt and proHidden', () => {
  it('the owner can earn Pro (an int date) and turn the badge off and on', async () => {
    await assertSucceeds(setDoc(doc(db('bob'), 'users/bob'), { ...me, proAt: 1_760_000_000_000 }, { merge: true }))
    await assertSucceeds(setDoc(doc(db('bob'), 'users/bob'), { proHidden: true, uid: 'bob' }, { merge: true }))
    await assertSucceeds(setDoc(doc(db('bob'), 'users/bob'), { proHidden: false, uid: 'bob' }, { merge: true }))
  })
  it('a new profile may carry it from the start', async () => {
    await assertSucceeds(setDoc(doc(db('carol'), 'users/carol'), { uid: 'carol', displayName: 'C', currency: 'AUD', proAt: 5 }))
  })
  it('refuses wrong types', async () => {
    await assertFails(setDoc(doc(db('bob'), 'users/bob'), { ...me, proAt: '2026-10-22' }, { merge: true }))
    await assertFails(setDoc(doc(db('bob'), 'users/bob'), { ...me, proAt: 1.5 }, { merge: true }))
    await assertFails(setDoc(doc(db('bob'), 'users/bob'), { ...me, proAt: 0 }, { merge: true }))
    await assertFails(setDoc(doc(db('bob'), 'users/bob'), { ...me, proHidden: 'yes' }, { merge: true }))
  })
  it('once earned, the date is never changed or removed by the app', async () => {
    await assertSucceeds(setDoc(doc(db('bob'), 'users/bob'), { ...me, proAt: 100 }, { merge: true }))
    // saving the profile again with the same date is fine
    await assertSucceeds(setDoc(doc(db('bob'), 'users/bob'), { ...me, proAt: 100, displayName: 'Bobby' }, { merge: true }))
    await assertFails(setDoc(doc(db('bob'), 'users/bob'), { ...me, proAt: 200 }, { merge: true }))
    await assertFails(updateDoc(doc(db('bob'), 'users/bob'), { proAt: deleteField() }))
  })
  it('nobody can set it on someone else’s profile', async () => {
    await assertFails(setDoc(doc(db('alice'), 'users/bob'), { proAt: 5, uid: 'bob' }, { merge: true }))
  })
})

describe('own member entry: pro', () => {
  const g1 = (uid: string) => doc(db(uid), 'groups/g1')
  it('a member can mark and unmark their own entry', async () => {
    await assertSucceeds(updateDoc(g1('bob'), { 'members.bob.name': 'Bob', 'members.bob.pro': true, memberOpId: 'bob' }))
    await assertSucceeds(updateDoc(g1('bob'), { 'members.bob.pro': deleteField(), memberOpId: 'bob' }))
  })
  it('not someone else’s entry or a placeholder', async () => {
    await assertFails(updateDoc(g1('bob'), { 'members.alice.pro': true, memberOpId: 'alice' }))
    await assertFails(updateDoc(g1('bob'), { 'members.p_cat.pro': true, memberOpId: 'p_cat' }))
  })
  it('only a bool', async () => {
    await assertFails(updateDoc(g1('bob'), { 'members.bob.pro': 'yes', memberOpId: 'bob' }))
    await assertFails(updateDoc(g1('bob'), { 'members.bob.pro': { since: 5 }, memberOpId: 'bob' }))
  })
})

describe('per-group profile: pro', () => {
  it('the owner can share it; not on someone else’s; only a bool', async () => {
    await assertSucceeds(setDoc(doc(db('bob'), 'groups/g1/profiles/bob'), { displayName: 'Bob', payment: {}, collect: true, pro: true }))
    await assertSucceeds(setDoc(doc(db('bob'), 'groups/g1/profiles/bob'), { displayName: 'Bob', payment: {}, collect: true }))
    await assertFails(setDoc(doc(db('alice'), 'groups/g1/profiles/bob'), { displayName: 'Bob', payment: {}, pro: true }))
    await assertFails(setDoc(doc(db('bob'), 'groups/g1/profiles/bob'), { displayName: 'Bob', payment: {}, pro: 'true' }))
    await assertFails(setDoc(doc(db('bob'), 'groups/g1/profiles/bob'), { displayName: 'Bob', payment: {}, proAt: 5 }))
  })
})
