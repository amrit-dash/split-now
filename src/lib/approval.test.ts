import { describe, expect, it } from 'vitest'
import {
  APPROVAL_DEFAULTS,
  FALLBACK_APPROVAL_THRESHOLD,
  approvalDefaultInCurrency,
  approvalDefaultOf,
  approvalSummary,
  defaultEditAutoApprove,
  editApprovalOutcome,
  editAutoApproved,
  newGroupEditAutoApprove,
  convertThreshold,
  defaultThreshold,
  isApprovalDefault,
  newGroupApproval,
  niceMinor,
  niceNumber,
  tableThreshold,
} from './approval'
import { CURRENCIES } from './money'

// The rules carry the same table (firestore.rules approvalThresholdOf); read the file so the two can't drift.
const fsModule = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync: (p: URL, enc: 'utf8') => string }
const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')

describe('default thresholds', () => {
  it('per currency, in minor units', () => {
    expect(defaultThreshold('INR')).toBe(200_000) // ₹2,000.00
    expect(defaultThreshold('USD')).toBe(10_000) // $100.00
    expect(defaultThreshold('AUD')).toBe(10_000)
    expect(defaultThreshold('JPY')).toBe(10_000) // ¥10,000 (no minor digits)
    expect(defaultThreshold('KRW')).toBe(100_000)
    expect(defaultThreshold('IDR')).toBe(100_000_000) // Rp 1,000,000.00
  })
  it('covers every currency the app offers', () => {
    for (const c of CURRENCIES) expect(tableThreshold(c), c).toBeGreaterThan(0)
  })
  it('converts the INR default for other currencies, else uses the flat fallback', () => {
    // ₹2,000 at 0.83 KES per INR ≈ KES 1,660 → 2,000
    expect(defaultThreshold('KES', 0.83)).toBe(200_000)
    // ₹2,000 at 0.0033 KWD per INR ≈ KWD 6.6 → 5 (three minor digits)
    expect(defaultThreshold('KWD', 0.0033)).toBe(5_000)
    expect(defaultThreshold('KES')).toBe(FALLBACK_APPROVAL_THRESHOLD)
    expect(defaultThreshold('KES', 0)).toBe(FALLBACK_APPROVAL_THRESHOLD)
    // the table wins over a rate
    expect(defaultThreshold('USD', 0.012)).toBe(10_000)
  })
  it('matches the table in firestore.rules (approvalThresholdOf)', () => {
    const m = rules.match(/function approvalThresholdOf[\s\S]*?\{([^{}]*)\}\.get\(g\.currency, (\d+)\)/)
    expect(m).not.toBeNull()
    const inRules = Object.fromEntries([...m![1].matchAll(/'([A-Z]{3})':\s*(\d+)/g)].map(([, c, v]) => [c, Number(v)]))
    const inApp = Object.fromEntries(Object.keys(APPROVAL_DEFAULTS).map((c) => [c, tableThreshold(c)]))
    expect(inRules).toEqual(inApp)
    expect(Number(m![2])).toBe(FALLBACK_APPROVAL_THRESHOLD)
  })
})

describe('nice figures', () => {
  it('rounds to 1, 2 or 5 × 10^n on a log scale', () => {
    expect(niceNumber(2.4)).toBe(2)
    expect(niceNumber(3.1)).toBe(2)
    expect(niceNumber(3.2)).toBe(5)
    expect(niceNumber(7)).toBe(5)
    expect(niceNumber(7.2)).toBe(10)
    expect(niceNumber(1180)).toBe(1000)
    expect(niceNumber(16_600)).toBe(20_000)
    expect(niceNumber(0.03)).toBe(0.02)
    expect(niceNumber(0)).toBe(0)
    expect(niceNumber(-5)).toBe(0)
  })
  it('in minor units of the currency, never 0', () => {
    expect(niceMinor(2_412, 'USD')).toBe(2_000) // $24.12 → $20
    expect(niceMinor(1_180, 'JPY')).toBe(1_000)
    expect(niceMinor(1, 'INR')).toBe(1)
  })
})

describe('convertThreshold', () => {
  it('₹200 → about $2', () => {
    expect(convertThreshold(20_000, 'INR', 'USD', 0.012)).toBe(200)
  })
  it('handles currencies with different minor digits', () => {
    // A$100 at 98 JPY per AUD = ¥9,800 → ¥10,000
    expect(convertThreshold(10_000, 'AUD', 'JPY', 98)).toBe(10_000)
    // ¥10,000 at 0.0102 AUD per JPY = A$102 → A$100.00
    expect(convertThreshold(10_000, 'JPY', 'AUD', 0.0102)).toBe(10_000)
  })
  it('round-trips a nice figure', () => {
    const usd = convertThreshold(200_000, 'INR', 'USD', 0.0119)
    expect(usd).toBe(2_000) // ₹2,000 → $23.80 → $20
    expect(convertThreshold(usd, 'USD', 'INR', 1 / 0.0119)).toBe(200_000) // $20 → ₹1,681 → ₹2,000
    expect(convertThreshold(10_000, 'EUR', 'EUR', null)).toBe(10_000)
  })
  it('without a rate, uses the new currency’s default', () => {
    expect(convertThreshold(50_000, 'INR', 'USD', null)).toBe(10_000)
    expect(convertThreshold(50_000, 'INR', 'JPY', 0)).toBe(10_000)
  })
  it('never 0, even for a tiny amount', () => {
    expect(convertThreshold(1, 'IDR', 'USD', 0.00006)).toBe(1)
  })
})

describe('the user setting', () => {
  it('defaults to off at the profile currency’s default', () => {
    expect(approvalDefaultOf(undefined, 'INR')).toEqual({ on: false, amount: 200_000, currency: 'INR' })
    const s = { on: true, amount: 500_000, currency: 'INR' }
    expect(approvalDefaultOf(s, 'USD')).toBe(s)
  })
  it('follows a change of default currency', () => {
    const s = { on: true, amount: 20_000, currency: 'INR' }
    expect(approvalDefaultInCurrency(s, 'USD', 0.012)).toEqual({ on: true, amount: 200, currency: 'USD' })
    expect(approvalDefaultInCurrency(s, 'JPY', null)).toEqual({ on: true, amount: 10_000, currency: 'JPY' })
    expect(approvalDefaultInCurrency(s, 'INR', 1)).toBe(s)
  })
  it('prefills a new group in its own currency', () => {
    const s = { on: true, amount: 500_000, currency: 'INR' }
    expect(newGroupApproval(s, 'INR')).toEqual({ requireApproval: true, threshold: 500_000 })
    // ₹5,000 at 0.012 → $60 → $50
    expect(newGroupApproval(s, 'USD', { fromSetting: 0.012 })).toEqual({ requireApproval: true, threshold: 5_000 })
    expect(newGroupApproval(s, 'USD')).toEqual({ requireApproval: true, threshold: 10_000 })
    expect(newGroupApproval(undefined, 'EUR')).toEqual({ requireApproval: false, threshold: 10_000 })
    expect(newGroupApproval(undefined, 'KES', { inr: 0.83 })).toEqual({ requireApproval: false, threshold: 200_000 })
    expect(newGroupApproval({ ...s, on: false }, 'INR')).toEqual({ requireApproval: false, threshold: 500_000 })
  })
  it('recognises a stored setting', () => {
    expect(isApprovalDefault({ on: true, amount: 100, currency: 'INR' })).toBe(true)
    expect(isApprovalDefault({ on: 'yes', amount: 100, currency: 'INR' })).toBe(false)
    expect(isApprovalDefault({ on: true, amount: 0, currency: 'INR' })).toBe(false)
    expect(isApprovalDefault({ on: true, amount: 1.5, currency: 'INR' })).toBe(false)
    expect(isApprovalDefault(null)).toBe(false)
  })
})

describe('approvalSummary', () => {
  it('says the amount when on, nothing when off', () => {
    expect(approvalSummary({ on: true, amount: 200_000, currency: 'INR' })).toMatch(/^Approval over ₹2,000$/)
    expect(approvalSummary({ on: true, amount: 2_050, currency: 'USD' })).toMatch(/^Approval over .*20\.50$/)
    expect(approvalSummary({ on: false, amount: 200_000, currency: 'INR' })).toBeNull()
    expect(approvalSummary(undefined)).toBeNull()
  })
})

describe('edit auto-approve amounts', () => {
  it('defaults to a twentieth of the approval default, rounded', () => {
    expect(defaultEditAutoApprove('INR')).toBe(10_000) // ₹100
    expect(defaultEditAutoApprove('USD')).toBe(500) // $5
    expect(defaultEditAutoApprove('JPY')).toBe(500) // ¥500
    expect(defaultEditAutoApprove('KES')).toBe(500)
  })
  it('converts like the approval amount, with its own default when there is no rate', () => {
    const s = { on: true, amount: 10_000, currency: 'INR' }
    expect(approvalDefaultInCurrency(s, 'USD', 0.012, defaultEditAutoApprove)).toEqual({ on: true, amount: 100, currency: 'USD' }) // ₹100 → $1.20 → $1
    expect(approvalDefaultInCurrency(s, 'JPY', null, defaultEditAutoApprove)).toEqual({ on: true, amount: 500, currency: 'JPY' })
    expect(approvalDefaultOf(undefined, 'INR', defaultEditAutoApprove)).toEqual({ on: false, amount: 10_000, currency: 'INR' })
  })
  it('prefills a new group', () => {
    expect(newGroupEditAutoApprove(undefined, 'INR')).toEqual({ on: false, amount: 10_000 })
    expect(newGroupEditAutoApprove({ on: true, amount: 20_000, currency: 'INR' }, 'INR')).toEqual({ on: true, amount: 20_000 })
    // ₹200 at 0.012 → $2.40 → $2
    expect(newGroupEditAutoApprove({ on: true, amount: 20_000, currency: 'INR' }, 'USD', { fromSetting: 0.012 })).toEqual({ on: true, amount: 200 })
    expect(newGroupEditAutoApprove({ on: true, amount: 20_000, currency: 'INR' }, 'USD')).toEqual({ on: true, amount: 500 })
  })
  it('the hub summary mentions edits only when approval is on', () => {
    const a = { on: true, amount: 200_000, currency: 'INR' }
    const e = { on: true, amount: 10_000, currency: 'INR' }
    expect(approvalSummary(a, e)).toBe('Approval over ₹2,000, edits within ₹100 pass')
    expect(approvalSummary(a, { ...e, on: false })).toBe('Approval over ₹2,000')
    expect(approvalSummary({ ...a, on: false }, e)).toBeNull()
  })
})

describe('editApprovalOutcome', () => {
  // ₹2,000 threshold (INR default), edits within ₹100 keep approval
  const group = { requireApproval: true, currency: 'INR', editAutoApprove: 10_000 }
  const marked = { amount: 500_000, requiresApproval: true }
  it('clears when the new amount is at or below the threshold, or approval is off', () => {
    expect(editApprovalOutcome({ group, before: marked, after: { amount: 200_000 } })).toBe('clear')
    expect(editApprovalOutcome({ group, before: marked, after: { amount: 150_000 } })).toBe('clear')
    expect(editApprovalOutcome({ group: { ...group, requireApproval: false }, before: marked, after: { amount: 900_000 } })).toBe('clear')
  })
  it('keeps the state when the amount did not change', () => {
    expect(editApprovalOutcome({ group, before: marked, after: { amount: 500_000 } })).toBe('keep')
    expect(editApprovalOutcome({ group: { ...group, editAutoApprove: undefined }, before: marked, after: { amount: 500_000 } })).toBe('keep')
  })
  it('keeps it for a change within edit auto-approve, either way, the limit included', () => {
    expect(editApprovalOutcome({ group, before: marked, after: { amount: 510_000 } })).toBe('keep')
    expect(editApprovalOutcome({ group, before: marked, after: { amount: 490_000 } })).toBe('keep')
    expect(editAutoApproved({ group, before: marked, after: { amount: 510_000 } })).toBe(true)
    expect(editAutoApproved({ group, before: marked, after: { amount: 500_000 } })).toBe(false)
  })
  it('asks again for a bigger change, with auto-approve off, or for an expense never marked', () => {
    expect(editApprovalOutcome({ group, before: marked, after: { amount: 510_001 } })).toBe('rerequest')
    expect(editApprovalOutcome({ group: { ...group, editAutoApprove: undefined }, before: marked, after: { amount: 500_100 } })).toBe('rerequest')
    expect(editApprovalOutcome({ group, before: { amount: 195_000 }, after: { amount: 205_000 } })).toBe('rerequest')
  })
})
