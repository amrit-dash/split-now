import { describe, expect, it } from 'vitest'
import type { Expense, Settlement } from '@/types'
import { EMPTY_FILTER, expenseMatches, isFiltering, settlementMatches } from './filter'

const e = (over: Partial<Expense>): Expense => ({
  id: 'e',
  groupId: 'g',
  description: 'Dinner at Café Mondo',
  amount: 3000,
  category: 'food',
  date: '2026-01-01',
  paidBy: { a: 3000 },
  splits: { a: 1500, b: 1500 },
  splitType: 'equal',
  splitInput: {},
  createdBy: 'u',
  createdAt: 0,
  updatedAt: 0,
  ...over,
})
const s: Settlement = {
  id: 's',
  groupId: 'g',
  from: 'b',
  to: 'a',
  amount: 1500,
  method: 'PayID',
  note: 'for dinner',
  date: '2026-01-02',
  createdBy: 'u',
  createdAt: 0,
}
const names: Record<string, string> = { a: 'Alice', b: 'Bob', c: 'Carol' }
const name = (id: string) => names[id] ?? id

describe('activity filter', () => {
  it('empty filter matches everything', () => {
    expect(isFiltering(EMPTY_FILTER)).toBe(false)
    expect(expenseMatches(e({}), EMPTY_FILTER)).toBe(true)
    expect(settlementMatches(s, EMPTY_FILTER, name)).toBe(true)
  })
  it('text search is case/accent-insensitive, needs all terms, checks description and notes', () => {
    expect(expenseMatches(e({}), { ...EMPTY_FILTER, q: 'cafe' })).toBe(true)
    expect(expenseMatches(e({}), { ...EMPTY_FILTER, q: 'DINNER mondo' })).toBe(true)
    expect(expenseMatches(e({}), { ...EMPTY_FILTER, q: 'dinner lunch' })).toBe(false)
    expect(expenseMatches(e({ notes: 'birthday' }), { ...EMPTY_FILTER, q: 'birth' })).toBe(true)
    expect(isFiltering({ ...EMPTY_FILTER, q: '  ' })).toBe(false)
  })
  it('category chips', () => {
    expect(expenseMatches(e({}), { ...EMPTY_FILTER, categories: ['food', 'transport'] })).toBe(true)
    expect(expenseMatches(e({}), { ...EMPTY_FILTER, categories: ['transport'] })).toBe(false)
    expect(settlementMatches(s, { ...EMPTY_FILTER, categories: ['food'] }, name)).toBe(false)
  })
  it('involving me covers payers and split members, including a zero share', () => {
    const f = (m: string) => ({ ...EMPTY_FILTER, involving: m })
    expect(expenseMatches(e({}), f('a'))).toBe(true)
    expect(expenseMatches(e({}), f('b'))).toBe(true)
    expect(expenseMatches(e({}), f('c'))).toBe(false)
    expect(expenseMatches(e({ splits: { a: 3000, c: 0 } }), f('c'))).toBe(true)
    expect(settlementMatches(s, f('a'), name)).toBe(true)
    expect(settlementMatches(s, f('c'), name)).toBe(false)
  })
  it('settlement text matches note, method and names', () => {
    expect(settlementMatches(s, { ...EMPTY_FILTER, q: 'bob' }, name)).toBe(true)
    expect(settlementMatches(s, { ...EMPTY_FILTER, q: 'payid' }, name)).toBe(true)
    expect(settlementMatches(s, { ...EMPTY_FILTER, q: 'dinner' }, name)).toBe(true)
    expect(settlementMatches(s, { ...EMPTY_FILTER, q: 'taxi' }, name)).toBe(false)
  })
})
