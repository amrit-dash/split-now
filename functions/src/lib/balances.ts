import { REMINDER } from '../config'
import { netBalances, type BalanceExpense, type BalanceSettlement, type MembersLite } from '../../../shared/balances-core'

/*
 * Settle-up reminders. The balance maths lives in shared/balances-core.ts (the same rules as
 * the app: trash and pending-approval expenses don't count), so a nudge is never about money
 * the app itself shows as not owed yet.
 */

export type { BalanceExpense as ExpenseLite, BalanceSettlement as SettlementLite }
export { isBalancedExpense as isBalanced, netBalances } from '../../../shared/balances-core'

export function reminderThreshold(currency: string): number {
  if (REMINDER.threshold[currency] !== undefined) return REMINDER.threshold[currency]
  let d = 2
  try {
    d = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    /* default */
  }
  return REMINDER.defaultThresholdMajor * 10 ** d
}

const DAY = 86_400_000

/**
 * reminderState/{groupId} (server-only): who was nudged when, and since when each member has
 * owed more than the threshold. `hasCandidates` lets the daily job find groups that still need
 * watching without reading every group in the project.
 */
export interface ReminderState {
  /** uid → when they were last nudged about this group */
  lastSent: Record<string, number>
  /** memberId → when their debt first went over the threshold (cleared when it drops back) */
  candidates: Record<string, number>
  hasCandidates: boolean
  evaluatedAt: number
}

export interface ReminderTarget {
  uid: string
  memberId: string
  owed: number
}

/**
 * One evaluation of a group: who should get a nudge now (members with an account who have
 * owed more than the threshold for at least `minAgeDays`, outside the `cooldownDays` window),
 * and the state to store back. A debt seen for the first time starts its clock now, unless the
 * balance `minAgeDays` ago was already over the threshold (so the first run after an upgrade
 * doesn't delay every existing reminder by a week).
 */
export function evaluateReminders(args: {
  members: MembersLite
  currency: string
  expenses: BalanceExpense[]
  settlements: BalanceSettlement[]
  now: number
  state: Partial<ReminderState> | undefined
}): { targets: ReminderTarget[]; next: ReminderState } {
  const { members, now } = args
  const threshold = reminderThreshold(args.currency)
  const minAge = REMINDER.minAgeDays * DAY
  const lastSent: Record<string, number> = { ...(args.state?.lastSent ?? {}) }
  const prevCandidates = args.state?.candidates ?? {}
  const candidates: Record<string, number> = {}
  const nowNet = netBalances(args.expenses, args.settlements, { members })
  let thenNet: Record<string, number> | undefined
  const targets: ReminderTarget[] = []
  for (const [memberId, m] of Object.entries(members)) {
    const owed = -(nowNet[memberId] ?? 0)
    if (owed <= threshold) continue
    let since = prevCandidates[memberId]
    if (typeof since !== 'number') {
      thenNet ??= netBalances(args.expenses, args.settlements, { members, asOf: now - minAge })
      since = -(thenNet[memberId] ?? 0) > threshold ? now - minAge : now
    }
    candidates[memberId] = since
    if (!m.uid || now - since < minAge) continue
    const last = lastSent[m.uid]
    if (last && now - last < REMINDER.cooldownDays * DAY) continue
    targets.push({ uid: m.uid, memberId, owed })
  }
  return { targets, next: { lastSent, candidates, hasCandidates: Object.keys(candidates).length > 0, evaluatedAt: now } }
}

/** Who should be nudged now, from a plain lastSent map (no candidate memory). */
export function reminderTargets(args: {
  members: MembersLite
  currency: string
  expenses: BalanceExpense[]
  settlements: BalanceSettlement[]
  now: number
  lastSent: Record<string, number>
}): ReminderTarget[] {
  return evaluateReminders({ ...args, state: { lastSent: args.lastSent } }).targets
}
