import type { Cents, FxSource, MemberId, OriginalAmount } from '@/types'
import { minorDigits } from './money'
import { allocate } from './splits'
import { localISODate } from './id'

/*
 * Foreign-exchange rates for multi-currency expenses.
 *
 * Rates are European Central Bank reference rates, published once per business day. A rate is
 * looked up for the expense date, shown to the user, and locked onto the expense when it's
 * saved, so balances never move.
 *
 * Lookup order (getRate):
 *  1. this device's cache (localStorage, per (date, base));
 *  2. the shared copy in Firestore, fxRates/{date} or fxRates/latest (EUR-based, written by Cloud
 *     Functions so every user sees the same numbers), via the repo (setFxShared). A missing past
 *     date is fetched and stored by the refreshFx callable;
 *  3. Frankfurter (https://frankfurter.dev) directly: demo mode, signed out, or Firebase down.
 *
 * Past dates never change, so they're kept for good; today's (or a future) date is refreshed
 * after a few hours because ECB publishes around 16:00 CET.
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

/** A shared ECB publication, fxRates/{date|latest} in Firestore (see functions/src/fx.ts). Any pair is rates[to] / rates[from]. */
export interface FxRatesDoc {
  /** ECB publication date */
  date: string
  base: 'EUR'
  /** units per 1 EUR, EUR: 1 included */
  rates: Record<string, number>
  /** when the server fetched them (ms) */
  fetchedAt: number
  source: 'ecb'
}

/** What the server's refreshFx returns (rates included so no second read is needed). */
export interface FxRefreshResult {
  date: string
  fetchedAt: number
  rates?: Record<string, number>
}

/** Access to the shared rates (implemented by the Firebase repo; demo mode has none). */
export interface FxShared {
  getFxRates(date: string | 'latest'): Promise<FxRatesDoc | null>
  refreshFx(date?: string): Promise<FxRefreshResult | null>
}

export type FxFetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>
export type FxStorage = Pick<Storage, 'getItem' | 'setItem'>

interface CacheEntry {
  date: string
  rates: Record<string, number>
  /** when this device stored it */
  at: number
  /** when the shared copy was fetched by the server (shared entries only) */
  fetchedAt?: number
  /** from Firestore fxRates (base EUR) rather than a direct API call */
  shared?: boolean
  /** the result of a "latest" request (used for the synced / not synced status) */
  latest?: boolean
}
type Cache = Record<string, CacheEntry>

const browserStorage = (): FxStorage | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

let fetcher: FxFetch = (url, init) => fetch(url, init)
let storage: FxStorage | undefined = browserStorage()
let now = () => Date.now()
let shared: FxShared | undefined

/** Swap the network, storage, clock and shared source (tests). Call with no arguments to restore the defaults. */
export function setFxEnv(env: { fetch?: FxFetch; storage?: FxStorage | null; now?: () => number; shared?: FxShared | null } = {}) {
  fetcher = env.fetch ?? ((url, init) => fetch(url, init))
  storage = env.storage === null ? undefined : (env.storage ?? browserStorage())
  now = env.now ?? (() => Date.now())
  shared = env.shared ?? undefined
}

/** Use the shared Firestore rates (data/index.ts passes the Firebase repo; null = direct API only). */
export function setFxShared(s: FxShared | null) {
  shared = s ?? undefined
}

/** Shared lookups shouldn't hang the expense form on a bad connection. */
const SHARED_TIMEOUT_MS = 8000
/** A shared latest copy older than this asks the server to refresh it. */
const SHARED_STALE_MS = 24 * 3600_000

function within<T>(p: Promise<T>, ms = SHARED_TIMEOUT_MS): Promise<T | null> {
  let t: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    p,
    new Promise<null>((r) => {
      t = setTimeout(() => r(null), ms)
    }),
  ]).finally(() => clearTimeout(t))
}

function readCache(): Cache {
  try {
    return JSON.parse(storage?.getItem(CACHE_KEY) ?? '{}') as Cache
  } catch {
    return {}
  }
}

function writeCache(c: Cache) {
  const keys = Object.keys(c)
  if (keys.length > MAX_ENTRIES) {
    for (const k of keys.sort((a, b) => c[a].at - c[b].at).slice(0, keys.length - MAX_ENTRIES)) delete c[k]
  }
  try {
    storage?.setItem(CACHE_KEY, JSON.stringify(c))
  } catch {
    /* quota or blocked storage */
  }
}

const cacheKey = (date: string, base: string) => `${date}|${base}`
/**
 * "Today" is the device's calendar day, like every other date in the app (expense dates come
 * from todayISO()). Using the UTC day here would treat a local evening west of UTC as a past
 * date: a rate fetched before ECB's afternoon publication would then be cached as final.
 */
const isoToday = () => localISODate(now())

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
  // A EUR-based (shared) publication gives every pair.
  const eur = c[cacheKey(date, 'EUR')]
  if (ok(eur)) {
    const f = from === 'EUR' ? 1 : eur.rates[from]
    const t = to === 'EUR' ? 1 : eur.rates[to]
    if (f > 0 && t > 0) return { rate: tidy(t / f), date: eur.date, source: 'ecb' }
  }
  return null
}

const cleanRates = (r: unknown): Record<string, number> =>
  Object.fromEntries(Object.entries((r ?? {}) as Record<string, unknown>).filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v > 0)) as Record<
    string,
    number
  >

/** Store a shared publication under the date it was asked for. */
function storeShared(asked: string, d: { date: string; fetchedAt: number; rates?: Record<string, number> }, latest: boolean): CacheEntry | null {
  const rates = cleanRates(d.rates)
  if (typeof d.date !== 'string' || Object.keys(rates).length < 2) return null
  const e: CacheEntry = { date: d.date, rates: { ...rates, EUR: 1 }, at: now(), fetchedAt: d.fetchedAt, shared: true, ...(latest ? { latest: true } : {}) }
  const c = readCache()
  if (latest) {
    // A fresh shared copy replaces this day's per-base copies, so every pair uses it.
    for (const k of Object.keys(c)) if (k.startsWith(`${asked}|`)) delete c[k]
  }
  c[cacheKey(asked, 'EUR')] = e
  writeCache(c)
  return e
}

/**
 * The shared rates for `asked` (yyyy-mm-dd), read from Firestore and cached: fxRates/latest for
 * today or later (asking the server to refresh a copy older than a day), else fxRates/{asked},
 * which the server fetches and stores when it doesn't exist yet (resolving weekends/holidays to
 * the previous business day). null when there's no shared source (demo mode) or it can't be reached.
 */
async function sharedEntry(asked: string, today: string, opts: { refresh?: boolean } = {}): Promise<CacheEntry | null> {
  const s = shared
  if (!s) return null
  try {
    if (asked >= today) {
      let d: FxRatesDoc | FxRefreshResult | null = await within(s.getFxRates('latest'))
      if (opts.refresh !== false && (!d || now() - d.fetchedAt > SHARED_STALE_MS)) {
        const r = await within(s.refreshFx())
        if (r) d = r.rates ? r : ((await within(s.getFxRates('latest'))) ?? d)
      }
      return d ? storeShared(asked, d, true) : null
    }
    let d: FxRatesDoc | FxRefreshResult | null = await within(s.getFxRates(asked))
    if (!d && opts.refresh !== false) {
      const r = await within(s.refreshFx(asked))
      d = r && (r.rates ? r : ((await within(s.getFxRates(asked))) ?? (await within(s.getFxRates(r.date)))))
    }
    return d ? storeShared(asked, d, false) : null
  } catch {
    return null
  }
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
  if (await sharedEntry(asked, today)) {
    // The shared copy has every currency ECB publishes; one it lacks (e.g. AED) has no ECB rate.
    return cachedRate(from, to, asked, { stale: true })
  }
  const ctl = typeof AbortController === 'undefined' ? undefined : new AbortController()
  const timer = ctl && setTimeout(() => ctl.abort(), 8000)
  try {
    const path = asked === today ? 'latest' : asked
    const res = await fetcher(`${FX_API}/${path}?base=${encodeURIComponent(from)}`, { signal: ctl?.signal })
    if (!res.ok) throw new Error(`FX ${res.status}`)
    const body = (await res.json()) as { date?: unknown; rates?: unknown }
    if (typeof body.date !== 'string' || !body.rates || typeof body.rates !== 'object') throw new Error('FX: bad response')
    const rates = Object.fromEntries(Object.entries(body.rates as Record<string, unknown>).filter(([, v]) => typeof v === 'number' && v > 0)) as Record<
      string,
      number
    >
    const c = readCache()
    c[cacheKey(asked, from)] = { date: body.date, rates, at: now(), ...(path === 'latest' ? { latest: true } : {}) }
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
  try {
    return (JSON.parse(storage?.getItem(LAST_KEY) ?? '{}') as Record<string, string>)[groupId]
  } catch {
    return undefined
  }
}

export function rememberCurrency(groupId: string, currency: string) {
  try {
    const m = JSON.parse(storage?.getItem(LAST_KEY) ?? '{}') as Record<string, string>
    m[groupId] = currency
    storage?.setItem(LAST_KEY, JSON.stringify(m))
  } catch {
    /* storage unavailable */
  }
}

/** When today's rates for `base` were last fetched (ms; the server's fetch time for shared rates), or null. */
export function ratesFetchedAt(base: string): number | null {
  const c = readCache()
  const e = c[cacheKey(isoToday(), base)] ?? c[cacheKey(isoToday(), 'EUR')]
  return e ? (e.fetchedAt ?? e.at) : null
}

export interface RatesStatus {
  /** ECB publication date of the newest "latest" rates this device has */
  date: string
  /** when they were fetched (by the server, for shared rates) */
  fetchedAt: number
  shared: boolean
}

/** The newest "latest" rates usable for `base` on this device, or null. */
export function ratesStatus(base: string): RatesStatus | null {
  let best: RatesStatus | null = null
  for (const [k, e] of Object.entries(readCache())) {
    if (!e.latest || !(k.endsWith(`|${base}`) || k.endsWith('|EUR'))) continue
    const s = { date: e.date, fetchedAt: e.fetchedAt ?? e.at, shared: !!e.shared }
    if (!best || s.date > best.date || (s.date === best.date && s.fetchedAt > best.fetchedAt)) best = s
  }
  return best
}

/**
 * The ECB publication date one should have by `t`: today in Frankfurt from 17:00 on weekdays
 * (ECB publishes ~16:00 CET), else the previous weekday. TARGET holidays are ignored.
 */
export function expectedEcbDate(t: number): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(t))
      .map((p) => [p.type, p.value]),
  )
  let d = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
  const weekend = (ms: number) => [0, 6].includes(new Date(ms).getUTCDay())
  if (Number(parts.hour) < 17 || weekend(d)) {
    d -= 86400_000
    while (weekend(d)) d -= 86400_000
  }
  return new Date(d).toISOString().slice(0, 10)
}

/** Synced: rates from the latest ECB publication, or fetched within the last day. */
export function isSynced(s: RatesStatus | null, t = now()): boolean {
  return !!s && (s.date >= expectedEcbDate(t) || t - s.fetchedAt < SHARED_STALE_MS)
}

/** Read the shared latest rates into the cache, without asking the server to refresh (Profile on open). */
export async function loadSharedRates(base: string): Promise<RatesStatus | null> {
  if (shared) await sharedEntry(isoToday(), isoToday(), { refresh: false })
  return ratesStatus(base)
}

/**
 * Fetch the latest ECB rates now, ignoring the cache (Profile → exchange rates). With a shared
 * source the server refreshes the copy everyone reads (at most every 10 min); otherwise
 * Frankfurter is asked directly for `base`. Returns the publication date, fetch time and number
 * of currencies, or null when offline / everything fails.
 */
export async function refreshRates(base: string): Promise<{ date: string; at: number; count: number; shared: boolean } | null> {
  if (shared) {
    try {
      const r = await within(shared.refreshFx())
      const d = r && (r.rates ? r : await within(shared.getFxRates('latest')))
      const e = d && storeShared(isoToday(), d, true)
      if (e) return { date: e.date, at: e.fetchedAt ?? e.at, count: Object.keys(e.rates).length - 1, shared: true }
    } catch {
      /* fall through to the direct API */
    }
  }
  const ctl = typeof AbortController === 'undefined' ? undefined : new AbortController()
  const timer = ctl && setTimeout(() => ctl.abort(), 8000)
  try {
    const res = await fetcher(`${FX_API}/latest?base=${encodeURIComponent(base)}`, { signal: ctl?.signal })
    if (!res.ok) return null
    const body = (await res.json()) as { date?: unknown; rates?: unknown }
    if (typeof body.date !== 'string' || !body.rates || typeof body.rates !== 'object') return null
    const rates = Object.fromEntries(Object.entries(body.rates as Record<string, unknown>).filter(([, v]) => typeof v === 'number' && v > 0)) as Record<
      string,
      number
    >
    const at = now()
    const c = readCache()
    c[cacheKey(isoToday(), base)] = { date: body.date, rates, at, latest: true }
    writeCache(c)
    return { date: body.date, at, count: Object.keys(rates).length, shared: false }
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}
