import { describe, expect, it } from 'vitest'
import type { Expense, Settlement } from '@/types'
import { countable, isBalancedExpense, netBalances, pairwiseDebts, totalsByMember } from './balances'
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
  it('rejects negative shares or payments, which would make net and pairwise disagree', () => {
    expect(isBalancedExpense({ amount: 100, paidBy: { a: 150, b: -50 }, splits: { a: 50, b: 50 } })).toBe(false)
    expect(isBalancedExpense({ amount: 100, paidBy: { a: 100 }, splits: { a: 150, b: -50 } })).toBe(false)
    expect(isBalancedExpense({ amount: 100, paidBy: { a: 100, b: 0 }, splits: { a: 100 } })).toBe(true)
  })
  it('countable is pure and reports what it rejected', () => {
    const r = countable([good, badSplits])
    expect(r.ok).toEqual([good])
    expect(r.rejected.map((e) => e.id)).toEqual(['bad-splits'])
  })
})

describe('pairwise debts', () => {
  const members = ['a', 'b', 'c', 'd', 'e']
  const fromPairs = (expenses: Expense[]) => {
    const out: Record<string, number> = {}
    for (const d of pairwiseDebts(expenses, [])) {
      out[d.from] = (out[d.from] ?? 0) - d.amount
      out[d.to] = (out[d.to] ?? 0) + d.amount
    }
    return out
  }
  let seed = 3
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31 }
  const random = (multiPayer: boolean) => {
    const expenses: Expense[] = []
    for (let i = 0; i < 200; i++) {
      const amount = 1 + Math.floor(rnd() * 100000)
      const payers = !multiPayer || rnd() < 0.7 ? [members[Math.floor(rnd() * 5)]] : members.filter(() => rnd() < 0.5)
      if (!payers.length) continue
      const paidBy: Record<string, number> = {}
      let left = amount
      payers.forEach((p, k) => { const v = k === payers.length - 1 ? left : Math.floor(rnd() * left); paidBy[p] = (paidBy[p] ?? 0) + v; left -= v })
      const owers = members.filter(() => rnd() < 0.6)
      if (!owers.length) continue
      const splits: Record<string, number> = {}
      left = amount
      owers.forEach((p, k) => { const v = k === owers.length - 1 ? left : Math.floor(rnd() * left); splits[p] = (splits[p] ?? 0) + v; left -= v })
      expenses.push(exp(paidBy, splits))
    }
    return expenses
  }
  it('single-payer expenses: pairwise debts sum to exactly the net balances (property)', () => {
    const expenses = random(false)
    const net = netBalances(expenses, [])
    const pairs = fromPairs(expenses)
    for (const m of members) expect(pairs[m] ?? 0).toBe(net[m] ?? 0)
  })
  it('multi-payer expenses: pairwise debts match the nets up to per-share rounding', () => {
    const expenses = random(true)
    const net = netBalances(expenses, [])
    const pairs = fromPairs(expenses)
    const multi = expenses.filter((e) => Object.values(e.paidBy).filter((v) => v > 0).length > 1).length
    for (const m of members) expect(Math.abs((pairs[m] ?? 0) - (net[m] ?? 0))).toBeLessThanOrEqual(multi * members.length)
  })
  it('a single payer owed by everyone, including themselves, nets like before', () => {
    const e = exp({ a: 9000 }, { a: 3000, b: 3000, c: 3000 })
    expect(pairwiseDebts([e], [])).toEqual([{ from: 'b', to: 'a', amount: 3000 }, { from: 'c', to: 'a', amount: 3000 }])
  })
})
