import { describe, expect, it } from 'vitest'
import type { Expense, Group } from '@/types'
import { turnLine, whoseTurn } from './fairness'

const group: Pick<Group, 'members' | 'type'> = {
  type: 'trip',
  members: { a: { name: 'Asha Rao', color: '#000' }, b: { name: 'Bala', color: '#111' }, c: { name: 'Chris', color: '#222' } },
}
const e = (over: Partial<Expense>): Expense => ({
  id: 'e',
  groupId: 'g',
  description: 'x',
  amount: 3000,
  category: 'food',
  date: '2026-10-05',
  paidBy: { a: 3000 },
  splits: { a: 1000, b: 1000, c: 1000 },
  splitType: 'equal',
  splitInput: {},
  createdBy: 'u',
  createdAt: 1,
  updatedAt: 1,
  ...over,
})
const today = '2026-10-08'

describe('whoseTurn', () => {
  it('picks whoever has fronted the least relative to their share', () => {
    const t = whoseTurn({ group, expenses: [e({ id: '1' }), e({ id: '2', paidBy: { b: 3000 } })] }, { today })
    expect(t?.memberId).toBe('c')
    expect(t?.fronted).toBe(-2000)
    expect(t?.lastPaid).toBeUndefined()
  })
  it('breaks ties by who paid longest ago', () => {
    const list = [
      e({ id: '1', date: '2026-10-01', paidBy: { a: 3000 } }),
      e({ id: '2', date: '2026-10-03', paidBy: { b: 3000 } }),
      e({ id: '3', date: '2026-10-05', paidBy: { c: 3000 } }),
    ]
    expect(whoseTurn({ group, expenses: list }, { today })?.memberId).toBe('a')
  })
  it('needs two recent expenses, two active people and a shared group', () => {
    expect(whoseTurn({ group, expenses: [e({})] }, { today })).toBeNull()
    expect(whoseTurn({ group: { ...group, type: 'personal' }, expenses: [e({}), e({ id: '2' })] }, { today })).toBeNull()
    const solo = [e({ paidBy: { a: 100 }, splits: { a: 100 }, amount: 100 }), e({ id: '2', paidBy: { a: 100 }, splits: { a: 100 }, amount: 100 })]
    expect(whoseTurn({ group, expenses: solo }, { today })).toBeNull()
  })
  it('ignores trash and old expenses', () => {
    const list = [e({ id: '1', deletedAt: 5 }), e({ id: '2', date: '2026-01-01', paidBy: { b: 3000 } }), e({ id: '3' }), e({ id: '4' })]
    // only 3 and 4 count: Asha paid both, Bala and Chris are level and neither ever paid → no winner
    expect(whoseTurn({ group, expenses: list }, { today })).toBeNull()
  })
  it('says nothing when nobody stands out', () => {
    const even = [e({ id: '1', paidBy: { a: 3000 } }), e({ id: '2', paidBy: { b: 3000 } }), e({ id: '3', paidBy: { c: 3000 } })]
    expect(whoseTurn({ group, expenses: even }, { today })).toBeNull()
  })
  it('wording', () => {
    expect(turnLine({ memberId: 'a', name: 'Asha Rao', fronted: 0 }, 'a')).toBe('Your turn to pay?')
    expect(turnLine({ memberId: 'a', name: 'Asha Rao', fronted: 0 }, 'b')).toBe('Asha’s turn to pay?')
    expect(turnLine({ memberId: 'c', name: 'Chris', fronted: 0 }, 'b')).toBe('Chris’ turn to pay?')
  })
})
