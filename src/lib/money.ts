import type { Cents } from '@/types'

/*
 * Amounts are stored as integer *minor units* of the group's currency: cents for AUD/USD,
 * whole yen for JPY (0 decimals), fils for BHD (3 decimals). The number of decimals comes
 * from Intl, so it matches how the currency is displayed.
 */

const fmtCache = new Map<string, Intl.NumberFormat>()
const digitsCache = new Map<string, number>()

/** Decimal places of a currency's minor unit (2 for AUD, 0 for JPY/KRW, 3 for BHD). */
export function minorDigits(currency = 'AUD'): number {
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

export function formatMoney(minor: Cents, currency = 'AUD', opts: { sign?: boolean } = {}): string {
  const key = `${currency}|${opts.sign ? 1 : 0}`
  let fmt = fmtCache.get(key)
  if (!fmt) {
    fmt = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      signDisplay: opts.sign ? 'exceptZero' : 'auto',
    })
    fmtCache.set(key, fmt)
  }
  return fmt.format(minor / factor(currency))
}

/**
 * Parse a user-typed amount ("12", "12.5", "1,234.56", "$9.99") to minor units of `currency`.
 * Returns NaN when invalid, including more decimals than the currency has (e.g. "¥10.5").
 */
export function parseMoney(input: string, currency = 'AUD'): Cents {
  const d = minorDigits(currency)
  const cleaned = input.replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.')
  if (!cleaned || !new RegExp(`^-?\\d*(\\.\\d{0,${d}})?$`).test(cleaned)) return NaN
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.round(n * 10 ** d) : NaN
}

/** Minor units → the string to pre-fill an amount input with ("12.50", or "1200" for JPY). */
export function centsToInput(minor: Cents, currency = 'AUD'): string {
  const d = minorDigits(currency)
  return (minor / 10 ** d).toFixed(d)
}

/**
 * Rescale an amount parsed as hundredths (what the OCR / text parsers produce: "1,200" → 120000)
 * to the minor units of `currency` (1200 for JPY, 120000 for AUD).
 */
export function fromHundredths(hundredths: number, currency = 'AUD'): Cents {
  const d = minorDigits(currency)
  return d === 2 ? hundredths : Math.round((hundredths * 10 ** d) / 100)
}

export const CURRENCIES = ['AUD', 'USD', 'EUR', 'GBP', 'INR', 'NZD', 'CAD', 'SGD', 'JPY', 'IDR', 'THB', 'AED']
