import type { Cents, Expense, Group, MemberId } from '@/types'
import type { StatementTxn } from '@/data/repo'
import { inTripWindow, hasTripWindow } from './capture'
import { computeSplits } from './splits'

/*
 * Statement import: transactions read from payment-app screenshots, flagged against a group so
 * the user only has to confirm. Pure helpers; the screen is src/components/StatementImport.tsx.
 */

export type Flag = 'in_trip' | 'outside_trip' | 'maybe_added' | 'received' | 'own_transfer' | 'refund'

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86_400_000

/** An expense in the group with the same amount within a day, not deleted. */
export function findDuplicate(t: { date: string; amount: Cents }, expenses: Expense[]): Expense | undefined {
  return expenses.find((e) => !e.deletedAt && (e.original?.amount ?? e.amount) === t.amount && dayDiff(e.date, t.date) <= 1)
}

export function flagsFor(t: StatementTxn & { amount: Cents }, group: Group | undefined, expenses: Expense[]): Flag[] {
  const f: Flag[] = []
  if (t.direction === 'credit') f.push('received')
  if (t.kind === 'self_transfer') f.push('own_transfer')
  if (t.kind === 'refund') f.push('refund')
  if (group && hasTripWindow(group)) f.push(inTripWindow(group, t.date) ? 'in_trip' : 'outside_trip')
  if (findDuplicate(t, expenses)) f.push('maybe_added')
  return f
}

/** Ticked by default: payments out, not transfers or refunds, not already added, inside the trip if it has dates. */
export const preselect = (flags: Flag[]) => !flags.some((f) => f === 'received' || f === 'own_transfer' || f === 'refund' || f === 'maybe_added' || f === 'outside_trip')

/** The group whose dates hold most of the payments, else the live trip, else the first shared group. */
export function bestGroup(groups: Group[], txns: Array<{ date: string; direction: string }>, today: string): Group | undefined {
  const out = txns.filter((t) => t.direction === 'debit')
  let best: Group | undefined
  let hits = 0
  for (const g of groups) {
    if (!hasTripWindow(g)) continue
    const n = out.filter((t) => inTripWindow(g, t.date)).length
    if (n > hits) { best = g; hits = n }
  }
  return best ?? groups.find((g) => inTripWindow(g, today)) ?? groups.find((g) => g.type !== 'personal' && g.type !== 'direct') ?? groups[0]
}

/** "SWIGGY INSTAMART" → "Swiggy Instamart"; leaves mixed-case names alone. */
export function tidyName(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t === t.toUpperCase() ? t.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : t
}

export interface DraftExpense {
  description: string
  amount: Cents
  date: string
  category: Expense['category']
  notes?: string
  payer: MemberId
  members: MemberId[]
}

export function buildExpense(d: DraftExpense, group: Group, order: MemberId[], createdBy: string, id: string, now: number): Expense {
  const members = order.filter((m) => d.members.includes(m))
  return {
    id, groupId: group.id, description: d.description.trim(), amount: d.amount, category: d.category, date: d.date,
    ...(d.notes?.trim() ? { notes: d.notes.trim() } : {}),
    paidBy: { [d.payer]: d.amount },
    splits: computeSplits(d.amount, 'equal', { selected: members }, order),
    splitType: 'equal', splitInput: { selected: members },
    createdBy, createdAt: now, updatedAt: now,
  }
}
