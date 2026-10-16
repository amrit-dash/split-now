/**
 * "Money received": a refund or reimbursement one person got that belongs to several people. It is
 * stored as an expense with the roles swapped (`kind: 'received'`): whoever received it is charged
 * the whole amount (`splits`), and everyone it is shared with is credited their share (`paidBy`).
 * Balances (paid minus share) then come out right with no special case: the receiver owes each
 * sharer their part. Anything that reads an expense as *spending* (insights, totals, budgets,
 * fairness, pushes) asks here first. Shared by the app and the functions. Pure.
 */

export interface Kinded {
  kind?: string
  paidBy: Record<string, number>
  splits: Record<string, number>
}

export const isReceived = (e: { kind?: string }): boolean => e.kind === 'received'

/** Who paid (an expense), or who received the money (money received). */
export const handlersOf = (e: Kinded): Record<string, number> => (isReceived(e) ? e.splits : e.paidBy)

/** Each person's share: of the cost (an expense), or of the money (money received). */
export const sharesOf = (e: Kinded): Record<string, number> => (isReceived(e) ? e.paidBy : e.splits)

/** Only what was spent: money received isn't spending (it shows on its own, never in a total). */
export const spending = <T extends { kind?: string }>(xs: readonly T[]): T[] => xs.filter((e) => !isReceived(e))

/**
 * The words beside my net for one entry in a list (`delta` = what I'm credited minus my share):
 * "you lent" / "you borrowed" for an expense; "you get" / "you pass on" for money received, where
 * the receiver owes the others and each sharer is owed their part.
 */
export function deltaWords(e: { kind?: string }, delta: number): string {
  if (isReceived(e)) return delta > 0 ? 'you get' : 'you pass on'
  return delta > 0 ? 'you lent' : 'you borrowed'
}

/** The verb for who handled the money: "Rahul paid ₹900" or "Rahul received ₹900". */
export const handledVerb = (e: { kind?: string }): string => (isReceived(e) ? 'received' : 'paid')
