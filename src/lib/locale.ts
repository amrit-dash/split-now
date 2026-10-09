/*
 * Region, default currency and number/date locale.
 *
 * Split Now is India-first: anyone in India (by time zone or language region), and anyone we
 * can't place, gets INR and en-IN formatting (₹1,00,000.00 lakh grouping, "7 Oct" dates).
 * Everyone else gets their own locale and its currency. Digits are always Western (the locale
 * tag carries "-u-nu-latn"), so an amount reads the same on every phone and parses back as typed.
 *
 * Everything here is pure except `detectFromBrowser`; the module keeps one "app locale" that
 * formatMoney / formatDate read, set once at start-up (main.tsx) and overridable in tests.
 */

export type Region = string // ISO 3166-1 alpha-2, e.g. 'IN', 'AU'

export const DEFAULT_REGION: Region = 'IN'
export const DEFAULT_LOCALE = 'en-IN'

const EURO = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK']

const REGION_CURRENCY: Record<string, string> = {
  IN: 'INR',
  AU: 'AUD',
  US: 'USD',
  GB: 'GBP',
  NZ: 'NZD',
  CA: 'CAD',
  SG: 'SGD',
  JP: 'JPY',
  ID: 'IDR',
  TH: 'THB',
  AE: 'AED',
  MY: 'MYR',
  HK: 'HKD',
  CH: 'CHF',
  SE: 'SEK',
  NO: 'NOK',
  DK: 'DKK',
  ZA: 'ZAR',
  KR: 'KRW',
  CN: 'CNY',
  PH: 'PHP',
  MX: 'MXN',
  BR: 'BRL',
  SA: 'SAR',
  QA: 'QAR',
  LK: 'LKR',
  NP: 'NPR',
  BD: 'BDT',
  PK: 'PKR',
  ...Object.fromEntries(EURO.map((c) => [c, 'EUR'])),
}

/** Time-zone → region, for when the language tag has no region ("en", "hi"). */
const TZ_REGION: Array<[RegExp, Region]> = [
  [/^Asia\/(Kolkata|Calcutta)$/, 'IN'],
  [/^Australia\//, 'AU'],
  [/^Pacific\/Auckland$/, 'NZ'],
  [/^Europe\/London$/, 'GB'],
  [/^Asia\/Singapore$/, 'SG'],
  [/^Asia\/Dubai$/, 'AE'],
  [/^Asia\/Tokyo$/, 'JP'],
  [/^Asia\/Bangkok$/, 'TH'],
  [/^Asia\/(Jakarta|Makassar|Jayapura)$/, 'ID'],
  [/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage)$/, 'US'],
  [/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax)$/, 'CA'],
]

const INDIAN_LANGS = new Set(['hi', 'bn', 'te', 'mr', 'ta', 'ur', 'gu', 'kn', 'ml', 'or', 'pa', 'as', 'kok', 'mai', 'sa'])

/** Region subtag of a BCP 47 tag: "en-IN" → "IN", "hi" → "IN" (an Indian language), "en" → undefined. */
export function regionOfLocale(tag: string | undefined): Region | undefined {
  if (!tag) return undefined
  try {
    const loc = new Intl.Locale(tag.replace(/_/g, '-'))
    if (loc.region && /^[A-Z]{2}$/.test(loc.region)) return loc.region
    return INDIAN_LANGS.has(loc.language) ? 'IN' : undefined
  } catch {
    return undefined
  }
}

/**
 * Best guess at the user's region. An Indian time zone wins (lots of Indian phones are set to
 * en-US / en-GB), then the language's region, then the time zone; null when we can't tell.
 */
export function detectRegion(language: string | undefined, timeZone: string | undefined): Region | null {
  if (timeZone && /^Asia\/(Kolkata|Calcutta)$/.test(timeZone)) return 'IN'
  const fromLang = regionOfLocale(language)
  if (fromLang) return fromLang
  for (const [re, r] of TZ_REGION) if (timeZone && re.test(timeZone)) return r
  return null
}

/** Default currency for a region: INR for India and for anywhere we can't place. */
export function currencyForRegion(region: Region | null | undefined): string {
  return (region && REGION_CURRENCY[region]) || 'INR'
}

/**
 * Locale to format numbers and dates with. Indian users get en-IN even if the phone says
 * en-US; unknown regions fall back to en-IN; everyone else keeps their own language tag.
 */
export function localeFor(language: string | undefined, region: Region | null): string {
  if (!region || region === 'IN') return DEFAULT_LOCALE
  if (language && regionOfLocale(language) === region) return language
  return language ? `${language.split(/[-_]/)[0]}-${region}` : `en-${region}`
}

/**
 * Pin Western digits: "en-IN" → "en-IN-u-nu-latn". Some locales (ar-EG, fa-IR, bn-BD, …) would
 * otherwise format ₹1,234 with their own digits, which other members can't read and the money
 * fields can't parse back. Unknown tags are returned as they are (the caller validates them).
 */
export function withLatinDigits(tag: string): string {
  try {
    return new Intl.Locale(tag, { numberingSystem: 'latn' }).toString()
  } catch {
    return tag
  }
}

export interface LocaleInfo {
  region: Region
  currency: string
  locale: string
  known: boolean
}

export function resolveLocale(language: string | undefined, timeZone: string | undefined): LocaleInfo {
  const r = detectRegion(language, timeZone)
  let locale = withLatinDigits(localeFor(language, r))
  try {
    new Intl.NumberFormat(locale)
  } catch {
    locale = withLatinDigits(DEFAULT_LOCALE)
  }
  return { region: r ?? DEFAULT_REGION, currency: currencyForRegion(r), locale, known: r !== null }
}

export function detectFromBrowser(): LocaleInfo {
  let lang: string | undefined, tz: string | undefined
  try {
    lang = typeof navigator === 'undefined' ? undefined : navigator.language
  } catch {
    /* ignore */
  }
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    /* ignore */
  }
  return resolveLocale(lang, tz)
}

let current: LocaleInfo = { region: DEFAULT_REGION, currency: 'INR', locale: withLatinDigits(DEFAULT_LOCALE), known: false }

/** Call once at start-up (main.tsx); tests may pass their own. */
export function initLocale(info: LocaleInfo = detectFromBrowser()): LocaleInfo {
  current = info
  return current
}

/** The locale numbers and dates are formatted with ("en-IN-u-nu-latn" by default). */
export const appLocale = () => current.locale
/** The detected region ("IN" by default). */
export const appRegion = () => current.region
/** Default currency for new profiles ("INR" by default). */
export const defaultCurrency = () => current.currency

/**
 * Which set of payment handles to offer: Indian (UPI, phone, account + IFSC), Australian
 * (PayID, BSB + account) or international only. The user's currency wins over the region.
 */
export function paymentRegion(currency: string | undefined, region: Region = current.region): 'IN' | 'AU' | 'INTL' {
  if (currency === 'INR') return 'IN'
  if (currency === 'AUD') return 'AU'
  if (region === 'IN' || region === 'AU') return region
  return 'INTL'
}

/** Named date styles, so screens share one cached formatter each instead of repeating option objects. */
export const DATE_STYLES = {
  /** 7 Oct */
  day: { day: 'numeric', month: 'short' },
  /** 7 Oct 2026 */
  dayYear: { day: 'numeric', month: 'short', year: 'numeric' },
  /** Tue 7 Oct */
  weekday: { weekday: 'short', day: 'numeric', month: 'short' },
  /** Tue 7 October 2026 */
  long: { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' },
  /** October 2026 */
  month: { month: 'long', year: 'numeric' },
  /** Oct */
  monthShort: { month: 'short' },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>
export type DateStyle = keyof typeof DATE_STYLES

const DATE_TIME: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }

const formatters = new Map<string, Intl.DateTimeFormat>()

/**
 * A cached Intl.DateTimeFormat for a style name or any options. Creating one costs ~90 µs
 * (`toLocaleDateString` does it on every call, and list rows called it per row per render);
 * formatting with a cached one ~1 µs.
 */
export function dateFormatter(style: DateStyle | Intl.DateTimeFormatOptions = 'day', locale = current.locale): Intl.DateTimeFormat {
  const opts = typeof style === 'string' ? DATE_STYLES[style] : style
  const key = `${locale}|${typeof style === 'string' ? style : JSON.stringify(opts)}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts)
    formatters.set(key, f)
  }
  return f
}

/** "2026-10-07" → local midnight; timestamps and Dates as they are; undefined when unreadable. */
function toDate(v: string | number | Date): Date | undefined {
  const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** "2026-10-07" (or a timestamp / Date) → "7 Oct" in the app locale; a style name or any Intl date options. */
export function formatDate(iso: string | number | Date, style: DateStyle | Intl.DateTimeFormatOptions = 'day', locale = current.locale): string {
  const d = toDate(iso)
  return d ? dateFormatter(style, locale).format(d) : '—'
}

/** Date and time, "7 Oct 2026, 6:45 pm" (for "added at" lines). */
export function formatDateTime(ts: string | number | Date, opts: Intl.DateTimeFormatOptions = DATE_TIME, locale = current.locale): string {
  const d = toDate(ts)
  return d ? dateFormatter(opts, locale).format(d) : '—'
}

/** Time of day, "6:45 pm". */
export function formatTime(ts: string | number | Date, opts: Intl.DateTimeFormatOptions = TIME, locale = current.locale): string {
  const d = toDate(ts)
  return d ? dateFormatter(opts, locale).format(d) : '—'
}
