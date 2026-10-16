import type { Cents, Expense, MemberId, Settlement } from '@/types'
import { netBalances } from './balances'
import { isReceived, spending } from '../../shared/received'

/**
 * The group's "Money received" screen: what was spent, what came back, and what that does to each
 * person's real cost and to their balance. Balances everywhere already include money received
 * (shared/received.ts swaps the roles so paid − share stays right); this shows the working, so the
 * spending figures (which leave money received out) and the balances (which don't) can be read
 * side by side. Pure; `expenses` and `settlements` are the counted ones (computeGroupData).
 */

export interface PersonBreakdown {
  id: MemberId
  /** what they paid towards expenses */
  paid: Cents
  /** their share of the expenses */
  share: Cents
  /** money received that came to them (they hold it for the others) */
  received: Cents
  /** their part of the money received */
  receivedShare: Cents
  /** what the group really cost them: share − receivedShare */
  netCost: Cents
  /** balance leaving money received out (+ is owed to them) */
  balanceBefore: Cents
  /** balance as it is (with money received), the one Settle up uses */
  balance: Cents
}

export interface ReceivedBreakdown {
  spent: Cents
  received: Cents
  /** spent − received */
  netCost: Cents
  /** the money received entries, newest first */
  entries: Expense[]
  people: PersonBreakdown[]
}

const add = (into: Record<MemberId, Cents>, from: Record<MemberId, Cents>) => {
  for (const [id, v] of Object.entries(from)) into[id] = (into[id] ?? 0) + v
}

export function receivedBreakdown(expenses: Expense[], settlements: Settlement[], order: MemberId[]): ReceivedBreakdown {
  const spent = spending(expenses)
  const entries = expenses.filter(isReceived).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  const paid: Record<MemberId, Cents> = {}
  const share: Record<MemberId, Cents> = {}
  const received: Record<MemberId, Cents> = {}
  const receivedShare: Record<MemberId, Cents> = {}
  for (const e of spent) {
    add(paid, e.paidBy)
    add(share, e.splits)
  }
  for (const e of entries) {
    add(received, e.splits)
    add(receivedShare, e.paidBy)
  }
  const before = netBalances(spent, settlements)
  const after = netBalances(expenses, settlements)
  const ids = [...new Set([...order, ...Object.keys(paid), ...Object.keys(share), ...Object.keys(received), ...Object.keys(receivedShare)])]
  const people = ids
    .map((id) => ({
      id,
      paid: paid[id] ?? 0,
      share: share[id] ?? 0,
      received: received[id] ?? 0,
      receivedShare: receivedShare[id] ?? 0,
      netCost: (share[id] ?? 0) - (receivedShare[id] ?? 0),
      balanceBefore: before[id] ?? 0,
      balance: after[id] ?? 0,
    }))
    .filter((p) => p.paid || p.share || p.received || p.receivedShare || p.balance || p.balanceBefore)
  const spentTotal = spent.reduce((s, e) => s + e.amount, 0)
  const receivedTotal = entries.reduce((s, e) => s + e.amount, 0)
  return { spent: spentTotal, received: receivedTotal, netCost: spentTotal - receivedTotal, entries, people }
}
