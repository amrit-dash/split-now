import { describe, expect, it } from 'vitest'
import { evaluateReminders, reminderTargets, netBalances, reminderThreshold } from './balances'
import { captureDoc, interpret, STATUS } from './capture-core'
import { captureIdFor, tokenKey } from './ids'
import { captureNote, expenseNote, formatMoney, reminderNote, settlementNote, settlementRecordedNote } from './notify-text'
import { resolvePrefs } from './prefs'
import { applyRateLimit } from './ratelimit'
import { expenseRecipients, memberUid } from './recipients'
import { readCaptureRequest } from './request'
import { istDate, transactionDate } from './time'
import { matchScoped, pickTrip } from './trips'

const SMS = 'Rs.840.00 debited from a/c XX1234 on 07-10-26 to VPA swiggy@icici (UPI Ref No 628112345678). Avl Bal Rs 12,345.00'
const TOKEN = 'abcdefghijkmnpqrstuvwxyz2345'
const NOW = new Date('2026-10-07T12:00:00+05:30')

describe('request normalisation', () => {
  it('reads JSON bodies', () => {
    const r = readCaptureRequest({ body: { token: TOKEN, text: SMS, device: 'ios', receivedAt: '2026-10-07T12:00:00+05:30' } })
    expect(r).toMatchObject({ token: TOKEN, text: SMS, device: 'ios' })
  })
  it('reads text/plain: JSON text or the raw SMS', () => {
    expect(readCaptureRequest({ body: JSON.stringify({ token: TOKEN, text: SMS }) }).text).toBe(SMS)
    const r = readCaptureRequest({ body: SMS, authorization: `Bearer ${TOKEN}`, userAgent: 'MacroDroid/5.0 okhttp' })
    expect(r).toMatchObject({ token: TOKEN, text: SMS, device: 'android' })
  })
  it('takes the token from ?t= and accepts form fields and numeric amounts', () => {
    const r = readCaptureRequest({ body: { amount: 840, merchant: ' Swiggy ' }, query: { t: TOKEN } })
    expect(r).toMatchObject({ token: TOKEN, amount: '840', merchant: 'Swiggy', device: 'other' })
  })
  it('infers iOS from the Shortcuts user agent', () => {
    expect(readCaptureRequest({ body: {}, userAgent: 'BackgroundShortcutRunner/1 CFNetwork/1498 Darwin/24' }).device).toBe('ios')
  })
})

describe('interpret', () => {
  it('parses an SMS into the contract shape with a masked raw', () => {
    const res = interpret(readCaptureRequest({ body: { token: TOKEN, text: SMS, device: 'ios' } }), NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.parsed).toEqual({ amount: 84000, currency: 'INR', merchant: 'Swiggy', direction: 'debit', ref: '628112345678', date: '2026-10-07' })
    expect(res.extra.source).toBe('sms-ios')
    expect(res.extra.raw).not.toContain('12,345')
    expect(res.extra.card).toBeUndefined()
  })
  it('rejects credits, OTPs and empty requests', () => {
    const r = (text?: string) => interpret(readCaptureRequest({ body: { token: TOKEN, text } }), NOW)
    expect(r('Rs.500.00 credited to A/c XX1234 on 07-10-26 from VPA a@okicici')).toMatchObject({ ok: false, reason: 'not_a_debit' })
    expect(r('482913 is your OTP for txn of Rs 500 at Amazon')).toMatchObject({ ok: false, reason: 'not_a_debit' })
    expect(r('Rs.2,000.00 debited from A/c XX1234 for UPI Lite top-up. UPI Ref 628112345678.')).toMatchObject({
      ok: false,
      reason: 'not_a_debit',
      sms: { kind: 'transfer' },
    })
    expect(r('hello there')).toMatchObject({ ok: false, reason: 'unparsed' })
    expect(r(undefined)).toEqual({ ok: false, reason: 'bad_request' })
    expect(STATUS.not_a_debit).toBe(200)
    expect(STATUS.bad_token).toBe(401)
    expect(STATUS.rate_limited).toBe(429)
  })
  it('accepts structured fields (URL contract v1 meaning: decimal amount)', () => {
    const res = interpret(readCaptureRequest({ body: { amount: '1,250.50', merchant: 'Cafe', ts: '2026-10-05T10:00:00+05:30', device: 'android' } }), NOW)
    expect(res.ok && res.parsed).toEqual({ amount: 125050, currency: 'INR', merchant: 'Cafe', direction: 'debit', date: '2026-10-05' })
    expect(res.ok && res.extra.source).toBe('android-auto')
  })
  it('infers the currency of a structured amount the way a /capture link does', () => {
    const cur = (amount: string, currency?: string) => {
      const res = interpret(readCaptureRequest({ body: { amount, currency, merchant: 'x' } }), NOW)
      return res.ok ? [res.parsed.currency, res.parsed.amount] : res.reason
    }
    expect(cur('A$12.50')).toEqual(['AUD', 1250])
    expect(cur('S$9')).toEqual(['SGD', 900])
    expect(cur('¥1200')).toEqual(['JPY', 1200])
    expect(cur('12.50 SGD')).toEqual(['SGD', 1250])
    expect(cur('840')).toEqual(['INR', 84000])
    expect(cur('A$12.50', 'INR')).toEqual(['INR', 1250])
  })
  it('builds a pending Capture document', () => {
    const res = interpret(readCaptureRequest({ body: { text: SMS, device: 'android' } }), NOW)
    if (!res.ok) throw new Error('expected ok')
    const d = captureDoc('sms_x', res.parsed, res.extra, 'g1', 1)
    expect(d).toMatchObject({ id: 'sms_x', amount: 84000, merchant: 'Swiggy', status: 'pending', source: 'sms-android', suggestedGroup: 'g1', createdAt: 1 })
    expect(Object.values(d)).not.toContain(undefined)
  })
})

describe('dates (IST)', () => {
  it('formats instants in Asia/Kolkata', () => {
    expect(istDate(new Date('2026-10-06T19:00:00Z'))).toBe('2026-10-07') // 00:30 IST
    expect(istDate(new Date('2026-10-06T18:00:00Z'))).toBe('2026-10-06')
  })
  it('prefers a plausible SMS date, else the received date', () => {
    expect(transactionDate('2026-10-05', NOW, NOW)).toBe('2026-10-05')
    expect(transactionDate('2024-01-01', NOW, NOW)).toBe('2026-10-07')
    expect(transactionDate(undefined, new Date('2026-10-06T19:00:00Z'), NOW)).toBe('2026-10-07')
  })
})

describe('trip matching', () => {
  const goa = { id: 'goa', name: 'Goa', type: 'trip', startDate: '2026-10-05', endDate: '2026-10-10', updatedAt: 1 }
  const india = { id: 'india', name: 'India', type: 'trip', startDate: '2026-10-01', endDate: '2026-10-31', updatedAt: 2 }
  const flat = { id: 'flat', name: 'Flat', type: 'home', updatedAt: 3 }
  it('picks the tightest window containing the date', () => {
    expect(pickTrip([india, goa, flat], '2026-10-07')?.id).toBe('goa')
    expect(pickTrip([india, goa, flat], '2026-10-20')?.id).toBe('india')
    expect(pickTrip([india, goa, flat], '2026-11-20')).toBeUndefined()
  })
  it('ignores the personal wallet and undated groups', () => {
    expect(pickTrip([{ ...goa, type: 'personal' }, flat], '2026-10-07')).toBeUndefined()
  })
  it('scoped: inside, outside, and undated (always on)', () => {
    expect(matchScoped(goa, '2026-10-07').kind).toBe('matched')
    expect(matchScoped(goa, '2026-10-11').kind).toBe('outside')
    expect(matchScoped(flat, '2026-10-11').kind).toBe('matched')
  })
})

describe('idempotency', () => {
  const p = { amount: 84000, currency: 'INR', merchant: 'Swiggy' }
  it('uses the bank ref when there is one', () => {
    const a = captureIdFor('u1', { ...p, ref: '628112345678' }, new Date('2026-10-07T10:00:00Z'))
    const b = captureIdFor('u1', { ...p, amount: 1, ref: '628112345678' }, new Date('2026-10-08T10:00:00Z'))
    expect(a).toBe(b)
    expect(a).toMatch(/^sms_[0-9a-f]{24}$/)
    expect(captureIdFor('u2', { ...p, ref: '628112345678' }, new Date())).not.toBe(a)
  })
  it('falls back to amount + merchant + minute', () => {
    const t = new Date('2026-10-07T10:00:05Z')
    expect(captureIdFor('u1', p, t)).toBe(captureIdFor('u1', { ...p, merchant: 'SWIGGY' }, new Date('2026-10-07T10:00:55Z')))
    expect(captureIdFor('u1', p, t)).not.toBe(captureIdFor('u1', p, new Date('2026-10-07T10:01:05Z')))
    expect(captureIdFor('u1', p, t)).not.toBe(captureIdFor('u1', { ...p, amount: 84001 }, t))
  })
  it('without a ref, the same (masked) message is the same capture whenever it arrives', () => {
    const text = 'Txn Rs.840.00 On HDFC Bank Card XX1234 At SWIGGY On 07-10. Not You? Call 18002586161'
    const a = captureIdFor('u1', p, new Date('2026-10-07T10:00:05Z'), text)
    expect(captureIdFor('u1', p, new Date('2026-10-07T10:03:05Z'), `  ${text.toUpperCase()}  `)).toBe(a)
    expect(captureIdFor('u1', p, new Date('2026-10-07T10:00:05Z'), text.replace('840', '841'))).not.toBe(a)
    expect(captureIdFor('u1', { ...p, ref: '628112345678' }, new Date(), text)).not.toBe(a)
  })
  it('hashes tokens for rate-limit doc ids', () => {
    expect(tokenKey(TOKEN)).toHaveLength(32)
    expect(tokenKey(TOKEN)).not.toContain(TOKEN)
  })
})

describe('rate limit', () => {
  const L = { perHour: 2, perDay: 3 }
  it('counts per hour and per day, and resets', () => {
    let s = applyRateLimit(undefined, 0, L)
    expect(s.allowed).toBe(true)
    s = applyRateLimit(s.next, 1000, L)
    expect(s.allowed).toBe(true)
    expect(applyRateLimit(s.next, 2000, L).allowed).toBe(false)
    s = applyRateLimit(s.next, 3_600_000, L) // new hour
    expect(s.allowed).toBe(true)
    expect(applyRateLimit(s.next, 7_300_000, L).allowed).toBe(false) // day cap
    expect(applyRateLimit(s.next, 86_400_000, L).allowed).toBe(true)
  })
})

describe('notification text (en-IN)', () => {
  it('formats rupees with Indian grouping', () => {
    expect(formatMoney(84000)).toBe('₹840')
    expect(formatMoney(84050)).toBe('₹840.50')
    expect(formatMoney(10000000)).toBe('₹1,00,000')
    expect(formatMoney(1250, 'USD')).toBe('$12.50')
  })
  it('capture: matched trip and unsorted', () => {
    expect(captureNote({ captureId: 'c1', amount: 84000, merchant: 'Swiggy', groupName: 'Goa Trip' })).toEqual({
      title: 'New payment',
      body: 'You spent ₹840 at Swiggy — add to Goa Trip?',
      url: '/capture/c1',
      tag: 'capture-c1',
    })
    expect(captureNote({ captureId: 'c1', amount: 84000 }).title).toBe('Unsorted payment')
  })
  it('expense, settlement and reminder', () => {
    const e = expenseNote({
      groupId: 'g',
      expenseId: 'e',
      groupName: 'Goa Trip',
      emoji: '🏖️',
      actorName: 'Sarah',
      description: 'Dinner',
      amount: 84000,
      currency: 'INR',
      share: 21000,
      paid: 0,
    })
    expect(e).toMatchObject({ title: '🏖️ Goa Trip', body: 'Sarah added Dinner · ₹840 · your share ₹210', url: '/groups/g/expenses/e' })
    expect(
      expenseNote({ groupId: 'g', expenseId: 'e', groupName: 'G', actorName: 'S', description: 'Taxi', amount: 50000, currency: 'INR', share: 0, paid: 50000 })
        .body,
    ).toContain('you paid ₹500')
    expect(settlementNote({ groupId: 'g', settlementId: 's', groupName: 'Goa', fromName: 'Rahul', amount: 50000, currency: 'INR' }).body).toBe(
      'Rahul paid you ₹500',
    )
    expect(settlementRecordedNote({ groupId: 'g', settlementId: 's', groupName: 'Goa', toName: 'Priya', amount: 50000, currency: 'INR' }).body).toBe(
      'Priya recorded that you paid ₹500. Not right? Open it to flag.',
    )
    expect(reminderNote({ groupId: 'g', groupName: 'Goa', owed: 124000, currency: 'INR' })).toMatchObject({ url: '/groups/g/settle', urgency: 'normal' })
    expect(reminderNote({ groupId: 'g', groupName: 'Goa', owed: 124000, currency: 'INR' }).body).toContain('₹1,240')
  })
})

describe('recipients and prefs', () => {
  const members = { a: { name: 'Sarah', uid: 'ua' }, b: { name: 'Bob', uid: 'ub' }, c: { name: 'Placeholder' }, d: { name: 'Dee', uid: 'ud' } }
  const uids = ['ua', 'ub', 'ud']
  it('notifies people in the expense with an account, except the author', () => {
    const r = expenseRecipients(members, { createdBy: 'ua', paidBy: { a: 84000 }, splits: { a: 21000, b: 21000, c: 21000, d: 21000 } }, uids)
    expect(r.map((x) => x.uid).sort()).toEqual(['ub', 'ud'])
    expect(r[0].share).toBe(21000)
  })
  it('never notifies a uid that is not in memberUids (a stranger typed into a member entry)', () => {
    const e = { createdBy: 'ua', paidBy: { a: 84000 }, splits: { a: 21000, b: 21000, d: 42000 } }
    expect(expenseRecipients({ ...members, d: { name: 'URGENT pay now', uid: 'victim' } }, e, uids).map((x) => x.uid)).toEqual(['ub'])
    expect(expenseRecipients(members, e)).toEqual([])
    expect(memberUid(members, 'b', uids)).toBe('ub')
    expect(memberUid({ ...members, b: { uid: 'victim' } }, 'b', uids)).toBeUndefined()
    expect(memberUid(members, 'c', uids)).toBeUndefined()
  })
  it('defaults prefs (unsorted off) and respects stored values', () => {
    expect(resolvePrefs(undefined)).toEqual({ captures: true, unsorted: false, expenses: true, settlements: true, reminders: true, outsideTrips: false })
    expect(resolvePrefs({ expenses: false, unsorted: true, junk: 1 })).toMatchObject({ expenses: false, unsorted: true })
    expect(resolvePrefs({ outsideTrips: true }).outsideTrips).toBe(true)
  })
})

describe('reminders', () => {
  const DAY = 86_400_000
  const now = 100 * DAY
  const members = { a: { uid: 'ua' }, b: { uid: 'ub' }, c: {} }
  const old = { amount: 200000, paidBy: { a: 200000 }, splits: { a: 100000, b: 100000 }, createdAt: now - 10 * DAY }
  it('nudges someone who has owed > ₹500 for over 7 days', () => {
    expect(reminderTargets({ members, currency: 'INR', expenses: [old], settlements: [], now, lastSent: {} })).toEqual([
      { uid: 'ub', memberId: 'b', owed: 100000 },
    ])
  })
  it('not for recent debts, small debts, settled debts, trash or within the cooldown', () => {
    const base = { members, currency: 'INR', settlements: [], now, lastSent: {} }
    expect(reminderTargets({ ...base, expenses: [{ ...old, createdAt: now - 2 * DAY }] })).toEqual([])
    expect(reminderTargets({ ...base, expenses: [{ ...old, amount: 80000, paidBy: { a: 80000 }, splits: { a: 40000, b: 40000 } }] })).toEqual([])
    expect(reminderTargets({ ...base, expenses: [old], settlements: [{ from: 'b', to: 'a', amount: 100000, createdAt: now - DAY }] })).toEqual([])
    expect(reminderTargets({ ...base, expenses: [{ ...old, deletedAt: 1 }] })).toEqual([])
    expect(reminderTargets({ ...base, expenses: [old], lastSent: { ub: now - 3 * DAY } })).toEqual([])
    expect(reminderTargets({ ...base, expenses: [old], lastSent: { ub: now - 8 * DAY } })).toHaveLength(1)
  })
  it('ignores unbalanced expenses; thresholds per currency', () => {
    expect(netBalances([{ amount: 100, paidBy: { a: 100 }, splits: { b: 50 } }], [])).toEqual({})
    expect(reminderThreshold('INR')).toBe(50000)
    expect(reminderThreshold('USD')).toBe(1000)
    expect(reminderThreshold('JPY')).toBe(10)
  })
  it('an expense still awaiting approval does not count, like in the app', () => {
    const pending = { ...old, requiresApproval: true, createdBy: 'ua' }
    expect(reminderTargets({ members, currency: 'INR', expenses: [pending], settlements: [], now, lastSent: {} })).toEqual([])
    expect(reminderTargets({ members, currency: 'INR', expenses: [{ ...pending, approvals: { ub: true } }], settlements: [], now, lastSent: {} })).toHaveLength(
      1,
    )
  })
  it('candidate memory: the clock starts when the debt first goes over the threshold', () => {
    const base = { members, currency: 'INR', settlements: [], state: undefined }
    // a debt edited into existence yesterday (createdAt is old) is new to the memory: not yet
    const edited = { ...old, amount: 200000, paidBy: { a: 200000 }, splits: { a: 100000, b: 100000 }, createdAt: now - 10 * DAY }
    const first = evaluateReminders({ ...base, expenses: [edited], now, state: { candidates: { b: now - 2 * DAY } } })
    expect(first.targets).toEqual([])
    expect(first.next).toMatchObject({ hasCandidates: true, candidates: { b: now - 2 * DAY }, evaluatedAt: now })
    // seven days later it is due; once nudged, the cooldown holds it
    const later = evaluateReminders({ ...base, expenses: [edited], now: now + 6 * DAY, state: first.next })
    expect(later.targets).toEqual([{ uid: 'ub', memberId: 'b', owed: 100000 }])
    const nudged = { ...later.next, lastSent: { ub: now + 6 * DAY } }
    expect(evaluateReminders({ ...base, expenses: [edited], now: now + 8 * DAY, state: nudged }).targets).toEqual([])
    // settled: the candidate is dropped and the group stops being watched
    const settled = evaluateReminders({ ...base, expenses: [edited], settlements: [{ from: 'b', to: 'a', amount: 100000 }], now: now + 9 * DAY, state: nudged })
    expect(settled.next).toMatchObject({ hasCandidates: false, candidates: {}, lastSent: { ub: now + 6 * DAY } })
  })
  it('first evaluation after the upgrade: a debt already a week old is due now, a newer one waits', () => {
    const r = evaluateReminders({ members, currency: 'INR', expenses: [old], settlements: [], now, state: undefined })
    expect(r.targets).toHaveLength(1)
    expect(r.next.candidates.b).toBe(now - 7 * DAY)
    const fresh = evaluateReminders({ members, currency: 'INR', expenses: [{ ...old, createdAt: now - 2 * DAY }], settlements: [], now, state: undefined })
    expect(fresh.targets).toEqual([])
    expect(fresh.next.candidates.b).toBe(now)
  })
})

import { clientIp, ipLimited, isKnownUnknown, rememberUnknown } from '../capture'
describe('pre-auth guards', () => {
  it('limits requests per client address inside a window', () => {
    const hits = new Map<string, { n: number; t: number }>()
    for (let i = 0; i < 3; i++) expect(ipLimited('1.2.3.4', 1000 + i, 3, 60_000, hits)).toBe(false)
    expect(ipLimited('1.2.3.4', 1004, 3, 60_000, hits)).toBe(true)
    expect(ipLimited('5.6.7.8', 1004, 3, 60_000, hits)).toBe(false)
    expect(ipLimited('1.2.3.4', 70_000, 3, 60_000, hits)).toBe(false)
    expect(clientIp('9.9.9.9, 10.0.0.1', '127.0.0.1')).toBe('9.9.9.9')
    expect(clientIp(undefined, '127.0.0.1')).toBe('127.0.0.1')
    expect(clientIp('', undefined)).toBe('unknown')
  })
  it('remembers unknown tokens for a while', () => {
    const cache = new Map<string, number>()
    expect(isKnownUnknown('t', 0, cache)).toBe(false)
    rememberUnknown('t', 0, cache)
    expect(isKnownUnknown('t', 1000, cache)).toBe(true)
    expect(isKnownUnknown('t', 6 * 60_000, cache)).toBe(false)
  })
})

import { senderId } from './request'
describe('senderId', () => {
  it('keeps sender ids, phone numbers and short names', () => {
    expect(senderId('VM-HDFCBK')).toBe('VM-HDFCBK')
    expect(senderId('AX-ICICIT-S')).toBe('AX-ICICIT-S')
    expect(senderId('+919876543210')).toBe('+919876543210')
    expect(senderId('HDFC Bank')).toBe('HDFC Bank')
  })
  it('drops a whole message passed as sender (iPhone Shortcut quirk)', () => {
    expect(senderId('Rs.250.00 debited from a/c XX1234 on 07-')).toBeUndefined()
    expect(senderId('Sent Rs.500 to swiggy@icici')).toBeUndefined()
    expect(senderId(undefined)).toBeUndefined()
  })
})
