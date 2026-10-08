import type { Cents, Debt, Expense, MemberId, Settlement } from '@/types'
import { allocate } from './splits'

const sum = (r: Record<string, number> | undefined) => Object.values(r ?? {}).reduce((a, b) => a + b, 0)

/**
 * Whether an expense is internally consistent: whole, non-negative amounts, and both who-paid
 * and who-owes add up to the total. Anything else (a buggy or tampered write) would skew
 * every balance, so balance maths ignores it. Mirrored in functions/src/lib/balances.ts.
 */
export function isBalancedExpense(e: Pick<Expense, 'amount' | 'paidBy' | 'splits'>): boolean {
  const whole = (r: Record<string, number> | undefined) => !!r && Object.values(r).every((v) => Number.isInteger(v) && v >= 0)
  return Number.isInteger(e.amount) && e.amount > 0 && whole(e.paidBy) && whole(e.splits) && sum(e.paidBy) === e.amount && sum(e.splits) === e.amount
}

/**
 * Expenses that are safe to count, and the ones that aren't (for the caller to report once).
 * Pure and quiet: netBalances / pairwiseDebts / totalsByMember each call it, so a screen that
 * wants all three computes `countable(expenses).ok` once and passes that list to each.
 */
export function countable(expenses: Expense[]): { ok: Expense[]; rejected: Expense[] } {
  const ok: Expense[] = []
  const rejected: Expense[] = []
  for (const e of expenses) (isBalancedExpense(e) ? ok : rejected).push(e)
  return { ok, rejected }
}

/** Net position per member. Positive = is owed money, negative = owes money. */
export function netBalances(expenses: Expense[], settlements: Settlement[]): Record<MemberId, Cents> {
  const net: Record<MemberId, Cents> = {}
  const add = (m: MemberId, v: Cents) => (net[m] = (net[m] ?? 0) + v)
  for (const e of countable(expenses).ok) {
    for (const [m, v] of Object.entries(e.paidBy)) add(m, v)
    for (const [m, v] of Object.entries(e.splits)) add(m, -v)
  }
  for (const s of settlements) {
    add(s.from, s.amount)
    add(s.to, -s.amount)
  }
  return net
}

/**
 * Raw pairwise debts (no simplification): within each expense, each person's share
 * is owed to the payers in proportion to what each payer paid. Opposite debts between
 * the same pair are netted. Settlements reduce the pair they apply to.
 */
export function pairwiseDebts(expenses: Expense[], settlements: Settlement[]): Debt[] {
  const pair = new Map<string, Cents>() // key "a|b" with a<b, value >0 means a owes b
  const addDebt = (from: MemberId, to: MemberId, amt: Cents) => {
    if (from === to || amt === 0) return
    const [a, b, sign] = from < to ? [from, to, 1] : [to, from, -1]
    const k = `${a}|${b}`
    pair.set(k, (pair.get(k) ?? 0) + sign * amt)
  }
  for (const e of countable(expenses).ok) {
    const payers = Object.entries(e.paidBy).filter(([, v]) => v > 0)
    if (payers.length === 1) {
      // The common case: everything is owed to the one payer, no rounding to do.
      const payer = payers[0][0]
      for (const [debtor, share] of Object.entries(e.splits)) addDebt(debtor, payer, share)
      continue
    }
    for (const [debtor, share] of Object.entries(e.splits)) {
      const parts = allocate(share, payers)
      for (const [payer, v] of Object.entries(parts)) addDebt(debtor, payer, v)
    }
  }
  for (const s of settlements) addDebt(s.to, s.from, s.amount)
  const out: Debt[] = []
  for (const [k, v] of pair) {
    const [a, b] = k.split('|')
    if (v > 0) out.push({ from: a, to: b, amount: v })
    else if (v < 0) out.push({ from: b, to: a, amount: -v })
  }
  return out.sort((x, y) => y.amount - x.amount)
}

export function totalsByMember(expenses: Expense[]) {
  const paid: Record<MemberId, Cents> = {}
  const share: Record<MemberId, Cents> = {}
  for (const e of countable(expenses).ok) {
    for (const [m, v] of Object.entries(e.paidBy)) paid[m] = (paid[m] ?? 0) + v
    for (const [m, v] of Object.entries(e.splits)) share[m] = (share[m] ?? 0) + v
  }
  return { paid, share }
}
