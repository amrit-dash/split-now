/*
 * The balance maths both the app and Cloud Functions must agree on: which expenses count, and
 * who owes what. The app's src/lib/balances.ts and src/lib/trust.ts carry the same rules for
 * the full Expense type; the reminder job (functions/src/lib/balances.ts) builds on this file so
 * it never nags someone about money the app itself says they don't owe yet.
 * Pure: no Firebase, no DOM, no '@/types' (documents are matched structurally).
 */

/** The fields of groups/{gid}/expenses/{id} that balances read (see Expense in src/types.ts). */
export interface BalanceExpense {
  amount: number
  paidBy?: Record<string, number>
  splits?: Record<string, number>
  createdAt?: number
  deletedAt?: number
  createdBy?: string
  /** set at creation when the group requires approval above its threshold */
  requiresApproval?: boolean
  /** uid → true for each person charged who approved it */
  approvals?: Record<string, true>
}

export interface BalanceSettlement {
  from: string
  to: string
  amount: number
  createdAt?: number
  deletedAt?: number
}

/** members map of a group: member id → { uid? } (placeholders have no uid; removedAt marks someone who left). */
export type MembersLite = Record<string, { uid?: string; removedAt?: number }>

const sum = (r: Record<string, number> | undefined) => Object.values(r ?? {}).reduce((a, b) => a + b, 0)
const ints = (r: Record<string, number> | undefined) => !!r && Object.values(r).every((v) => Number.isInteger(v))

/**
 * Whether an expense is internally consistent: integer amounts, and both who-paid and who-owes
 * add up to the total. Anything else (a buggy or tampered write) would skew every balance, so
 * balance maths ignores it.
 */
export function isBalancedExpense(e: Pick<BalanceExpense, 'amount' | 'paidBy' | 'splits'>): boolean {
  return Number.isInteger(e.amount) && e.amount > 0 && ints(e.paidBy) && ints(e.splits) && sum(e.paidBy) === e.amount && sum(e.splits) === e.amount
}

/** Charged members (with an account, other than the author) who still have to approve. */
export function pendingApprovers(e: Pick<BalanceExpense, 'requiresApproval' | 'approvals' | 'splits' | 'createdBy'>, members: MembersLite): string[] {
  if (e.requiresApproval !== true) return []
  return Object.entries(e.splits ?? {})
    .filter(([id, v]) => {
      const u = members[id]?.uid
      // Someone who left can't approve any more; waiting on them would hold the expense forever.
      return v > 0 && !!u && u !== e.createdBy && !e.approvals?.[u] && typeof members[id]?.removedAt !== 'number'
    })
    .map(([id]) => id)
}

/** Pending expenses are listed but left out of balances until everyone charged approves. */
export const isPendingApproval = (e: Pick<BalanceExpense, 'requiresApproval' | 'approvals' | 'splits' | 'createdBy'>, members: MembersLite): boolean =>
  pendingApprovers(e, members).length > 0

/**
 * Net per member (positive = is owed). Trash and pending-approval expenses are left out, like
 * the app's countedExpenses; with `asOf`, only items created at or before that instant count.
 */
export function netBalances(
  expenses: BalanceExpense[],
  settlements: BalanceSettlement[],
  opts: { members?: MembersLite; asOf?: number } = {},
): Record<string, number> {
  const { members = {}, asOf = Infinity } = opts
  const net: Record<string, number> = {}
  const add = (m: string, v: number) => (net[m] = (net[m] ?? 0) + v)
  for (const e of expenses) {
    if (typeof e.deletedAt === 'number' || (e.createdAt ?? 0) > asOf || !isBalancedExpense(e) || isPendingApproval(e, members)) continue
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
