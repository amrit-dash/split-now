import { describe, expect, it } from 'vitest'
import { spokenNumbers } from './spoken-numbers'

describe('spokenNumbers', () => {
  it('amounts as speech-to-text writes them', () => {
    expect(spokenNumbers('twelve hundred for dinner with Rahul')).toBe('1200 for dinner with Rahul')
    expect(spokenNumbers('two thousand five hundred for the hotel')).toBe('2500 for the hotel')
    expect(spokenNumbers('a thousand bucks for cab')).toBe('1000 bucks for cab')
    expect(spokenNumbers('fifteen hundred and fifty, I paid')).toBe('1550, I paid')
    expect(spokenNumbers('three lakh for the car')).toBe('300000 for the car')
    expect(spokenNumbers('lunch twenty five')).toBe('lunch 25')
  })
  it('a count of things stays words, and so does “a” and “and”', () => {
    expect(spokenNumbers('one coffee and a cab')).toBe('one coffee and a cab')
    expect(spokenNumbers('two beers for Rahul and me')).toBe('two beers for Rahul and me')
    expect(spokenNumbers('dinner 1200 with Rahul')).toBe('dinner 1200 with Rahul')
  })
  it('a scale after digits is left for the amount reader (“1 lakh”, “2 thousand”)', () => {
    expect(spokenNumbers('deposit 1 lakh')).toBe('deposit 1 lakh')
    expect(spokenNumbers('rent 2 thousand')).toBe('rent 2 thousand')
  })
  it('a trailing “and” goes back to the sentence', () => {
    expect(spokenNumbers('two thousand and Rahul paid')).toBe('2000 and Rahul paid')
  })
})
