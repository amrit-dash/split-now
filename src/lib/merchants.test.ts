import { describe, expect, it } from 'vitest'
import type { Expense } from '@/types'
import {
  EMPTY_MEMORY,
  MERCHANT_CAP,
  forgetMerchant,
  isEmptyMemory,
  learnFromSave,
  normaliseMerchant,
  parseMemory,
  recallCategory,
  rememberMerchant,
  suggestCategory,
} from './merchants'

describe('normaliseMerchant', () => {
  it('lower-cases, strips punctuation, accents and reference numbers', () => {
    expect(normaliseMerchant('SWIGGY*INSTAMART 4521')).toBe('swiggy instamart')
    expect(normaliseMerchant('  Café Noir — Indiranagar ')).toBe('cafe noir indiranagar')
    expect(normaliseMerchant('Blue Tokai Coffee Roasters')).toBe('blue tokai coffee roasters')
    expect(normaliseMerchant('123 456')).toBe('')
    expect(normaliseMerchant('x'.repeat(100))).toHaveLength(60)
  })
})

describe('remember, recall, forget', () => {
  it('remembers under the normalised key and recalls any spelling', () => {
    const m = rememberMerchant(EMPTY_MEMORY, 'Blue Tokai', 'food', 10)
    expect(m).toEqual({ categories: { 'blue tokai': 'food' }, touched: { 'blue tokai': 10 } })
    expect(recallCategory(m, 'BLUE TOKAI 9981')).toBe('food')
    expect(recallCategory(m, 'Third Wave')).toBeUndefined()
    expect(recallCategory(undefined, 'Blue Tokai')).toBeUndefined()
  })
  it('returns the same object when nothing changes, and forgets cleanly', () => {
    const m = rememberMerchant(EMPTY_MEMORY, 'Blue Tokai', 'food', 10)
    expect(rememberMerchant(m, 'blue tokai', 'food', 10)).toBe(m)
    expect(rememberMerchant(EMPTY_MEMORY, '   ', 'food')).toBe(EMPTY_MEMORY)
    expect(forgetMerchant(m, 'Blue Tokai')).toEqual(EMPTY_MEMORY)
    expect(forgetMerchant(m, 'Other')).toBe(m)
    expect(isEmptyMemory(m)).toBe(false)
    expect(isEmptyMemory(EMPTY_MEMORY)).toBe(true)
  })
  it('keeps the most recently used entries under the cap', () => {
    let m = EMPTY_MEMORY
    for (let i = 0; i < MERCHANT_CAP + 5; i++) m = rememberMerchant(m, `shop${i}`, 'shopping', i)
    expect(Object.keys(m.categories)).toHaveLength(MERCHANT_CAP)
    expect(recallCategory(m, 'shop0')).toBeUndefined()
    expect(recallCategory(m, `shop${MERCHANT_CAP + 4}`)).toBe('shopping')
    expect(Object.keys(m.touched)).toHaveLength(MERCHANT_CAP)
  })
})

describe('parseMemory', () => {
  it('drops junk and unknown categories, fills missing timestamps', () => {
    const m = parseMemory({ categories: { toit: 'food', bad: 'snacks', '': 'food', ['k'.repeat(61)]: 'food' }, touched: { toit: 5, bad: 1 }, extra: 1 })
    expect(m).toEqual({ categories: { toit: 'food' }, touched: { toit: 5 } })
    expect(parseMemory({ categories: { toit: 'food' } }).touched).toEqual({ toit: 0 })
    expect(parseMemory(null)).toEqual(EMPTY_MEMORY)
    expect(parseMemory('x')).toEqual(EMPTY_MEMORY)
  })
})

describe('suggestCategory and learning', () => {
  const history = [{ description: 'Blue Tokai', category: 'shopping' as const, count: 1, last: {} as Expense }]
  it('memory beats the group history, which beats the keyword guess', () => {
    const m = rememberMerchant(EMPTY_MEMORY, 'Blue Tokai', 'food')
    expect(suggestCategory('Blue Tokai', { memory: m, history })).toBe('food')
    expect(suggestCategory('Blue Tokai', { history })).toBe('shopping')
    expect(suggestCategory('Uber to airport')).toBe('transport')
    expect(suggestCategory('Blue Tokai')).toBeNull()
    expect(suggestCategory('  ')).toBeNull()
  })
  it('learns only when the user changed the suggestion', () => {
    expect(learnFromSave(EMPTY_MEMORY, 'Uber', 'transport', 'transport')).toBeNull()
    expect(learnFromSave(EMPTY_MEMORY, '', 'food', null)).toBeNull()
    const learned = learnFromSave(EMPTY_MEMORY, 'Blue Tokai', 'food', null, 7)
    expect(learned).toEqual({ categories: { 'blue tokai': 'food' }, touched: { 'blue tokai': 7 } })
    // the user went back to the keyword guess: the memory follows their latest choice
    expect(learnFromSave(learned!, 'Blue Tokai', 'shopping', 'food', 8)?.categories['blue tokai']).toBe('shopping')
  })
})
