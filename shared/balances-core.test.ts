import { describe, expect, it } from 'vitest'
import { isBalancedExpense, isPendingApproval, netBalances, pendingApprovers } from './balances-core'

const members = { a: { uid: 'ua' }, b: { uid: 'ub' }, c: {} }
const dinner = { amount: 9000, paidBy: { a: 9000 }, splits: { a: 3000, b: 3000, c: 3000 }, createdBy: 'ua', createdAt: 10 }

describe('balances-core', () => {
  it('only balanced expenses count', () => {
    expect(isBalancedExpense(dinner)).toBe(true)
    expect(isBalancedExpense({ amount: 100, paidBy: { a: 100 }, splits: { b: 50 } })).toBe(false)
    expect(isBalancedExpense({ amount: 100, paidBy: { a: 100.5 }, splits: { b: 100.5 } })).toBe(false)
    expect(isBalancedExpense({ amount: 0, paidBy: {}, splits: {} })).toBe(false)
    expect(netBalances([{ amount: 100, paidBy: { a: 100 }, splits: { b: 50 } }], [])).toEqual({})
  })
  it('nets expenses and settlements, skipping trash', () => {
    expect(netBalances([dinner], [{ from: 'b', to: 'a', amount: 3000 }])).toEqual({ a: 3000, b: 0, c: -3000 })
    expect(netBalances([{ ...dinner, deletedAt: 1 }], [{ from: 'b', to: 'a', amount: 3000, deletedAt: 2 }])).toEqual({})
    expect(netBalances([dinner], [], { asOf: 5 })).toEqual({})
  })
  it('an expense awaiting approval is listed but not counted, like the app (src/lib/trust.ts)', () => {
    const pending = { ...dinner, requiresApproval: true }
    expect(pendingApprovers(pending, members)).toEqual(['b'])
    expect(isPendingApproval(pending, members)).toBe(true)
    expect(netBalances([pending], [], { members })).toEqual({})
    // approved by everyone charged who has an account (placeholders can't approve)
    expect(isPendingApproval({ ...pending, approvals: { ub: true } }, members)).toBe(false)
    expect(netBalances([{ ...pending, approvals: { ub: true } }], [], { members })).toEqual({ a: 6000, b: -3000, c: -3000 })
    // without the members map nobody can be pending, so the old server behaviour is kept
    expect(netBalances([pending], [])).toEqual({ a: 6000, b: -3000, c: -3000 })
  })
})
