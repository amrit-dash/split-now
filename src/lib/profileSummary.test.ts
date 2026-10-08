import { describe, expect, it } from 'vitest'
import { autoCaptureSummary, linksSummary, notificationSummary, paymentSummary } from './profileSummary'
import { DEFAULT_PREFS } from './push'

describe('paymentSummary', () => {
  it('shows the most useful method first', () => {
    expect(paymentSummary({ upi: 'amrit@okaxis' })).toBe('UPI · amrit@okaxis')
    expect(paymentSummary({ upi: 'amrit@okaxis', phone: '+91 98765 43210', paypal: 'amrit' })).toBe('UPI · amrit@okaxis +2 more')
    expect(paymentSummary({ phone: '+91 98765 43210' })).toBe('UPI phone · +91 98765 43210')
    expect(paymentSummary({ account: '123456789012', ifsc: 'HDFC0001234' })).toBe('Bank · ••••9012')
  })
  it('respects the region order', () => {
    expect(paymentSummary({ payid: 'a@b.com', upi: 'x@y' }, 'AU')).toBe('PayID · a@b.com +1 more')
    expect(paymentSummary({ account: '12345678', bsb: '062-000' }, 'AU')).toBe('Bank · 062-000 ••••5678')
    expect(paymentSummary({ revolut: '@amrit' }, 'INTL')).toBe('Revolut · @amrit')
  })
  it('"Not set" when empty', () => {
    expect(paymentSummary(undefined)).toBe('Not set')
    expect(paymentSummary({})).toBe('Not set')
    expect(paymentSummary({ upi: '  ' })).toBe('Not set')
  })
})

describe('notificationSummary', () => {
  const base = { iosNeedsInstall: false, supported: true, perm: 'default' as NotificationPermission, prefs: DEFAULT_PREFS }
  it('covers each state', () => {
    expect(notificationSummary(base)).toBe('Off')
    expect(notificationSummary({ ...base, perm: 'granted' })).toBe('On · 4 types')
    expect(notificationSummary({ ...base, perm: 'granted', prefs: { captures: true, unsorted: false, expenses: false, settlements: false, reminders: false, outsideTrips: true } })).toBe('On · 1 type')
    expect(notificationSummary({ ...base, perm: 'granted', prefs: { captures: false, unsorted: false, expenses: false, settlements: false, reminders: false, outsideTrips: true } })).toBe('On · all types muted')
    expect(notificationSummary({ ...base, perm: 'denied' })).toBe('Blocked in browser settings')
    expect(notificationSummary({ ...base, supported: false })).toBe('Not available in this browser')
    expect(notificationSummary({ ...base, iosNeedsInstall: true })).toBe('Install the app to turn on')
  })
})

describe('autoCaptureSummary', () => {
  it('counts keys', () => {
    expect(autoCaptureSummary(null)).toBe('')
    expect(autoCaptureSummary([])).toBe('Not set up')
    expect(autoCaptureSummary([{}])).toBe('On · 1 capture key')
    expect(autoCaptureSummary([{ groupId: 'g' }, { groupId: 'h' }, {}])).toBe('On · SMS for 2 trips · 1 capture key')
  })
})

describe('linksSummary', () => {
  it('joins labels', () => {
    expect(linksSummary(['Friends', '', 'Install app'])).toBe('Friends · Install app')
  })
})
