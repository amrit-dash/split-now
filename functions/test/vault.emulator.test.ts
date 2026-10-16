/**
 * Calls the `vault` callable in the Functions emulator: who may ask about a private group, the
 * passkey options for a known origin only, a wrong pattern is counted before any passkey is asked
 * for, and nothing opens or is set without a passkey. The full passkey ceremony needs a real
 * authenticator, so the hashing and lockout are covered by functions/src/lib/vault-core.test.ts.
 * Run with: npm run test:functions.
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
    const r = await call<Record<string, unknown>>({ op: 'status', groupId: 'vg' }, 'bob')
    expect(r.result).toEqual({
      serverReady: true,
      hasPasskey: false,
      universal: false,
      triesLeft: 5,
      group: { keyReady: false, hasPattern: false },
    })
    expect((await call<Record<string, unknown>>({ op: 'status' }, 'bob')).result).not.toHaveProperty('group')
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
    for (const data of [
      { op: 'setUniversal', pattern: 'TTLTLL', ordered: true },
      { op: 'groupPattern', groupId: 'vg', pattern: 'TL', ordered: true },
      { op: 'unlockFinish' },
    ]) {
      const r = await call(data, 'alice')
      expect(['UNAUTHENTICATED', 'FAILED_PRECONDITION', 'DEADLINE_EXCEEDED']).toContain(r.error?.status)
    }
    await env.withSecurityRulesDisabled(async (ctx) => {
      expect((await getDoc(doc(ctx.firestore(), 'vaultKeys/vg'))).exists()).toBe(false)
      expect((await getDoc(doc(ctx.firestore(), 'users/alice/secrets/vault'))).get('pattern')).toBeUndefined()
    })
  })
  it('changing a pattern takes one that opens it, before any passkey: a passkey alone is not enough', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/secrets/vault'), { pattern: { salt: 'c2FsdA==', hash: 'bm90LXRoZS1oYXNo' } })
    })
    // a wrong current pattern (or none) is refused and counted, and no passkey is checked
    for (const data of [
      { op: 'setUniversal', pattern: 'LLTTLT', ordered: true },
      { op: 'setUniversal', pattern: 'LLTTLT', ordered: true, current: 'TTLTLL' },
      { op: 'groupPattern', groupId: 'vg', pattern: 'TL', ordered: true, current: 'TTLTLL' },
    ])
      expect((await call(data, 'alice')).error?.status).toBe('PERMISSION_DENIED')
    await env.withSecurityRulesDisabled(async (ctx) => {
      const person = (await getDoc(doc(ctx.firestore(), 'users/alice/secrets/vault'))).data()
      expect(person?.tries).toEqual({ wrong: 3 })
      expect(person?.pattern.hash).toBe('bm90LXRoZS1oYXNo')
    })
    // bob has no pattern of any kind: nothing proves he can open it, so he can't give it one
    expect((await call({ op: 'groupPattern', groupId: 'vg', pattern: 'TL', ordered: true, current: 'TL' }, 'bob')).error?.status).toBe('FAILED_PRECONDITION')
  })
  it('unlockStart: no pattern set yet asks for setup; a wrong one is counted and gets no passkey challenge', async () => {
    expect((await call({ op: 'unlockStart', pattern: 'TTLTLL' }, 'alice')).error?.status).toBe('FAILED_PRECONDITION')
    // a universal pattern, as setUniversal stores it after a passkey (hashed with the emulator's VAULT_KEK)
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/secrets/vault'), { pattern: { salt: 'c2FsdA==', hash: 'bm90LXRoZS1oYXNo' } })
    })
    const r = await call<unknown>({ op: 'unlockStart', pattern: 'LLTTLT' }, 'alice')
    expect(r.error?.status).toBe('PERMISSION_DENIED')
    await env.withSecurityRulesDisabled(async (ctx) => {
      expect((await getDoc(doc(ctx.firestore(), 'users/alice/secrets/vault'))).get('tries')).toEqual({ wrong: 1 })
      expect((await getDoc(doc(ctx.firestore(), 'users/alice/secrets/passkeys'))).get('challengePurpose')).toBeUndefined()
    })
    // not someone else's group
    expect((await call({ op: 'unlockStart', pattern: 'TTLTLL', groupId: 'vg' }, 'mallory')).error?.status).toBe('PERMISSION_DENIED')
  })
  it('create: a member makes the first key once; never hands out an existing one', async () => {
    expect((await call({ op: 'create', groupId: 'vg' }, 'mallory')).error?.status).toBe('PERMISSION_DENIED')
    const first = await call<{ dek: string }>({ op: 'create', groupId: 'vg' }, 'alice')
    expect(first.result?.dek).toMatch(/^[A-Za-z0-9+/]{43}=$/)
    expect((await call({ op: 'create', groupId: 'vg' }, 'bob')).error?.status).toBe('ALREADY_EXISTS')
    expect((await call({ op: 'create', groupId: 'plain' }, 'alice')).error?.status).toBe('FAILED_PRECONDITION')
    // the new group's own words are sealed with its key; its ids and emails are not
    await env.withSecurityRulesDisabled(async (ctx) => {
      const g = (await getDoc(doc(ctx.firestore(), 'groups/vg'))).data() as { name: string; members: Record<string, { name: string; uid: string }> }
      expect(g.name).toMatch(/^v1:/)
      expect(g.members.m_a.name).toMatch(/^v1:/)
      expect(g.members.m_a.uid).toBe('alice')
    })
  })
  it('convert: the creator alone, never a wallet, never without a passkey', async () => {
    expect((await call({ op: 'convert', groupId: 'plain', on: true }, 'bob')).error?.message).toMatch(/Only the person who made the group/)
    expect((await call({ op: 'convert', groupId: 'plain', on: true }, 'mallory')).error?.status).toBe('PERMISSION_DENIED')
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'groups/wallet'), group({ type: 'personal', memberUids: ['alice'] }))
    })
    expect((await call({ op: 'convert', groupId: 'wallet', on: true }, 'alice')).error?.status).toBe('FAILED_PRECONDITION')
    // already as asked: nothing to do
    expect((await call({ op: 'convert', groupId: 'vg', on: true }, 'alice')).result).toEqual({ ok: true })
    expect(['UNAUTHENTICATED', 'DEADLINE_EXCEEDED']).toContain((await call({ op: 'convert', groupId: 'plain', on: true }, 'alice')).error?.status)
    await env.withSecurityRulesDisabled(async (ctx) => {
      expect((await getDoc(doc(ctx.firestore(), 'groups/plain'))).get('vault')).toBeUndefined()
      expect((await getDoc(doc(ctx.firestore(), 'groups/plain'))).get('name')).toBe('Secret trip')
    })
  })
  it('joining: ask once, wait for the creator; a decline holds for a day; deciding needs the creator and a passkey', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'groups/vg'), group({ vault: true, inviteCode: 'INVITE12' }))
      await setDoc(doc(ctx.firestore(), 'invites/INVITE12'), { groupId: 'vg', groupName: 'A private group', emoji: '🔒', placeholders: {}, vault: true })
      await setDoc(doc(ctx.firestore(), 'users/carol'), { displayName: 'Carol Singh' })
    })
    expect((await call({ op: 'joinStatus', code: 'INVITE12' }, 'carol')).result).toEqual({ status: 'none' })
    expect((await call({ op: 'requestJoin', code: 'INVITE12' }, 'carol')).result).toEqual({ status: 'pending' })
    expect((await call({ op: 'requestJoin', code: 'INVITE12' }, 'carol')).result).toEqual({ status: 'pending' })
    expect((await call({ op: 'joinStatus', code: 'INVITE12' }, 'bob')).result).toEqual({ status: 'member', groupId: 'vg' })
    expect((await call({ op: 'requestJoin', code: 'NOPE1234' }, 'carol')).error?.status).toBe('NOT_FOUND')
    await env.withSecurityRulesDisabled(async (ctx) => {
      const r = (await getDoc(doc(ctx.firestore(), 'groups/vg/joinRequests/carol'))).data() as { name: string; status: string }
      expect(r.status).toBe('pending')
      // their name is sealed with the group's key, never stored in the clear
      expect(r.name).toMatch(/^v1:/)
      expect(JSON.stringify(r)).not.toContain('Carol')
    })
    // only the creator decides, and not without a passkey
    expect((await call({ op: 'decideJoin', groupId: 'vg', uid: 'carol', approve: true }, 'bob')).error?.status).toBe('PERMISSION_DENIED')
    expect(['UNAUTHENTICATED', 'DEADLINE_EXCEEDED']).toContain(
      (await call({ op: 'decideJoin', groupId: 'vg', uid: 'carol', approve: true }, 'alice')).error?.status,
    )
    await env.withSecurityRulesDisabled(async (ctx) => {
      expect((await getDoc(doc(ctx.firestore(), 'groups/vg'))).get('memberUids')).toEqual(['alice', 'bob'])
      await setDoc(doc(ctx.firestore(), 'groups/vg/joinRequests/carol'), {
        uid: 'carol',
        name: 'v1:x',
        status: 'declined',
        createdAt: 1,
        decidedAt: Date.now(),
      })
    })
    expect((await call({ op: 'requestJoin', code: 'INVITE12' }, 'carol')).error?.status).toBe('RESOURCE_EXHAUSTED')
    expect((await call<{ status: string }>({ op: 'joinStatus', code: 'INVITE12' }, 'carol')).result?.status).toBe('declined')
    // adding directly: only the creator, only someone they share another group with
    expect((await call({ op: 'addContact', groupId: 'vg', uid: 'carol' }, 'bob')).error?.status).toBe('PERMISSION_DENIED')
    expect((await call({ op: 'addContact', groupId: 'vg', uid: 'carol' }, 'alice')).error?.message).toMatch(/another group with them/)
  })
})
