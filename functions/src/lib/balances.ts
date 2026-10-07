import { REMINDER } from '../config'

/** Minimal shapes of groups/{gid}/expenses and /settlements docs (see src/types.ts). */
export interface ExpenseLite {
  amount: number
  paidBy?: Record<string, number>
  splits?: Record<string, number>
  createdAt?: number
  deletedAt?: number
}
export interface SettlementLite {
  from: string
  to: string
  amount: number
  createdAt?: number
  deletedAt?: number
}

const sum = (r: Record<string, number> | undefined) => Object.values(r ?? {}).reduce((a, b) => a + b, 0)
const ints = (r: Record<string, number> | undefined) => !!r && Object.values(r).every((v) => Number.isInteger(v))

/** Same guard as isBalancedExpense in src/lib/balances.ts: ignore docs whose shares don't add up. */
export const isBalanced = (e: ExpenseLite) =>
  Number.isInteger(e.amount) && e.amount > 0 && ints(e.paidBy) && ints(e.splits) && sum(e.paidBy) === e.amount && sum(e.splits) === e.amount

/** Net per member (positive = is owed). Only items created at or before `asOf`, trash excluded. */
export function netBalances(expenses: ExpenseLite[], settlements: SettlementLite[], asOf = Infinity): Record<string, number> {
  const net: Record<string, number> = {}
  const add = (m: string, v: number) => (net[m] = (net[m] ?? 0) + v)
  for (const e of expenses) {
    if (typeof e.deletedAt === 'number' || (e.createdAt ?? 0) > asOf || !isBalanced(e)) continue
    for (const [m, v] of Object.entries(e.paidBy!)) add(m, v)
    for (const [m, v] of Object.entries(e.splits!)) add(m, -v)
  }
  for (const s of settlements) {
    if (typeof s.deletedAt === 'number' || (s.createdAt ?? 0) > asOf || !Number.isInteger(s.amount)) continue
    add(s.from, s.amount)
    add(s.to, -s.amount)
  }
  return net
}

export function reminderThreshold(currency: string): number {
  if (REMINDER.threshold[currency] !== undefined) return REMINDER.threshold[currency]
  let d = 2
  try { d = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2 } catch { /* default */ }
  return REMINDER.defaultThresholdMajor * 10 ** d
}

const DAY = 86_400_000

/**
 * Who in a group should get a settle-up nudge now: members with an account who owe more than
 * the threshold today *and* already owed more than it `minAgeDays` ago, and who haven't been
 * nudged about this group within `cooldownDays`.
 */
export function reminderTargets(args: {
  members: Record<string, { uid?: string }>
  currency: string
  expenses: ExpenseLite[]
  settlements: SettlementLite[]
  now: number
  lastSent: Record<string, number>
}): Array<{ uid: string; memberId: string; owed: number }> {
  const threshold = reminderThreshold(args.currency)
  const nowNet = netBalances(args.expenses, args.settlements)
  const thenNet = netBalances(args.expenses, args.settlements, args.now - REMINDER.minAgeDays * DAY)
  const out: Array<{ uid: string; memberId: string; owed: number }> = []
  for (const [memberId, m] of Object.entries(args.members)) {
    if (!m.uid) continue
    const owed = -(nowNet[memberId] ?? 0)
    const owedThen = -(thenNet[memberId] ?? 0)
    if (owed <= threshold || owedThen <= threshold) continue
    const last = args.lastSent[m.uid]
    if (last && args.now - last < REMINDER.cooldownDays * DAY) continue
    out.push({ uid: m.uid, memberId, owed })
  }
  return out
}
