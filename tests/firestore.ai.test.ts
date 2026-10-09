/**
 * Rule tests for AI reading: project settings (config/ai), admins, users' own keys and status.
 * Run with: npm run test:rules
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

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
    await setDoc(doc(ctx.firestore(), 'admins/boss'), { note: 'owner' })
    await setDoc(doc(ctx.firestore(), 'config/ai'), { mode: 'off' })
    await setDoc(doc(ctx.firestore(), 'users/alice/secrets/gemini'), { key: 'AIzaSECRET', hint: '…CRET' })
    await setDoc(doc(ctx.firestore(), 'users/alice/aiState/status'), { hint: '…CRET' })
    await setDoc(doc(ctx.firestore(), 'stats/ai_2026-10-08'), { app: 3 })
  })
})

const as = (u: string) => env.authenticatedContext(u).firestore()
const good = {
  mode: 'allowlist',
  allowEmails: ['a@b.co'],
  images: true,
  sms: false,
  model: 'gemini-3.5-flash-lite',
  perDay: 50,
  perHour: 10,
  globalPerDay: 2000,
  updatedAt: 1,
  updatedBy: 'boss',
}

describe('config/ai', () => {
  it('only admins can read it (it holds the allow-list of emails) or write valid settings', async () => {
    await assertFails(getDoc(doc(as('alice'), 'config/ai')))
    await assertSucceeds(getDoc(doc(as('boss'), 'config/ai')))
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'config/ai')))
    await assertFails(getDoc(doc(env.authenticatedContext('ghost', { firebase: { sign_in_provider: 'anonymous' } }).firestore(), 'config/ai')))
    await assertFails(getDocs(collection(as('boss'), 'config')))
    await assertFails(setDoc(doc(as('alice'), 'config/ai'), good))
    await assertSucceeds(setDoc(doc(as('boss'), 'config/ai'), good))
    await assertFails(setDoc(doc(as('boss'), 'config/ai'), { ...good, mode: 'party' }))
    await assertFails(setDoc(doc(as('boss'), 'config/ai'), { ...good, perDay: 0 }))
    await assertFails(setDoc(doc(as('boss'), 'config/ai'), { ...good, globalPerDay: 0 }))
    await assertFails(setDoc(doc(as('boss'), 'config/ai'), { ...good, globalPerDay: 'lots' }))
    await assertFails(setDoc(doc(as('boss'), 'config/ai'), { ...good, secret: 'x' }))
    await assertFails(setDoc(doc(as('boss'), 'config/other'), { x: 1 }))
  })
})

describe('config/app', () => {
  it('admins set a version string; nobody else writes it', async () => {
    const v = { version: '2.1.1', updatedAt: 1, updatedBy: 'boss' }
    await assertSucceeds(getDoc(doc(as('alice'), 'config/app')))
    await assertFails(setDoc(doc(as('alice'), 'config/app'), v))
    await assertSucceeds(setDoc(doc(as('boss'), 'config/app'), v))
    await assertSucceeds(setDoc(doc(as('boss'), 'config/app'), { ...v, version: '2.2.0-beta.1' }))
    await assertFails(setDoc(doc(as('boss'), 'config/app'), { ...v, version: '<script>' }))
    await assertFails(setDoc(doc(as('boss'), 'config/app'), { ...v, extra: 1 }))
    await assertFails(setDoc(doc(as('boss'), 'config/other'), v))
  })
})

describe('admins, stats', () => {
  it('you can only see your own admin record; nobody writes it', async () => {
    await assertSucceeds(getDoc(doc(as('boss'), 'admins/boss')))
    await assertSucceeds(getDoc(doc(as('alice'), 'admins/alice'))) // missing doc, still allowed to check
    await assertFails(getDoc(doc(as('alice'), 'admins/boss')))
    await assertFails(setDoc(doc(as('alice'), 'admins/alice'), { x: 1 }))
    await assertFails(setDoc(doc(as('boss'), 'admins/alice'), { x: 1 }))
  })
  it('usage stats are admin-read-only', async () => {
    await assertSucceeds(getDoc(doc(as('boss'), 'stats/ai_2026-10-08')))
    await assertFails(getDoc(doc(as('alice'), 'stats/ai_2026-10-08')))
    await assertFails(setDoc(doc(as('boss'), 'stats/ai_2026-10-08'), { app: 9 }))
  })
})

describe('own key', () => {
  it('can never be read or written by the app, not even by its owner', async () => {
    await assertFails(getDoc(doc(as('alice'), 'users/alice/secrets/gemini')))
    await assertFails(setDoc(doc(as('alice'), 'users/alice/secrets/gemini'), { key: 'x' }))
    await assertFails(deleteDoc(doc(as('alice'), 'users/alice/secrets/gemini')))
    await assertFails(getDoc(doc(as('boss'), 'users/alice/secrets/gemini')))
  })
  it('status is readable by its owner only, written by the server only', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'users/alice/aiState/status')))
    await assertFails(getDoc(doc(as('bob'), 'users/alice/aiState/status')))
    await assertFails(setDoc(doc(as('alice'), 'users/alice/aiState/status'), { hint: 'x' }))
  })
  it('AI prefs are validated', async () => {
    const ref = doc(as('alice'), 'users/alice/settings/notifications')
    await assertSucceeds(setDoc(ref, { aiEnabled: false, aiSource: 'own', aiModel: 'gemini-3-flash', aiSmsMerchant: true }))
    await assertFails(setDoc(ref, { aiSource: 'anyone' }))
    await assertFails(setDoc(ref, { aiModel: 'x'.repeat(81) }))
    await assertFails(setDoc(ref, { aiSmsMerchant: 'yes' }))
  })
  it('the Quick add with AI switch is a bool', async () => {
    const ref = doc(as('alice'), 'users/alice/settings/notifications')
    await assertSucceeds(setDoc(ref, { aiQuickAdd: true, updatedAt: 1 }, { merge: true }))
    await assertFails(setDoc(ref, { aiQuickAdd: 'on' }, { merge: true }))
    await assertFails(setDoc(doc(as('bob'), 'users/alice/settings/notifications'), { aiQuickAdd: true }, { merge: true }))
  })
})
