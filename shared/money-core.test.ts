import { describe, expect, it } from 'vitest'
import { currencyFromAmount, fingerprint, minorDigitsOf, sanitiseRef } from './money-core'

describe('money-core', () => {
  it('minor digits from Intl', () => {
    expect(minorDigitsOf('INR')).toBe(2)
    expect(minorDigitsOf('JPY')).toBe(0)
    expect(minorDigitsOf('BHD')).toBe(3)
    expect(minorDigitsOf('nope')).toBe(2)
  })
  it.each([
    ['A$12.50', 'AUD'],
    ['AU$3', 'AUD'],
    ['NZ$5', 'NZD'],
    ['US$5', 'USD'],
    ['CA$5', 'CAD'],
    ['S$9', 'SGD'],
    ['€4', 'EUR'],
    ['£4', 'GBP'],
    ['₹400', 'INR'],
    ['Rs.840', 'INR'],
    ['12.50 USD', 'USD'],
    ['You paid 5 AUD', 'AUD'],
    ['¥1200', 'JPY'],
    ['฿90', 'THB'],
    ['Rp 5000', 'IDR'],
  ])('%s → %s', (raw, cur) => expect(currencyFromAmount(raw)).toBe(cur))
  it('is undefined for a bare dollar sign or an unknown code', () => {
    expect(currencyFromAmount('$12')).toBeUndefined()
    expect(currencyFromAmount('12 XYZ')).toBeUndefined()
    expect(currencyFromAmount('12 XYZ', ['XYZ'])).toBe('XYZ')
  })
  it('sanitiseRef keeps a safe id of 4–64 characters', () => {
    expect(sanitiseRef(' ref/62811-2345 ')).toBe('ref62811-2345')
    expect(sanitiseRef('ab')).toBeUndefined()
    expect(sanitiseRef('x'.repeat(80))).toHaveLength(64)
    expect(sanitiseRef(undefined)).toBeUndefined()
  })
  it('fingerprint is stable, short and sensitive to small changes', () => {
    expect(fingerprint('hello')).toBe(fingerprint('hello'))
    expect(fingerprint('hello')).not.toBe(fingerprint('hellp'))
    expect(fingerprint('')).toMatch(/^[a-z0-9]{1,14}$/)
    expect(fingerprint('Rs.60.00 debited from a/c XX1234')).toMatch(/^[a-z0-9]{8,14}$/)
  })
})
