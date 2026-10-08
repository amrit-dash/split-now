import { beforeEach, describe, expect, it } from 'vitest'
import type { Expense } from '@/types'
import {
  addDaysISO,
  descriptionHistory,
  lastGroup,
  lastMethod,
  lastSplit,
  pastCategory,
  rememberGroup,
  rememberMethod,
  rememberSplit,
  sameSplit,
  sanitizeSplit,
  setRecentsStorage,
  suggestDescriptions,
} from './recents'

const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

const ex = (id: string, description: string, date: string, extra: Partial<Expense> = {}): Expense => ({
  id,
  groupId: 'g',
  description,
  amount: 100,
  category: 'other',
  date,
  paidBy: { a: 100 },
  splits: { a: 50, b: 50 },
  splitType: 'equal',
  splitInput: { selected: ['a', 'b'] },
  createdBy: 'u',
  createdAt: 0,
  updatedAt: 0,
  ...extra,
})

describe('recents storage', () => {
  beforeEach(() => setRecentsStorage(mem()))

  it('remembers the last group', () => {
    expect(lastGroup()).toBeUndefined()
    rememberGroup('g1')
    expect(lastGroup()).toBe('g1')
  })

  it('remembers payer and a repeatable split per group, dropping members who left', () => {
    rememberSplit('g', { payer: 'b', splitType: 'equal', input: { selected: ['a', 'b', 'c'] } })
    expect(lastSplit('g', ['a', 'b', 'c'])).toEqual({ payer: 'b', splitType: 'equal', input: { selected: ['a', 'b', 'c'] } })
    expect(lastSplit('g', ['a', 'c'])).toEqual({ splitType: 'equal', input: { selected: ['a', 'c'] } })
    expect(lastSplit('other', ['a'])).toEqual({})
  })

  it('does not repeat exact amounts (they belong to one bill)', () => {
    rememberSplit('g', { payer: 'a', splitType: 'exact', input: { exact: { a: 10 } } })
    expect(lastSplit('g', ['a', 'b'])).toEqual({ payer: 'a' })
  })

  it('remembers the method per recipient', () => {
    rememberMethod('g', 'b', 'Cash')
    expect(lastMethod('g', 'b')).toBe('Cash')
    expect(lastMethod('g', 'a')).toBeUndefined()
  })

  it('survives missing storage', () => {
    setRecentsStorage(undefined)
    rememberGroup('g')
    expect(lastGroup()).toBeUndefined()
    expect(lastSplit('g', ['a'])).toEqual({})
  })
})

describe('sanitizeSplit / sameSplit', () => {
  it('drops a percent split that no longer adds up to 100', () => {
    expect(sanitizeSplit({ splitType: 'percent', input: { percent: { a: 50, b: 50 } } }, ['a'])).toEqual({})
    expect(sanitizeSplit({ splitType: 'percent', input: { percent: { a: 60, b: 40 } } }, ['a', 'b']).splitType).toBe('percent')
  })
  it('compares ignoring order', () => {
    expect(sameSplit('equal', { selected: ['b', 'a'] }, 'equal', { selected: ['a', 'b'] })).toBe(true)
    expect(sameSplit('equal', { selected: ['a'] }, 'equal', { selected: ['a', 'b'] })).toBe(false)
    expect(sameSplit('shares', { shares: { a: 2, b: 1 } }, 'equal', { selected: ['a', 'b'] })).toBe(false)
  })
})

describe('description suggestions', () => {
  const list = [
    ex('1', 'Dinner', '2026-09-01', { category: 'food' }),
    ex('2', 'dinner ', '2026-09-20', { category: 'food' }),
    ex('3', 'Dinner', '2026-10-01', { category: 'food' }),
    ex('4', 'Petrol', '2026-10-07', { category: 'transport' }),
    ex('5', 'Dinner at Thalassa', '2026-10-06', { category: 'food' }),
    ex('6', 'Wifi', '2025-01-01', { category: 'utilities' }),
    ex('7', 'Gone', '2026-10-07', { deletedAt: 1 }),
  ]
  const h = descriptionHistory(list)

  it('groups case-insensitively, frequent and recent first, skipping trashed', () => {
    expect(h.map((s) => s.description)).toEqual(['Dinner', 'Petrol', 'Dinner at Thalassa', 'Wifi'])
    expect(h[0].count).toBe(3)
    expect(h[0].last.id).toBe('3')
  })

  it('suggests prefix and word matches, not what is already typed', () => {
    expect(suggestDescriptions(h, '').length).toBe(4)
    expect(suggestDescriptions(h, 'din').map((s) => s.description)).toEqual(['Dinner', 'Dinner at Thalassa'])
    expect(suggestDescriptions(h, 'dinner').map((s) => s.description)).toEqual(['Dinner at Thalassa'])
    expect(suggestDescriptions(h, 'thal').map((s) => s.description)).toEqual(['Dinner at Thalassa'])
  })

  it('knows the category used for a description', () => {
    expect(pastCategory(h, ' petrol')).toBe('transport')
    expect(pastCategory(h, 'Lunch')).toBeUndefined()
  })
})

it('addDaysISO crosses months and years', () => {
  expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28')
  expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31')
})
