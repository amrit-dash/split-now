import type { Cents, FxSource, MemberId, OriginalAmount } from '@/types'
import { minorDigits } from './money'
import { allocate } from './splits'

/*
 * Foreign-exchange rates for multi-currency expenses.
 *
 * Rates come from Frankfurter (https://frankfurter.dev): free, no key, European Central Bank
 * reference rates published once per business day. A rate is fetched for the expense date,
 * shown to the user, and locked onto the expense when it's saved, so balances never move.
 *
 * Responses are cached in localStorage per (date, base). Past dates never change, so they're
 * kept for good; today's (or a future) date is refreshed after a few hours because ECB
 * publishes around 16:00 CET and the API serves yesterday's rates until then.
 */

export const FX_API = 'https://api.frankfurter.dev/v1'
const CACHE_KEY = 'splitit-fx-v1'
const FRESH_MS = 6 * 3600_000
/** Keep the cache from growing forever on a long-lived install. */
const MAX_ENTRIES = 200

export interface FxRate {
  /** units of `to` per 1 unit of `from` */
  rate: number
  /** date the rate is actually for (may be an earlier business day than asked for) */
  date: string
  source: FxSource
}

export type FxFetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>
export type FxStorage = Pick<Storage, 'getItem' | 'setItem'>

interface CacheEntry { date: string; rates: Record<string, number>; at: number }
type Cache = Record<string, CacheEntry>

const browserStorage = (): FxStorage | undefined => {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage } catch { return undefined }
}

let fetcher: FxFetch = (url, init) => fetch(url, init)
let storage: FxStorage | undefined = browserStorage()
let now = () => Date.now()

/** Swap the network, storage and clock (tests). Call with no arguments to restore the defaults. */
export function setFxEnv(env: { fetch?: FxFetch; storage?: FxStorage | null; now?: () => number } = {}) {
  fetcher = env.fetch ?? ((url, init) => fetch(url, init))
  storage = env.storage === null ? undefined : env.storage ?? browserStorage()
  now = env.now ?? (() => Date.now())
}

function readCache(): Cache {
  try { return JSON.parse(storage?.getItem(CACHE_KEY) ?? '{}') as Cache } catch { return {} }
}

function writeCache(c: Cache) {
  const keys = Object.keys(c)
  if (keys.length > MAX_ENTRIES) {
    for (const k of keys.sort((a, b) => c[a].at - c[b].at).slice(0, keys.length - MAX_ENTRIES)) delete c[k]
  }
  try { storage?.setItem(CACHE_KEY, JSON.stringify(c)) } catch { /* quota or blocked storage */ }
}

const cacheKey = (date: string, base: string) => `${date}|${base}`
const isoToday = () => new Date(now()).toISOString().slice(0, 10)

/** A cached entry is usable when it's for a past date, or was fetched recently. */
function fresh(e: CacheEntry | undefined, asked: string): e is CacheEntry {
  return !!e && (asked < isoToday() || now() - e.at < FRESH_MS)
}

/** Look up a rate in the cache, directly or as the inverse of the opposite pair. */
export function cachedRate(from: string, to: string, date: string, opts: { stale?: boolean } = {}): FxRate | null {
  if (from === to) return { rate: 1, date, source: 'ecb' }
  const c = readCache()
  const ok = (e: CacheEntry | undefined): e is CacheEntry => (opts.stale ? !!e : fresh(e, date))
  const direct = c[cacheKey(date, from)]
  if (ok(direct) && direct.rates[to] > 0) return { rate: direct.rates[to], date: direct.date, source: 'ecb' }
  const inverse = c[cacheKey(date, to)]
  if (ok(inverse) && inverse.rates[from] > 0) return { rate: tidy(1 / inverse.rates[from]), date: inverse.date, source: 'ecb' }
  return null
}

/**
 * The ECB rate from `from` to `to` for `date` (yyyy-mm-dd), or null when it can't be had
 * (offline, API down, or a currency ECB doesn't publish, like AED). Never throws.
 */
export async function getRate(from: string, to: string, date: string): Promise<FxRate | null> {
  if (from === to) return { rate: 1, date, source: 'ecb' }
  const today = isoToday()
  const asked = date > today ? today : date
  const hit = cachedRate(from, to, asked)
  if (hit) return hit
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return cachedRate(from, to, asked, { stale: true })
  const ctl = typeof AbortController === 'undefined' ? undefined : new AbortController()
  const timer = ctl && setTimeout(() => ctl.abort(), 8000)
  try {
    const path = asked === today ? 'latest' : asked
    const res = await fetcher(`${FX_API}/${path}?base=${encodeURIComponent(from)}`, { signal: ctl?.signal })
    if (!res.ok) throw new Error(`FX ${res.status}`)
    const body = (await res.json()) as { date?: unknown; rates?: unknown }
    if (typeof body.date !== 'string' || !body.rates || typeof body.rates !== 'object') throw new Error('FX: bad response')
    const rates = Object.fromEntries(Object.entries(body.rates as Record<string, unknown>).filter(([, v]) => typeof v === 'number' && v > 0)) as Record<string, number>
    const c = readCache()
    c[cacheKey(asked, from)] = { date: body.date, rates, at: now() }
    writeCache(c)
    return rates[to] > 0 ? { rate: rates[to], date: body.date, source: 'ecb' } : null
  } catch {
    // Offline: an older copy of the same day beats nothing.
    return cachedRate(from, to, asked, { stale: true })
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Drop float noise from computed rates (1 / 23.422 → 0.0426949...). */
function tidy(n: number) {
  return Number(n.toPrecision(10))
}

/** Convert minor units of `from` to minor units of `to` at `rate` (to per 1 from). */
export function convertMinor(amount: Cents, from: string, to: string, rate: number): Cents {
  const v = amount * rate * 10 ** (minorDigits(to) - minorDigits(from))
  // toPrecision first so 0.5-boundaries aren't decided by float error (1.005 → 1.00499999…).
  return Math.round(Number(v.toPrecision(12)))
}

export interface Converted {
  amount: Cents
  paidBy: Record<MemberId, Cents>
  splits: Record<MemberId, Cents>
}

/**
 * Convert an expense entered in `from` to the group currency `to`. The total is converted
 * once; who-paid and who-owes are then re-allocated from it with largest-remainder rounding
 * (weighted by the original amounts), so both still add up to the converted total exactly.
 * Returns null if the converted total would round to zero.
 */
export function convertExpense(e: Converted, from: string, to: string, rate: number): Converted | null {
  const amount = convertMinor(e.amount, from, to, rate)
  if (!(amount > 0)) return null
  return { amount, paidBy: reallocate(e.paidBy, amount), splits: reallocate(e.splits, amount) }
}

/** Spread `total` over the keys of `parts`, proportionally to their values. */
export function reallocate(parts: Record<MemberId, Cents>, total: Cents): Record<MemberId, Cents> {
  return allocate(total, Object.entries(parts))
}

/** Rebuild original-currency amounts (to re-edit a converted expense's payers). */
export function toOriginal(parts: Record<MemberId, Cents>, original: Pick<OriginalAmount, 'amount'>): Record<MemberId, Cents> {
  return reallocate(parts, original.amount)
}

/** "0.04269", "23.42", "12,422" — enough digits to be useful, no float noise. */
export function formatRate(rate: number): string {
  return new Intl.NumberFormat('en', rate >= 1 ? { maximumFractionDigits: 4 } : { maximumSignificantDigits: 4 }).format(rate)
}

/** "1 THB = 0.0427 AUD (ECB, 2026-10-07)" */
export function rateLabel(o: Pick<OriginalAmount, 'currency' | 'rate' | 'rateDate' | 'source'>, to: string): string {
  return `1 ${o.currency} = ${formatRate(o.rate)} ${to} (${o.source === 'ecb' ? 'ECB' : 'manual'}, ${o.rateDate})`
}

/** Parse a typed rate ("0.0427", "0,0427"). NaN unless positive and finite. */
export function parseRate(s: string): number {
  const n = Number(s.trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : NaN
}

// ---- Last-used currency per group (e.g. THB for the whole Bali trip) ----------------

const LAST_KEY = 'splitit-fx-last'

export function lastCurrency(groupId: string): string | undefined {
  try { return (JSON.parse(storage?.getItem(LAST_KEY) ?? '{}') as Record<string, string>)[groupId] } catch { return undefined }
}

export function rememberCurrency(groupId: string, currency: string) {
  try {
    const m = JSON.parse(storage?.getItem(LAST_KEY) ?? '{}') as Record<string, string>
    m[groupId] = currency
    storage?.setItem(LAST_KEY, JSON.stringify(m))
  } catch { /* storage unavailable */ }
}
