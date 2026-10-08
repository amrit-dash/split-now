import type { Cents } from '@/types'
import { appLocale } from './locale'

/*
 * Amounts are stored as integer *minor units* of the group's currency: paise for INR, cents for AUD/USD,
 * whole yen for JPY (0 decimals), fils for BHD (3 decimals). The number of decimals comes
 * from Intl, so it matches how the currency is displayed.
 */

const fmtCache = new Map<string, Intl.NumberFormat>()
const digitsCache = new Map<string, number>()

/** Decimal places of a currency's minor unit (2 for INR/AUD, 0 for JPY/KRW, 3 for BHD). */
export function minorDigits(currency = 'INR'): number {
  let d = digitsCache.get(currency)
  if (d === undefined) {
    try {
      d = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
    } catch {
      d = 2
    }
    digitsCache.set(currency, d)
  }
  return d
}

const factor = (currency?: string) => 10 ** minorDigits(currency)

/**
 * Format minor units for display, in the app locale (src/lib/locale.ts) unless `opts.locale`
 * is given: en-IN groups in lakhs/crores (₹1,00,000.00), en-AU gives $1,000.00.
 */
export function formatMoney(minor: Cents, currency = 'INR', opts: { sign?: boolean; locale?: string } = {}): string {
  const locale = opts.locale ?? appLocale()
  const key = `${locale}|${currency}|${opts.sign ? 1 : 0}`
  let fmt = fmtCache.get(key)
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat(locale, { style: 'currency', currency, signDisplay: opts.sign ? 'exceptZero' : 'auto' })
    } catch {
      fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency, signDisplay: opts.sign ? 'exceptZero' : 'auto' })
    }
    fmtCache.set(key, fmt)
  }
  return fmt.format(minor / factor(currency))
}

/** "₹" for INR, "$" for AUD in en-AU, "A$" for AUD in en-IN: the symbol in the app locale. */
export function currencySymbol(currency = 'INR', locale = appLocale()): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency
  } catch {
    return currency
  }
}

/**
 * Parse a user-typed amount ("12", "12.5", "1,234.56", "$9.99") to minor units of `currency`.
 * Returns NaN when invalid, including more decimals than the currency has (e.g. "¥10.5").
 */
export function parseMoney(input: string, currency = 'INR'): Cents {
  const d = minorDigits(currency)
  const raw = input.replace(/[^\d.,-]/g, '')
  // Thousands separators, Western (1,234,567) or Indian lakh/crore (12,34,567): drop them all.
  const cleaned = /^-?\d{1,3}(?:,\d{2,3})*,\d{3}(?:\.\d*)?$/.test(raw) ? raw.replace(/,/g, '') : raw.replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.')
  if (!cleaned || !new RegExp(`^-?\\d*(\\.\\d{0,${d}})?$`).test(cleaned)) return NaN
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.round(n * 10 ** d) : NaN
}

/** Minor units → the string to pre-fill an amount input with ("12.50", or "1200" for JPY). */
export function centsToInput(minor: Cents, currency = 'INR'): string {
  const d = minorDigits(currency)
  return (minor / 10 ** d).toFixed(d)
}

/**
 * Rescale an amount parsed as hundredths (what the OCR / text parsers produce: "1,200" → 120000)
 * to the minor units of `currency` (1200 for JPY, 120000 for AUD).
 */
export function fromHundredths(hundredths: number, currency = 'INR'): Cents {
  const d = minorDigits(currency)
  return d === 2 ? hundredths : Math.round((hundredths * 10 ** d) / 100)
}

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'THB', 'AUD', 'NZD', 'CAD', 'JPY', 'IDR', 'MYR', 'LKR', 'NPR']
