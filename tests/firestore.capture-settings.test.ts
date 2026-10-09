/**
 * Rules for the auto-capture settings: filter keys in settings/notifications (including the
 * person's own paused trips), the legacy group-wide captureOff field (ignored, still allowed) and
 * the webhook's activity log (users/{uid}/captureLog).
 * Run with: npm run test:rules.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'

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
  memberUids: ['alice', 'bob'],
  members: { alice: { name: 'Alice', uid: 'alice', color: '#000' }, bob: { name: 'Bob', uid: 'bob', color: '#111' } },
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
const prefsPath = 'users/alice/settings/notifications'

describe('capture settings in settings/notifications', () => {
  const full = {
    captures: true,
    unsorted: false,
    expenses: true,
    settlements: true,
    reminders: true,
    outsideTrips: false,
    capturePaused: false,
    minAmount: 10000,
    ignoreWords: ['SIP', 'rent'],
    pausedTrips: ['g1'],
    updatedAt: 1,
  }
  it('owner can write the new keys (set, merge and update)', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), prefsPath), full))
    await assertSucceeds(setDoc(doc(db('alice'), prefsPath), { capturePaused: true, updatedAt: 2 }, { merge: true }))
    await assertSucceeds(updateDoc(doc(db('alice'), prefsPath), { minAmount: 0, ignoreWords: [] }))
    await assertSucceeds(getDoc(doc(db('alice'), prefsPath)))
  })
  it('a merge write on a missing doc creates it', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), prefsPath), { ignoreWords: ['EMI'], updatedAt: 1 }, { merge: true }))
  })
  it('rejects wrong types and out-of-range values', async () => {
    await assertFails(setDoc(doc(db('alice'), prefsPath), { ...full, capturePaused: 'yes' }))
    await assertFails(setDoc(doc(db('alice'), prefsPath), { ...full, minAmount: -1 }))
    await assertFails(setDoc(doc(db('alice'), prefsPath), { ...full, minAmount: 1.5 }))
    await assertFails(setDoc(doc(db('alice'), prefsPath), { ...full, minAmount: 10_000_001 }))
    await assertFails(setDoc(doc(db('alice'), prefsPath), { ...full, ignoreWords: 'SIP' }))
    await assertFails(setDoc(doc(db('alice'), prefsPath), { ...full, ignoreWords: Array.from({ length: 21 }, (_, i) => `w${i}`) }))
    await assertFails(setDoc(doc(db('alice'), prefsPath), { ...full, captureAll: true }))
  })
  it('pausedTrips: a list of at most 100', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), prefsPath), { pausedTrips: Array.from({ length: 100 }, (_, i) => `g${i}`), updatedAt: 2 }, { merge: true }))
    await assertSucceeds(setDoc(doc(db('alice'), prefsPath), { pausedTrips: [], updatedAt: 3 }, { merge: true }))
    await assertFails(setDoc(doc(db('alice'), prefsPath), { pausedTrips: Array.from({ length: 101 }, (_, i) => `g${i}`) }, { merge: true }))
    await assertFails(setDoc(doc(db('alice'), prefsPath), { pausedTrips: 'g1' }, { merge: true }))
    await assertFails(setDoc(doc(db('bob'), 'users/alice/settings/notifications'), { pausedTrips: ['g1'] }, { merge: true }))
  })
  it('nobody else can read or write them', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), prefsPath), full))
    await assertFails(getDoc(doc(db('bob'), prefsPath)))
    await assertFails(setDoc(doc(db('bob'), prefsPath), { capturePaused: true }, { merge: true }))
    await assertFails(getDoc(doc(db(), prefsPath)))
  })
})

describe('legacy group.captureOff (ignored by matching, still a valid boolean field)', () => {
  it('any member can pause and resume', async () => {
    await assertSucceeds(updateDoc(doc(db('bob'), 'groups/g1'), { captureOff: true, updatedAt: 2 }))
    await assertSucceeds(updateDoc(doc(db('alice'), 'groups/g1'), { captureOff: false, updatedAt: 3 }))
  })
  it('must be a boolean', async () => {
    await assertFails(updateDoc(doc(db('alice'), 'groups/g1'), { captureOff: 'yes' }))
  })
  it('non-members cannot touch it', async () => {
    await assertFails(updateDoc(doc(db('carol'), 'groups/g1'), { captureOff: true }))
    await assertFails(updateDoc(doc(db(), 'groups/g1'), { captureOff: true }))
  })
})

describe('capture activity log', () => {
  const entry = { at: 1, result: 'captured', amount: 84000, currency: 'INR', merchant: 'Swiggy', groupName: 'Goa', device: 'ios' }
  beforeEach(async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'users/alice/captureLog/e1'), entry))
  })
  it('owner can read, list and delete', async () => {
    await assertSucceeds(getDoc(doc(db('alice'), 'users/alice/captureLog/e1')))
    await assertSucceeds(getDocs(collection(db('alice'), 'users/alice/captureLog')))
    await assertSucceeds(deleteDoc(doc(db('alice'), 'users/alice/captureLog/e1')))
  })
  it('no client writes, even by the owner', async () => {
    await assertFails(addDoc(collection(db('alice'), 'users/alice/captureLog'), entry))
    await assertFails(setDoc(doc(db('alice'), 'users/alice/captureLog/e2'), entry))
    await assertFails(updateDoc(doc(db('alice'), 'users/alice/captureLog/e1'), { result: 'ignored' }))
  })
  it('others cannot read or delete it', async () => {
    await assertFails(getDoc(doc(db('bob'), 'users/alice/captureLog/e1')))
    await assertFails(getDocs(collection(db('bob'), 'users/alice/captureLog')))
    await assertFails(deleteDoc(doc(db('bob'), 'users/alice/captureLog/e1')))
    await assertFails(getDoc(doc(db(), 'users/alice/captureLog/e1')))
  })
})
