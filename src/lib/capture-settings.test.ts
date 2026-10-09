import { describe, expect, it } from 'vitest'
import {
  LOG_RESULTS, filterReason, logResultText, logResultTone, matchIgnoreWord, normaliseIgnoreWords, parseIgnoreWords, relativeTime, resolveFilters,
} from './capture-filters'
import { addIgnoreWord, captureSettingsLines, paiseToRupeesInput, rupeesToPaise } from './capture-settings'
import { DEFAULT_ALL_PREFS, resolveAllPrefs } from './push'
import { ANDROID_FILTER_REGEX, MACRODROID_PLAY_INTENT, MACRODROID_PLAY_URL, REASON_TEXT, interpretResponse, macrodroidPlayLink, sampleSms } from './sms-setup'

describe('ignore keywords', () => {
  it('normalises: trims, dedupes case-insensitively, caps count and length', () => {
    expect(normaliseIgnoreWords([' SIP ', 'sip', 'mutual   fund', '', 3])).toEqual(['SIP', 'mutual fund'])
    expect(normaliseIgnoreWords(Array.from({ length: 30 }, (_, i) => `w${i}`))).toHaveLength(20)
    expect(normaliseIgnoreWords(['x'.repeat(80)])[0]).toHaveLength(40)
    expect(parseIgnoreWords('SIP, rent\nEMI')).toEqual(['SIP', 'rent', 'EMI'])
  })
  it('matches whole words, any case, across whitespace', () => {
    expect(matchIgnoreWord(['SIP'], 'NACH/SIP/Zerodha debited')).toBe('SIP')
    expect(matchIgnoreWord(['sip'], 'paid to Gossip Cafe')).toBeUndefined()
    expect(matchIgnoreWord(['credit card bill'], 'Payment of Credit  Card\nBill Rs 5000')).toBe('credit card bill')
    expect(matchIgnoreWord(['rent'], undefined, 'NoBroker Rent')).toBe('rent')
    expect(matchIgnoreWord(['a.b'], 'axb')).toBeUndefined() // regex characters are literal
    expect(matchIgnoreWord([], 'anything')).toBeUndefined()
  })
})

describe('filterReason', () => {
  const f = resolveFilters({ minAmount: 10000, ignoreWords: ['rent'] })
  it('below the minimum (INR), ignored keyword, or kept', () => {
    expect(filterReason(f, { amount: 9999, currency: 'INR' })).toBe('below_min')
    expect(filterReason(f, { amount: 10000, currency: 'INR' })).toBeUndefined()
    expect(filterReason(f, { amount: 500, currency: 'USD' })).toBeUndefined()
    expect(filterReason(f, { amount: 2_500_000, currency: 'INR', merchant: 'House rent' })).toBe('ignored')
  })
  it('defaults filter nothing', () => {
    expect(filterReason(resolveFilters(undefined), { amount: 1, currency: 'INR', merchant: 'SIP' }, 'SIP rent')).toBeUndefined()
  })
})

describe('activity log text', () => {
  it('has friendly text for every result', () => {
    for (const r of LOG_RESULTS) expect(logResultText({ result: r })).toMatch(/\w/)
    expect(logResultText({ result: 'outside_trip' })).toBe('Ignored: outside trip dates')
    expect(logResultText({ result: 'captured', groupName: 'Goa' })).toBe('Captured for Goa')
    expect(logResultText({ result: 'paused', groupName: 'Goa' })).toBe('Ignored: capture paused for Goa')
    expect(logResultTone('captured')).toBe('ok')
    expect(logResultTone('unparsed')).toBe('warn')
    expect(logResultTone('ignored')).toBe('muted')
  })
  it('relative time', () => {
    const now = Date.parse('2026-10-08T12:00:00Z')
    expect(relativeTime(now - 20_000, now)).toBe('just now')
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3 h ago')
    expect(relativeTime(now - 30 * 3_600_000, now)).toBe('yesterday')
    expect(relativeTime(now - 4 * 86_400_000, now)).toBe('4 days ago')
    expect(relativeTime(Date.parse('2026-09-01T12:00:00Z'), now)).toBe('2026-09-01')
  })
})

describe('settings form helpers', () => {
  it('rupees ↔ paise', () => {
    expect(rupeesToPaise('150')).toBe(15000)
    expect(rupeesToPaise('₹1,500.50')).toBe(150050)
    expect(rupeesToPaise('')).toBe(0)
    expect(rupeesToPaise('abc')).toBe(0)
    expect(rupeesToPaise('-5')).toBe(0)
    expect(rupeesToPaise('99999999')).toBe(10_000_000)
    expect(paiseToRupeesInput(0)).toBe('')
    expect(paiseToRupeesInput(15000)).toBe('150')
    expect(paiseToRupeesInput(150050)).toBe('1500.50')
  })
  it('addIgnoreWord keeps identity when nothing changes', () => {
    const w = ['SIP']
    expect(addIgnoreWord(w, 'sip')).toBe(w)
    expect(addIgnoreWord(w, ' ')).toBe(w)
    expect(addIgnoreWord(w, 'rent')).toEqual(['SIP', 'rent'])
  })
  it('summary lines', () => {
    expect(captureSettingsLines(DEFAULT_ALL_PREFS)).toEqual(['Only payments dated during a trip', 'Notifies for trip payments'])
    expect(captureSettingsLines({ ...DEFAULT_ALL_PREFS, capturePaused: true })).toHaveLength(1)
    const lines = captureSettingsLines({ ...DEFAULT_ALL_PREFS, outsideTrips: true, unsorted: true, minAmount: 10000, ignoreWords: ['SIP', 'rent'] }, ['Goa'])
    expect(lines).toContain('Ignoring payments under ₹100')
    expect(lines).toContain('Ignoring 2 keywords: SIP, rent')
    expect(lines).toContain('Paused for Goa')
    expect(lines).toContain('Notifies for every captured payment')
  })
  it('resolveAllPrefs fills defaults and drops bad types', () => {
    expect(resolveAllPrefs(undefined)).toEqual(DEFAULT_ALL_PREFS)
    expect(resolveAllPrefs({ captures: false, minAmount: '5', ignoreWords: ['SIP'], capturePaused: true }))
      .toMatchObject({ captures: false, minAmount: 0, ignoreWords: ['SIP'], capturePaused: true, outsideTrips: false })
  })
})

describe('Android setup', () => {
  // MacroDroid uses Java regex with inline flags; JS takes the flags separately.
  const re = new RegExp(ANDROID_FILTER_REGEX.replace(/^\(\?is\)/, ''), 'is')
  it('passes debit SMS and blocks OTPs and chat', () => {
    expect(re.test(sampleSms('2026-10-07'))).toBe(true)
    expect(re.test('Sent Rs.500.00\nFrom HDFC Bank A/C x1234\nTo Ravi')).toBe(true)
    expect(re.test('INR 1,200.00 spent on ICICI Bank Card XX1234 at AMAZON')).toBe(true)
    expect(re.test('123456 is your OTP for a payment of Rs 500 at Swiggy. Do not share.')).toBe(false)
    expect(re.test('Your one-time password is 4321 for Rs.250 debit')).toBe(false)
    expect(re.test('see you at 7?')).toBe(false)
  })
  it('Play Store link: intent on Android, https elsewhere', () => {
    expect(MACRODROID_PLAY_URL).toBe('https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid')
    expect(MACRODROID_PLAY_INTENT).toBe('intent://details?id=com.arlosoft.macrodroid#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.arlosoft.macrodroid;end')
    expect(macrodroidPlayLink('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(MACRODROID_PLAY_INTENT)
    expect(macrodroidPlayLink('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(MACRODROID_PLAY_URL)
  })
})

describe('webhook reasons', () => {
  it('explains the new filter reasons', () => {
    for (const r of ['paused', 'below_min', 'ignored'] as const) {
      expect(REASON_TEXT[r]).toBeTruthy()
      expect(interpretResponse(200, { ok: false, reason: r })).toMatchObject({ kind: 'rejected', reason: r, message: REASON_TEXT[r] })
    }
  })
})
