import { describe, expect, it } from 'vitest'
import {
  FX_V1,
  FX_V2,
  THROTTLE_MS,
  asRatesDoc,
  berlinDate,
  fetchEcb,
  parseV1,
  parseV2,
  planRefresh,
  refreshWrites,
  validRequest,
  type Fetch,
  type FxRatesDoc,
} from './fx-core'

const V2 = [
  { date: '2026-10-07', base: 'EUR', quote: 'EUR', rate: 1 },
  { date: '2026-10-07', base: 'EUR', quote: 'INR', rate: 108.1165 },
  { date: '2026-10-07', base: 'EUR', quote: 'USD', rate: 1.1177 },
]
const V1 = { amount: 1, base: 'EUR', date: '2026-10-07', rates: { INR: 108.1165, USD: 1.1177 } }
// 2026-10-08 14:00 in Frankfurt (CEST, UTC+2)
const NOW = Date.parse('2026-10-08T12:00:00Z')
const doc = (date: string, fetchedAt = NOW): FxRatesDoc => ({ date, base: 'EUR', rates: { EUR: 1, INR: 108 }, fetchedAt, source: 'ecb' })

describe('parsing Frankfurter', () => {
  it('reads /v2/rates and adds EUR: 1', () => {
    expect(parseV2(V2)).toEqual({ date: '2026-10-07', rates: { EUR: 1, INR: 108.1165, USD: 1.1177 } })
    expect(parseV2([{ date: '2026-10-07', base: 'EUR', quote: 'INR', rate: 108 }])?.rates.EUR).toBe(1)
  })
  it('rejects odd /v2 bodies and skips bad rows', () => {
    expect(parseV2([])).toBeNull()
    expect(parseV2({ message: 'x' })).toBeNull()
    expect(parseV2([{ date: '2026-10-07', base: 'USD', quote: 'INR', rate: 84 }])).toBeNull()
    expect(parseV2([...V2, { date: '2026-10-07', base: 'EUR', quote: 'XXX', rate: -1 }, { date: 'x', base: 'EUR', quote: 'JPY', rate: 1 }])?.rates).toEqual({
      EUR: 1,
      INR: 108.1165,
      USD: 1.1177,
    })
  })
  it('reads /v1', () => {
    expect(parseV1(V1)).toEqual({ date: '2026-10-07', rates: { EUR: 1, INR: 108.1165, USD: 1.1177 } })
    expect(parseV1({ ...V1, base: 'USD' })).toBeNull()
    expect(parseV1({ date: '2026-10-07', rates: {} })).toBeNull()
    expect(parseV1(null)).toBeNull()
  })
})

describe('fetchEcb', () => {
  const mock = (answers: Record<string, unknown | 'throw' | number>) => {
    const calls: string[] = []
    const f: Fetch = async (url) => {
      calls.push(url)
      const a = Object.entries(answers).find(([k]) => url.startsWith(k))?.[1]
      if (a === 'throw' || a === undefined) throw new TypeError('fetch failed')
      if (typeof a === 'number') return { ok: false, status: a, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => a }
    }
    return { f, calls }
  }
  it('uses v2 with ECB only, by date', async () => {
    const { f, calls } = mock({ [FX_V2]: V2 })
    expect((await fetchEcb(f, '2026-10-07')).date).toBe('2026-10-07')
    expect(calls).toEqual([`${FX_V2}?providers=ECB&date=2026-10-07`])
  })
  it('falls back to v1, then throws', async () => {
    const a = mock({ [FX_V2]: 500, [FX_V1]: V1 })
    expect((await fetchEcb(a.f)).rates.INR).toBe(108.1165)
    expect(a.calls[1]).toBe(`${FX_V1}/latest`)
    const b = mock({ [FX_V2]: 'throw', [FX_V1]: 503 })
    await expect(fetchEcb(b.f)).rejects.toThrow(/unavailable/)
  })
})

describe('refresh planning', () => {
  it('knows the date in Frankfurt', () => {
    expect(berlinDate(Date.parse('2026-10-07T22:30:00Z'))).toBe('2026-10-08')
  })
  it('throttles the latest to one fetch per 10 minutes', () => {
    expect(planRefresh({ now: NOW, latest: null })).toEqual({ kind: 'latest', fetch: true })
    expect(planRefresh({ now: NOW, latest: doc('2026-10-07', NOW - THROTTLE_MS + 1000) })).toEqual({ kind: 'latest', fetch: false })
    expect(planRefresh({ now: NOW, latest: doc('2026-10-07', NOW - THROTTLE_MS - 1) })).toEqual({ kind: 'latest', fetch: true })
  })
  it('treats today and future dates as latest; stored past dates are final', () => {
    expect(planRefresh({ requested: '2026-10-08', now: NOW, latest: doc('2026-10-07') }).kind).toBe('latest')
    expect(planRefresh({ requested: '2027-01-01', now: NOW }).kind).toBe('latest')
    expect(planRefresh({ requested: '2026-10-04', now: NOW, stored: null })).toEqual({ kind: 'date', date: '2026-10-04', fetch: true })
    expect(planRefresh({ requested: '2026-10-04', now: NOW, stored: doc('2026-10-02', 0) })).toEqual({ kind: 'date', date: '2026-10-04', fetch: false })
  })
  it('validates the date argument', () => {
    expect(validRequest(undefined)).toBe(true)
    expect(validRequest(null)).toBe(true)
    expect(validRequest('2026-10-04')).toBe(true)
    expect(validRequest('1998-12-31')).toBe(false)
    expect(validRequest('2026-13-40')).toBe(false)
    expect(validRequest('04/10/2026')).toBe(false)
    expect(validRequest(20261004)).toBe(false)
  })
})

describe('refreshWrites', () => {
  const got = { date: '2026-10-02', rates: { EUR: 1, INR: 108 } }
  it('stores the publication and aliases a past weekend to it', () => {
    const w = refreshWrites({ got, now: NOW, requested: '2026-10-04', latest: doc('2026-10-07') })
    expect(w.map(([id]) => id)).toEqual(['2026-10-02', '2026-10-04'])
    expect(w[1][1]).toMatchObject({ date: '2026-10-02', base: 'EUR', fetchedAt: NOW, source: 'ecb' })
  })
  it('updates latest only when not older', () => {
    expect(refreshWrites({ got: { ...got, date: '2026-10-07' }, now: NOW, latest: doc('2026-10-06') }).map(([id]) => id)).toEqual(['2026-10-07', 'latest'])
    expect(refreshWrites({ got: { ...got, date: '2026-10-07' }, now: NOW, latest: null }).map(([id]) => id)).toEqual(['2026-10-07', 'latest'])
  })
  it('never aliases a date that may not be published yet', () => {
    // Asked for "today in Frankfurt" via the date path would be latest; a date equal to the result needs no alias.
    expect(refreshWrites({ got: { ...got, date: '2026-10-07' }, now: NOW, requested: '2026-10-08', latest: doc('2026-10-07') }).map(([id]) => id)).toEqual([
      '2026-10-07',
      'latest',
    ])
    expect(refreshWrites({ got, now: NOW, requested: '2026-10-02', latest: doc('2026-10-07') }).map(([id]) => id)).toEqual(['2026-10-02'])
  })
  it('checks stored docs', () => {
    expect(asRatesDoc(doc('2026-10-07'))).not.toBeNull()
    expect(asRatesDoc({ date: '2026-10-07', base: 'USD', rates: {}, fetchedAt: 1 })).toBeNull()
    expect(asRatesDoc(undefined)).toBeNull()
  })
})
