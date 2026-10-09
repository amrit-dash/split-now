/*
 * Money helpers shared by the app (src/lib/capture.ts re-exports them) and Cloud Functions
 * (functions/src/lib/capture-core.ts, ai.ts). Pure: no Firebase, no DOM, no '@/types'.
 *
 * One implementation of "which currency does this amount string imply" means a POST to
 * /api/capture with { amount: 'A$12.50' } and a /capture?raw=A$12.50 link agree (AUD, not ₹).
 */

/** Currencies the app offers. Kept in step with CURRENCIES in src/lib/money.ts. */
export const KNOWN_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'THB', 'AUD', 'NZD', 'CAD', 'JPY', 'IDR', 'MYR', 'LKR', 'NPR']

/*
 * Decimal places of each currency's minor unit, from ISO 4217 (the standard, not the device's
 * display data). Intl's answer depends on the ICU version: Node, Chrome and an older phone can
 * disagree (IDR came back 0 on one machine and 2 on another), and two devices storing the same
 * amount with different digits would be 100× apart. Everything not listed has 2.
 */
const ISO_DIGITS: Record<string, number> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
  CLF: 4,
  UYW: 4,
}

/** Decimal places of a currency's minor unit (2 for INR/AUD/IDR, 0 for JPY/KRW, 3 for BHD), per ISO 4217. */
export function minorDigitsOf(currency = 'INR'): number {
  return ISO_DIGITS[currency.toUpperCase()] ?? 2
}

/** Symbols that name a currency on their own. Order matters: the two-letter prefixes come before the bare ones. */
const SYMBOLS: Array<[RegExp, string]> = [
  [/(?<![A-Z])A\$|AU\$/i, 'AUD'],
  [/NZ\$/i, 'NZD'],
  [/US\$/i, 'USD'],
  [/(?<![A-Z])C\$|CA\$/i, 'CAD'],
  [/(?<![A-Z])S\$|SG\$/i, 'SGD'],
  [/€/, 'EUR'],
  [/£/, 'GBP'],
  [/₹|\bRs\.?/i, 'INR'],
  [/¥/, 'JPY'],
  [/\bRp\b/i, 'IDR'],
  [/฿/, 'THB'],
]

/** Currency implied by an amount string such as "A$12.50", "12,50 EUR" or "Rs.840", else undefined. */
export function currencyFromAmount(raw: string, known: readonly string[] = KNOWN_CURRENCIES): string | undefined {
  const code = [...raw.matchAll(/\b([A-Z]{3})\b/g)].map((m) => m[1]).find((c) => known.includes(c))
  if (code) return code
  return SYMBOLS.find(([re]) => re.test(raw))?.[1]
}

/** An idempotency key fit for a document id ([A-Za-z0-9_-], 4–64 chars), or undefined. */
export function sanitiseRef(raw: string | null | undefined): string | undefined {
  const s = raw
    ?.trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 64)
  return s && s.length >= 4 ? s : undefined
}

/**
 * Short, stable fingerprint of a string (FNV-1a, 52 bits as base36) for ids that must be the
 * same on every device without Web Crypto's async API: the share-sheet capture of one SMS gets
 * the same id however often it is shared.
 */
export function fingerprint(s: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ c, 0x0100019b) >>> 0
  }
  return (h1.toString(36) + h2.toString(36)).slice(0, 14)
}
