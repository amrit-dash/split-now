import type { Cents } from '@/types'

const fmtCache = new Map<string, Intl.NumberFormat>()

export function formatMoney(cents: Cents, currency = 'AUD', opts: { sign?: boolean } = {}): string {
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
  return fmt.format(cents / 100)
}

/** Parse a user-typed amount ("12", "12.5", "1,234.56", "$9.99") to cents. Returns NaN when invalid. */
export function parseMoney(input: string): Cents {
  const cleaned = input.replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.')
  if (!cleaned || !/^-?\d*(\.\d{0,2})?$/.test(cleaned)) return NaN
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.round(n * 100) : NaN
}

export function centsToInput(cents: Cents): string {
  return (cents / 100).toFixed(2)
}

export const CURRENCIES = ['AUD', 'USD', 'EUR', 'GBP', 'INR', 'NZD', 'CAD', 'SGD', 'JPY', 'IDR', 'THB', 'AED']
