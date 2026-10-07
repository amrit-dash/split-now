import { describe, expect, it } from 'vitest'
import { centsToInput, currencySymbol, formatMoney, fromHundredths, minorDigits, parseMoney } from './money'
import { captureQuery, parseCaptureAmount, parseCaptureParams } from './capture'
import { centsToDecimal } from './export'

describe('money', () => {
  it('knows minor-unit digits per currency', () => {
    expect(minorDigits('AUD')).toBe(2)
    expect(minorDigits('JPY')).toBe(0)
    expect(minorDigits('KRW')).toBe(0)
    expect(minorDigits('BHD')).toBe(3)
    expect(minorDigits('NOT-A-CURRENCY')).toBe(2)
  })

  it('parses two-decimal currencies to cents', () => {
    expect(parseMoney('12')).toBe(1200)
    expect(parseMoney('12.5')).toBe(1250)
    expect(parseMoney('1,234.56', 'USD')).toBe(123456)
    expect(parseMoney('$9.99')).toBe(999)
    expect(parseMoney('1.234')).toBeNaN()
    expect(parseMoney('abc')).toBeNaN()
  })

  it('parses zero-decimal currencies to whole units', () => {
    expect(parseMoney('1200', 'JPY')).toBe(1200)
    expect(parseMoney('¥1,200', 'JPY')).toBe(1200)
    expect(parseMoney('10.5', 'JPY')).toBeNaN()
    expect(parseMoney('50000', 'KRW')).toBe(50000)
  })

  it('parses three-decimal currencies', () => {
    expect(parseMoney('1.234', 'BHD')).toBe(1234)
  })

  it('round-trips through the input format', () => {
    expect(centsToInput(1250)).toBe('12.50')
    expect(centsToInput(1200, 'JPY')).toBe('1200')
    expect(parseMoney(centsToInput(98765, 'JPY'), 'JPY')).toBe(98765)
    expect(parseMoney(centsToInput(98765, 'AUD'), 'AUD')).toBe(98765)
  })

  it('rescales OCR hundredths to minor units', () => {
    expect(fromHundredths(120000, 'JPY')).toBe(1200)
    expect(fromHundredths(1250, 'AUD')).toBe(1250)
  })

  it('capture links respect the currency', () => {
    expect(parseCaptureAmount('1,200', 'JPY')).toBe(1200)
    expect(parseCaptureAmount('12.50')).toBe(1250)
    const r = parseCaptureParams(new URLSearchParams('amount=1200&currency=JPY&merchant=Lawson'), '2026-01-01')
    expect(r.ok && r.draft.amount).toBe(1200)
    expect(new URLSearchParams(captureQuery({ amount: 1200, currency: 'JPY', merchant: 'Lawson' })).get('amount')).toBe('1200')
  })

  it('CSV export writes whole yen', () => {
    expect(centsToDecimal(1200, 'JPY')).toBe('1200')
    expect(centsToDecimal(-5, 'AUD')).toBe('-0.05')
    expect(centsToDecimal(1234, 'BHD')).toBe('1.234')
  })

  it('formats using the currency’s minor unit', () => {
    expect(formatMoney(1200, 'JPY')).toMatch(/1,?200/)
    expect(formatMoney(1200, 'JPY')).not.toMatch(/12\.00/)
    expect(formatMoney(1250, 'USD')).toMatch(/12\.50/)
  })

  it('defaults to INR in en-IN with lakh grouping', () => {
    expect(formatMoney(12345678)).toBe('₹1,23,456.78')
    expect(formatMoney(12345678, 'INR', { locale: 'en-US' })).toBe('₹123,456.78')
    expect(parseMoney('1,00,000')).toBe(10000000)
    expect(parseMoney('₹2,50,000.50')).toBe(25000050)
  })

  it('currency symbols in a locale', () => {
    expect(currencySymbol('INR', 'en-IN')).toBe('₹')
    expect(currencySymbol('AUD', 'en-AU')).toBe('$')
    expect(currencySymbol('AUD', 'en-IN')).toBe('A$')
    expect(currencySymbol('XYZ1', 'en-IN')).toBe('XYZ1')
  })
})
