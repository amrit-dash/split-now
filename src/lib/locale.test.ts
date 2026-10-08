import { afterEach, describe, expect, it } from 'vitest'
import {
  appLocale, currencyForRegion, dateFormatter, defaultCurrency, detectRegion, formatDate, formatDateTime, formatTime, initLocale, localeFor,
  paymentRegion, regionOfLocale, resolveLocale, withLatinDigits,
} from './locale'
import { formatMoney } from './money'

afterEach(() => { initLocale(resolveLocale(undefined, undefined)) })

describe('region detection', () => {
  it('reads the region from the language tag', () => {
    expect(regionOfLocale('en-IN')).toBe('IN')
    expect(regionOfLocale('en_AU')).toBe('AU')
    expect(regionOfLocale('hi')).toBe('IN')
    expect(regionOfLocale('ta-IN')).toBe('IN')
    expect(regionOfLocale('en')).toBeUndefined()
    expect(regionOfLocale('not a tag!')).toBeUndefined()
  })

  it('an Indian time zone wins over an en-US phone', () => {
    expect(detectRegion('en-US', 'Asia/Kolkata')).toBe('IN')
    expect(detectRegion('en-GB', 'Asia/Calcutta')).toBe('IN')
  })

  it('falls back from language to time zone to unknown', () => {
    expect(detectRegion('en-AU', 'Australia/Melbourne')).toBe('AU')
    expect(detectRegion('en', 'Australia/Sydney')).toBe('AU')
    expect(detectRegion('en', 'Asia/Dubai')).toBe('AE')
    expect(detectRegion('en', 'UTC')).toBeNull()
    expect(detectRegion(undefined, undefined)).toBeNull()
  })

  it('maps regions to currencies, defaulting to INR', () => {
    expect(currencyForRegion('IN')).toBe('INR')
    expect(currencyForRegion('AU')).toBe('AUD')
    expect(currencyForRegion('DE')).toBe('EUR')
    expect(currencyForRegion('GB')).toBe('GBP')
    expect(currencyForRegion('AE')).toBe('AED')
    expect(currencyForRegion('ZZ')).toBe('INR')
    expect(currencyForRegion(null)).toBe('INR')
  })

  it('formats in en-IN for India and unknown regions', () => {
    expect(localeFor('en-US', 'IN')).toBe('en-IN')
    expect(localeFor(undefined, null)).toBe('en-IN')
    expect(localeFor('en-AU', 'AU')).toBe('en-AU')
    expect(localeFor('en', 'AU')).toBe('en-AU')
  })

  it('resolves everything at once, with Western digits pinned', () => {
    expect(resolveLocale('en-US', 'Asia/Kolkata')).toEqual({ region: 'IN', currency: 'INR', locale: 'en-IN-u-nu-latn', known: true })
    expect(resolveLocale('en-AU', 'Australia/Melbourne')).toEqual({ region: 'AU', currency: 'AUD', locale: 'en-AU-u-nu-latn', known: true })
    expect(resolveLocale(undefined, 'UTC')).toEqual({ region: 'IN', currency: 'INR', locale: 'en-IN-u-nu-latn', known: false })
  })

  it('pins Latin digits and leaves unparseable tags alone', () => {
    expect(withLatinDigits('en-IN')).toBe('en-IN-u-nu-latn')
    expect(withLatinDigits('ar-EG-u-nu-arab')).toBe('ar-EG-u-nu-latn')
    expect(withLatinDigits('not a tag!')).toBe('not a tag!')
    // An Egyptian phone would otherwise show Arabic-Indic digits.
    const egypt = resolveLocale('ar-EG', 'Africa/Cairo').locale
    expect(egypt).toBe('ar-EG-u-nu-latn')
    expect(formatMoney(123456, 'EGP', { locale: egypt })).toMatch(/1,234\.56/)
    expect(formatMoney(123456, 'EGP', { locale: egypt })).not.toMatch(/[٠-٩]/)
  })

  it('picks payment handle sets by currency, then region', () => {
    expect(paymentRegion('INR', 'AU')).toBe('IN')
    expect(paymentRegion('AUD', 'IN')).toBe('AU')
    expect(paymentRegion('USD', 'IN')).toBe('IN')
    expect(paymentRegion('USD', 'US')).toBe('INTL')
  })
})

describe('app locale', () => {
  it('defaults to India', () => {
    expect(appLocale()).toBe('en-IN-u-nu-latn')
    expect(defaultCurrency()).toBe('INR')
  })

  it('formatMoney uses lakh / crore grouping in en-IN', () => {
    expect(formatMoney(10000000, 'INR')).toBe('₹1,00,000.00')
    expect(formatMoney(1234567890, 'INR')).toBe('₹1,23,45,678.90')
    expect(formatMoney(50000, 'INR', { sign: true })).toBe('+₹500.00')
  })

  it('follows the app locale, or an explicit one', () => {
    initLocale(resolveLocale('en-AU', 'Australia/Melbourne'))
    expect(formatMoney(10000000, 'AUD')).toBe('$100,000.00')
    expect(formatMoney(10000000, 'INR', { locale: 'en-IN' })).toBe('₹1,00,000.00')
    expect(defaultCurrency()).toBe('AUD')
  })

  it('formats dates day-first in en-IN', () => {
    expect(formatDate('2026-10-07')).toBe('7 Oct')
    expect(formatDate('2026-10-07', { day: 'numeric', month: 'short', year: 'numeric' })).toBe('7 Oct 2026')
    expect(formatDate('nope')).toBe('—')
  })

  it('knows the named styles and takes timestamps and Dates too', () => {
    const d = new Date(2026, 9, 7, 18, 45)
    expect(formatDate('2026-10-07', 'dayYear')).toBe('7 Oct 2026')
    expect(formatDate(d.getTime(), 'day')).toBe('7 Oct')
    expect(formatDate(d, 'month')).toBe('October 2026')
    expect(formatDate(d, 'monthShort')).toBe('Oct')
    expect(formatDate(d, 'weekday')).toMatch(/^Wed,? 7 Oct$/)
    expect(formatDate(d, 'long')).toMatch(/^Wed,? 7 October 2026$/)
    expect(formatDateTime(d)).toMatch(/^7 Oct 2026, 6:45\s?pm$/i)
    expect(formatTime(d)).toMatch(/^6:45\s?pm$/i)
    expect(formatDateTime('nope')).toBe('—')
  })

  it('reuses one formatter per locale and style', () => {
    expect(dateFormatter('day')).toBe(dateFormatter('day'))
    expect(dateFormatter({ day: 'numeric', month: 'short' })).toBe(dateFormatter({ day: 'numeric', month: 'short' }))
    expect(dateFormatter('day')).not.toBe(dateFormatter('dayYear'))
    expect(dateFormatter('day', 'en-AU')).not.toBe(dateFormatter('day'))
    initLocale(resolveLocale('en-AU', 'Australia/Melbourne'))
    expect(dateFormatter('day')).toBe(dateFormatter('day', 'en-AU-u-nu-latn'))
  })
})
