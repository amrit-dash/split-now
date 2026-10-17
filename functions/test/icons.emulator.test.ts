/**
 * Calls iconPictureAi (Draw a picture) and iconsAi (Suggest with AI) in the Functions emulator and
 * checks who may draw: sign-in, the admin's flag (config/app flags.aiIcons), the person's switches
 * (aiIcons under aiEnabled), whose key pays (own key whenever added, unless "Only Split Now's key";
 * the shared key only on Gemini with config/ai pictures on), and the limits. No case reaches
 * Gemini: every one is decided before a key is used. Run with: npm run test:functions.
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

async function call<T>(
  data: unknown,
  uid?: string,
  fn = 'iconPictureAi',
): Promise<{ status: number; result?: T; error?: { status: string; message: string } }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (uid) headers.authorization = `Bearer ${token(uid)}`
  const res = await fetch(url(fn), { method: 'POST', headers, body: JSON.stringify({ data }) })
  const json = (await res.json()) as { result?: T; error?: { status: string; message: string } }
  return { status: res.status, ...json }
}

const req = { title: 'Goa trip', kind: 'group' }
type Answer = { unavailable?: true; reason?: string; image?: string }
const ownKey = { key: 'AIzaSyTESTKEY-not-real-000000000000', hint: '…0000' }

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

describe('iconPictureAi (emulator)', () => {
  it('needs a signed-in account and a title', async () => {
    expect((await call(req)).error?.status).toBe('UNAUTHENTICATED')
    expect((await call({ title: '  ' }, 'alice')).error?.status).toBe('INVALID_ARGUMENT')
  })

  it('a shared key on Gemma for bills still draws when the admin turned pictures on (the key has billing)', async () => {
    await write('config/ai', { mode: 'everyone', engine: 'gemma' })
    expect((await call<Answer>(req, 'alice')).result).toEqual({ unavailable: true, reason: 'off' })
    await write('config/ai', { mode: 'everyone', engine: 'gemma', pictures: true, pictureModel: 'gemini-3-pro-image' })
    expect((await call<Answer>(req, 'alice')).result).toEqual({ unavailable: true, reason: 'not_configured' })
  })

  it('the shared Gemini key draws only when the admin turned pictures on', async () => {
    await write('config/ai', { mode: 'everyone', engine: 'gemini' })
    expect((await call<Answer>(req, 'alice')).result).toEqual({ unavailable: true, reason: 'off' })
    // allowed, it gets as far as the key (none in the emulator)
    await write('config/ai', { mode: 'everyone', engine: 'gemini', pictures: true })
    expect((await call<Answer>(req, 'alice')).result).toEqual({ unavailable: true, reason: 'not_configured' })
  })

  it('an own key is used even while the free AI is the default; its limit is checked before Gemini', async () => {
    const now = Date.now()
    await write('config/ai', { mode: 'everyone', engine: 'gemma' })
    await write('users/alice/secrets/gemini', ownKey)
    await write('rateLimits/ai_own_alice', { hourStart: now, hourCount: 999, dayStart: now, dayCount: 999 })
    expect((await call<Answer>(req, 'alice')).result).toEqual({ unavailable: true, reason: 'quota' })
    expect((await read(`stats/ai_${today}`))?.denied_own).toBe(1)
  })

  it('not with “Only Split Now’s key”, nor with AI icons or AI switched off, nor with the admin’s flag off', async () => {
    await write('users/alice/secrets/gemini', ownKey)
    await write('users/alice/settings/notifications', { aiSource: 'app' })
    expect((await call<Answer>(req, 'alice')).result).toEqual({ unavailable: true, reason: 'off' })
    await write('users/alice/settings/notifications', { aiIcons: false })
    expect((await call<Answer>(req, 'alice')).result).toEqual({ unavailable: true, reason: 'off' })
    await write('users/alice/settings/notifications', { aiEnabled: false })
    expect((await call<Answer>(req, 'alice')).result).toEqual({ unavailable: true, reason: 'off' })
    await write('users/alice/settings/notifications', {})
    await write('config/app', { flags: { aiIcons: false } })
    expect((await call<Answer>(req, 'alice')).result).toEqual({ unavailable: true, reason: 'off' })
  })
})

describe('iconsAi (emulator)', () => {
  it('same gates: off with the flag or the person’s switch off; otherwise it reaches the key', async () => {
    await write('config/ai', { mode: 'everyone', engine: 'gemini' })
    expect((await call<Answer>(req, 'alice', 'iconsAi')).result).toEqual({ unavailable: true, reason: 'not_configured' })
    await write('users/alice/settings/notifications', { aiIcons: false })
    expect((await call<Answer>(req, 'alice', 'iconsAi')).result).toEqual({ unavailable: true, reason: 'off' })
  })
})

describe('iconPickAi (emulator)', () => {
  const pick = { title: 'Thalassa', kind: 'expense', choices: ['🍽️', '🍕', '🚕'], categories: ['food', 'transport'] }
  it('needs an account and something to pick from', async () => {
    expect((await call(pick, undefined, 'iconPickAi')).error?.status).toBe('UNAUTHENTICATED')
    expect((await call({ ...pick, choices: ['pizza'] }, 'alice', 'iconPickAi')).error?.status).toBe('INVALID_ARGUMENT')
  })
  it('its own switches: the admin’s flag and the person’s, apart from Suggest with AI', async () => {
    await write('config/ai', { mode: 'everyone', engine: 'gemini' })
    // Suggest with AI off doesn't turn this off: it reaches the (missing) key
    await write('users/alice/settings/notifications', { aiIcons: false })
    expect((await call<Answer>(pick, 'alice', 'iconPickAi')).result).toEqual({ unavailable: true, reason: 'not_configured' })
    await write('users/alice/settings/notifications', { aiIconAuto: false })
    expect((await call<Answer>(pick, 'alice', 'iconPickAi')).result).toEqual({ unavailable: true, reason: 'off' })
    await write('users/alice/settings/notifications', {})
    await write('config/app', { flags: { aiIconAuto: false } })
    expect((await call<Answer>(pick, 'alice', 'iconPickAi')).result).toEqual({ unavailable: true, reason: 'off' })
  })
})
