/*
 * Which switch in Settings → Notifications an approval push answers to. Asking someone for their
 * OK (a big expense, a payment to confirm, an edit that needs a fresh OK) is "Needs your OK"
 * (`approvals`), so turning off the everyday "New expenses" or "Someone pays you back" never hides
 * the one push that holds the group up. Plain news stays on those switches. Pure, tested.
 */
import { type MembersLite, pendingApprovers } from '../../../shared/balances-core'
import type { PrefKey } from './prefs'

/** A new expense: an ask for those who must approve it, news for everyone else in it. */
export const expensePref = (needsApproval: boolean): PrefKey => (needsApproval ? 'approvals' : 'expenses')

/** A payment that needs the payee's OK: cleared by its screenshot it is news, else an ask. */
export const paymentOkPref = (cleared: boolean): PrefKey => (cleared ? 'settlements' : 'approvals')

type ApprovalExpense = Parameters<typeof pendingApprovers>[0] & { deletedAt?: unknown }

/**
 * Member ids an edit made wait again: pending after it, not before (their OK was taken away, or
 * approval was just switched on for it). Nothing for an expense in Recently deleted. Approving
 * only ever shrinks the list, so an Approve tap never pushes anyone.
 */
export function newlyWaiting(before: ApprovalExpense | undefined, after: ApprovalExpense | undefined, members: MembersLite): string[] {
  if (!before || !after || typeof after.deletedAt === 'number') return []
  const was = new Set(pendingApprovers(before, members))
  return pendingApprovers(after, members).filter((id) => !was.has(id))
}
