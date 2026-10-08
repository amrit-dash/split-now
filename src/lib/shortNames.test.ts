import { describe, expect, it } from 'vitest'
import { shortNames } from './shortNames'

const m = (...names: string[]) => Object.fromEntries(names.map((name, i) => [`m${i}`, { name }]))

describe('shortNames', () => {
  it('uses first names', () => {
    expect(shortNames(m('Priya Sharma', 'Rohan', 'Ananya K Iyer'))).toEqual({ m0: 'Priya', m1: 'Rohan', m2: 'Ananya' })
  })
  it('labels me as You', () => {
    expect(shortNames(m('Amrit Singh', 'Priya'), 'm0')).toEqual({ m0: 'You', m1: 'Priya' })
  })
  it('adds a last initial when first names clash', () => {
    expect(shortNames(m('Rahul Sharma', 'Rahul Kumar', 'Zoë'))).toEqual({ m0: 'Rahul S.', m1: 'Rahul K.', m2: 'Zoë' })
  })
  it('matches first names case- and accent-insensitively', () => {
    expect(shortNames(m('José Ruiz', 'jose Alba'))).toEqual({ m0: 'José R.', m1: 'jose A.' })
  })
  it('a single-word name next to a clash keeps its first name', () => {
    expect(shortNames(m('Rahul', 'Rahul Kumar'))).toEqual({ m0: 'Rahul', m1: 'Rahul K.' })
  })
  it('falls back to the full name when the initial clashes too', () => {
    expect(shortNames(m('Rahul Sharma', 'Rahul Singh', 'Rahul Kumar'))).toEqual({ m0: 'Rahul Sharma', m1: 'Rahul Singh', m2: 'Rahul K.' })
  })
  it('does not disambiguate against me (shown as You)', () => {
    expect(shortNames(m('Rahul Sharma', 'Rahul Kumar'), 'm0')).toEqual({ m0: 'You', m1: 'Rahul' })
  })
  it('handles email-like and blank names', () => {
    expect(shortNames(m('priya.s@gmail.com', '  '))).toEqual({ m0: 'priya.s', m1: '?' })
  })
})
