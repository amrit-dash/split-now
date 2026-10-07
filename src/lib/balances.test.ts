import { describe, expect, it } from 'vitest'
import type { Expense, Settlement } from '@/types'
import { isBalancedExpense, netBalances, pairwiseDebts, totalsByMember } from './balances'
import { simplifyDebts } from './simplify'

const exp = (paidBy: Record<string, number>, splits: Record<string, number>): Expense => ({
  id: Math.random().toString(), groupId: 'g', description: 'x', amount: Object.values(paidBy).reduce((a, b) => a + b, 0),
  category: 'other', date: '2026-01-01', paidBy, splits, splitType: 'exact', splitInput: {}, createdBy: 'a', createdAt: 0, updatedAt: 0,
})

describe('balances', () => {
  const expenses = [
    exp({ a: 3000 }, { a: 1000, b: 1000, c: 1000 }),
    exp({ b: 1500 }, { a: 500, b: 500, c: 500 }),
  ]
  it('net sums to zero', () => {
    const net = netBalances(expenses, [])
    expect(net).toEqual({ a: 1500, b: 0, c: -1500 })
  })
  it('pairwise nets opposite debts', () => {
    const d = pairwiseDebts(expenses, [])
    // b owes a 1000, a owes b 500 → b owes a 500; c owes a 1000 and b 500
    expect(d).toContainEqual({ from: 'b', to: 'a', amount: 500 })
    expect(d).toContainEqual({ from: 'c', to: 'a', amount: 1000 })
    expect(d).toContainEqual({ from: 'c', to: 'b', amount: 500 })
  })
  it('simplify preserves nets and reduces transfers', () => {
    const net = netBalances(expenses, [])
    const s = simplifyDebts(net)
    expect(s).toEqual([{ from: 'c', to: 'a', amount: 1500 }])
  })
  it('settlements clear balances', () => {
    const st: Settlement = { id: 's', groupId: 'g', from: 'c', to: 'a', amount: 1500, method: 'cash', date: '', createdBy: 'c', createdAt: 0 }
    expect(simplifyDebts(netBalances(expenses, [st]))).toEqual([])
  })
  it('multi-payer expense', () => {
    const net = netBalances([exp({ a: 6000, b: 4000 }, { a: 2500, b: 2500, c: 2500, d: 2500 })], [])
    expect(net).toEqual({ a: 3500, b: 1500, c: -2500, d: -2500 })
  })
})

describe('malformed expenses', () => {
  const good = exp({ a: 3000 }, { a: 1500, b: 1500 })
  const badSplits = { ...exp({ a: 3000 }, { a: 1000, b: 1000 }), id: 'bad-splits' } // splits sum 2000 ≠ 3000
  const badPaid = { ...exp({ a: 3000 }, { a: 1500, b: 1500 }), id: 'bad-paid', paidBy: { a: 9000 } }
  const fractional = { ...exp({ a: 3000 }, { a: 1500, b: 1500 }), id: 'frac', splits: { a: 1500.5, b: 1499.5 } }

  it('detects unbalanced expenses', () => {
    expect(isBalancedExpense(good)).toBe(true)
    expect(isBalancedExpense(badSplits)).toBe(false)
    expect(isBalancedExpense(badPaid)).toBe(false)
    expect(isBalancedExpense(fractional)).toBe(false)
  })
  it('ignores them in balances, debts and totals', () => {
    const all = [good, badSplits, badPaid, fractional]
    expect(netBalances(all, [])).toEqual({ a: 1500, b: -1500 })
    expect(pairwiseDebts(all, [])).toEqual([{ from: 'b', to: 'a', amount: 1500 }])
    expect(totalsByMember(all).paid).toEqual({ a: 3000 })
  })
})
