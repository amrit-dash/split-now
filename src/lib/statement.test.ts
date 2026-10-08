import { describe, expect, it } from 'vitest'
import type { Expense, Group } from '@/types'
import { bestGroup, buildExpense, findDuplicate, flagsFor, preselect, tidyName } from './statement'

const g = (id: string, extra: Partial<Group> = {}) =>
  ({
    id,
    name: id,
    emoji: '✈️',
    type: 'trip',
    currency: 'INR',
    simplify: true,
    members: { a: { name: 'A', uid: 'ua' }, b: { name: 'B' } },
    memberUids: ['ua'],
    createdBy: 'ua',
    inviteCode: '',
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  }) as Group
const txn = (date: string, amount: number, more: object = {}) => ({ date, name: 'X', amount, direction: 'debit' as const, kind: 'payment' as const, ...more })

describe('statement helpers', () => {
  const goa = g('goa', { startDate: '2026-10-03', endDate: '2026-10-06' })
  it('flags trip dates, received, own transfers and possible duplicates', () => {
    const e = { id: 'e1', amount: 6000, date: '2026-10-04' } as Expense
    expect(flagsFor(txn('2026-10-05', 6000), goa, [e])).toEqual(['in_trip', 'maybe_added'])
    expect(flagsFor(txn('2026-10-08', 100), goa, [])).toEqual(['outside_trip'])
    expect(flagsFor(txn('2026-10-04', 100, { direction: 'credit' }), goa, [])).toEqual(['received', 'in_trip'])
    expect(flagsFor(txn('2026-10-04', 100, { kind: 'self_transfer' }), g('flat', { type: 'home' }), [])).toEqual(['own_transfer'])
  })
  it('preselects only plain payments in range', () => {
    expect(preselect(['in_trip'])).toBe(true)
    expect(preselect([])).toBe(true)
    for (const f of ['outside_trip', 'maybe_added', 'received', 'own_transfer', 'refund'] as const) expect(preselect([f])).toBe(false)
  })
  it('ignores deleted expenses and compares original amounts', () => {
    expect(findDuplicate({ date: '2026-10-04', amount: 100 }, [{ amount: 100, date: '2026-10-04', deletedAt: 1 } as Expense])).toBeUndefined()
    expect(findDuplicate({ date: '2026-10-04', amount: 100 }, [{ amount: 9, original: { amount: 100 }, date: '2026-10-05' } as Expense])).toBeDefined()
  })
  it('picks the group whose dates hold most payments', () => {
    const blr = g('blr', { startDate: '2026-09-01', endDate: '2026-09-30' })
    expect(bestGroup([blr, goa], [txn('2026-10-04', 1), txn('2026-10-05', 1), txn('2026-09-10', 1)], '2026-10-08')?.id).toBe('goa')
    expect(bestGroup([g('flat', { type: 'home' })], [txn('2026-10-04', 1)], '2026-10-08')?.id).toBe('flat')
  })
  it('tidies shouting names and builds an equal split', () => {
    expect(tidyName('SWIGGY  INSTAMART')).toBe('Swiggy Instamart')
    expect(tidyName('aradhi aradhana')).toBe('aradhi aradhana')
    const e = buildExpense(
      { description: 'Cafe', amount: 6001, date: '2026-10-05', category: 'food', payer: 'a', members: ['b', 'a'] },
      goa,
      ['a', 'b'],
      'ua',
      'e1',
      5,
    )
    expect(e.paidBy).toEqual({ a: 6001 })
    expect(e.splits.a + e.splits.b).toBe(6001)
    expect(e.splitInput).toEqual({ selected: ['a', 'b'] })
  })
})
