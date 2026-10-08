/*
 * Shared exchange rates (fxRates/{yyyy-mm-dd} and fxRates/latest), pure parts: fetching and
 * parsing ECB reference rates from Frankfurter, and deciding what a refresh reads and writes.
 * Kept free of firebase-admin so it can be unit-tested (fx-core.test.ts).
 *
 * Frankfurter (Oct 2026): /v1 still answers but sends `Deprecation` with a successor link to
 * /v2/rates, which mixes providers unless asked for ECB only. We use
 *   https://api.frankfurter.dev/v2/rates?providers=ECB[&date=yyyy-mm-dd]   (array of {date, base, quote, rate})
 * and fall back to
 *   https://api.frankfurter.dev/v1/{latest|yyyy-mm-dd}                       ({date, base, rates})
 * Both default to base EUR and, for a weekend/holiday, return the previous business day.
 */

export const FX_V2 = 'https://api.frankfurter.dev/v2/rates'
export const FX_V1 = 'https://api.frankfurter.dev/v1'
/** A refresh within this long of the last fetch of `latest` is served from Firestore. */
export const THROTTLE_MS = 10 * 60_000
/** ECB's first reference rates. */
export const FIRST_DATE = '1999-01-04'
const ECB_TZ = 'Europe/Berlin'

export interface FxRatesDoc {
  /** ECB publication date the rates are for */
  date: string
  base: 'EUR'
  /** units of each currency per 1 EUR; EUR: 1 included */
  rates: Record<string, number>
  /** when the server fetched them (ms) */
  fetchedAt: number
  source: 'ecb'
}

export interface EcbRates { date: string; rates: Record<string, number> }

export type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

const ISO = /^\d{4}-\d{2}-\d{2}$/
export const isIsoDate = (s: unknown): s is string => typeof s === 'string' && ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))

/** Today's date in Frankfurt (where ECB publishes). */
export function berlinDate(now: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ECB_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))
}

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
const isCode = (k: string) => /^[A-Z]{3}$/.test(k)

/** /v2/rates?providers=ECB → EUR-based rates, or null when the body isn't what we expect. */
export function parseV2(body: unknown): EcbRates | null {
  if (!Array.isArray(body) || !body.length) return null
  const rates: Record<string, number> = { EUR: 1 }
  let date = ''
  for (const r of body as Array<Record<string, unknown>>) {
    if (!r || r.base !== 'EUR' || typeof r.quote !== 'string' || !isCode(r.quote) || !positive(r.rate) || !isIsoDate(r.date)) continue
    rates[r.quote] = r.rate
    if (r.date > date) date = r.date
  }
  return date && Object.keys(rates).length > 1 ? { date, rates } : null
}

/** /v1/{latest|date} (base EUR) → rates, or null. */
export function parseV1(body: unknown): EcbRates | null {
  const b = body as { date?: unknown; base?: unknown; rates?: unknown } | null
  if (!b || !isIsoDate(b.date) || (b.base !== undefined && b.base !== 'EUR') || !b.rates || typeof b.rates !== 'object') return null
  const rates: Record<string, number> = { EUR: 1 }
  for (const [k, v] of Object.entries(b.rates as Record<string, unknown>)) if (isCode(k) && positive(v)) rates[k] = v
  return Object.keys(rates).length > 1 ? { date: b.date, rates } : null
}

async function getJson(fetch: Fetch, url: string, timeoutMs: number): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.json()
}

/**
 * ECB rates for `date` (or the latest), trying /v2 then /v1. Throws when neither answers
 * with usable rates.
 */
export async function fetchEcb(fetch: Fetch, date?: string, timeoutMs = 10_000): Promise<EcbRates> {
  const errors: string[] = []
  try {
    const r = parseV2(await getJson(fetch, `${FX_V2}?providers=ECB${date ? `&date=${date}` : ''}`, timeoutMs))
    if (r) return r
    errors.push('v2: unexpected response')
  } catch (e) { errors.push(`v2: ${(e as Error).message}`) }
  try {
    const r = parseV1(await getJson(fetch, `${FX_V1}/${date ?? 'latest'}`, timeoutMs))
    if (r) return r
    errors.push('v1: unexpected response')
  } catch (e) { errors.push(`v1: ${(e as Error).message}`) }
  throw new Error(`ECB rates unavailable (${errors.join('; ')})`)
}

/**
 * What a refresh for `requested` (undefined = latest) should do. A past date is final once
 * stored; the latest is re-fetched at most every THROTTLE_MS. A date that is today or later in
 * Frankfurt, or missing, means "latest".
 */
export type RefreshPlan =
  | { kind: 'latest'; fetch: boolean }
  | { kind: 'date'; date: string; fetch: boolean }

export function planRefresh(o: { requested?: string; now: number; latest?: FxRatesDoc | null; stored?: FxRatesDoc | null; force?: boolean }): RefreshPlan {
  const today = berlinDate(o.now)
  if (!o.requested || o.requested >= today) {
    const fresh = !!o.latest && o.now - o.latest.fetchedAt < THROTTLE_MS
    return { kind: 'latest', fetch: !!o.force || !fresh }
  }
  return { kind: 'date', date: o.requested, fetch: !!o.force || !o.stored }
}

/** Is a refresh `date` argument acceptable? (undefined/null = latest) */
export function validRequest(date: unknown): date is string | undefined | null {
  return date === undefined || date === null || (isIsoDate(date) && date >= FIRST_DATE)
}

/**
 * The documents to write after fetching `got`:
 *  - fxRates/{ECB date} always (a publication never changes; rewriting it is harmless);
 *  - fxRates/{requested} too, as an alias, when a past date resolved to an earlier business
 *    day (only past dates are aliased, so "not published yet" is never stored as final);
 *  - fxRates/latest when the result is at least as new as the stored latest.
 */
export function refreshWrites(o: { got: EcbRates; now: number; requested?: string; latest?: FxRatesDoc | null }): Array<[string, FxRatesDoc]> {
  const d: FxRatesDoc = { date: o.got.date, base: 'EUR', rates: o.got.rates, fetchedAt: o.now, source: 'ecb' }
  const out: Array<[string, FxRatesDoc]> = [[d.date, d]]
  if (o.requested && o.requested !== d.date && o.requested < berlinDate(o.now) && o.requested > d.date) out.push([o.requested, d])
  if (!o.latest || d.date >= o.latest.date) out.push(['latest', d])
  return out
}

/** A stored doc, checked (anything malformed reads as missing). */
export function asRatesDoc(v: unknown): FxRatesDoc | null {
  const d = v as Partial<FxRatesDoc> | undefined
  return d && isIsoDate(d.date) && d.base === 'EUR' && d.rates && typeof d.rates === 'object' && typeof d.fetchedAt === 'number' ? (d as FxRatesDoc) : null
}
