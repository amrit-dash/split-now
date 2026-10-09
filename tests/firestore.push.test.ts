/**
 * Rules for push notifications and the backend: push tokens, notification prefs, scoped capture
 * tokens, and server-only state. Run with: npm run test:rules.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

const group = {
  id: 'g1',
  name: 'Goa',
  emoji: '🏖️',
  type: 'trip',
  currency: 'INR',
  simplify: true,
  startDate: '2026-10-05',
  endDate: '2026-10-10',
  memberUids: ['alice'],
  members: { alice: { name: 'Alice', uid: 'alice', color: '#000' } },
  inviteCode: 'ABC234',
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
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'groups/g1'), group))
})

const db = (uid?: string) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore())
const push = { token: 'fcm-token-abc', ua: 'Mozilla/5.0', createdAt: 1, lastSeen: 1 }

describe('push tokens', () => {
  it('owner can register, refresh, read and delete', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), 'users/alice/pushTokens/h1'), push))
    await assertSucceeds(updateDoc(doc(db('alice'), 'users/alice/pushTokens/h1'), { lastSeen: 2 }))
    await assertSucceeds(getDoc(doc(db('alice'), 'users/alice/pushTokens/h1')))
    await assertSucceeds(deleteDoc(doc(db('alice'), 'users/alice/pushTokens/h1')))
  })
  it('nobody else can read or write them', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'users/alice/pushTokens/h1'), push))
    await assertFails(getDoc(doc(db('bob'), 'users/alice/pushTokens/h1')))
    await assertFails(getDoc(doc(db(), 'users/alice/pushTokens/h1')))
    await assertFails(setDoc(doc(db('bob'), 'users/alice/pushTokens/h2'), push))
    await assertFails(deleteDoc(doc(db('bob'), 'users/alice/pushTokens/h1')))
  })
  it('only whitelisted, typed fields', async () => {
    await assertFails(setDoc(doc(db('alice'), 'users/alice/pushTokens/h1'), { ...push, admin: true }))
    await assertFails(setDoc(doc(db('alice'), 'users/alice/pushTokens/h1'), { ...push, token: 5 }))
    await assertFails(setDoc(doc(db('alice'), 'users/alice/pushTokens/h1'), { ...push, createdAt: 'now' }))
  })
})

describe('notification prefs', () => {
  const prefs = { captures: true, unsorted: false, expenses: true, settlements: false, reminders: true, updatedAt: 1 }
  it('owner can read and write booleans', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), 'users/alice/settings/notifications'), prefs))
    await assertSucceeds(updateDoc(doc(db('alice'), 'users/alice/settings/notifications'), { reminders: false }))
    await assertSucceeds(getDoc(doc(db('alice'), 'users/alice/settings/notifications')))
  })
  it('rejects other users, unknown keys and non-booleans', async () => {
    await assertFails(setDoc(doc(db('bob'), 'users/alice/settings/notifications'), prefs))
    await assertFails(getDoc(doc(db('bob'), 'users/alice/settings/notifications')))
    await assertFails(setDoc(doc(db('alice'), 'users/alice/settings/notifications'), { ...prefs, spam: true }))
    await assertFails(setDoc(doc(db('alice'), 'users/alice/settings/notifications'), { ...prefs, expenses: 'yes' }))
  })
})

describe('scoped capture tokens', () => {
  it('can be scoped to a group the owner is in', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), 'captureTokens/aaaaaaaaaaaaaaaaaaaaaaaaaaaa'), { uid: 'alice', createdAt: 1, groupId: 'g1', label: 'Goa' }))
  })
  it('not to a group the owner is not in, or that does not exist', async () => {
    await assertFails(setDoc(doc(db('bob'), 'captureTokens/bbbbbbbbbbbbbbbbbbbbbbbbbbbb'), { uid: 'bob', createdAt: 1, groupId: 'g1' }))
    await assertFails(setDoc(doc(db('alice'), 'captureTokens/cccccccccccccccccccccccccccc'), { uid: 'alice', createdAt: 1, groupId: 'nope' }))
  })
  it('the owner can still read a token the server stamped lastUsedAt on', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'captureTokens/dddddddddddddddddddddddddddd'), { uid: 'alice', createdAt: 1, lastUsedAt: 2 }),
    )
    await assertSucceeds(getDoc(doc(db('alice'), 'captureTokens/dddddddddddddddddddddddddddd')))
    await assertFails(updateDoc(doc(db('alice'), 'captureTokens/dddddddddddddddddddddddddddd'), { lastUsedAt: 3 }))
  })
})

describe('server-only state', () => {
  it('rate limits and reminder state are closed to every client', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'rateLimits/x'), { hourCount: 1 })
      await setDoc(doc(ctx.firestore(), 'reminderState/g1'), { lastSent: {} })
    })
    for (const who of ['alice', undefined]) {
      await assertFails(getDoc(doc(db(who), 'rateLimits/x')))
      await assertFails(setDoc(doc(db(who), 'rateLimits/x'), { hourCount: 0 }))
      await assertFails(getDoc(doc(db(who), 'reminderState/g1')))
      await assertFails(setDoc(doc(db(who), 'reminderState/g1'), { lastSent: {} }))
    }
  })
})
