import type { Group, MemberId } from '@/types'
import { TRASH_DAYS } from '../../shared/group-trash'

/**
 * Who may delete a group (it goes to "Recently deleted" for 30 days, shared/group-trash.ts):
 * the person who created it, always; once they have left the group, any member, but only when
 * everyone is square, so a group can't be put away with money still owed in it by someone who
 * isn't its owner. The rules enforce the creator part; the "everyone square" part is the app's.
 */
export type DeleteState = { allowed: true } | { allowed: false; reason: string }

export function groupDeleteState(g: Pick<Group, 'name' | 'createdBy' | 'members' | 'memberUids'>, uid: string, everyoneSquare: boolean): DeleteState {
  if (!g.memberUids.includes(uid)) return { allowed: false, reason: `You’re no longer in “${g.name}”.` }
  if (g.createdBy === uid) return { allowed: true }
  if (!g.memberUids.includes(g.createdBy)) {
    return everyoneSquare ? { allowed: true } : { allowed: false, reason: 'Everyone needs to be settled up first.' }
  }
  const by = Object.values(g.members).find((m) => m.uid === g.createdBy)?.name
  return { allowed: false, reason: `Only ${by ?? 'the person who created it'} can delete “${g.name}”.` }
}

/**
 * The delete confirmation's message: what happens, and the payments still open (up to three,
 * then "and N more"), so nobody deletes away a debt without seeing it.
 */
export function deleteMessage(
  debts: ReadonlyArray<{ from: MemberId; to: MemberId; amount: number }>,
  name: (id: MemberId) => string,
  money: (n: number) => string,
): string {
  const base = `It moves to Recently deleted for everyone in the group. Anyone in it can restore it within ${TRASH_DAYS} days; after that it’s gone for good.`
  if (!debts.length) return base
  const shown = debts.slice(0, 3).map((d) => `${name(d.from)} owes ${name(d.to)} ${money(d.amount)}`)
  const more = debts.length > 3 ? `, and ${debts.length - 3} more` : ''
  return `${base} Still open: ${shown.join('; ')}${more}.`
}
