import { describe, expect, it } from 'vitest'
import { awaitingOk, checkPayment, checkReasonText, needsOkOnCreate, type OkSettlement, payeeMatches, settlementCounts } from './payment-ok'

const members = { a: { uid: 'ua' }, b: { uid: 'ub' }, c: {}, gone: { uid: 'ug', removedAt: 5 } }
const pay = (o: Partial<OkSettlement> = {}): OkSettlement => ({ from: 'a', to: 'b', createdBy: 'ua', needsOk: true, ...o })

describe('needsOkOnCreate', () => {
  it('asks for the payee’s OK only when the group does, they have an account, and someone else records it', () => {
    expect(needsOkOnCreate(true, { to: 'b' }, members, 'ua')).toBe(true)
    expect(needsOkOnCreate(true, { to: 'b' }, members, 'ub')).toBe(false)
    expect(needsOkOnCreate(false, { to: 'b' }, members, 'ua')).toBe(false)
    expect(needsOkOnCreate(undefined, { to: 'b' }, members, 'ua')).toBe(false)
    // A placeholder (no account) or someone who left can't give an OK.
    expect(needsOkOnCreate(true, { to: 'c' }, members, 'ua')).toBe(false)
    expect(needsOkOnCreate(true, { to: 'gone' }, members, 'ua')).toBe(false)
  })
})

describe('awaitingOk / settlementCounts', () => {
  it('waits until the payee’s OK, and is left out of balances meanwhile', () => {
    expect(awaitingOk(pay(), members, true)).toBe(true)
    expect(settlementCounts(pay(), members, true)).toBe(false)
    const ok = pay({ ok: { by: 'ub', at: 1, via: 'payee' } })
    expect(awaitingOk(ok, members, true)).toBe(false)
    expect(settlementCounts(ok, members, true)).toBe(true)
  })
  it('cleared by the screenshot counts; flagged afterwards waits again', () => {
    expect(settlementCounts(pay({ ok: { by: 'ai', at: 1, via: 'ai' } }), members, true)).toBe(true)
    expect(settlementCounts(pay({ ok: { by: 'ai', at: 1, via: 'ai' }, flag: { by: 'ub', at: 2 } }), members, true)).toBe(false)
    expect(settlementCounts(pay({ flag: { by: 'ub', at: 2 } }), members, true)).toBe(false)
  })
  it('with the setting off everything counts; payments without the mark always count', () => {
    expect(settlementCounts(pay(), members, false)).toBe(true)
    expect(settlementCounts(pay({ flag: { by: 'ub', at: 2 } }), members, undefined)).toBe(true)
    expect(settlementCounts(pay({ needsOk: undefined }), members, true)).toBe(true)
  })
  it('a payee who left can’t give an OK, so the payment counts; trash never does', () => {
    expect(settlementCounts(pay({ to: 'gone' }), members, true)).toBe(true)
    expect(settlementCounts(pay({ needsOk: undefined, deletedAt: 3 }), members, false)).toBe(false)
    expect(awaitingOk(pay({ deletedAt: 3 }), members, true)).toBe(false)
  })
})

describe('payeeMatches', () => {
  const names = ['Rohan', 'Rohan Sharma']
  const handles = ['rohan@okhdfc', '+91 98765 43210']
  it('a known handle matches exactly (UPI ID, phone in any format)', () => {
    expect(payeeMatches({ payeeHandle: 'ROHAN@okhdfc' }, names, handles)).toBe(true)
    expect(payeeMatches({ payeeHandle: '9876543210' }, names, handles)).toBe(true)
  })
  it('a name sharing a word matches (the bank’s full name for “Rohan”)', () => {
    expect(payeeMatches({ payee: 'ROHAN K SHARMA' }, names, handles)).toBe(true)
    expect(payeeMatches({ payee: 'Priya Nair' }, names, handles)).toBe(false)
  })
  it('another UPI ID is someone else, even with the same first name', () => {
    expect(payeeMatches({ payee: 'Rohan Verma', payeeHandle: 'rohanv@ybl' }, names, handles)).toBe(false)
    // Without a known UPI ID to compare, the name decides.
    expect(payeeMatches({ payee: 'Rohan Sharma', payeeHandle: 'rohan@ybl' }, names, [])).toBe(true)
  })
  it('nothing to go on is unknown', () => {
    expect(payeeMatches({}, names, handles)).toBeNull()
  })
})

describe('checkPayment', () => {
  const want = { amount: 50000, currency: 'INR', names: ['Rohan'], handles: ['rohan@okhdfc'], date: '2026-10-10', usedRefs: ['UTR111'] }
  const read = { amount: 50000, currency: 'INR', payee: 'Rohan Sharma', status: 'success' as const, date: '2026-10-10', ref: 'UTR222' }

  it('matches the exact amount to the payee, successful, recent and new', () => {
    expect(checkPayment(read, want)).toEqual({ verdict: 'match', reasons: [] })
  })
  it('anything that disagrees is a mismatch, with every reason', () => {
    expect(checkPayment({ ...read, amount: 49999 }, want).reasons).toEqual(['amount'])
    expect(checkPayment({ ...read, payee: 'Priya' }, want).reasons).toEqual(['payee'])
    expect(checkPayment({ ...read, status: 'failed' }, want).reasons).toEqual(['status'])
    expect(checkPayment({ ...read, date: '2026-10-01' }, want).reasons).toEqual(['date'])
    expect(checkPayment({ ...read, ref: 'utr111' }, want).reasons).toEqual(['reused'])
    expect(checkPayment({ ...read, currency: 'USD' }, want).reasons).toEqual(['currency'])
    expect(checkPayment({ ...read, amount: 1, payee: 'Priya' }, want)).toEqual({ verdict: 'mismatch', reasons: ['amount', 'payee'] })
  })
  it('within 3 days is fine; an unread status or date doesn’t count against it', () => {
    expect(checkPayment({ ...read, date: '2026-10-07' }, want).verdict).toBe('match')
    expect(checkPayment({ ...read, status: 'unknown', date: undefined }, want).verdict).toBe('match')
  })
  it('no amount or no payee is unreadable (it waits for the payee)', () => {
    expect(checkPayment(null, want).verdict).toBe('unreadable')
    expect(checkPayment({ ...read, amount: undefined }, want).verdict).toBe('unreadable')
    expect(checkPayment({ ...read, payee: undefined }, want).verdict).toBe('unreadable')
  })
  it('says why in plain words', () => {
    expect(checkReasonText(['amount', 'payee'])).toBe('The screenshot shows a different amount, someone else as the payee')
    expect(checkReasonText([])).toBe('The screenshot could not be read')
  })
})
