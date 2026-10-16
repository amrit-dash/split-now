import { describe, expect, it } from 'vitest'
import { ANIMALS, animalsFor, currencySymbol, gibberish, scrambledAmount } from './vault-scramble'

describe('vault scramble', () => {
  it('gibberish is stable for a seed, differs between seeds, and is only letters and spaces', () => {
    expect(gibberish('g1')).toBe(gibberish('g1'))
    expect(gibberish('g1')).not.toBe(gibberish('g2'))
    expect(gibberish('g1', 14)).toMatch(/^[A-Z][a-z ]{0,13}$/)
    expect(gibberish('g1', 14).length).toBeLessThanOrEqual(14)
  })
  it('an amount is symbols, never digits', () => {
    const a = scrambledAmount('g1', '₹')
    expect(a).toBe(scrambledAmount('g1', '₹'))
    expect(a).toMatch(/^₹[#%&*@§]{0,2},?[#%&*@§]{3}$/)
    expect(a).not.toMatch(/\d/)
  })
  it('animals: the same ones each time, no repeats while there are enough', () => {
    const a = animalsFor('g1', 5)
    expect(a).toEqual(animalsFor('g1', 5))
    expect(new Set(a).size).toBe(5)
    for (const x of a) expect(ANIMALS).toContain(x)
    expect(animalsFor('g1', 20)).toHaveLength(20)
  })
  it('a currency symbol', () => {
    expect(currencySymbol('INR')).toBe('₹')
    expect(currencySymbol('USD', 'en-US')).toBe('$')
    expect(currencySymbol('XXX1')).toBe('XXX1')
  })
})
