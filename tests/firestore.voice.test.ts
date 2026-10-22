/**
 * Rule tests for voice: the transcription settings (the person's choice and which key, the admin's
 * model, flags and limits) and the profile's voiceTried, set the first time someone holds + to talk.
 * Run with: npm run test:rules
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

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
    await setDoc(doc(ctx.firestore(), 'users/alice'), { uid: 'alice', displayName: 'Alice', currency: 'INR' })
  })
})

const as = (u: string) => env.authenticatedContext(u).firestore()

describe('transcription settings (users/{uid}/settings/notifications)', () => {
  it('Transcribe with AI is a bool, and Which key is Automatic, Own key or Split Now’s', async () => {
    const ref = doc(as('alice'), 'users/alice/settings/notifications')
    await assertSucceeds(setDoc(ref, { aiTranscribe: true, aiTranscribeKey: 'auto', updatedAt: 1 }, { merge: true }))
    await assertSucceeds(setDoc(ref, { aiTranscribeKey: 'own', updatedAt: 2 }, { merge: true }))
    await assertSucceeds(setDoc(ref, { aiTranscribeKey: 'app', updatedAt: 3 }, { merge: true }))
    await assertFails(setDoc(ref, { aiTranscribe: 'yes' }, { merge: true }))
    await assertFails(setDoc(ref, { aiTranscribeKey: 'anyone' }, { merge: true }))
    await assertFails(setDoc(doc(as('bob'), 'users/alice/settings/notifications'), { aiTranscribe: true }, { merge: true }))
  })
})

describe('voiceTried on the profile', () => {
  it('the owner sets it to a time; anything else is refused', async () => {
    await assertSucceeds(updateDoc(doc(as('alice'), 'users/alice'), { voiceTried: 1_760_000_000_000 }))
    await assertSucceeds(getDoc(doc(as('alice'), 'users/alice')))
    await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { voiceTried: true }))
    await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { voiceTried: 'yes' }))
    await assertFails(updateDoc(doc(as('bob'), 'users/alice'), { voiceTried: 1 }))
  })
})

describe('config/ai transcribeModel', () => {
  const good = { mode: 'off', images: true, sms: true, model: 'gemini-3.5-flash-lite', perDay: 50, perHour: 10, globalPerDay: 2000 }
  it('is one of the Flash-Lite models, or empty for the recommended one', async () => {
    await assertSucceeds(setDoc(doc(as('boss'), 'config/ai'), { ...good, transcribeModel: '' }))
    await assertSucceeds(setDoc(doc(as('boss'), 'config/ai'), { ...good, transcribeModel: 'gemini-3.5-flash-lite' }))
    await assertSucceeds(setDoc(doc(as('boss'), 'config/ai'), { ...good, transcribeModel: 'gemini-3.1-flash-lite' }))
    await assertFails(setDoc(doc(as('boss'), 'config/ai'), { ...good, transcribeModel: 'gemma-4-31b-it' }))
    await assertFails(setDoc(doc(as('boss'), 'config/ai'), { ...good, transcribeModel: 3 }))
    await assertFails(setDoc(doc(as('alice'), 'config/ai'), { ...good, transcribeModel: '' }))
  })
})

describe('config/app voice flags and config/limits voice limits', () => {
  it('the two transcription flags are bools', async () => {
    const base = { updatedAt: 1, updatedBy: 'boss' }
    await assertSucceeds(setDoc(doc(as('boss'), 'config/app'), { ...base, flags: { aiTranscribe: false, aiTranscribeShared: true } }))
    await assertFails(setDoc(doc(as('boss'), 'config/app'), { ...base, flags: { aiTranscribe: 'off' } }))
    await assertFails(setDoc(doc(as('boss'), 'config/app'), { ...base, flags: { aiTranscribeShared: 1 } }))
  })
  it('the recording cap and the daily allowance stay in their ranges', async () => {
    const base = { updatedAt: 1, updatedBy: 'boss' }
    await assertSucceeds(setDoc(doc(as('boss'), 'config/limits'), { ...base, transcribeMaxKb: 512, transcribePerDay: 40 }))
    await assertSucceeds(setDoc(doc(as('boss'), 'config/limits'), { ...base, transcribeMaxKb: 32, transcribePerDay: 1000 }))
    await assertFails(setDoc(doc(as('boss'), 'config/limits'), { ...base, transcribeMaxKb: 31 }))
    await assertFails(setDoc(doc(as('boss'), 'config/limits'), { ...base, transcribeMaxKb: 4097 }))
    await assertFails(setDoc(doc(as('boss'), 'config/limits'), { ...base, transcribePerDay: 0 }))
    await assertFails(setDoc(doc(as('alice'), 'config/limits'), { ...base, transcribePerDay: 5 }))
  })
})
