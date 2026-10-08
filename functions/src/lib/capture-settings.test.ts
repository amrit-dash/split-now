import { describe, expect, it } from 'vitest'
import { filterReason } from '../../../shared/capture-filters'
import { CAPTURE_LOG_KEEP, STATUS, interpret, logEntry } from './capture-core'
import { resolveCapturePrefs, resolvePrefs } from './prefs'
import { readCaptureRequest } from './request'
import { matchScoped, pausedTrip, pickTrip, type TripGroup } from './trips'

const NOW = new Date('2026-10-07T12:00:00+05:30')
const TOKEN = 'abcdefghijkmnpqrstuvwxyz2345'

describe('capture prefs', () => {
  it('defaults keep today’s behaviour', () => {
    expect(resolveCapturePrefs(undefined)).toEqual({ outsideTrips: false, capturePaused: false, minAmount: 0, ignoreWords: [] })
  })
  it('reads stored values and sanitises bad ones', () => {
    expect(resolveCapturePrefs({ outsideTrips: true, capturePaused: true, minAmount: 10000, ignoreWords: [' SIP ', 'sip', 'Rent', 7, ''] }))
      .toEqual({ outsideTrips: true, capturePaused: true, minAmount: 10000, ignoreWords: ['SIP', 'Rent'] })
    expect(resolveCapturePrefs({ capturePaused: 'yes', minAmount: -5, ignoreWords: 'SIP' }))
      .toEqual({ outsideTrips: false, capturePaused: false, minAmount: 0, ignoreWords: [] })
    expect(resolveCapturePrefs({ minAmount: 1e12 }).minAmount).toBe(10_000_000)
  })
  it('the push prefs are unaffected by the capture keys', () => {
    expect(resolvePrefs({ capturePaused: true, minAmount: 5, ignoreWords: ['x'] })).toEqual({
      captures: true, unsorted: false, expenses: true, settlements: true, reminders: true, outsideTrips: false,
    })
  })
})

describe('filters on a parsed SMS', () => {
  const parse = (text: string) => {
    const it = interpret(readCaptureRequest({ body: { token: TOKEN, text, device: 'android' } }), NOW)
    if (!it.ok) throw new Error(it.reason)
    return it.parsed
  }
  const sip = 'Rs.5000.00 debited from a/c XX1234 on 07-10-26 to VPA zerodha@hdfcbank NACH SIP mutual fund (UPI Ref No 628112345678)'
  const chai = 'Rs.40.00 debited from a/c XX1234 on 07-10-26 to VPA chaiwala@ybl (UPI Ref No 628112345679)'
  it('below the minimum (INR only)', () => {
    const f = { capturePaused: false, minAmount: 10000, ignoreWords: [] }
    expect(filterReason(f, parse(chai), chai)).toBe('below_min')
    expect(filterReason(f, parse(sip), sip)).toBeUndefined()
    expect(filterReason(f, { amount: 4000, currency: 'USD' })).toBeUndefined()
  })
  it('ignore keywords in the text or the merchant', () => {
    expect(filterReason({ capturePaused: false, minAmount: 0, ignoreWords: ['mutual fund'] }, parse(sip), sip)).toBe('ignored')
    expect(filterReason({ capturePaused: false, minAmount: 0, ignoreWords: ['chaiwala'] }, parse(chai))).toBe('ignored')
    expect(filterReason({ capturePaused: false, minAmount: 0, ignoreWords: ['rent'] }, parse(chai), chai)).toBeUndefined()
  })
  it('new reasons answer 200 so automations don’t retry', () => {
    expect([STATUS.paused, STATUS.below_min, STATUS.ignored]).toEqual([200, 200, 200])
  })
})

describe('activity log entries', () => {
  const p = { amount: 84000, currency: 'INR', merchant: 'Swiggy' }
  it('captured / rejected entries carry amount and merchant, never text', () => {
    expect(logEntry('captured', 'ios', 1, p, 'Goa')).toEqual({ at: 1, result: 'captured', device: 'ios', amount: 84000, currency: 'INR', merchant: 'Swiggy', groupName: 'Goa' })
    expect(logEntry('paused', 'android', 2)).toEqual({ at: 2, result: 'paused', device: 'android' })
    expect(Object.keys(logEntry('outside_trip', 'other', 3, p)!)).not.toContain('text')
  })
  it('skips outcomes that are not logged', () => {
    expect(logEntry('bad_token', 'ios', 1)).toBeUndefined()
    expect(logEntry('rate_limited', 'ios', 1)).toBeUndefined()
    expect(logEntry('bad_request', 'ios', 1)).toBeUndefined()
  })
  it('keeps about 30', () => expect(CAPTURE_LOG_KEEP).toBe(30))
})

describe('per-trip pause (captureOff)', () => {
  const goa: TripGroup = { id: 'goa', name: 'Goa', type: 'trip', startDate: '2026-10-05', endDate: '2026-10-10' }
  const india: TripGroup = { id: 'india', name: 'India', type: 'trip', startDate: '2026-10-01', endDate: '2026-10-31' }
  it('pickTrip skips paused trips', () => {
    expect(pickTrip([goa, india], '2026-10-07')?.id).toBe('goa')
    expect(pickTrip([{ ...goa, captureOff: true }, india], '2026-10-07')?.id).toBe('india')
    expect(pickTrip([{ ...goa, captureOff: true }], '2026-10-07')).toBeUndefined()
  })
  it('pausedTrip finds the paused trip containing the date', () => {
    expect(pausedTrip([{ ...goa, captureOff: true }], '2026-10-07')?.id).toBe('goa')
    expect(pausedTrip([{ ...goa, captureOff: true }], '2026-10-20')).toBeUndefined()
    expect(pausedTrip([goa], '2026-10-07')).toBeUndefined()
  })
  it('a scoped key for a paused trip matches nothing', () => {
    expect(matchScoped({ ...goa, captureOff: true }, '2026-10-07').kind).toBe('off')
    expect(matchScoped(goa, '2026-10-07').kind).toBe('matched')
  })
})
