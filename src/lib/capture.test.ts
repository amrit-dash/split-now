import { describe, expect, it } from 'vitest'
import {
  captureFromSharedText, captureQuery, classifySharedText, currencyFromAmount, inboxToDraft, inTripWindow, isLiveTrip, liveTripFor,
  newCaptureToken, normaliseSource, parseCaptureAmount, parseCaptureDate, parseCaptureParams, rankGroupsForCapture, sanitiseRef, sharedTextIgnoredText,
} from './capture'

const TODAY = '2026-10-07'
const P = (q: string) => new URLSearchParams(q)

describe('parseCaptureAmount', () => {
  it.each([
    ['12.50', 1250], ['A$12.50', 1250], ['$1,234.56', 123456], ['12,50 €', 1250], ['1.234,56', 123456],
    ['-4.20', 420], ['7', 700], ['1,234', 123400], ['AUD 9.9', 990], ['1.234.567', 123456700],
  ])('%s → %i', (raw, cents) => expect(parseCaptureAmount(raw)).toBe(cents))

  it.each(['', 'abc', '0', '0.00', '$', '1.2.3,4,5'])('rejects %j', (raw) => expect(parseCaptureAmount(raw)).toBeNaN())
})

describe('currencyFromAmount', () => {
  it.each([
    ['A$12.50', 'AUD'], ['AU$3', 'AUD'], ['NZ$5', 'NZD'], ['US$5', 'USD'], ['CA$5', 'CAD'], ['€4', 'EUR'],
    ['£4', 'GBP'], ['₹400', 'INR'], ['12.50 USD', 'USD'], ['You paid 5 AUD', 'AUD'],
  ])('%s → %s', (raw, cur) => expect(currencyFromAmount(raw)).toBe(cur))
  it('is undefined for a bare dollar sign', () => expect(currencyFromAmount('$12')).toBeUndefined())
})

describe('parseCaptureDate', () => {
  it('passes through ISO dates and takes the date part of timestamps as written', () => {
    expect(parseCaptureDate('2026-09-30', TODAY)).toBe('2026-09-30')
    expect(parseCaptureDate('2026-10-01T23:30:00+11:00', TODAY)).toBe('2026-10-01')
  })
  it('understands other formats and falls back to today', () => {
    expect(parseCaptureDate('3 Oct 2026', TODAY)).toBe('2026-10-03')
    expect(parseCaptureDate('', TODAY)).toBe(TODAY)
    expect(parseCaptureDate(undefined, TODAY)).toBe(TODAY)
    expect(parseCaptureDate('2026-02-31', TODAY)).toBe(TODAY)
    expect(parseCaptureDate('yesterday', TODAY)).toBe(TODAY)
  })
})

describe('parseCaptureParams', () => {
  it('parses the full v=1 contract', () => {
    const r = parseCaptureParams(P('v=1&amount=12.50&currency=aud&merchant=Cafe%20Luna&ts=2026-10-01T09:30:00%2B11:00&src=ios-shortcut&card=Amex&raw=A%2412.50&ref=abc-123&group=g_bali&t=tok&u=alice'), TODAY)
    expect(r).toEqual({
      ok: true,
      token: 'tok',
      owner: 'alice',
      draft: {
        amount: 1250, currency: 'AUD', merchant: 'Cafe Luna', date: '2026-10-01', ts: '2026-10-01T09:30:00+11:00',
        source: 'ios-shortcut', card: 'Amex', raw: 'A$12.50', note: undefined, ref: 'abc-123', group: 'g_bali',
      },
    })
  })
  it('accepts the older names as aliases', () => {
    const r = parseCaptureParams(P('amount=A$9&merchant=Bar&date=2026-10-02&source=applepay&note=hi'), TODAY)
    expect(r.ok && r.draft).toMatchObject({ amount: 900, currency: 'AUD', date: '2026-10-02', source: 'ios-shortcut', note: 'hi' })
  })
  it('falls back to raw when amount is missing, and defaults date and source', () => {
    const r = parseCaptureParams(P('raw=%E2%82%AC4,20&merchant=Kiosk'), TODAY)
    expect(r.ok && r.draft).toMatchObject({ amount: 420, currency: 'EUR', date: TODAY, source: 'manual' })
  })
  it('requires an amount and a merchant', () => {
    expect(parseCaptureParams(P('merchant=Cafe'), TODAY).ok).toBe(false)
    expect(parseCaptureParams(P('amount=abc&merchant=Cafe'), TODAY).ok).toBe(false)
    expect(parseCaptureParams(P('amount=0&merchant=Cafe'), TODAY).ok).toBe(false)
    expect(parseCaptureParams(P('amount=5'), TODAY).ok).toBe(false)
    expect(parseCaptureParams(P('amount=5&merchant=%20%20'), TODAY).ok).toBe(false)
  })
  it('rejects unknown versions and absurd amounts', () => {
    expect(parseCaptureParams(P('v=2&amount=5&merchant=x'), TODAY).ok).toBe(false)
    expect(parseCaptureParams(P('amount=99999999&merchant=x'), TODAY).ok).toBe(false)
  })
  it('clips long fields and drops unsafe refs', () => {
    const r = parseCaptureParams(P(`amount=1&merchant=${'m'.repeat(150)}&ref=../../x`), TODAY)
    expect(r.ok && r.draft.merchant.length).toBe(100)
    expect(r.ok && r.draft.ref).toBe(undefined)
  })
  it('round-trips through captureQuery', () => {
    const q = captureQuery({ amount: 1250, merchant: 'Cafe', source: 'share', date: '2026-10-01' })
    expect(q).toBe('v=1&amount=12.50&merchant=Cafe&src=share&date=2026-10-01')
    expect(parseCaptureParams(P(q), TODAY)).toMatchObject({ ok: true, draft: { amount: 1250, merchant: 'Cafe', source: 'share', date: '2026-10-01' } })
  })
})

describe('small helpers', () => {
  it('normalises sources', () => {
    expect(normaliseSource('ApplePay')).toBe('ios-shortcut')
    expect(normaliseSource('tasker')).toBe('android-auto')
    expect(normaliseSource('email')).toBe('email')
    expect(normaliseSource(undefined)).toBe('manual')
  })
  it('sanitises refs', () => {
    expect(sanitiseRef('txn_2026-10-07_001')).toBe('txn_2026-10-07_001')
    expect(sanitiseRef('a/b')).toBe(undefined)
    expect(sanitiseRef('ab')).toBe(undefined)
  })
  it('makes long random tokens', () => {
    const t = newCaptureToken()
    expect(t).toMatch(/^[a-z2-9]{28}$/)
    expect(newCaptureToken()).not.toBe(t)
  })
})

describe('inboxToDraft', () => {
  const base = { token: 't'.repeat(28), uid: 'alice', merchant: 'Cafe' }
  it('prefers an integer amount and otherwise parses raw', () => {
    expect(inboxToDraft({ ...base, amount: 1250, currency: 'usd' }, TODAY)).toMatchObject({ amount: 1250, currency: 'USD', source: 'ios-shortcut', date: TODAY })
    expect(inboxToDraft({ ...base, raw: 'A$12.50', ts: '2026-10-05T08:00:00+11:00', src: 'ios-shortcut' }, TODAY))
      .toMatchObject({ amount: 1250, currency: 'AUD', date: '2026-10-05' })
  })
  it('returns null when no amount can be recovered', () => {
    expect(inboxToDraft({ ...base, raw: 'n/a' }, TODAY)).toBeNull()
    expect(inboxToDraft(base, TODAY)).toBeNull()
  })
})

describe('trip windows', () => {
  const bali = { startDate: '2026-10-01', endDate: '2026-10-10' }
  it('is inclusive and open-ended when one side is missing', () => {
    expect(inTripWindow(bali, '2026-10-01')).toBe(true)
    expect(inTripWindow(bali, '2026-10-10')).toBe(true)
    expect(inTripWindow(bali, '2026-10-11')).toBe(false)
    expect(inTripWindow(bali, '2026-09-30')).toBe(false)
    expect(inTripWindow({ startDate: '2026-10-01' }, '2030-01-01')).toBe(true)
    expect(inTripWindow({ endDate: '2026-10-01' }, '2020-01-01')).toBe(true)
    expect(inTripWindow({}, TODAY)).toBe(false)
    expect(isLiveTrip(bali, TODAY)).toBe(true)
  })
})

describe('rankGroupsForCapture', () => {
  const g = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: 'trip' as const, currency: 'AUD', updatedAt: 0, ...extra })
  const groups = [
    g('flat', { type: 'home' as const, updatedAt: 100 }),
    g('personal', { type: 'personal' as const, updatedAt: 999 }),
    g('bali', { startDate: '2026-10-01', endDate: '2026-10-14', updatedAt: 1 }),
    g('wedding', { type: 'event' as const, startDate: '2026-10-06', endDate: '2026-10-08', updatedAt: 2 }),
    g('japan', { startDate: '2026-12-01', endDate: '2026-12-20', currency: 'JPY', updatedAt: 50 }),
  ]

  it('puts in-window groups first, tightest window first, and excludes the personal wallet', () => {
    const { ranked, best } = rankGroupsForCapture(groups, { date: '2026-10-07' })
    expect(ranked.map((x) => x.id)).toEqual(['wedding', 'bali', 'flat', 'japan'])
    expect(best).toBe('wedding')
  })
  it('does not pre-select anything when no trip covers the date', () => {
    const { ranked, best } = rankGroupsForCapture(groups, { date: '2026-11-15', currency: 'JPY' })
    expect(best).toBeUndefined()
    expect(ranked[0].id).toBe('japan') // currency match beats recency
  })
  it('uses currency, then recency, to break ties between equal windows', () => {
    const two = [g('a', { startDate: '2026-10-01', endDate: '2026-10-09', updatedAt: 5 }), g('b', { startDate: '2026-10-01', endDate: '2026-10-09', currency: 'EUR', updatedAt: 1 })]
    expect(rankGroupsForCapture(two, { date: '2026-10-05', currency: 'EUR' }).best).toBe('b')
    expect(rankGroupsForCapture(two, { date: '2026-10-05' }).best).toBe('a')
  })
  it('liveTripFor picks the running trip', () => {
    expect(liveTripFor(groups, '2026-10-02')).toBe('bali')
    expect(liveTripFor(groups, '2027-01-01')).toBeUndefined()
  })
})

describe('captureFromSharedText', () => {
  const HDFC = 'Rs.250.00 debited from a/c 50100123456789 on 07-10-26 to VPA swiggy@icici (UPI Ref No 628112345678). Avl Bal Rs 12,345.00'
  it('runs a bank SMS through the SMS parser, masks the note and dedupes on the bank ref', () => {
    const d = captureFromSharedText({ text: HDFC }, TODAY)
    expect(d).toMatchObject({ amount: 25000, currency: 'INR', merchant: 'Swiggy', date: '2026-10-07', source: 'share', ref: 'sms_628112345678' })
    expect(d?.note).toContain('XX6789')
    expect(d?.note).not.toContain('50100123456789')
    expect(d?.note).not.toContain('12,345')
    expect(d?.card).toBeUndefined()
    // the bank is read from the text; a suffix is only kept when the bank already masked it (a/c XX1234)
    expect(captureFromSharedText({ text: HDFC, title: 'HDFC Bank' }, TODAY)?.card).toBe('HDFC Bank')
    expect(captureFromSharedText({ text: HDFC.replace('50100123456789', 'XX6789'), title: 'HDFC Bank' }, TODAY)?.card).toBe('HDFC Bank ••6789')
  })
  it('never captures credits, OTPs, requests or self transfers, and says why', () => {
    expect(captureFromSharedText({ text: 'Rs.500.00 credited to HDFC Bank A/c XX1234 on 07-10-26 from VPA rahul@okicici (UPI 628112345678)' }, TODAY)).toBeNull()
    expect(classifySharedText({ text: '482913 is your OTP to complete the transaction of Rs.840 at Swiggy. Never share it.' }, TODAY)).toEqual({ outcome: 'ignored', kind: 'otp' })
    expect(classifySharedText({ text: 'Rs.2,000.00 debited from A/c XX1234 for UPI Lite top-up. UPI Ref 628112345678.' }, TODAY)).toEqual({ outcome: 'ignored', kind: 'transfer' })
    const r = classifySharedText({ text: 'RAHUL SHARMA is requesting Rs.500.00 from you on Google Pay.' }, TODAY)
    expect(r.outcome === 'ignored' && sharedTextIgnoredText(r)).toMatch(/request/)
  })
  it('applies the user’s capture filters like the webhook does', () => {
    expect(classifySharedText({ text: HDFC }, TODAY, { minAmount: 50000, ignoreWords: [] })).toEqual({ outcome: 'ignored', kind: 'debit', filtered: 'below_min' })
    expect(classifySharedText({ text: HDFC }, TODAY, { minAmount: 0, ignoreWords: ['swiggy'] })).toEqual({ outcome: 'ignored', kind: 'debit', filtered: 'ignored' })
    expect(classifySharedText({ text: HDFC }, TODAY, { minAmount: 0, ignoreWords: ['rent'] }).outcome).toBe('capture')
  })
  it('gives the same id to the same message without a reference', () => {
    const t = 'Rs.60.00 debited from a/c XX1234 to VPA paytmqr5c5kj9@ptys on 07-10-26'
    const a = captureFromSharedText({ text: t }, TODAY)
    expect(a?.merchant).toBe('Payment')
    expect(a?.ref).toMatch(/^shr_/)
    expect(captureFromSharedText({ text: `  ${t} ` }, TODAY)?.ref).toBe(a?.ref)
    expect(captureFromSharedText({ text: t.replace('60.00', '61.00') }, TODAY)?.ref).not.toBe(a?.ref)
  })
  it('reads a payment sentence', () => {
    expect(captureFromSharedText({ text: 'You paid A$12.50 to Cafe Luna' }, TODAY))
      .toMatchObject({ amount: 1250, currency: 'AUD', merchant: 'Cafe Luna', source: 'share', date: TODAY })
  })
  it('finds a merchant after "at"', () => {
    expect(captureFromSharedText({ title: 'Card purchase', text: 'Purchase of $8.40 at Seven Eleven on 03/10/2026' }, TODAY))
      .toMatchObject({ amount: 840, merchant: 'Seven Eleven', date: '2026-10-03' })
  })
  it('returns null with no amount', () => {
    expect(captureFromSharedText({ text: 'see you at dinner' }, TODAY)).toBeNull()
    expect(captureFromSharedText({}, TODAY)).toBeNull()
  })
})
