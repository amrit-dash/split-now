import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  FX_API, cachedRate, convertExpense, convertMinor, formatRate, getRate, lastCurrency, parseRate, rateLabel,
  rememberCurrency, setFxEnv, toOriginal, type FxFetch,
} from './fx'

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)

class MemStorage {
  m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, v) }
}

describe('convertMinor', () => {
  it('converts between currencies with different minor units', () => {
    expect(convertMinor(120000, 'THB', 'AUD', 0.04269)).toBe(5123) // ฿1,200.00 → A$51.23
    expect(convertMinor(1000, 'JPY', 'AUD', 0.00909)).toBe(909) // ¥1,000 → A$9.09
    expect(convertMinor(1000, 'AUD', 'JPY', 109.99)).toBe(1100) // A$10.00 → ¥1,100 (1099.9)
    expect(convertMinor(1000, 'AUD', 'BHD', 0.25)).toBe(2500) // 3-decimal currency
  })
  it('rounds half away from float noise', () => {
    expect(convertMinor(201, 'USD', 'AUD', 0.5)).toBe(101) // 100.5 → 101
    expect(convertMinor(100, 'AUD', 'USD', 1.005)).toBe(101) // 100.49999… in floats
  })
})

describe('convertExpense', () => {
  it('keeps paidBy and splits summing exactly to the converted total', () => {
    const splits = { a: 33334, b: 33333, c: 33333 } // ฿1,000.00 three ways
    const c = convertExpense({ amount: 100000, paidBy: { a: 100000 }, splits }, 'THB', 'AUD', 0.04269)!
    expect(c.amount).toBe(4269)
    expect(c.paidBy).toEqual({ a: 4269 })
    expect(sum(c.splits)).toBe(4269)
    expect(c.splits).toEqual({ a: 1423, b: 1423, c: 1423 })
  })
  it('handles multiple payers and uneven splits', () => {
    const c = convertExpense({ amount: 99999, paidBy: { a: 50000, b: 49999 }, splits: { a: 10000, b: 20000, c: 69999 } }, 'JPY', 'AUD', 0.00911)!
    expect(sum(c.paidBy)).toBe(c.amount)
    expect(sum(c.splits)).toBe(c.amount)
    expect(c.amount).toBe(91099)
  })
  it('returns null when the converted amount rounds to zero', () => {
    expect(convertExpense({ amount: 1, paidBy: { a: 1 }, splits: { a: 1 } }, 'IDR', 'AUD', 0.00008)).toBeNull()
  })
  it('toOriginal rebuilds original-currency payer amounts', () => {
    expect(toOriginal({ a: 2000, b: 2269 }, { amount: 100000 })).toEqual({ a: 46849, b: 53151 })
  })
})

describe('formatting and parsing', () => {
  it('formats rates', () => {
    expect(formatRate(0.042694)).toBe('0.04269')
    expect(formatRate(23.4221)).toBe('23.4221')
    expect(formatRate(12422)).toBe('12,422')
    expect(rateLabel({ currency: 'THB', rate: 0.0421, rateDate: '2026-10-07', source: 'ecb' }, 'AUD')).toBe('1 THB = 0.0421 AUD (ECB, 2026-10-07)')
    expect(rateLabel({ currency: 'THB', rate: 0.0421, rateDate: '2026-10-07', source: 'manual' }, 'AUD')).toContain('(manual,')
  })
  it('parses typed rates', () => {
    expect(parseRate('0.0421')).toBe(0.0421)
    expect(parseRate(' 0,0421 ')).toBe(0.0421)
    expect(parseRate('0')).toBeNaN()
    expect(parseRate('-1')).toBeNaN()
    expect(parseRate('abc')).toBeNaN()
  })
})

describe('getRate + cache', () => {
  let store: MemStorage
  let calls: string[]
  let clock: number
  let respond: (url: string) => { ok: boolean; status: number; body: unknown } | 'throw'
  const fetchMock: FxFetch = async (url) => {
    calls.push(url)
    const r = respond(url)
    if (r === 'throw') throw new TypeError('Failed to fetch')
    return { ok: r.ok, status: r.status, json: async () => r.body }
  }

  beforeEach(() => {
    store = new MemStorage()
    calls = []
    clock = Date.parse('2026-10-07T10:00:00Z')
    respond = (url) => ({ ok: true, status: 200, body: { amount: 1, base: 'THB', date: url.includes('2026-10-04') ? '2026-10-02' : '2026-10-07', rates: { AUD: 0.04269, USD: 0.0297 } } })
    setFxEnv({ fetch: fetchMock, storage: store, now: () => clock })
  })
  afterEach(() => setFxEnv({ storage: null }))

  it('is 1 for the same currency, without a request', async () => {
    expect(await getRate('AUD', 'AUD', '2026-10-01')).toEqual({ rate: 1, date: '2026-10-01', source: 'ecb' })
    expect(calls).toEqual([])
  })

  it('fetches a past date by date and reports the business day the rate is for', async () => {
    expect(await getRate('THB', 'AUD', '2026-10-04')).toEqual({ rate: 0.04269, date: '2026-10-02', source: 'ecb' })
    expect(calls).toEqual([`${FX_API}/2026-10-04?base=THB`])
  })

  it('serves past dates from the cache forever, for any symbol of that base', async () => {
    await getRate('THB', 'AUD', '2026-10-04')
    clock += 30 * 86400_000
    expect((await getRate('THB', 'USD', '2026-10-04'))?.rate).toBe(0.0297)
    expect(calls).toHaveLength(1)
  })

  it('uses the inverse of a cached opposite pair', async () => {
    await getRate('THB', 'AUD', '2026-10-04')
    const r = cachedRate('AUD', 'THB', '2026-10-04')
    expect(r?.rate).toBeCloseTo(1 / 0.04269, 6)
    expect((await getRate('AUD', 'THB', '2026-10-04'))?.rate).toBe(r?.rate)
    expect(calls).toHaveLength(1)
  })

  it('asks for latest for today and future dates, and refreshes today after a few hours', async () => {
    await getRate('THB', 'AUD', '2026-12-25')
    expect(calls).toEqual([`${FX_API}/latest?base=THB`])
    await getRate('THB', 'AUD', '2026-10-07')
    expect(calls).toHaveLength(1)
    clock += 7 * 3600_000
    await getRate('THB', 'AUD', '2026-10-07')
    expect(calls).toHaveLength(2)
  })

  it('falls back to a stale copy when offline, else null', async () => {
    await getRate('THB', 'AUD', '2026-10-07')
    clock += 7 * 3600_000
    respond = () => 'throw'
    expect((await getRate('THB', 'AUD', '2026-10-07'))?.rate).toBe(0.04269)
    expect(await getRate('THB', 'AUD', '2026-09-01')).toBeNull()
  })

  it('returns null for currencies ECB does not publish', async () => {
    respond = () => ({ ok: false, status: 404, body: { message: 'not found' } })
    expect(await getRate('AED', 'AUD', '2026-10-01')).toBeNull()
    respond = () => ({ ok: true, status: 200, body: { date: '2026-10-01', rates: { USD: 1 } } })
    expect(await getRate('THB', 'AED', '2026-10-01')).toBeNull()
  })

  it('ignores a corrupt cache', async () => {
    store.setItem('splitit-fx-v1', '{not json')
    expect((await getRate('THB', 'AUD', '2026-10-04'))?.rate).toBe(0.04269)
  })

  it('remembers the last currency per group', () => {
    expect(lastCurrency('g1')).toBeUndefined()
    rememberCurrency('g1', 'THB')
    rememberCurrency('g2', 'JPY')
    expect(lastCurrency('g1')).toBe('THB')
    expect(lastCurrency('g2')).toBe('JPY')
  })
})
