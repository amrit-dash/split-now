import { describe, expect, it } from 'vitest'
import type { Expense } from '@/types'
import { bulkDuplicates, duplicateLine, findDuplicate, normaliseTokens, relativeDay, similarDescription } from './duplicates'
import { formatMoney } from './money'

const e = (over: Partial<Expense>): Expense => ({
  id: 'e1',
  groupId: 'g',
  description: 'Dinner at Toit',
  amount: 120000,
  category: 'food',
  date: '2026-10-07',
  paidBy: { a: 120000 },
  splits: { a: 60000, b: 60000 },
  splitType: 'equal',
  splitInput: { selected: ['a', 'b'] },
  createdBy: 'ua',
  createdAt: 100,
  updatedAt: 100,
  ...over,
})
const draft = { amount: 120000, cur: 'INR', date: '2026-10-08', description: 'Dinner Toit' }

describe('tokens and similarity', () => {
  it('drops punctuation, accents, plurals and filler words', () => {
    expect(normaliseTokens('Dinner at Toit!')).toEqual(['dinner', 'toit'])
    expect(normaliseTokens('Café  Coffees, for the flat')).toEqual(['cafe', 'coffee', 'flat'])
    expect(normaliseTokens('at the')).toEqual([])
  })
  it('matches rewordings of the same thing, not different things', () => {
    expect(similarDescription('Dinner at Toit', 'Toit dinner')).toBe(true)
    expect(similarDescription('Dinner at Toit', 'Dinner')).toBe(true)
    expect(similarDescription('Dinner at Toit brewpub', 'Toit brewpub drinks')).toBe(true)
    expect(similarDescription('Chai', 'Auto to airport')).toBe(false)
    expect(similarDescription('Uber', 'Dinner')).toBe(false)
  })
  it('an empty description compares equal (amount and date decide)', () => {
    expect(similarDescription('', 'Dinner')).toBe(true)
    expect(similarDescription('Dinner', 'at the')).toBe(true)
  })
})

describe('findDuplicate', () => {
  it('finds the same amount within a day with a similar description', () => {
    expect(findDuplicate([e({})], draft, 'INR')?.id).toBe('e1')
    expect(findDuplicate([e({ date: '2026-10-09' })], draft, 'INR')?.id).toBe('e1')
    expect(findDuplicate([e({})], { ...draft, description: '' }, 'INR')?.id).toBe('e1')
  })
  it('ignores different amounts, far dates, different descriptions, trash, the edited expense and repeats', () => {
    expect(findDuplicate([e({ amount: 120001 })], draft, 'INR')).toBeUndefined()
    expect(findDuplicate([e({ date: '2026-10-05' })], draft, 'INR')).toBeUndefined()
    expect(findDuplicate([e({ description: 'Cab to the airport' })], draft, 'INR')).toBeUndefined()
    expect(findDuplicate([e({ deletedAt: 5 })], draft, 'INR')).toBeUndefined()
    expect(findDuplicate([e({})], { ...draft, excludeId: 'e1' }, 'INR')).toBeUndefined()
    expect(findDuplicate([e({ recurrence: { freq: 'monthly', nextDate: '2026-11-07' } })], draft, 'INR')).toBeUndefined()
    expect(findDuplicate([e({ recurringFrom: 'tpl' })], draft, 'INR')).toBeUndefined()
    expect(findDuplicate([e({})], { ...draft, amount: 0 }, 'INR')).toBeUndefined()
  })
  it('a foreign-currency draft matches the stored original, not the converted amount', () => {
    const thb = e({ amount: 300000, original: { currency: 'THB', amount: 120000, rate: 2.5, rateDate: '2026-10-07', source: 'ecb' } })
    expect(findDuplicate([thb], { ...draft, cur: 'THB' }, 'INR')?.id).toBe('e1')
    expect(findDuplicate([thb], { ...draft, cur: 'INR' }, 'INR')).toBeUndefined()
    expect(findDuplicate([thb], { ...draft, cur: 'INR', amount: 300000 }, 'INR')?.id).toBe('e1')
  })
  it('prefers the closest date, then the newest entry', () => {
    const list = [
      e({ id: 'far', date: '2026-10-07', createdAt: 9 }),
      e({ id: 'near-old', date: '2026-10-08', createdAt: 1 }),
      e({ id: 'near-new', date: '2026-10-08', createdAt: 2 }),
    ]
    expect(findDuplicate(list, draft, 'INR')?.id).toBe('near-new')
  })
})

describe('copy', () => {
  it('relative days', () => {
    expect(relativeDay('2026-10-08', '2026-10-08')).toBe('today')
    expect(relativeDay('2026-10-07', '2026-10-08')).toBe('yesterday')
    expect(relativeDay('2026-10-09', '2026-10-08')).toBe('tomorrow')
    expect(relativeDay('2026-09-01', '2026-10-08')).toMatch(/Sep/)
  })
  it('the warning line', () => {
    expect(duplicateLine(e({}), 'INR', '2026-10-08')).toBe('Looks like a duplicate of “Dinner at Toit” (₹1,200.00, yesterday)')
    const thb = e({ amount: 300000, original: { currency: 'THB', amount: 120000, rate: 2.5, rateDate: '2026-10-07', source: 'ecb' } })
    expect(duplicateLine(thb, 'INR', '2026-10-07')).toContain(`${formatMoney(120000, 'THB')}, today`)
  })
})

describe('bulkDuplicates', () => {
  it('maps each capture that is already an expense to it, and leaves the rest out', () => {
    const list = [
      e({ id: 'x', description: 'TOIT BREWPUB', amount: 120000, date: '2026-10-07' }),
      e({ id: 'y', description: 'Uber', amount: 45000, date: '2026-10-01' }),
    ]
    const caps = [
      { id: 'c1', amount: 120000, date: '2026-10-08', merchant: 'Toit Brewpub' },
      { id: 'c2', amount: 45000, date: '2026-10-08', merchant: 'Uber' }, // a week later: a new ride
      { id: 'c3', amount: 9900, date: '2026-10-08', merchant: 'Swiggy' },
    ]
    const dups = bulkDuplicates(caps, list, 'INR')
    expect([...dups.keys()]).toEqual(['c1'])
    expect(dups.get('c1')?.id).toBe('x')
  })
})
