/**
 * Calls the `joinApproval` callable in the Functions emulator: asking to join an ordinary group
 * whose creator turned on "New people need my OK" (group.approveJoins), and the creator's answer.
 * One request at a time, a day after a decline, only the creator decides, and nothing of a private
 * group goes through here (its creator decides with a passkey, in the vault callable).
 * Run with: npm run test:functions.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

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

type Answer<T> = { result?: T; error?: { status: string; message: string } }
async function call<T>(data: unknown, uid?: string): Promise<Answer<T>> {
  const headers: Record<string, string> = { 'content-type': 'application/json', origin: 'http://localhost:5173' }
  if (uid) headers.authorization = `Bearer ${token(uid)}`
  const res = await fetch(url('joinApproval'), { method: 'POST', headers, body: JSON.stringify({ data }) })
  return (await res.json()) as Answer<T>
}

const group = (extra: Record<string, unknown> = {}) => ({
  name: 'Goa trip',
  emoji: '🏖️',
  type: 'trip',
  currency: 'INR',
  memberUids: ['alice', 'bob'],
  members: { m_a: { name: 'Alice', uid: 'alice' }, m_b: { name: 'Bob', uid: 'bob' }, p_c: { name: 'Carol', color: '#222' } },
  inviteCode: 'INVITE12',
  createdBy: 'alice',
  createdAt: 1,
  updatedAt: 1,
  approveJoins: true,
  ...extra,
})

/** A document as stored (withSecurityRulesDisabled itself returns nothing). */
async function read(path: string) {
  let out: (Record<string, unknown> & { memberUids?: string[]; members?: Record<string, { uid?: string; name?: string }> }) | undefined
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
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'groups/g'), group())
    await setDoc(doc(ctx.firestore(), 'invites/INVITE12'), {
      groupId: 'g',
      groupName: 'Goa trip',
      emoji: '🏖️',
      placeholders: { p_c: 'Carol' },
      approveJoins: true,
    })
    await setDoc(doc(ctx.firestore(), 'users/carol'), { displayName: 'Carol Singh' })
    await setDoc(doc(ctx.firestore(), 'users/dev'), { displayName: 'Dev' })
  })
})

describe('joinApproval callable (emulator)', () => {
  it('needs a signed-in person and a working invite', async () => {
    expect((await call({ op: 'status', code: 'INVITE12' })).error?.status).toBe('UNAUTHENTICATED')
    expect((await call({ op: 'ask', code: 'NOPE1234' }, 'carol')).error?.status).toBe('NOT_FOUND')
    expect((await call({ op: 'ask', code: '../x' }, 'carol')).error?.status).toBe('INVALID_ARGUMENT')
    expect((await call({ op: 'what' }, 'carol')).error?.status).toBe('INVALID_ARGUMENT')
  })

  it('ask once and wait; the request names them as they are; the creator lets them in, into a placeholder', async () => {
    expect((await call({ op: 'status', code: 'INVITE12' }, 'carol')).result).toEqual({ status: 'none' })
    expect((await call({ op: 'ask', code: 'invite12' }, 'carol')).result).toEqual({ status: 'pending' })
    expect((await call({ op: 'ask', code: 'INVITE12' }, 'carol')).result).toEqual({ status: 'pending' })
    expect((await call({ op: 'status', code: 'INVITE12' }, 'carol')).result).toEqual({ status: 'pending' })
    expect((await call({ op: 'status', code: 'INVITE12' }, 'bob')).result).toEqual({ status: 'member', groupId: 'g' })
    expect(await read('groups/g/joinRequests/carol')).toMatchObject({ uid: 'carol', name: 'Carol Singh', status: 'pending' })

    // only the creator decides
    expect((await call({ op: 'decide', groupId: 'g', uid: 'carol', approve: true }, 'bob')).error?.status).toBe('PERMISSION_DENIED')
    expect((await call({ op: 'decide', groupId: 'g', uid: 'carol', approve: true }, 'carol')).error?.status).toBe('PERMISSION_DENIED')
    expect((await read('groups/g'))?.memberUids).toEqual(['alice', 'bob'])

    expect((await call({ op: 'decide', groupId: 'g', uid: 'carol', approve: true, memberId: 'p_c' }, 'alice')).result).toEqual({ ok: true })
    const g = await read('groups/g')
    expect(g?.memberUids).toEqual(['alice', 'bob', 'carol'])
    expect(g?.members?.p_c).toEqual({ name: 'Carol', color: '#222', uid: 'carol' })
    expect(await read('groups/g/joinRequests/carol')).toMatchObject({ status: 'approved', decidedBy: 'alice', memberId: 'p_c' })
    // the invite stops offering the placeholder that is hers now
    expect((await read('invites/INVITE12'))?.placeholders).toEqual({})
    expect((await call({ op: 'status', code: 'INVITE12' }, 'carol')).result).toEqual({ status: 'member', groupId: 'g' })
    // answered already
    expect((await call({ op: 'decide', groupId: 'g', uid: 'carol', approve: false }, 'alice')).error?.status).toBe('NOT_FOUND')
  })

  it('as someone new; a placeholder someone else has is refused', async () => {
    await call({ op: 'ask', code: 'INVITE12' }, 'dev')
    expect((await call({ op: 'decide', groupId: 'g', uid: 'dev', approve: true, memberId: 'm_b' }, 'alice')).error?.status).toBe('FAILED_PRECONDITION')
    expect((await call({ op: 'decide', groupId: 'g', uid: 'dev', approve: true }, 'alice')).result).toEqual({ ok: true })
    const g = await read('groups/g')
    expect(g?.memberUids).toContain('dev')
    const [id, entry] = Object.entries(g?.members ?? {}).find(([, m]) => m.uid === 'dev') ?? []
    expect(id).toMatch(/^m_dev_/)
    expect(entry).toMatchObject({ name: 'Dev', uid: 'dev' })
  })

  it('a decline holds for a day, and they read nothing of the group meanwhile', async () => {
    await call({ op: 'ask', code: 'INVITE12' }, 'carol')
    expect((await call({ op: 'decide', groupId: 'g', uid: 'carol', approve: false }, 'alice')).result).toEqual({ ok: true })
    expect((await read('groups/g'))?.memberUids).toEqual(['alice', 'bob'])
    expect(await read('groups/g/joinRequests/carol')).toMatchObject({ status: 'declined', decidedBy: 'alice' })
    expect((await call({ op: 'ask', code: 'INVITE12' }, 'carol')).error?.status).toBe('RESOURCE_EXHAUSTED')
    expect((await call<{ status: string; retryAt: number }>({ op: 'status', code: 'INVITE12' }, 'carol')).result?.status).toBe('declined')
    // a day later they may ask again
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'groups/g/joinRequests/carol'), { decidedAt: Date.now() - 25 * 3600_000 })
    })
    expect((await call({ op: 'ask', code: 'INVITE12' }, 'carol')).result).toEqual({ status: 'pending' })
  })

  it('turned off: the invite is open again, and a waiting request from someone who joined closes as approved', async () => {
    await call({ op: 'ask', code: 'INVITE12' }, 'carol')
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'groups/g'), { approveJoins: false })
    })
    expect((await call({ op: 'status', code: 'INVITE12' }, 'dev')).result).toEqual({ status: 'open' })
    expect((await call({ op: 'ask', code: 'INVITE12' }, 'dev')).result).toEqual({ status: 'open' })
    expect(await read('groups/g/joinRequests/dev')).toBeUndefined()
    // carol joined from the invite meanwhile; the creator turns it back on and answers her old request
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'groups/g'), { approveJoins: true, memberUids: ['alice', 'bob', 'carol'], 'members.p_c.uid': 'carol' })
    })
    expect((await call({ op: 'decide', groupId: 'g', uid: 'carol', approve: true }, 'alice')).result).toEqual({ ok: true })
    expect(await read('groups/g/joinRequests/carol')).toMatchObject({ status: 'approved', memberId: 'p_c' })
    expect(Object.keys((await read('groups/g'))?.members ?? {}).sort()).toEqual(['m_a', 'm_b', 'p_c'])
  })

  it('never for a private group: its creator decides with a passkey in the vault callable', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'groups/g'), group({ vault: true }))
      await setDoc(doc(ctx.firestore(), 'groups/g/joinRequests/carol'), { uid: 'carol', name: 'v1:x', status: 'pending', createdAt: 1 })
    })
    expect((await call({ op: 'ask', code: 'INVITE12' }, 'dev')).error?.status).toBe('FAILED_PRECONDITION')
    expect((await call({ op: 'decide', groupId: 'g', uid: 'carol', approve: true }, 'alice')).error?.status).toBe('FAILED_PRECONDITION')
    expect((await read('groups/g'))?.memberUids).toEqual(['alice', 'bob'])
  })

  it('the joinApproval switch stops asking, not answering', async () => {
    await call({ op: 'ask', code: 'INVITE12' }, 'carol')
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'config/app'), { flags: { joinApproval: false } })
    })
    try {
      expect((await call({ op: 'ask', code: 'INVITE12' }, 'dev')).error?.message).toMatch(/switched off/)
      expect((await call({ op: 'decide', groupId: 'g', uid: 'carol', approve: false }, 'alice')).result).toEqual({ ok: true })
    } finally {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'config/app'), { flags: {} })
      })
    }
  })
})
