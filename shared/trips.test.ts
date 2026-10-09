import { describe, expect, it } from 'vitest'
import { hasTripWindow, inTripWindow, isLiveTrip, liveTripFor, matchScoped, pausedTrip, pickTrip, rankGroupsForCapture, type TripGroup } from './trips'

const goa: TripGroup = { id: 'goa', name: 'Goa', type: 'trip', currency: 'INR', startDate: '2026-10-05', endDate: '2026-10-10', updatedAt: 1 }
const india: TripGroup = { id: 'india', name: 'India', type: 'trip', currency: 'INR', startDate: '2026-10-01', endDate: '2026-10-31', updatedAt: 2 }
const flat: TripGroup = { id: 'flat', name: 'Flat', type: 'home', currency: 'INR', updatedAt: 3 }
const wallet: TripGroup = { id: 'me', type: 'personal', startDate: '2026-01-01', updatedAt: 9 }

describe('trip windows', () => {
  it('inclusive, open-ended on a missing side', () => {
    expect(hasTripWindow(flat)).toBe(false)
    expect(inTripWindow(goa, '2026-10-05')).toBe(true)
    expect(inTripWindow(goa, '2026-10-10')).toBe(true)
    expect(inTripWindow(goa, '2026-10-11')).toBe(false)
    expect(inTripWindow({ startDate: '2026-10-05' }, '2027-01-01')).toBe(true)
    expect(inTripWindow(flat, '2026-10-05')).toBe(false)
    expect(isLiveTrip(goa, '2026-10-07')).toBe(true)
  })
})

describe('rankGroupsForCapture / pickTrip', () => {
  it('tightest window first, then currency, then recency; never the wallet or an archived group', () => {
    const { ranked, best } = rankGroupsForCapture([india, goa, flat, wallet, { ...goa, id: 'old', archived: true }], { date: '2026-10-07' })
    expect(ranked.map((g) => g.id)).toEqual(['goa', 'india', 'flat'])
    expect(best).toBe('goa')
    expect(pickTrip([india, goa, flat], '2026-10-07')?.id).toBe('goa')
    expect(pickTrip([india, goa, flat], '2026-10-20')?.id).toBe('india')
    expect(pickTrip([india, goa, flat], '2026-11-20')).toBeUndefined()
    expect(liveTripFor([india, goa, flat], '2026-10-20')).toBe('india')
  })
  it('a matching currency breaks a tie between equal windows, on both sides', () => {
    const a = { ...goa, id: 'a', updatedAt: 5 }
    const b = { ...goa, id: 'b', currency: 'EUR', updatedAt: 1 }
    expect(rankGroupsForCapture([a, b], { date: '2026-10-07', currency: 'EUR' }).best).toBe('b')
    expect(pickTrip([a, b], '2026-10-07', 'EUR')?.id).toBe('b')
    expect(pickTrip([a, b], '2026-10-07')?.id).toBe('a')
  })
  it('the webhook skips paused trips; the ranking for the Inbox still lists them', () => {
    expect(pickTrip([{ ...goa, captureOff: true }, india], '2026-10-07')?.id).toBe('india')
    expect(pickTrip([{ ...goa, captureOff: true }], '2026-10-07')).toBeUndefined()
    expect(rankGroupsForCapture([{ ...goa, captureOff: true }], { date: '2026-10-07' }).best).toBe('goa')
    expect(pausedTrip([{ ...goa, captureOff: true }], '2026-10-07')?.id).toBe('goa')
    expect(pausedTrip([{ ...goa, captureOff: true }], '2026-10-20')).toBeUndefined()
    expect(pausedTrip([goa], '2026-10-07')).toBeUndefined()
  })
  it('scoped: inside, outside, undated (always on), paused or archived (off)', () => {
    expect(matchScoped(goa, '2026-10-07').kind).toBe('matched')
    expect(matchScoped(goa, '2026-10-11').kind).toBe('outside')
    expect(matchScoped(flat, '2026-10-11').kind).toBe('matched')
    expect(matchScoped({ ...goa, captureOff: true }, '2026-10-07').kind).toBe('off')
    expect(matchScoped({ ...goa, archived: true }, '2026-10-07').kind).toBe('off')
  })
})
