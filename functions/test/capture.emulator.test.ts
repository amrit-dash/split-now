/**
 * POSTs real-looking SMS to the `capture` function in the emulator and checks what lands in
 * Firestore. Run with: npm run test:functions (builds functions, starts functions + firestore).
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore'

const PROJECT = 'demo-splitit'
const URL = `http://127.0.0.1:5001/${PROJECT}/asia-south1/capture`
const TOKEN = 'abcdefghijkmnpqrstuvwxyz2345'
const SCOPED = 'scopedtokenscopedtokenscope'
const LEFT = 'lefttokenlefttokenlefttoken2'
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
const [y, m, d] = today.split('-')
const ddmmyy = `${d}-${m}-${y.slice(2)}`
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

let env: RulesTestEnvironment

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
    const base = {
      emoji: '🏖️',
      currency: 'INR',
      simplify: true,
      memberUids: ['alice'],
      members: { alice: { name: 'Alice', uid: 'alice', color: '#000' } },
      inviteCode: 'ABC234',
      createdBy: 'alice',
      createdAt: 1,
      updatedAt: 1,
    }
    await setDoc(doc(db, 'groups/goa'), { ...base, id: 'goa', name: 'Goa Trip', type: 'trip', startDate: addDays(today, -2), endDate: addDays(today, 3) })
    await setDoc(doc(db, 'groups/old'), { ...base, id: 'old', name: 'Old Trip', type: 'trip', startDate: '2025-01-01', endDate: '2025-01-05' })
    await setDoc(doc(db, 'groups/gone'), {
      ...base,
      id: 'gone',
      name: 'Left Trip',
      type: 'trip',
      memberUids: ['bob'],
      members: { bob: { name: 'Bob', uid: 'bob', color: '#000' } },
      createdBy: 'bob',
    })
    await setDoc(doc(db, `captureTokens/${TOKEN}`), { uid: 'alice', createdAt: 1 })
    await setDoc(doc(db, `captureTokens/${SCOPED}`), { uid: 'alice', createdAt: 1, groupId: 'old', label: 'Old Trip' })
    await setDoc(doc(db, `captureTokens/${LEFT}`), { uid: 'alice', createdAt: 1, groupId: 'gone', label: 'Left Trip' })
  })
})

const post = (body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
  fetch(URL, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })

const sms = (ref = '628112345678') => `Rs.840.00 debited from a/c XX1234 on ${ddmmyy} to VPA swiggy@icici (UPI Ref No ${ref}). Avl Bal Rs 12,345.00`

async function captures() {
  let out: Array<Record<string, unknown>> = []
  await env.withSecurityRulesDisabled(async (ctx) => {
    out = (await getDocs(collection(ctx.firestore(), 'users/alice/captures'))).docs.map((x) => x.data())
  })
  return out
}

describe('capture webhook (emulator)', () => {
  it('saves a debit SMS as a pending capture matched to the live trip', async () => {
    const res = await post({ token: TOKEN, text: sms(), sender: 'VM-HDFCBK', device: 'ios', receivedAt: new Date().toISOString() })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({
      ok: true,
      matchedGroupId: 'goa',
      pushed: false,
      parsed: { amount: 84000, currency: 'INR', merchant: 'Swiggy', direction: 'debit', ref: '628112345678', date: today },
    })
    const [c] = await captures()
    expect(c).toMatchObject({ id: json.captureId, amount: 84000, merchant: 'Swiggy', status: 'pending', source: 'sms-ios', suggestedGroup: 'goa', date: today })
    expect(String(c.raw)).not.toContain('12,345')
    let lastUsed: unknown
    await env.withSecurityRulesDisabled(async (ctx) => {
      lastUsed = (await getDoc(doc(ctx.firestore(), `captureTokens/${TOKEN}`))).get('lastUsedAt')
    })
    expect(typeof lastUsed).toBe('number')
  })

  it('is idempotent on the bank reference', async () => {
    await post({ token: TOKEN, text: sms('111122223333') })
    const again = await post({ token: TOKEN, text: sms('111122223333') })
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ ok: false, reason: 'duplicate' })
    expect(await captures()).toHaveLength(1)
  })

  it('accepts text/plain with a Bearer token', async () => {
    const res = await post(sms('999988887777'), { 'content-type': 'text/plain', authorization: `Bearer ${TOKEN}`, 'user-agent': 'MacroDroid okhttp/4' })
    expect(res.status).toBe(200)
    expect((await captures())[0]).toMatchObject({ source: 'sms-android' })
  })

  it('accepts form-encoded bodies with ?t=', async () => {
    const res = await fetch(`${URL}?t=${TOKEN}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ text: sms('555566667777'), device: 'android' }).toString(),
    })
    expect(res.status).toBe(200)
  })

  it('ignores credits and OTPs without saving', async () => {
    const credit = await post({ token: TOKEN, text: `Rs.500.00 credited to A/c XX1234 on ${ddmmyy} from VPA rahul@okicici (UPI 628112345678)` })
    expect(credit.status).toBe(200)
    expect(await credit.json()).toEqual({ ok: false, reason: 'not_a_debit' })
    expect(await captures()).toHaveLength(0)
  })

  it('a token scoped to a trip drops payments outside it', async () => {
    const res = await post({ token: SCOPED, text: sms() })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false, reason: 'outside_trip' })
    expect(await captures()).toHaveLength(0)
  })

  it('skips a trip the person paused for themselves, and ignores the legacy group-wide captureOff', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'users/alice/settings/notifications'), { pausedTrips: ['goa'], outsideTrips: true }),
    )
    const paused = await post({ token: TOKEN, text: sms('333344445555') })
    expect(await paused.json()).toEqual({ ok: false, reason: 'paused' })
    expect(await captures()).toHaveLength(0)
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/settings/notifications'), { pausedTrips: [] })
      await setDoc(doc(ctx.firestore(), 'groups/goa'), { captureOff: true }, { merge: true })
    })
    const legacy = await post({ token: TOKEN, text: sms('333344446666') })
    expect(await legacy.json()).toMatchObject({ ok: true, matchedGroupId: 'goa' })
  })

  it('writes the activity log as one document, newest first, never with SMS text', async () => {
    await post({ token: TOKEN, text: sms('222233334444') })
    await post({ token: TOKEN, text: `Rs.500.00 credited to A/c XX1234 on ${ddmmyy} from VPA rahul@okicici (UPI 628112345678)` })
    let log: Record<string, unknown> | undefined
    await env.withSecurityRulesDisabled(async (ctx) => {
      log = (await getDoc(doc(ctx.firestore(), 'users/alice/captureLog/recent'))).data()
    })
    const entries = log?.entries as Array<Record<string, unknown>>
    expect(entries.map((e) => e.result)).toEqual(['not_a_debit', 'captured'])
    expect(entries[1]).toMatchObject({ amount: 84000, merchant: 'Swiggy', groupName: 'Goa Trip', device: 'other' })
    expect(JSON.stringify(log)).not.toContain('XX1234')
    let docs = 0
    await env.withSecurityRulesDisabled(async (ctx) => {
      docs = (await getDocs(collection(ctx.firestore(), 'users/alice/captureLog'))).size
    })
    expect(docs).toBe(1)
  })

  it('a transfer between the user’s own accounts is not a payment', async () => {
    const res = await post({ token: TOKEN, text: `Rs.2,000.00 debited from A/c XX1234 on ${ddmmyy} for UPI Lite top-up. UPI Ref 628112345670. -HDFC Bank` })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false, reason: 'not_a_debit' })
    expect(await captures()).toHaveLength(0)
  })

  it('infers the currency of a structured amount (A$12.50 is AUD, not ₹12.50)', async () => {
    const res = await post({ token: TOKEN, amount: 'A$12.50', merchant: 'Cafe Luna', ref: 'card-1' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, parsed: { amount: 1250, currency: 'AUD', merchant: 'Cafe Luna' } })
  })

  it('a key scoped to a trip the user left is dead, not "all my trips"', async () => {
    const res = await post({ token: LEFT, text: sms('333344445555') })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false, reason: 'bad_scope' })
    expect(await captures()).toHaveLength(0)
  })

  it('the same card alert without a reference is captured once', async () => {
    const card = `Spent Rs 1,234.00 on HDFC Bank Card x1234 at AMAZON on ${ddmmyy}. Not You? Call 18002586161`
    const first = await post({ token: TOKEN, text: card })
    expect(await first.json()).toMatchObject({ ok: true, parsed: { amount: 123400, merchant: 'Amazon' } })
    const again = await post({ token: TOKEN, text: `${card} ` })
    expect(await again.json()).toEqual({ ok: false, reason: 'duplicate' })
    expect(await captures()).toHaveLength(1)
  })

  it('refuses oversized bodies before reading anything', async () => {
    const res = await post({ token: TOKEN, text: 'x'.repeat(20_000) })
    expect(res.status).toBe(413)
  })

  it('rejects bad tokens and bad requests', async () => {
    expect((await post({ token: 'nope', text: sms() })).status).toBe(401)
    expect((await post({ token: 'x'.repeat(28), text: sms() })).status).toBe(401)
    const bad = await post({ token: TOKEN })
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ ok: false, reason: 'bad_request' })
    expect((await fetch(URL)).status).toBe(405)
  })
})
