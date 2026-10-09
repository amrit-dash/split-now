/**
 * Calls the admin callables (adminStats, adminBlockUser) in the Functions emulator and checks
 * what they read and write in Firestore. The emulator skips ID-token signature checks, so a
 * hand-made JWT stands in for a signed-in user. Run with: npm run test:functions.
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
function token(uid: string, extra: Record<string, unknown> = {}): string {
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
    ...extra,
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
    const db = ctx.firestore()
    await setDoc(doc(db, 'admins/boss'), { note: 'owner' })
    await setDoc(doc(db, 'groups/g1'), { name: 'Trip', memberUids: ['alice', 'boss'], updatedAt: Date.now() })
    await setDoc(doc(db, 'groups/g2'), { name: 'Old', memberUids: ['alice'], updatedAt: 1 })
    await setDoc(doc(db, `stats/capture_${today}`), { day: today, received: 4, captured: 3 })
    await setDoc(doc(db, `stats/push_${today}`), { day: today, sent: 2 })
    await setDoc(doc(db, 'users/alice/pushTokens/t1'), { token: 'abc', createdAt: 1, lastSeen: 1 })
    await setDoc(doc(db, 'captureTokens/abcdefghijkmnpqrstuvwxyz2345'), { uid: 'alice', createdAt: 1 })
  })
})

const read = async (path: string) => {
  let out: Record<string, unknown> | undefined
  await env.withSecurityRulesDisabled(async (ctx) => {
    out = (await getDoc(doc(ctx.firestore(), path))).data()
  })
  return out
}

describe('admin callables (emulator)', () => {
  it('refuse everyone but admins', async () => {
    expect((await call('adminStats', { days: 3 })).error?.status).toBe('UNAUTHENTICATED')
    expect((await call('adminStats', { days: 3 }, 'alice')).error?.status).toBe('PERMISSION_DENIED')
    expect((await call('adminBlockUser', { uid: 'alice', block: true }, 'alice')).error?.status).toBe('PERMISSION_DENIED')
  })

  it('adminStats returns the last N days of counters and group totals', async () => {
    const r = await call<{
      today: string
      days: Array<{ day: string; capture: Record<string, number>; push: Record<string, number> }>
      totals: Record<string, unknown>
    }>('adminStats', { days: 3 }, 'boss')
    expect(r.status).toBe(200)
    const s = r.result!
    expect(s.today).toBe(today)
    expect(s.days).toHaveLength(3)
    const last = s.days[2]
    expect(last.day).toBe(today)
    expect(last.capture).toEqual({ received: 4, captured: 3 })
    expect(last.push).toEqual({ sent: 2 })
    expect(s.days[0].capture).toEqual({})
    expect(s.totals).toMatchObject({ groups: 2, activeGroups: 1, blocked: 0 })
    // No Auth emulator here: the account count is reported as unknown rather than wrong.
    expect(s.totals.users).toBeNull()
  })

  it('adminBlockUser writes the block entry, drops the account’s keys, and reverses', async () => {
    const r = await call<{ uid: string; blocked: boolean }>('adminBlockUser', { uid: 'alice', block: true, reason: 'Spam' }, 'boss')
    expect(r.status).toBe(200)
    expect(r.result).toMatchObject({ uid: 'alice', blocked: true })
    expect(await read('blocked/alice')).toMatchObject({ reason: 'Spam', by: 'boss' })
    expect(await read('users/alice/pushTokens/t1')).toBeUndefined()
    expect(await read('captureTokens/abcdefghijkmnpqrstuvwxyz2345')).toBeUndefined()

    const u = await call<{ blocked: boolean }>('adminBlockUser', { uid: 'alice', block: false }, 'boss')
    expect(u.result?.blocked).toBe(false)
    expect(await read('blocked/alice')).toBeUndefined()
  })

  it('the capture webhook counts outcomes in stats/capture_{day}', async () => {
    const sms = `Rs.840.00 debited from a/c XX1234 to VPA swiggy@icici (UPI Ref No 628112340001). Avl Bal Rs 12,345.00`
    const res = await fetch(url('capture'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'abcdefghijkmnpqrstuvwxyz2345', text: sms, sender: 'VM-HDFCBK', device: 'ios' }),
    })
    expect(res.status).toBe(200)
    // alice has no trip and outsideTrips is off: received, dropped as outside_trip, on top of the seeded counts.
    expect(await read(`stats/capture_${today}`)).toMatchObject({ day: today, received: 5, captured: 3, outside_trip: 1 })
  })

  it('an admin cannot block themselves or another admin, and the input is checked', async () => {
    expect((await call('adminBlockUser', { uid: 'boss', block: true }, 'boss')).error?.status).toBe('FAILED_PRECONDITION')
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'admins/second'), { note: 'x' }))
    expect((await call('adminBlockUser', { uid: 'second', block: true }, 'boss')).error?.status).toBe('FAILED_PRECONDITION')
    expect((await call('adminBlockUser', { uid: 'alice', block: 'yes' }, 'boss')).error?.status).toBe('INVALID_ARGUMENT')
    expect((await call('adminBlockUser', { uid: 'nope/../x', block: true }, 'boss')).error?.status).toBe('INVALID_ARGUMENT')
  })
})
