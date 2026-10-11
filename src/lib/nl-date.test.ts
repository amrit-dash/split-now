import { describe, expect, it } from 'vitest'
import { isValidYMD, parseNlDate } from './nl-date'

// a Sunday
const today = '2026-10-11'
const date = (s: string, dayFirst?: boolean) => parseNlDate(s, today, dayFirst)?.date

describe('parseNlDate', () => {
  it('month names, either order, with ordinals and "of"', () => {
    expect(parseNlDate('lunch Oct 2 Cafe Blue', today)).toEqual({ date: '2026-10-02', rest: 'lunch Cafe Blue', index: 6, length: 5 })
    expect(date('2 Oct')).toBe('2026-10-02')
    expect(parseNlDate('lunch 290 2nd Oct', today)).toMatchObject({ date: '2026-10-02', rest: 'lunch 290' })
    expect(date('October 2nd')).toBe('2026-10-02')
    expect(parseNlDate('dinner on the 2nd of October', today)).toMatchObject({ date: '2026-10-02', rest: 'dinner' })
    expect(date('sept 30')).toBe('2026-09-30')
    expect(date('Dec. 5')).toBe('2025-12-05')
    expect(date('2-Oct')).toBe('2026-10-02')
  })
  it('a year-less date is the most recent one on or before today', () => {
    expect(date('Oct 11')).toBe('2026-10-11')
    expect(date('Oct 12')).toBe('2025-10-12')
    expect(date('29 Feb')).toBe('2024-02-29')
  })
  it('an explicit year is taken as given, even in the future', () => {
    expect(date('Oct 2, 2026')).toBe('2026-10-02')
    expect(parseNlDate('hotel 2 Oct 2027 900', today)).toMatchObject({ date: '2027-10-02', rest: 'hotel 900' })
    expect(date('2026-10-02')).toBe('2026-10-02')
    expect(date('2027-01-05')).toBe('2027-01-05')
  })
  it('numeric dates are day first unless told otherwise', () => {
    expect(date('2/10')).toBe('2026-10-02')
    expect(date('2-10')).toBe('2026-10-02')
    expect(date('2/10', false)).toBe('2026-02-10')
    expect(date('2/10/26')).toBe('2026-10-02')
    expect(date('02/10/2026')).toBe('2026-10-02')
    expect(date('10/2/2026', false)).toBe('2026-10-02')
    expect(date('on 2.10')).toBe('2026-10-02')
  })
  it('numbers that are not dates', () => {
    expect(parseNlDate('coffee 2.10', today)).toBeNull()
    expect(parseNlDate('pizza 2-3 people', today)).toBeNull()
    expect(parseNlDate('thali 290/-', today)).toBeNull()
    expect(parseNlDate('dinner 1,200', today)).toBeNull()
    expect(parseNlDate('cab 14:00', today)).toBeNull()
    expect(parseNlDate('octopus 2', today)).toBeNull()
  })
  it('impossible days never match', () => {
    expect(parseNlDate('31 Feb', today)).toBeNull()
    expect(parseNlDate('Oct 32', today)).toBeNull()
    expect(parseNlDate('31/02', today)).toBeNull()
    expect(parseNlDate('2026-02-30', today)).toBeNull()
    expect(parseNlDate('13/13/2026', today)).toBeNull()
  })
  it('"on the 2nd" is this month, or last month when still ahead', () => {
    expect(date('on 2nd')).toBe('2026-10-02')
    expect(date('on the 2nd')).toBe('2026-10-02')
    expect(date('on the 20th')).toBe('2026-09-20')
    expect(date('on the 31st')).toBe('2026-08-31')
  })
  it('weekdays are the most recent such day strictly before today', () => {
    expect(date('monday')).toBe('2026-10-05')
    expect(date('last fri')).toBe('2026-10-09')
    expect(date('on sat')).toBe('2026-10-10')
    expect(date('sunday')).toBe('2026-10-04')
    // short forms need a word before them: "sat" and "sun" are words too
    expect(parseNlDate('sat in the sun', today)).toBeNull()
  })
  it('relative words', () => {
    expect(date('today')).toBe(today)
    expect(date('aaj')).toBe(today)
    expect(date('yesterday')).toBe('2026-10-10')
    expect(date('kal')).toBe('2026-10-10')
    expect(date('last night')).toBe('2026-10-10')
    expect(date('the day before yesterday')).toBe('2026-10-09')
    expect(date('3 days ago')).toBe('2026-10-08')
    expect(date('a week ago')).toBe('2026-10-04')
    expect(parseNlDate('Kalpana skal', today)).toBeNull()
  })
  it('the earliest of equally strong dates wins; month names beat day words', () => {
    expect(date('Oct 2 or Oct 3')).toBe('2026-10-02')
    expect(date('yesterday, i.e. Oct 9')).toBe('2026-10-09')
  })
  it('isValidYMD', () => {
    expect(isValidYMD(2024, 2, 29)).toBe(true)
    expect(isValidYMD(2026, 2, 29)).toBe(false)
    expect(isValidYMD(2026, 4, 31)).toBe(false)
    expect(isValidYMD(2026, 0, 1)).toBe(false)
  })
})
