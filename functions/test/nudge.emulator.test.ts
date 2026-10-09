/**
 * Calls the `nudge` callable in the Functions emulator: one group, and several groups at once
 * (the Balances screen's "by person" row). Nobody here has a push token, so every nudge that
 * goes out answers `no_push` and leaves the in-app reminder (the activity entry) instead.
 * Run with: npm run test:functions.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDocs, setDoc } from 'firebase/firestore'

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

async function call<T>(data: unknown, uid?: string): Promise<{ result?: T; error?: { status: string; message: string } }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (uid) headers.authorization = `Bearer ${token(uid)}`
  const res = await fetch(url('nudge'), { method: 'POST', headers, body: JSON.stringify({ data }) })
  return (await res.json()) as { result?: T; error?: { status: string; message: string } }
}

type Res = { sent: boolean; reason?: string; amount?: number; groups?: number }

const group = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  emoji: '🏖️',
  type: 'trip',
  currency: 'INR',
  memberUids: ['alice', 'bob'],
  members: { m_a: { name: 'Alice', uid: 'alice' }, m_b: { name: 'Bob', uid: 'bob' }, m_c: { name: 'Chai' } },
  createdBy: 'alice',
  createdAt: 1,
  updatedAt: Date.now(),
  ...extra,
})
/** `payer` paid `amount`, split equally with `other`. */
const expense = (payer: string, other: string, amount: number) => ({
  description: 'Dinner',
  amount,
  paidBy: { [payer]: amount },
  splits: { [payer]: amount / 2, [other]: amount / 2 },
  createdBy: 'alice',
  createdAt: 1,
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
    const db = ctx.firestore()
    // Bob owes Alice ₹1,000 in Goa and ₹500 in Flat; Alice owes Bob ₹200 in Office.
    await setDoc(doc(db, 'groups/goa'), group('Goa trip'))
    await setDoc(doc(db, 'groups/goa/expenses/e1'), expense('m_a', 'm_b', 200000))
    await setDoc(doc(db, 'groups/flat'), group('Flat'))
    await setDoc(doc(db, 'groups/flat/expenses/e1'), expense('m_a', 'm_b', 100000))
    await setDoc(doc(db, 'groups/office'), group('Office'))
    await setDoc(doc(db, 'groups/office/expenses/e1'), expense('m_b', 'm_a', 40000))
    // Chai (a placeholder) owes Alice in Goa too.
    await setDoc(doc(db, 'groups/goa/expenses/e2'), expense('m_a', 'm_c', 60000))
  })
})

const nudges = async (groupId: string) => {
  let out: Array<Record<string, unknown>> = []
  await env.withSecurityRulesDisabled(async (ctx) => {
    out = (await getDocs(collection(ctx.firestore(), `groups/${groupId}/activity`))).docs.map((d) => d.data()).filter((a) => a.type === 'settlement.nudged')
  })
  return out
}

describe('nudge callable (emulator)', () => {
  it('one group: no push to send, so the in-app reminder is left and the day is used', async () => {
    expect((await call({ groupId: 'goa', memberId: 'm_b' })).error?.status).toBe('UNAUTHENTICATED')
    expect((await call<Res>({ groupId: 'goa', memberId: 'm_b' }, 'alice')).result).toEqual({ sent: false, reason: 'no_push', amount: 100000 })
    const [entry] = await nudges('goa')
    expect(entry).toMatchObject({ actorUid: 'alice', targetId: 'm_b', after: { amount: 100000, memberId: 'm_b' } })
    expect((await call<Res>({ groupId: 'goa', memberId: 'm_b' }, 'alice')).result).toMatchObject({ sent: false, reason: 'rate_limited' })
    // nothing owed the other way, and nobody to push to for a placeholder
    expect((await call<Res>({ groupId: 'goa', memberId: 'm_a' }, 'bob')).result).toEqual({ sent: false, reason: 'not_owed' })
    expect((await call<Res>({ groupId: 'goa', memberId: 'm_c' }, 'alice')).result).toEqual({ sent: false, reason: 'not_member' })
  })

  it('several groups: one nudge with the net total, an entry in each group they owe in, once a day', async () => {
    const items = [
      { groupId: 'goa', memberId: 'm_b', amount: 100000 },
      { groupId: 'flat', memberId: 'm_b' },
      { groupId: 'office', memberId: 'm_b' },
    ]
    // 1,000 + 500 − 200
    expect((await call<Res>({ items }, 'alice')).result).toEqual({ sent: false, reason: 'no_push', amount: 130000, groups: 2 })
    expect(await nudges('goa')).toHaveLength(1)
    expect((await nudges('flat'))[0]).toMatchObject({ targetId: 'm_b', after: { amount: 50000, memberId: 'm_b', total: 130000 } })
    expect(await nudges('office')).toHaveLength(0)
    expect((await call<Res>({ items }, 'alice')).result).toMatchObject({ sent: false, reason: 'rate_limited' })
    // and a single-group nudge in one of those groups waits for tomorrow too
    expect((await call<Res>({ groupId: 'flat', memberId: 'm_b' }, 'alice')).result).toMatchObject({ sent: false, reason: 'rate_limited' })
  })

  it('several groups: nothing owed overall, junk and oversized requests', async () => {
    const owedNothing = [
      { groupId: 'office', memberId: 'm_b' },
      { groupId: 'nope', memberId: 'm_b' },
    ]
    expect((await call<Res>({ items: owedNothing }, 'alice')).result).toEqual({ sent: false, reason: 'not_owed' })
    const placeholders = [
      { groupId: 'goa', memberId: 'm_c' },
      { groupId: 'flat', memberId: 'm_c' },
    ]
    expect((await call<Res>({ items: placeholders }, 'alice')).result).toEqual({ sent: false, reason: 'not_member' })
    const many = Array.from({ length: 21 }, (_, i) => ({ groupId: `g${i}`, memberId: 'm_b' }))
    expect((await call({ items: many }, 'alice')).error?.status).toBe('INVALID_ARGUMENT')
    expect((await call({ items: [{ groupId: 'a/b', memberId: 'm_b' }] }, 'alice')).error?.status).toBe('INVALID_ARGUMENT')
  })
})
