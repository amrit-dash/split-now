import { describe, expect, it } from 'vitest'
import { rowTripDates, defaultRateBasis, olderRateDay, rateDayNote, rateGapLine, suggestHomeCurrency, tripRateDate } from './trip-rate'

const today = '2026-11-05'

describe('tripRateDate', () => {
  it('the end date once the trip is over', () => {
    expect(tripRateDate({ endDate: '2026-10-06' }, ['2026-10-02', '2026-10-09'], today)).toBe('2026-10-06')
  })
  it('a trip still on, or with no dates: the last expense before today', () => {
    expect(tripRateDate({ endDate: '2026-11-10' }, ['2026-10-02', '2026-10-30'], today)).toBe('2026-10-30')
    expect(tripRateDate({}, ['2026-10-02', undefined, '2026-10-04'], today)).toBe('2026-10-04')
  })
  it('nothing before today: no trip rate (it would be today’s)', () => {
    expect(tripRateDate({}, [], today)).toBeNull()
    expect(tripRateDate({}, [today], today)).toBeNull()
    expect(tripRateDate({ endDate: today }, [], today)).toBeNull()
  })
})

describe('defaultRateBasis', () => {
  it('a Trip group starts on the trip’s rate; others, or no trip date, on today’s', () => {
    expect(defaultRateBasis({ type: 'trip' }, '2026-10-06')).toBe('trip')
    expect(defaultRateBasis({ type: 'trip' }, null)).toBe('today')
    expect(defaultRateBasis({ type: 'home' }, '2026-10-06')).toBe('today')
  })
})

describe('rateGapLine', () => {
  const format = (m: number) => `₹${m / 100}`
  it('says how far the other rate is, either way', () => {
    expect(rateGapLine({ basis: 'trip', atToday: 504000, atTrip: 528000, format })).toBe('₹240 more than at today’s rate')
    expect(rateGapLine({ basis: 'today', atToday: 504000, atTrip: 528000, format })).toBe('₹240 less than at the trip’s rate')
    expect(rateGapLine({ basis: 'trip', atToday: 528000, atTrip: 504000, format })).toBe('₹240 less than at today’s rate')
    expect(rateGapLine({ basis: 'today', atToday: 528000, atTrip: 504000, format })).toBe('₹240 more than at the trip’s rate')
  })
  it('nothing to say when they agree', () => {
    expect(rateGapLine({ basis: 'trip', atToday: 100, atTrip: 100, format })).toBeNull()
  })
})

describe('olderRateDay', () => {
  it('names the day of a rate from well before the payment', () => {
    expect(olderRateDay({ rateDate: '2026-10-06' }, '2026-11-05')).toBe('2026-10-06')
  })
  it('today’s rate (even a weekend’s, dated a few days back) says nothing', () => {
    expect(olderRateDay({ rateDate: '2026-11-01' }, '2026-11-05')).toBeUndefined()
    expect(olderRateDay(undefined, '2026-11-05')).toBeUndefined()
    expect(olderRateDay({ rateDate: 'bad' }, '2026-11-05')).toBeUndefined()
  })
})

describe('rateDayNote', () => {
  it('a phrase for an older rate, nothing for today’s', () => {
    expect(rateDayNote({ rateDate: '2026-10-06' }, '2026-11-05', () => '6 Oct')).toBe(' at the 6 Oct rate')
    expect(rateDayNote({ rateDate: '2026-11-04' }, '2026-11-05')).toBe('')
  })
})

describe('suggestHomeCurrency', () => {
  const base = { groupCurrency: 'USD', homeCurrency: 'INR', type: 'trip', locked: false }
  it('a shared group in another currency, still changeable', () => {
    expect(suggestHomeCurrency(base)).toBe(true)
  })
  it('not for your own currency, a wallet, or once expenses fix it', () => {
    expect(suggestHomeCurrency({ ...base, groupCurrency: 'INR' })).toBe(false)
    expect(suggestHomeCurrency({ ...base, type: 'personal' })).toBe(false)
    expect(suggestHomeCurrency({ ...base, locked: true })).toBe(false)
  })
})

describe('rowTripDates', () => {
  const rows = [
    { key: 'a', groupId: 'nyc', currency: 'USD' },
    { key: 'b', groupId: 'flat', currency: 'USD' },
    { key: 'c', groupId: 'goa', currency: 'INR' },
  ]
  const groups = {
    nyc: { type: 'trip', endDate: '2026-10-06', expenseDates: ['2026-10-02'] },
    flat: { type: 'home', expenseDates: ['2026-10-02'] },
    goa: { type: 'trip', expenseDates: ['2026-09-01'] },
  }
  it('a trip in another currency at its trip’s day; homes and your own currency at today’s', () => {
    expect(rowTripDates(rows, groups, 'INR', '2026-11-05')).toEqual({ a: '2026-10-06' })
  })
  it('Today: none', () => {
    expect(rowTripDates(rows, groups, 'INR', '2026-11-05', 'today')).toEqual({})
  })
})
