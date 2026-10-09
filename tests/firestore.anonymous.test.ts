/**
 * Anonymous accounts (live-table guests) are not users: everything outside tables/* and
 * fxRates/* must refuse them, however they got a uid. Run with: npm run test:rules
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { arrayUnion, collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore'

let env: RulesTestEnvironment

const group = {
  id: 'g1',
  name: 'Trip',
  emoji: '🏝️',
  type: 'trip',
  currency: 'INR',
  simplify: true,
  memberUids: ['alice'],
  members: { alice: { name: 'Alice', uid: 'alice', color: '#000' }, p_bob: { name: 'Bob', color: '#111' } },
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
    const fs = ctx.firestore()
    await setDoc(doc(fs, 'groups/g1'), group)
    await setDoc(doc(fs, 'invites/ABCD2345'), { groupId: 'g1', groupName: 'Trip', emoji: '🏝️', placeholders: { p_bob: 'Bob' } })
    await setDoc(doc(fs, 'config/ai'), { mode: 'allowlist', allowEmails: ['secret@example.com'] })
    await setDoc(doc(fs, 'fxRates/latest'), { date: '2026-10-07', rates: { INR: 90 } })
    await setDoc(doc(fs, 'users/guest'), { uid: 'guest', displayName: 'G', currency: 'INR' })
  })
})

// The same uid, as an anonymous guest and as a real account.
const guest = () => env.authenticatedContext('guest', { firebase: { sign_in_provider: 'anonymous' } }).firestore()
const user = () => env.authenticatedContext('guest', { firebase: { sign_in_provider: 'google.com' } }).firestore()

describe('anonymous guests', () => {
  it('cannot read invites or the AI config, or list groups', async () => {
    await assertFails(getDoc(doc(guest(), 'invites/ABCD2345')))
    await assertSucceeds(getDoc(doc(user(), 'invites/ABCD2345')))
    await assertFails(getDoc(doc(guest(), 'config/ai')))
    await assertFails(getDocs(query(collection(guest(), 'groups'), where('memberUids', 'array-contains', 'guest'))))
  })
  it('cannot join or create groups', async () => {
    await assertFails(
      updateDoc(doc(guest(), 'groups/g1'), {
        memberUids: arrayUnion('guest'),
        'members.p_bob': { name: 'Bob', uid: 'guest', color: '#111' },
        joinCode: 'ABCD2345',
        joinMemberId: 'p_bob',
        updatedAt: 2,
      }),
    )
    await assertFails(
      setDoc(doc(guest(), 'groups/g2'), {
        ...group,
        id: 'g2',
        memberUids: ['guest'],
        members: { guest: { name: 'G', uid: 'guest', color: '#000' } },
        createdBy: 'guest',
      }),
    )
    await assertSucceeds(
      setDoc(doc(user(), 'groups/g2'), {
        ...group,
        id: 'g2',
        memberUids: ['guest'],
        members: { guest: { name: 'G', uid: 'guest', color: '#000' } },
        createdBy: 'guest',
      }),
    )
  })
  it('cannot create capture keys, or touch their own user document', async () => {
    await assertFails(setDoc(doc(guest(), 'captureTokens/gggggggggggggggggggggggggggg'), { uid: 'guest', createdAt: 1 }))
    await assertFails(getDoc(doc(guest(), 'users/guest')))
    await assertFails(setDoc(doc(guest(), 'users/guest'), { uid: 'guest', displayName: 'X', currency: 'INR' }))
    await assertFails(
      setDoc(doc(guest(), 'users/guest/captures/c1'), {
        id: 'c1',
        amount: 100,
        merchant: 'x',
        date: '2026-10-07',
        source: 'manual',
        status: 'pending',
        createdAt: 1,
        updatedAt: 1,
      }),
    )
    await assertFails(setDoc(doc(guest(), 'users/guest/pushTokens/t'), { token: 'x', createdAt: 1, lastSeen: 1 }))
    await assertFails(getDoc(doc(guest(), 'admins/guest')))
  })
  it('cannot read a group they were somehow listed in', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'groups/g1'), { ...group, memberUids: ['alice', 'guest'] }))
    await assertFails(getDoc(doc(guest(), 'groups/g1')))
    await assertFails(getDocs(collection(guest(), 'groups/g1/expenses')))
    await assertSucceeds(getDoc(doc(user(), 'groups/g1')))
  })
  it('can still read the shared exchange rates', async () => {
    await assertSucceeds(getDoc(doc(guest(), 'fxRates/latest')))
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'fxRates/latest')))
  })
})
