/*
 * Delete my account (Settings → Data → Delete my account): what the screen says about the plan the
 * server made (functions/src/delete-account.ts, shared/account-delete.ts). Pure. Group names come
 * from the person's own groups on this phone, so a private group's name is the opened one.
 */
import type { DeletionBlocker, DeletionStep } from '../../shared/account-delete'
import { formatMoney } from './money'

/** What the person types to confirm. */
export const CONFIRM_WORD = 'DELETE'

export const confirmTyped = (typed: string): boolean => typed.trim().toUpperCase() === CONFIRM_WORD

export interface GroupLite {
  name: string
  currency?: string
}

const nameOf = (groups: Record<string, GroupLite>, id: string) => groups[id]?.name || 'a group'

/** One line per thing that stops the deletion, in the person's words. */
export function blockerLine(b: DeletionBlocker, groups: Record<string, GroupLite>): string {
  const name = nameOf(groups, b.groupId)
  if (b.reason === 'unsettled') {
    const amount = formatMoney(b.amount, groups[b.groupId]?.currency ?? 'INR')
    return b.owes ? `You owe ${amount} in ${name}. Settle up first.` : `You’re owed ${amount} in ${name}. Settle up first.`
  }
  if (b.reason === 'pending') return `An expense in ${name} still needs an OK.`
  return `“${b.description || 'An expense'}” still repeats in ${name}. Stop it repeating first.`
}

/** The groups that go with the account, the ones the person leaves, and the ones handed to someone else. */
export function planSummary(steps: DeletionStep[], groups: Record<string, GroupLite>): { deleted: string[]; left: string[]; handedOver: string[] } {
  const out = { deleted: [] as string[], left: [] as string[], handedOver: [] as string[] }
  for (const s of steps) {
    const name = nameOf(groups, s.groupId)
    if (s.kind === 'delete') out.deleted.push(name)
    else {
      out.left.push(name)
      if (s.newCreator) out.handedOver.push(name)
    }
  }
  return out
}

/** Whether the button can be pressed: nothing stops it, not an admin, and the word is typed. */
export const canDelete = (plan: { blockers: DeletionBlocker[]; admin: boolean } | null, typed: string): boolean =>
  !!plan && plan.blockers.length === 0 && !plan.admin && confirmTyped(typed)
