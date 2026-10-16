import { describe, expect, it } from 'vitest'
import type { Expense, Settlement } from '@/types'
import { receivedBreakdown } from './received-breakdown'

const ex = (id: string, amount: number, paidBy: Record<string, number>, splits: Record<string, number>, extra: Partial<Expense> = {}): Expense => ({
  id,
  groupId: 'g',
  description: id,
  amount,
  category: 'other',
  date: '2026-10-01',
  paidBy,
  splits,
  splitType: 'exact',
  splitInput: {},
  createdBy: 'u',
  createdAt: 1,
  updatedAt: 1,
  ...extra,
})

describe('receivedBreakdown', () => {
  // The owner's example: A 200, B 700, C 400, D 700 spent (2000, 500 each); A then gets a 1000 reimbursement shared by all four.
  const spentRows = [
    ex('a', 20000, { A: 20000 }, { A: 5000, B: 5000, C: 5000, D: 5000 }),
    ex('b', 70000, { B: 70000 }, { A: 17500, B: 17500, C: 17500, D: 17500 }),
    ex('c', 40000, { C: 40000 }, { A: 10000, B: 10000, C: 10000, D: 10000 }),
    ex('d', 70000, { D: 70000 }, { A: 17500, B: 17500, C: 17500, D: 17500 }),
  ]
  const refund = ex('r', 100000, { A: 25000, B: 25000, C: 25000, D: 25000 }, { A: 100000 }, { kind: 'received', date: '2026-10-05' })
  const order = ['A', 'B', 'C', 'D']

  it('splits spent, received and the real cost per person', () => {
    const b = receivedBreakdown([...spentRows, refund], [], order)
    expect([b.spent, b.received, b.netCost]).toEqual([200000, 100000, 100000])
    expect(b.entries.map((e) => e.id)).toEqual(['r'])
    const A = b.people.find((p) => p.id === 'A')!
    expect(A).toMatchObject({ paid: 20000, share: 50000, received: 100000, receivedShare: 25000, netCost: 25000 })
    // Before: A owes 300 (paid 200, share 500). After: A also holds 750 of the others' money, so owes 1050.
    expect(A.balanceBefore).toBe(-30000)
    expect(A.balance).toBe(-105000)
    const B = b.people.find((p) => p.id === 'B')!
    expect([B.balanceBefore, B.balance, B.netCost]).toEqual([20000, 45000, 25000])
    // Everyone's real cost is 250 and balances still sum to zero.
    expect(b.people.map((p) => p.netCost)).toEqual([25000, 25000, 25000, 25000])
    expect(b.people.reduce((s, p) => s + p.balance, 0)).toBe(0)
  })
  it('counts payments already made in both balances', () => {
    const paid: Settlement = { id: 's', groupId: 'g', from: 'A', to: 'B', amount: 20000, method: 'Cash', date: '2026-10-06', createdBy: 'u', createdAt: 2 }
    const b = receivedBreakdown([...spentRows, refund], [paid], order)
    const A = b.people.find((p) => p.id === 'A')!
    expect([A.balanceBefore, A.balance]).toEqual([-10000, -85000])
  })
  it('with no money received, before and after match', () => {
    const b = receivedBreakdown(spentRows, [], order)
    expect(b.received).toBe(0)
    expect(b.people.every((p) => p.balance === p.balanceBefore)).toBe(true)
  })
})
