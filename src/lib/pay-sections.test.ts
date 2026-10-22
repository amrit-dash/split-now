import { describe, expect, it } from 'vitest'
import { shownPaySections } from './pay-sections'

const IN = [
  { title: 'UPI', keys: ['upi'] },
  { title: 'Bank transfer (IMPS / NEFT)', keys: ['account', 'ifsc'] },
  { title: 'International', keys: ['paypal', 'revolut'] },
]
const all = ['upi', 'account', 'ifsc', 'paypal', 'revolut', 'payid', 'bsb', 'venmo']
const base = { showAll: true, allHandles: false, allKeys: all, filled: () => false }

describe('shownPaySections', () => {
  it('Simple: UPI ID, bank transfer and PayPal only, even with others filled in', () => {
    const s = shownPaySections(IN, { ...base, simple: true, filled: (k) => k === 'venmo' || k === 'revolut' })
    expect(s.map((x) => [x.title, x.keys])).toEqual([
      ['UPI', ['upi']],
      ['Bank transfer (IMPS / NEFT)', ['account', 'ifsc']],
      ['International', ['paypal']],
    ])
  })
  it('Advanced: the region, plus other handles once filled in or asked for', () => {
    expect(shownPaySections(IN, { ...base, simple: false }).map((x) => x.title)).toEqual(['UPI', 'Bank transfer (IMPS / NEFT)', 'International'])
    const filled = shownPaySections(IN, { ...base, simple: false, filled: (k) => k === 'venmo' })
    expect(filled.at(-1)).toEqual({ title: 'Other', keys: ['venmo'] })
    expect(shownPaySections(IN, { ...base, simple: false, allHandles: true }).at(-1)?.keys).toEqual(['payid', 'bsb', 'venmo'])
  })
  it('Minimal look: the main way to pay plus anything filled in', () => {
    const s = shownPaySections(IN, { ...base, simple: false, showAll: false, filled: (k) => k === 'paypal' })
    expect(s.map((x) => x.title)).toEqual(['UPI', 'International'])
  })
})
