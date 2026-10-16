/**
 * Calls the `vault` callable in the Functions emulator: who may ask about a private group, the
 * passkey options for a known origin only, and nothing opens without a passkey. The full
 * passkey ceremony needs a real authenticator, so the pattern and key steps are covered by
 * functions/src/lib/vault-core.test.ts. Run with: npm run test:functions.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'

const PROJECT = 'demo-splitit'
const url = (name: string) => `http://127.0.0.1:5001/${PROJECT}/asia-south1/${name}`

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

async function call<T>(data: unknown, uid?: string, origin = 'http://localhost:5173'): Promise<{ result?: T; error?: { status: string; message: string } }> {
  const headers: Record<string, string> = { 'content-type': 'application/json', origin }
  if (uid) headers.authorization = `Bearer ${token(uid)}`
  const res = await fetch(url('vault'), { method: 'POST', headers, body: JSON.stringify({ data }) })
  return (await res.json()) as { result?: T; error?: { status: string; message: string } }
}

const group = (extra: Record<string, unknown> = {}) => ({
  name: 'Secret trip',
  emoji: '🔒',
  type: 'trip',
  currency: 'INR',
  memberUids: ['alice', 'bob'],
  members: { m_a: { name: 'Alice', uid: 'alice' }, m_b: { name: 'Bob', uid: 'bob' } },
  createdBy: 'alice',
  createdAt: 1,
  updatedAt: 1,
  ...extra,
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(() => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'groups/vg'), group({ vault: true }))
    await setDoc(doc(ctx.firestore(), 'groups/plain'), group())
  })
})

describe('vault callable (emulator)', () => {
  it('needs a signed-in member of a private group', async () => {
    expect((await call({ op: 'status', groupId: 'vg' })).error?.status).toBe('UNAUTHENTICATED')
    expect((await call({ op: 'status', groupId: 'vg' }, 'mallory')).error?.status).toBe('PERMISSION_DENIED')
    expect((await call({ op: 'status', groupId: 'plain' }, 'alice')).error?.status).toBe('FAILED_PRECONDITION')
    expect((await call({ op: 'status', groupId: '../x' }, 'alice')).error?.status).toBe('INVALID_ARGUMENT')
  })
  it('status: not set up, no passkey yet, every try left', async () => {
    const r = await call<{ setUp: boolean; hasPasskey: boolean; triesLeft: number }>({ op: 'status', groupId: 'vg' }, 'bob')
    expect(r.result).toEqual({ setUp: false, hasPasskey: false, triesLeft: 5 })
  })
  it('passkey options only for the app’s own origins, with a challenge kept on the server', async () => {
    expect((await call({ op: 'passkeyOptions', purpose: 'register' }, 'alice', 'https://evil.example')).error?.status).toBe('FAILED_PRECONDITION')
    const r = await call<{ options: { challenge: string; rp: { id: string } }; hasPasskey: boolean }>({ op: 'passkeyOptions', purpose: 'register' }, 'alice')
    expect(r.result?.options.rp.id).toBe('localhost')
    expect(r.result?.hasPasskey).toBe(false)
    let stored: string | undefined
    await env.withSecurityRulesDisabled(async (ctx) => {
      stored = (await getDoc(doc(ctx.firestore(), 'users/alice/secrets/passkeys'))).get('challenge')
    })
    expect(stored).toBe(r.result?.options.challenge)
  })
  it('nothing is set up or opened without a passkey', async () => {
    for (const op of ['setup', 'unlock', 'changePattern']) {
      const r = await call({ op, groupId: 'vg', pattern: 'TTLTLL', next: 'LLTLTT' }, 'alice')
      expect(['UNAUTHENTICATED', 'FAILED_PRECONDITION', 'DEADLINE_EXCEEDED']).toContain(r.error?.status)
    }
    await env.withSecurityRulesDisabled(async (ctx) => {
      expect((await getDoc(doc(ctx.firestore(), 'vaultKeys/vg'))).exists()).toBe(false)
    })
  })
})
