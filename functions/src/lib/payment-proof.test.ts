import { describe, expect, it } from 'vitest'
import { checkPayment } from '../../../shared/payment-ok'
import { payeeDecision, proofExpect, proofUpdate, shouldCheck } from './payment-proof'

const s = { to: 'alice', amount: 50000, date: '2026-10-10', needsOk: true, proofPath: 'settleproofs/g1/s1.jpg' }
const g = { currency: 'INR', members: { alice: { name: 'Alice' }, bob: { name: 'Bob' } } }
const profile = { displayName: 'Alice Menon', payment: { upi: 'alice@okicici', phone: '9876543210', account: '123456789012', ifsc: 'HDFC0001234' } }

describe('proofExpect', () => {
  it('the amount and currency that changed hands, the payee’s names and handles (never bank account numbers)', () => {
    expect(proofExpect(s, g, profile, ['UTR1'])).toEqual({
      amount: 50000,
      currency: 'INR',
      names: ['Alice', 'Alice Menon'],
      handles: ['alice@okicici', '9876543210'],
      date: '2026-10-10',
      usedRefs: ['UTR1'],
    })
  })
  it('a payment in another currency is checked against what was paid', () => {
    const e = proofExpect({ ...s, amount: 1250, paid: { currency: 'INR', amount: 104500 } }, { ...g, currency: 'USD' }, undefined, [])
    expect(e).toMatchObject({ amount: 104500, currency: 'INR', names: ['Alice'], handles: [] })
  })
})

describe('shouldCheck', () => {
  it('only an undecided payment that needs an OK, with its screenshot at its own path', () => {
    expect(shouldCheck(s, 'g1', 's1')).toBe(true)
    expect(shouldCheck({ ...s, needsOk: undefined }, 'g1', 's1')).toBe(false)
    expect(shouldCheck({ ...s, proofPath: 'settleproofs/g1/s2.jpg' }, 'g1', 's1')).toBe(false)
    expect(shouldCheck({ ...s, proofPath: undefined }, 'g1', 's1')).toBe(false)
    expect(shouldCheck({ ...s, ok: { via: 'payee' } }, 'g1', 's1')).toBe(false)
    expect(shouldCheck({ ...s, aiCheck: { verdict: 'match' } }, 'g1', 's1')).toBe(false)
    expect(shouldCheck({ ...s, deletedAt: 1 }, 'g1', 's1')).toBe(false)
  })
})

describe('proofUpdate', () => {
  const read = { amount: 50000, currency: 'INR', payee: 'ALICE MENON', status: 'success' as const, ref: ' 4321 ' }
  it('a match clears the payment, marked as the screenshot’s, with the reference kept', () => {
    const check = checkPayment(read, proofExpect(s, g, profile, []))
    expect(proofUpdate(check, read, 7, s)).toEqual({ aiCheck: { verdict: 'match', reasons: [], at: 7, ref: '4321' }, ok: { by: 'ai', at: 7, via: 'ai' } })
  })
  it('a mismatch only records why', () => {
    const check = checkPayment({ ...read, amount: 100 }, proofExpect(s, g, profile, []))
    expect(proofUpdate(check, read, 7, s)).toEqual({ aiCheck: { verdict: 'mismatch', reasons: ['amount'], at: 7, ref: '4321' } })
  })
  it('the payee’s own decision meanwhile wins', () => {
    const check = checkPayment(read, proofExpect(s, g, profile, []))
    expect(proofUpdate(check, read, 7, { ...s, flag: { by: 'alice' } })).not.toHaveProperty('ok')
    expect(proofUpdate(check, null, 7, { ...s, deletedAt: 3 })).not.toHaveProperty('ok')
  })
})

describe('payeeDecision', () => {
  it('an OK the payee gave, or a new flag; not the screenshot’s OK or anything else', () => {
    expect(payeeDecision({}, { ok: { via: 'payee' } })).toBe('ok')
    expect(payeeDecision({ ok: { via: 'ai' }, flag: undefined }, { flag: { by: 'a' } })).toBe('flag')
    expect(payeeDecision({ flag: { by: 'a' } }, { ok: { via: 'payee' } })).toBe('ok')
    expect(payeeDecision({}, { ok: { via: 'ai' } })).toBeNull()
    expect(payeeDecision({ ok: { via: 'payee' } }, { ok: { via: 'payee' } })).toBeNull()
    expect(payeeDecision({}, { flag: { by: 'a' }, deletedAt: 1 })).toBeNull()
    expect(payeeDecision(undefined, { flag: {} })).toBeNull()
  })
})
