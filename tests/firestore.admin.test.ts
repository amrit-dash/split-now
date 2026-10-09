/**
 * Rule tests for the admin console: config/app (public switches), config/limits, blocked
 * accounts, usage stats, and the write freeze in maintenance mode / for blocked accounts.
 * Run with: npm run test:rules
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestContext, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'

type Db = ReturnType<RulesTestContext['firestore']>
let env: RulesTestEnvironment

// alice created the group; bob and boss (an admin) are members.
const group = {
  id: 'g1',
  name: 'Trip',
  emoji: '🏝️',
  type: 'trip',
  currency: 'INR',
  simplify: true,
  memberUids: ['alice', 'bob', 'boss'],
  members: {
    alice: { name: 'Alice', uid: 'alice', color: '#000' },
    bob: { name: 'Bob', uid: 'bob', color: '#111' },
    boss: { name: 'Boss', uid: 'boss', color: '#222' },
  },
  inviteCode: 'ABCD2345',
  createdBy: 'alice',
  createdAt: 1,
  updatedAt: 1,
}
const expense = (by: string) => ({
  groupId: 'g1',
  amount: 1000,
  description: 'Chai',
  date: '2026-10-08',
  paidBy: { [by]: 1000 },
  splits: { alice: 500, bob: 500 },
  splitType: 'equal',
  createdBy: by,
  createdAt: 1,
})
const appConfig = {
  maintenance: false,
  maintenanceMessage: 'Back soon',
  minVersion: '0.1.0',
  announcement: { text: 'New: nudges', level: 'info', until: 1_800_000_000_000 },
  flags: { aiImages: true, aiSms: false, liveTables: true, autoCapture: true, quickAdd: true, nudges: true, statementImport: true },
  signups: 'open',
  updatedAt: 1,
  updatedBy: 'boss',
}
const limits = {
  capturePerHour: 60,
  capturePerDay: 300,
  aiOwnPerHour: 120,
  aiOwnPerDay: 600,
  nudgePerDay: 1,
  fxPerUserPerHour: 30,
  fxPerUserPerDay: 200,
  updatedAt: 1,
  updatedBy: 'boss',
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
  await seed(async (fs) => {
    await setDoc(doc(fs, 'admins/boss'), { note: 'owner' })
    await setDoc(doc(fs, 'groups/g1'), group)
    await setDoc(doc(fs, 'users/alice/pushTokens/t1'), { token: 'abc', createdAt: 1, lastSeen: 1 })
    await setDoc(doc(fs, 'stats/capture_2026-10-08'), { day: '2026-10-08', received: 3, captured: 2 })
    await setDoc(doc(fs, 'stats/push_2026-10-08'), { day: '2026-10-08', sent: 5 })
  })
})

const seed = (fn: (fs: Db) => Promise<void>) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()))
const as = (uid: string) => env.authenticatedContext(uid).firestore()
const guest = (uid = 'ghost') => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore()
const anon = () => env.unauthenticatedContext().firestore()

describe('config/app', () => {
  it('is readable by everyone (signed out and table guests included), never listable', async () => {
    await seed((fs) => setDoc(doc(fs, 'config/app'), appConfig))
    await assertSucceeds(getDoc(doc(anon(), 'config/app')))
    await assertSucceeds(getDoc(doc(guest(), 'config/app')))
    await assertSucceeds(getDoc(doc(as('alice'), 'config/app')))
    await assertSucceeds(getDoc(doc(as('boss'), 'config/app')))
    await assertFails(getDocs(collection(as('boss'), 'config')))
    await assertFails(getDocs(collection(as('alice'), 'config')))
  })
  it('is written by admins only, with every field validated', async () => {
    await assertFails(setDoc(doc(as('alice'), 'config/app'), appConfig))
    await assertFails(setDoc(doc(guest(), 'config/app'), appConfig))
    await assertSucceeds(setDoc(doc(as('boss'), 'config/app'), appConfig))
    await assertSucceeds(setDoc(doc(as('boss'), 'config/app'), { maintenance: true, updatedAt: 2, updatedBy: 'boss' }))
    await assertSucceeds(setDoc(doc(as('boss'), 'config/app'), { ...appConfig, announcement: null }))
    await assertSucceeds(setDoc(doc(as('boss'), 'config/app'), { ...appConfig, flags: {} }))
    await assertFails(setDoc(doc(as('boss'), 'config/app'), { ...appConfig, secret: 'x' }))
    await assertFails(setDoc(doc(as('boss'), 'config/app'), { ...appConfig, maintenance: 'yes' }))
    await assertFails(setDoc(doc(as('boss'), 'config/app'), { ...appConfig, maintenanceMessage: 'x'.repeat(301) }))
    await assertFails(setDoc(doc(as('boss'), 'config/app'), { ...appConfig, minVersion: 'v1' }))
    await assertFails(setDoc(doc(as('boss'), 'config/app'), { ...appConfig, minVersion: '1.2' }))
    await assertFails(setDoc(doc(as('boss'), 'config/app'), { ...appConfig, announcement: { text: 'hi', level: 'party' } }))
    await assertFails(setDoc(doc(as('boss'), 'config/app'), { ...appConfig, announcement: { text: 'x'.repeat(301), level: 'info' } }))
    await assertFails(setDoc(doc(as('boss'), 'config/app'), { ...appConfig, announcement: { text: 'hi', level: 'info', url: 'https://x' } }))
    await assertFails(setDoc(doc(as('boss'), 'config/app'), { ...appConfig, flags: { ...appConfig.flags, teleport: true } }))
    await assertFails(setDoc(doc(as('boss'), 'config/app'), { ...appConfig, flags: { ...appConfig.flags, nudges: 'on' } }))
    await assertSucceeds(setDoc(doc(as('boss'), 'config/app'), { ...appConfig, flags: { ...appConfig.flags, aiQuickAdd: false } }))
    await assertFails(setDoc(doc(as('boss'), 'config/app'), { ...appConfig, flags: { ...appConfig.flags, aiQuickAdd: 'off' } }))
    await assertFails(setDoc(doc(as('boss'), 'config/app'), { ...appConfig, flags: 'all' }))
    await assertFails(setDoc(doc(as('boss'), 'config/app'), { ...appConfig, signups: 'closed' }))
  })
})

describe('config/limits', () => {
  it('admins read and write it inside the ranges; nobody else reads it', async () => {
    await seed((fs) => setDoc(doc(fs, 'config/limits'), limits))
    await assertFails(getDoc(doc(as('alice'), 'config/limits')))
    await assertFails(getDoc(doc(guest(), 'config/limits')))
    await assertFails(getDoc(doc(anon(), 'config/limits')))
    await assertSucceeds(getDoc(doc(as('boss'), 'config/limits')))
    await assertFails(setDoc(doc(as('alice'), 'config/limits'), limits))
    await assertSucceeds(setDoc(doc(as('boss'), 'config/limits'), limits))
    await assertSucceeds(setDoc(doc(as('boss'), 'config/limits'), { nudgePerDay: 3, updatedAt: 2, updatedBy: 'boss' }))
    await assertFails(setDoc(doc(as('boss'), 'config/limits'), { ...limits, nudgePerDay: 21 }))
    await assertFails(setDoc(doc(as('boss'), 'config/limits'), { ...limits, capturePerHour: 0 }))
    await assertFails(setDoc(doc(as('boss'), 'config/limits'), { ...limits, fxPerUserPerDay: 1.5 }))
    await assertFails(setDoc(doc(as('boss'), 'config/limits'), { ...limits, aiOwnPerDay: '600' }))
    await assertFails(setDoc(doc(as('boss'), 'config/limits'), { ...limits, aiGlobalPerDay: 5 }))
    await assertFails(setDoc(doc(as('boss'), 'config/other'), { x: 1 }))
  })
})

describe('blocked accounts and stats', () => {
  it('a blocked account can see its own entry, admins see any, nobody writes', async () => {
    await seed((fs) => setDoc(doc(fs, 'blocked/mallory'), { reason: 'Spam', at: 1, by: 'boss' }))
    await assertSucceeds(getDoc(doc(as('mallory'), 'blocked/mallory')))
    await assertSucceeds(getDoc(doc(as('alice'), 'blocked/alice'))) // missing, still allowed to check
    await assertFails(getDoc(doc(as('alice'), 'blocked/mallory')))
    await assertSucceeds(getDoc(doc(as('boss'), 'blocked/mallory')))
    await assertFails(getDocs(collection(as('boss'), 'blocked')))
    await assertFails(setDoc(doc(as('boss'), 'blocked/alice'), { reason: 'x', at: 1, by: 'boss' }))
    await assertFails(deleteDoc(doc(as('mallory'), 'blocked/mallory')))
    await assertFails(deleteDoc(doc(as('boss'), 'blocked/mallory')))
  })
  it('usage counters of every kind are admin-read-only', async () => {
    await assertSucceeds(getDoc(doc(as('boss'), 'stats/capture_2026-10-08')))
    await assertSucceeds(getDoc(doc(as('boss'), 'stats/push_2026-10-08')))
    await assertFails(getDoc(doc(as('alice'), 'stats/capture_2026-10-08')))
    await assertFails(setDoc(doc(as('boss'), 'stats/push_2026-10-08'), { sent: 99 }))
  })
})

describe('maintenance mode freezes writes for everyone but admins', () => {
  beforeEach(() => seed((fs) => setDoc(doc(fs, 'config/app'), { maintenance: true, maintenanceMessage: 'Back soon', updatedAt: 1, updatedBy: 'boss' })))

  it('members cannot write group data, tokens, their profile or settings', async () => {
    await assertFails(setDoc(doc(as('alice'), 'groups/g1/expenses/e1'), expense('alice')))
    await assertFails(
      setDoc(doc(as('alice'), 'groups/g1/settlements/s1'), { groupId: 'g1', amount: 500, from: 'bob', to: 'alice', createdBy: 'alice', createdAt: 1 }),
    )
    await assertFails(
      setDoc(doc(as('alice'), 'groups/g1/activity/a1'), {
        type: 'expense.added',
        actorUid: 'alice',
        actorName: 'Alice',
        targetId: 'e1',
        summary: 's',
        createdAt: 1,
      }),
    )
    await assertFails(updateDoc(doc(as('alice'), 'groups/g1'), { name: 'Renamed', updatedAt: 2 }))
    await assertFails(setDoc(doc(as('alice'), 'groups/g9'), { ...group, id: 'g9', memberUids: ['alice'], members: { alice: group.members.alice } }))
    await assertFails(setDoc(doc(as('alice'), 'groups/g1/profiles/alice'), { displayName: 'Alice' }))
    await assertFails(setDoc(doc(as('alice'), 'captureTokens/abcdefghijklmnopqrstuvwx'), { uid: 'alice', createdAt: 1 }))
    await assertFails(setDoc(doc(as('alice'), 'users/alice'), { uid: 'alice', displayName: 'Alice', currency: 'INR' }))
    await assertFails(setDoc(doc(as('alice'), 'users/alice/settings/notifications'), { captures: false }))
    await assertFails(setDoc(doc(as('alice'), 'users/alice/captures/c1'), { amount: 100, status: 'pending' }))
  })
  it('table guests cannot open or change a table', async () => {
    const now = Date.now()
    await assertFails(
      setDoc(doc(guest('g1'), 'tables/TBL23456'), {
        code: 'TBL23456',
        hostUid: 'g1',
        status: 'open',
        items: {},
        claims: {},
        participants: { g1: { name: 'G', uid: 'g1', joinedAt: now } },
        createdAt: now,
        expiresAt: now + 3_600_000,
      }),
    )
  })
  it('reading still works, and so does cleaning up a push registration', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'groups/g1')))
    await assertSucceeds(getDoc(doc(as('alice'), 'config/app')))
    await assertSucceeds(deleteDoc(doc(as('alice'), 'users/alice/pushTokens/t1')))
  })
  it('admins keep working', async () => {
    await assertSucceeds(setDoc(doc(as('boss'), 'groups/g1/expenses/e2'), { ...expense('boss'), splits: { boss: 500, bob: 500 } }))
    await assertSucceeds(updateDoc(doc(as('boss'), 'groups/g1'), { name: 'Renamed', updatedAt: 2 }))
    await assertSucceeds(setDoc(doc(as('boss'), 'users/boss'), { uid: 'boss', displayName: 'Boss', currency: 'INR' }))
  })
  it('and everything opens again when maintenance is turned off', async () => {
    await seed((fs) => setDoc(doc(fs, 'config/app'), { maintenance: false, updatedAt: 2, updatedBy: 'boss' }))
    await assertSucceeds(setDoc(doc(as('alice'), 'groups/g1/expenses/e1'), expense('alice')))
    await assertSucceeds(updateDoc(doc(as('alice'), 'groups/g1'), { name: 'Renamed', updatedAt: 2 }))
  })
})

describe('a blocked account', () => {
  beforeEach(() => seed((fs) => setDoc(doc(fs, 'blocked/alice'), { reason: 'Spam', at: 1, by: 'boss' })))

  it('cannot write anything, while other members can', async () => {
    await assertFails(setDoc(doc(as('alice'), 'groups/g1/expenses/e1'), expense('alice')))
    await assertFails(updateDoc(doc(as('alice'), 'groups/g1'), { name: 'Renamed', updatedAt: 2 }))
    await assertFails(setDoc(doc(as('alice'), 'groups/g9'), { ...group, id: 'g9', memberUids: ['alice'], members: { alice: group.members.alice } }))
    await assertFails(setDoc(doc(as('alice'), 'users/alice'), { uid: 'alice', displayName: 'Alice', currency: 'INR' }))
    await assertFails(setDoc(doc(as('alice'), 'groups/g1/expenses/e1/comments/c1'), { text: 'hi', authorUid: 'alice', authorName: 'Alice', createdAt: 1 }))
    await assertSucceeds(setDoc(doc(as('bob'), 'groups/g1/expenses/e1'), { ...expense('bob'), splits: { alice: 500, bob: 500 } }))
    await assertSucceeds(updateDoc(doc(as('bob'), 'groups/g1'), { name: 'Renamed', updatedAt: 2 }))
  })
  it('can still read, see why, and sign out cleanly', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'groups/g1')))
    await assertSucceeds(getDoc(doc(as('alice'), 'blocked/alice')))
    await assertSucceeds(deleteDoc(doc(as('alice'), 'users/alice/pushTokens/t1')))
  })
})
