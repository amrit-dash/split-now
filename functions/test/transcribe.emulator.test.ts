/**
 * Calls transcribeAi (and aiKey's transcription-key actions) in the Functions emulator and checks
 * the gates: sign-in, the recording (type and size cap from config/limits), the admin's flags
 * (config/app aiTranscribe, aiTranscribeShared), the person's own choice (aiTranscribe under
 * aiEnabled, and Which key), and the daily allowance. No case reaches Gemini: each is decided
 * before a key is used (a real model can't be called here; scripts/voice-probe.mjs is the way to
 * try the real one). Run with: npm run test:functions.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'

const PROJECT = 'demo-splitit'
const url = (name: string) => `http://127.0.0.1:5001/${PROJECT}/asia-south1/${name}`
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())

let env: RulesTestEnvironment

/** An unsigned ID token the emulator accepts as `uid` (a real account, not an anonymous guest). */
function token(uid: string): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    auth_time: now,
    iat: now,
    exp: now + 3600,
    sub: uid,
    user_id: uid,
    email: `${uid}@example.com`,
    email_verified: true,
    firebase: { identities: {}, sign_in_provider: 'google.com' },
  }
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`
}

async function call<T>(name: string, data: unknown, uid?: string): Promise<{ status: number; result?: T; error?: { status: string; message: string } }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (uid) headers.authorization = `Bearer ${token(uid)}`
  const res = await fetch(url(name), { method: 'POST', headers, body: JSON.stringify({ data }) })
  const json = (await res.json()) as { result?: T; error?: { status: string; message: string } }
  return { status: res.status, ...json }
}

/** A few KB of something that looks like a recording (never sent on: every case stops before a key is used). */
const audio = (bytes = 3000) => Buffer.alloc(bytes, 7).toString('base64')
const clip = { audio: audio(), mimeType: 'audio/webm;codecs=opus', lang: 'en-IN' }
const FAKE_KEY = 'AIzaSyTESTKEY-not-real-000000000000'

type Answer = { unavailable?: true; reason?: string; text?: string }

const write = (path: string, data: Record<string, unknown>) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data)
  })
const read = async (path: string) => {
  let out: Record<string, unknown> | undefined
  await env.withSecurityRulesDisabled(async (ctx) => {
    out = (await getDoc(doc(ctx.firestore(), path))).data()
  })
  return out
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(() => env.cleanup())
beforeEach(() => env.clearFirestore())

describe('transcribeAi (emulator)', () => {
  it('needs a signed-in account and a recording of a known type within the cap', async () => {
    expect((await call('transcribeAi', clip)).error?.status).toBe('UNAUTHENTICATED')
    expect((await call('transcribeAi', { ...clip, audio: '' }, 'alice')).error?.status).toBe('INVALID_ARGUMENT')
    expect((await call('transcribeAi', { ...clip, mimeType: 'video/mp4' }, 'alice')).error?.status).toBe('INVALID_ARGUMENT')
    // config/limits transcribeMaxKb: 32 KB, and a 40 KB recording is refused before anything else
    await write('config/limits', { transcribeMaxKb: 32 })
    const big = await call('transcribeAi', { ...clip, audio: audio(40 * 1024) }, 'alice')
    expect(big.error?.status).toBe('INVALID_ARGUMENT')
    expect(big.error?.message).toContain('32 KB')
  })

  it('the admin’s flag switches it off for everyone, own keys included', async () => {
    await write('users/alice/settings/notifications', { aiTranscribe: true })
    await write('users/alice/secrets/gemini', { key: FAKE_KEY, hint: '…0000' })
    await write('config/app', { flags: { aiTranscribe: false } })
    expect((await call<Answer>('transcribeAi', clip, 'alice')).result).toEqual({ unavailable: true, reason: 'off' })
  })

  it('is off until the person chooses AI (and while their AI master switch is off)', async () => {
    await write('private/geminiTranscribeKey', { key: FAKE_KEY, hint: '…0000' })
    expect((await call<Answer>('transcribeAi', clip, 'alice')).result).toEqual({ unavailable: true, reason: 'off' })
    await write('users/alice/settings/notifications', { aiTranscribe: true, aiEnabled: false })
    expect((await call<Answer>('transcribeAi', clip, 'alice')).result).toEqual({ unavailable: true, reason: 'off' })
  })

  it('with AI chosen but no key to use: not_configured', async () => {
    await write('users/alice/settings/notifications', { aiTranscribe: true })
    // no transcription key, no own key
    expect((await call<Answer>('transcribeAi', clip, 'alice')).result).toEqual({ unavailable: true, reason: 'not_configured' })
    // a transcription key, but everyone may not use it, and no own key
    await write('private/geminiTranscribeKey', { key: FAKE_KEY, hint: '…0000' })
    await write('config/app', { flags: { aiTranscribeShared: false } })
    expect((await call<Answer>('transcribeAi', clip, 'alice')).result).toEqual({ unavailable: true, reason: 'not_configured' })
    // An old "Which key: Own key" no longer narrows it (22 Oct 2026): Split Now's key is tried
    // (the fake key is then refused by Google, but it is no longer "not configured")
    await write('config/app', { flags: {} })
    await write('users/alice/settings/notifications', { aiTranscribe: true, aiTranscribeKey: 'own' })
    expect((await call<Answer>('transcribeAi', clip, 'alice')).result).not.toEqual({ unavailable: true, reason: 'not_configured' })
  })

  it('Split Now’s transcription key over its daily allowance is refused before Gemini, and counted', async () => {
    const now = Date.now()
    await write('users/alice/settings/notifications', { aiTranscribe: true })
    await write('private/geminiTranscribeKey', { key: FAKE_KEY, hint: '…0000' })
    await write('config/limits', { transcribePerDay: 3 })
    await write('rateLimits/ai_transcribe_alice', { hourStart: now, hourCount: 3, dayStart: now, dayCount: 3 })
    expect((await call<Answer>('transcribeAi', clip, 'alice')).result).toEqual({ unavailable: true, reason: 'quota' })
    const stats = await read(`stats/ai_${today}`)
    expect(stats?.denied_transcribe_app).toBe(1)
    // The bill-reading key's daily budget (stats app) is untouched.
    expect(stats?.app).toBeUndefined()
  })

  it('an own key over its limit is refused before Gemini too', async () => {
    const now = Date.now()
    await write('users/alice/settings/notifications', { aiTranscribe: true, aiTranscribeKey: 'own' })
    await write('users/alice/secrets/gemini', { key: FAKE_KEY, hint: '…0000' })
    await write('rateLimits/ai_own_alice', { hourStart: now, hourCount: 999, dayStart: now, dayCount: 999 })
    expect((await call<Answer>('transcribeAi', clip, 'alice')).result).toEqual({ unavailable: true, reason: 'quota' })
    expect((await read(`stats/ai_${today}`))?.denied_transcribe_own).toBe(1)
  })
})

describe('the transcription key (aiKey which: transcribe)', () => {
  it('is admins only', async () => {
    const r = await call('aiKey', { which: 'transcribe', action: 'set', key: FAKE_KEY }, 'alice')
    expect(r.error?.status).toBe('PERMISSION_DENIED')
  })
  it('refuses a key that doesn’t look like one, and a test with none saved', async () => {
    await write('admins/boss', { note: 'owner' })
    expect((await call('aiKey', { which: 'transcribe', action: 'set', key: 'hello' }, 'boss')).error?.status).toBe('INVALID_ARGUMENT')
    expect((await call('aiKey', { which: 'transcribe', action: 'test' }, 'boss')).error?.status).toBe('FAILED_PRECONDITION')
  })
  it('remove takes it away, and aiStatus then says it isn’t set up', async () => {
    await write('admins/boss', { note: 'owner' })
    await write('private/geminiTranscribeKey', { key: FAKE_KEY, hint: '…0000', billing: 'billed' })
    const before = await call<{ transcribe: { configured: boolean; hint?: string; billing?: string } }>('aiStatus', {}, 'boss')
    expect(before.result?.transcribe).toMatchObject({ configured: true, hint: '…0000', billing: 'billed' })
    // Everyone else learns only whether it is set up.
    const other = await call<{ transcribe: Record<string, unknown> }>('aiStatus', {}, 'alice')
    expect(other.result?.transcribe).toEqual({ configured: true })
    const r = await call<{ hint: string | null }>('aiKey', { which: 'transcribe', action: 'remove' }, 'boss')
    expect(r.result?.hint).toBeNull()
    expect(await read('private/geminiTranscribeKey')).toBeUndefined()
    const after = await call<{ transcribe: { configured: boolean } }>('aiStatus', {}, 'boss')
    expect(after.result?.transcribe.configured).toBe(false)
  })
})
