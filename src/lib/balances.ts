import type { Cents, Debt, Expense, MemberId, Settlement } from '@/types'
import { allocate } from './splits'

/** Net position per member. Positive = is owed money, negative = owes money. */
export function netBalances(expenses: Expense[], settlements: Settlement[]): Record<MemberId, Cents> {
  const net: Record<MemberId, Cents> = {}
  const add = (m: MemberId, v: Cents) => (net[m] = (net[m] ?? 0) + v)
  for (const e of expenses) {
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
  for (const e of expenses) {
    const payers = Object.entries(e.paidBy).filter(([, v]) => v > 0)
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
  for (const e of expenses) {
    for (const [m, v] of Object.entries(e.paidBy)) paid[m] = (paid[m] ?? 0) + v
    for (const [m, v] of Object.entries(e.splits)) share[m] = (share[m] ?? 0) + v
  }
  return { paid, share }
}
