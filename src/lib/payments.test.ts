import { describe, expect, it } from 'vitest'
import { isIfsc, isIOS, isUpiId, methodFor, methodLabel, payOptions, roundSuggestions, settleMethods, upiAppLinks, upiLink } from './payments'
import { encodeQr } from './qr'

describe('UPI links', () => {
  it('builds a upi://pay link in spec order with the amount in rupees', () => {
    expect(upiLink({ pa: 'rohan.sharma@okaxis', pn: 'Rohan Sharma', amount: 125050, note: 'Split Now Goa Trip' }))
      .toBe('upi://pay?pa=rohan.sharma@okaxis&pn=Rohan%20Sharma&am=1250.50&cu=INR&tn=Split%20Now%20Goa%20Trip')
  })

  it('drops emoji / odd characters and keeps pn and tn short', () => {
    const l = upiLink({ pa: 'a@ybl', pn: 'Priya 🌸 Nair', amount: 50000, note: 'Split Now: Goa Trip 🏖️ & more stuff here, really long' })
    expect(l).toBe('upi://pay?pa=a@ybl&pn=Priya%20Nair&am=500.00&cu=INR&tn=Split%20Now%20Goa%20Trip%20more%20stuff')
  })

  it('leaves the amount out when there is none, so the payer types it', () => {
    expect(upiLink({ pa: 'a@ybl' })).toBe('upi://pay?pa=a@ybl&cu=INR')
  })

  it('app-specific links share the query', () => {
    const apps = upiAppLinks({ pa: 'a@ybl', amount: 10000 })
    expect(apps.map((a) => a.href)).toEqual([
      'tez://upi/pay?pa=a@ybl&am=100.00&cu=INR',
      'phonepe://pay?pa=a@ybl&am=100.00&cu=INR',
      'paytmmp://upi/pay?pa=a@ybl&am=100.00&cu=INR',
    ])
  })

  it('fits in a QR code even with long names', () => {
    const l = upiLink({ pa: 'a.really.long.upi.handle.for.testing.purposes@okhdfcbank', pn: 'Someone With A Very Long Name Indeed', amount: 99999999, note: 'Split Now Bengaluru Flat Indiranagar 2026' })
    expect(() => encodeQr(l)).not.toThrow()
  })

  it('validates UPI IDs and IFSC codes', () => {
    expect(isUpiId('rohan@okaxis')).toBe(true)
    expect(isUpiId('9876543210@ybl')).toBe(true)
    expect(isUpiId('rohan')).toBe(false)
    expect(isUpiId('rohan@')).toBe(false)
    expect(isUpiId('ro han@ybl')).toBe(false)
    expect(isIfsc('HDFC0001234')).toBe(true)
    expect(isIfsc('sbin0005943')).toBe(true)
    expect(isIfsc('HDFC1001234')).toBe(false)
  })
})

describe('payOptions', () => {
  const all = { upi: 'rohan@okaxis', phone: '+91 98765 43210', account: '50100123456789', ifsc: 'hdfc0001234', paypal: 'https://paypal.me/rohan', revolut: '@rohan', payid: 'r@x.com', bsb: '062-000' }

  it('puts UPI first for INR, with a QR, app links and the exact amount', () => {
    const o = payOptions(all, 50000, 'INR', 'Split Now: Goa Trip', 'Rohan')
    expect(o.map((x) => x.key)).toEqual(['upi', 'phone', 'bank', 'paypal', 'revolut', 'payid'])
    expect(o[0].href).toBe('upi://pay?pa=rohan@okaxis&pn=Rohan&am=500.00&cu=INR&tn=Split%20Now%20Goa%20Trip')
    expect(o[0].qr).toBe(o[0].href)
    expect(o[0].apps?.map((a) => a.label)).toEqual(['Google Pay', 'PhonePe', 'Paytm'])
    expect(o[2]).toMatchObject({ label: 'Bank (A/c / IFSC)', value: '50100123456789 / HDFC0001234' })
    expect(o[3].href).toBe('https://paypal.me/rohan/500.00INR')
  })

  it('keeps PayID / BSB first for AUD and gives UPI no amount link', () => {
    const o = payOptions({ payid: 'r@x.com', bsb: '062-000', account: '1234', upi: 'r@ybl' }, 1000, 'AUD', 'x')
    expect(o.map((x) => x.key)).toEqual(['payid', 'bank', 'upi'])
    expect(o[1].value).toBe('062-000 / 1234')
    expect(o[2].href).toBeUndefined()
    expect(o[2].qr).toBeUndefined()
  })

  it('no handles, no options', () => {
    expect(payOptions(undefined, 100, 'INR', '')).toEqual([])
    expect(payOptions({}, 100, 'INR', '')).toEqual([])
  })

  it('a malformed UPI ID is still shown to copy, but without a link', () => {
    const [o] = payOptions({ upi: 'rohan' }, 100, 'INR', '')
    expect(o).toMatchObject({ key: 'upi', value: 'rohan' })
    expect(o.href).toBeUndefined()
  })
})

describe('settle methods', () => {
  it('chips per currency', () => {
    expect(settleMethods('INR')).toEqual(['UPI', 'Cash', 'Bank transfer', 'Other'])
    expect(settleMethods('AUD')[0]).toBe('PayID')
    expect(settleMethods('USD')).toContain('Bank transfer')
  })
  it('maps an option to a method', () => {
    expect(methodFor({ key: 'phone', label: 'UPI number / phone', value: '' })).toBe('UPI')
    expect(methodFor({ key: 'bank', label: 'Bank (A/c / IFSC)', value: '' })).toBe('Bank transfer')
    expect(methodFor({ key: 'paypal', label: 'PayPal', value: '' })).toBe('PayPal')
  })
  it('detects iOS', () => {
    expect(isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(true)
    expect(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true)
    expect(isIOS('Mozilla/5.0 (Linux; Android 15; Pixel 9)', 5)).toBe(false)
  })
})

describe('settle-up helpers', () => {
  it('labels the waived method and leaves the rest as stored', () => {
    expect(methodLabel('waived')).toBe('Waived')
    expect(methodLabel('UPI')).toBe('UPI')
    expect(methodLabel('Bank transfer')).toBe('Bank transfer')
  })

  it('suggests the round figures just below and above a debt', () => {
    expect(roundSuggestions(124700, 'INR')).toEqual([120000, 125000])
    expect(roundSuggestions(8300, 'INR')).toEqual([8000, 9000])
    expect(roundSuggestions(2700, 'INR')).toEqual([2500, 3000])
    expect(roundSuggestions(1248000, 'INR')).toEqual([1200000, 1250000])
    expect(roundSuggestions(1247, 'JPY')).toEqual([1200, 1250])
    // Already round, or nothing sensible below: only what makes sense.
    expect(roundSuggestions(120000, 'INR')).toEqual([])
    expect(roundSuggestions(300, 'INR')).toEqual([500])
    expect(roundSuggestions(0, 'INR')).toEqual([])
    expect(roundSuggestions(Number.NaN, 'INR')).toEqual([])
  })
})
