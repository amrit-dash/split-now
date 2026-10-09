/**
 * Calls quickAddAi in the Functions emulator and checks its gates: sign-in, input, the admin's
 * flag (config/app flags.aiQuickAdd), the person's own switch (aiQuickAdd under aiEnabled), and the
 * own-key rate limit. No case reaches Gemini: every one is decided before a key is used, so the
 * real API is never called. Run with: npm run test:functions.
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

async function call<T>(data: unknown, uid?: string): Promise<{ status: number; result?: T; error?: { status: string; message: string } }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (uid) headers.authorization = `Bearer ${token(uid)}`
  const res = await fetch(url('quickAddAi'), { method: 'POST', headers, body: JSON.stringify({ data }) })
  const json = (await res.json()) as { result?: T; error?: { status: string; message: string } }
  return { status: res.status, ...json }
}

const line = {
  text: 'create a group Goa trip with Rahul and Priya and add dinner 2400 paid by me split equally',
  today,
  currency: 'INR',
  me: 'Alice',
  groupId: 'g1',
  groups: [{ id: 'g1', name: 'Flat', type: 'home', members: [{ id: 'm_dev', name: 'Dev' }] }],
}

type Answer = { unavailable?: true; reason?: string; result?: unknown }

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

describe('quickAddAi (emulator)', () => {
  it('needs a signed-in account and a line', async () => {
    expect((await call(line)).error?.status).toBe('UNAUTHENTICATED')
    expect((await call({ ...line, text: '   ' }, 'alice')).error?.status).toBe('INVALID_ARGUMENT')
  })

  it('is off until the person turns it on (opt-in), even with the shared key open to everyone', async () => {
    await write('config/ai', { mode: 'everyone' })
    const r = await call<Answer>(line, 'alice')
    expect(r.result).toEqual({ unavailable: true, reason: 'off' })
    await write('users/alice/settings/notifications', { aiQuickAdd: true, aiEnabled: false })
    expect((await call<Answer>(line, 'alice')).result).toEqual({ unavailable: true, reason: 'off' })
  })

  it('the admin’s flag switches it off for everyone, own keys included', async () => {
    await write('users/alice/settings/notifications', { aiQuickAdd: true })
    await write('users/alice/secrets/gemini', { key: 'AIzaSyTESTKEY-not-real-000000000000', hint: '…0000' })
    await write('config/app', { flags: { aiQuickAdd: false } })
    expect((await call<Answer>(line, 'alice')).result).toEqual({ unavailable: true, reason: 'off' })
  })

  it('with both switches on it gets as far as the key: none set up is "not_configured"', async () => {
    await write('users/alice/settings/notifications', { aiQuickAdd: true })
    await write('config/ai', { mode: 'everyone' })
    expect((await call<Answer>(line, 'alice')).result).toEqual({ unavailable: true, reason: 'not_configured' })
  })

  it('an own key over its limit is refused before Gemini, and counted as denied', async () => {
    const now = Date.now()
    await write('users/alice/settings/notifications', { aiQuickAdd: true })
    await write('users/alice/secrets/gemini', { key: 'AIzaSyTESTKEY-not-real-000000000000', hint: '…0000' })
    await write('rateLimits/ai_own_alice', { hourStart: now, hourCount: 999, dayStart: now, dayCount: 999 })
    expect((await call<Answer>(line, 'alice')).result).toEqual({ unavailable: true, reason: 'quota' })
    expect((await read(`stats/ai_${today}`))?.denied_own).toBe(1)
  })
})
