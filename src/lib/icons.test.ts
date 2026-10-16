import { describe, expect, it } from 'vitest'
import { CATEGORIES } from './categories'
import { firstEmoji } from './emoji'
import { bestIcon, categoryIcons, expenseEmoji, GROUP_ICON_LIST, guessExpenseIcon, guessGroupIcon, ICONS, isIcon, searchIcons } from './icons'

describe('the icon catalogue', () => {
  it('is well formed: one emoji a row, known categories, words in every row', () => {
    for (const e of ICONS) {
      expect(firstEmoji(e.emoji)).toBe(e.emoji)
      expect(e.words.length).toBeGreaterThan(0)
      for (const w of e.words) expect(w.length).toBeGreaterThan(0)
      for (const c of e.categories) expect(c in CATEGORIES).toBe(true)
      expect(e.categories.length || e.group).toBeTruthy()
    }
    expect(ICONS.length).toBeGreaterThanOrEqual(180)
    expect(new Set(ICONS.flatMap((e) => e.words.map((w) => w.join(' ')))).size).toBeGreaterThan(1000)
    expect(GROUP_ICON_LIST.length).toBeGreaterThanOrEqual(85)
  })
  it('the longest phrase wins, then the earlier row', () => {
    expect(bestIcon('Ice cream at Corner House')?.emoji).toBe('🍦')
    expect(bestIcon('Gas station')?.emoji).toBe('⛽')
    expect(bestIcon('Gas cylinder')?.emoji).toBe('🔥')
    expect(bestIcon('')).toBeNull()
    expect(bestIcon('xyzzy')).toBeNull()
  })
  it('whole words with plurals, accents ignored', () => {
    expect(bestIcon('Pizzas')?.emoji).toBe('🍕')
    expect(bestIcon('Buses to Hampi')?.emoji).toBe('🚌')
    expect(bestIcon('Café Mocha')?.emoji).toBe('☕')
    // inside another word: no
    expect(bestIcon('Catering')?.emoji).toBeUndefined()
  })
})

describe('an expense’s icon', () => {
  it('comes from its own category, so the two agree', () => {
    expect(guessExpenseIcon('Pizza', 'food')).toBe('🍕')
    expect(guessExpenseIcon('Ferry to Havelock', 'transport')).toBe('⛴️')
    expect(guessExpenseIcon('Dinner', 'transport')).toBeNull()
    // Other takes any row
    expect(guessExpenseIcon('Ferry', 'other')).toBe('⛴️')
  })
  it('the chosen icon first, then the automatic one, then the category’s', () => {
    expect(expenseEmoji({ icon: '🦄', description: 'Pizza', category: 'food' })).toBe('🦄')
    expect(expenseEmoji({ description: 'Pizza', category: 'food' })).toBe('🍕')
    expect(expenseEmoji({ description: 'Something', category: 'food' })).toBe('🍔')
    // a locked private group's icon is a token: ignored, never shown as text
    expect(expenseEmoji({ icon: 'v1:abc', description: 'Pizza', category: 'food' })).toBe('🍕')
    // an unknown stored category reads as Other
    expect(expenseEmoji({ description: 'Nothing', category: 'banana' as never })).toBe('🧾')
  })
  it('a stored icon is one emoji', () => {
    expect(isIcon('🍕')).toBe(true)
    expect(isIcon('👨‍👩‍👧')).toBe(true)
    expect(isIcon('🍕🍕')).toBe(false)
    expect(isIcon('pizza')).toBe(false)
    expect(isIcon('')).toBe(false)
    expect(isIcon(undefined)).toBe(false)
  })
})

describe('a group name’s icon', () => {
  it('names the icon and the type', () => {
    expect(guessGroupIcon('Ski trip')).toEqual({ emoji: '🎿', type: 'trip' })
    expect(guessGroupIcon('Pizza night')).toEqual({ emoji: '🍕', type: 'outing' })
    expect(guessGroupIcon('Badminton gang')).toEqual({ emoji: '🏸', type: 'other' })
    expect(guessGroupIcon('Electricity')).toBeNull()
  })
})

describe('the icon sheet’s search', () => {
  it('finds by the start of a word, whole words first', () => {
    expect(searchIcons('fer')[0]).toBe('⛴️')
    expect(searchIcons('ice cream')[0]).toBe('🍦')
    expect(searchIcons('tea')[0]).toBe('🍵')
    expect(searchIcons('nothing like this')).toEqual([])
  })
  it('empty lists everything once, with the given icons first', () => {
    const all = searchIcons('', ['🦄', '🍕'])
    expect(all.slice(0, 2)).toEqual(['🦄', '🍕'])
    expect(new Set(all).size).toBe(all.length)
  })
  it('a category’s icons start with its own emoji', () => {
    expect(categoryIcons('food')[0]).toBe('🍔')
    expect(categoryIcons('food')).toContain('🍕')
    expect(categoryIcons('rent')).not.toContain('🍕')
  })
})
