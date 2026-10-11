import { describe, expect, it } from 'vitest'
import type { Expense, Settlement } from '@/types'
import { addedLater, EMPTY_FILTER, expenseMatches, isFiltering, isSortKey, sectionRows, settlementMatches, sheetFilterCount, sortRows } from './filter'

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

describe('kind, paid by and dates', () => {
  it('expenses only / payments only', () => {
    expect(expenseMatches(e({}), { ...EMPTY_FILTER, kind: 'payments' })).toBe(false)
    expect(settlementMatches(s, { ...EMPTY_FILTER, kind: 'expenses' }, (id) => id)).toBe(false)
    expect(expenseMatches(e({}), { ...EMPTY_FILTER, kind: 'expenses' })).toBe(true)
    expect(settlementMatches(s, { ...EMPTY_FILTER, kind: 'payments' }, (id) => id)).toBe(true)
  })
  it('paid by: the expense’s payer, the payment’s sender', () => {
    expect(expenseMatches(e({}), { ...EMPTY_FILTER, paidBy: 'a' })).toBe(true)
    expect(expenseMatches(e({}), { ...EMPTY_FILTER, paidBy: 'b' })).toBe(false)
    expect(settlementMatches(s, { ...EMPTY_FILTER, paidBy: 'b' }, (id) => id)).toBe(true)
    expect(settlementMatches(s, { ...EMPTY_FILTER, paidBy: 'a' }, (id) => id)).toBe(false)
  })
  it('between two days, inclusive, either end open', () => {
    expect(expenseMatches(e({ date: '2026-01-05' }), { ...EMPTY_FILTER, from: '2026-01-05', to: '2026-01-05' })).toBe(true)
    expect(expenseMatches(e({ date: '2026-01-04' }), { ...EMPTY_FILTER, from: '2026-01-05' })).toBe(false)
    expect(settlementMatches(s, { ...EMPTY_FILTER, to: '2026-01-01' }, (id) => id)).toBe(false)
  })
  it('counts as filtering, and the sheet counts its own', () => {
    expect(isFiltering({ ...EMPTY_FILTER, kind: 'all' })).toBe(false)
    expect(isFiltering({ ...EMPTY_FILTER, from: '2026-01-01' })).toBe(true)
    expect(sheetFilterCount({ ...EMPTY_FILTER, kind: 'payments', paidBy: 'a', from: '2026-01-01', to: '2026-01-31' })).toBe(3)
    expect(sheetFilterCount({ ...EMPTY_FILTER, q: 'x', categories: ['food'] })).toBe(0)
  })
})

describe('sort', () => {
  const rows = [
    { id: 'a', date: '2026-01-02', createdAt: 30, amount: 500 },
    { id: 'b', date: '2026-01-03', createdAt: 10, amount: 900 },
    { id: 'c', date: '2026-01-02', createdAt: 20, amount: 100 },
  ]
  const ids = (r: typeof rows) => r.map((x) => x.id)
  it('by date spent, date added and amount', () => {
    expect(ids(sortRows(rows, 'spent-desc'))).toEqual(['b', 'a', 'c'])
    expect(ids(sortRows(rows, 'spent-asc'))).toEqual(['c', 'a', 'b'])
    expect(ids(sortRows(rows, 'added-desc'))).toEqual(['a', 'c', 'b'])
    expect(ids(sortRows(rows, 'added-asc'))).toEqual(['b', 'c', 'a'])
    expect(ids(sortRows(rows, 'amount-desc'))).toEqual(['b', 'a', 'c'])
    expect(ids(sortRows(rows, 'amount-asc'))).toEqual(['c', 'a', 'b'])
  })
  it('does not reorder the input', () => {
    sortRows(rows, 'amount-asc')
    expect(ids(rows)).toEqual(['a', 'b', 'c'])
  })
  it('isSortKey', () => {
    expect(isSortKey('added-desc')).toBe(true)
    expect(isSortKey('nope')).toBe(false)
  })
})

describe('sections', () => {
  const month = (d: string | number) =>
    typeof d === 'number' ? (d < 100 ? 'January 2026' : 'February 2026') : d.startsWith('2026-01') ? 'January 2026' : 'February 2026'
  const rows = [
    { date: '2026-02-01', createdAt: 200, amount: 1 },
    { date: '2026-01-31', createdAt: 300, amount: 2 },
    { date: '2026-01-30', createdAt: 50, amount: 3 },
  ]
  it('by month spent, keeping the order', () => {
    expect(sectionRows(rows, 'spent-desc', month).map((s) => [s.label, s.rows.length])).toEqual([
      ['February 2026', 1],
      ['January 2026', 2],
    ])
  })
  it('by month added', () => {
    expect(sectionRows(rows, 'added-desc', month).map((s) => s.label)).toEqual(['Added in February 2026', 'Added in January 2026'])
  })
  it('one section for an amount order, none when empty', () => {
    expect(sectionRows(rows, 'amount-desc', month)).toHaveLength(1)
    expect(sectionRows([], 'amount-desc', month)).toEqual([])
  })
})

describe('addedLater', () => {
  const dayOf = (ms: number) => (ms > 100 ? '2026-01-05' : '2026-01-02')
  it('the day it was added, only when after the day spent', () => {
    expect(addedLater({ date: '2026-01-02', createdAt: 500 }, dayOf)).toBe('2026-01-05')
    expect(addedLater({ date: '2026-01-02', createdAt: 1 }, dayOf)).toBeNull()
  })
})
