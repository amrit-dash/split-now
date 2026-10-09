import type { Member, MemberId } from '@/types'

import { activeMembers } from '../../shared/members'

export { activeMemberIds, activeMembers, formerMemberMatch, isRemoved } from '../../shared/members'

/** The people in the group now, by name, plus any removed ids in `keep` (the people in an old expense being edited). */
export function orderMembers(members: Record<MemberId, Pick<Member, 'name' | 'removedAt'>>, keep?: Iterable<MemberId>): MemberId[] {
  const ids = new Set(Object.keys(activeMembers(members)))
  for (const id of keep ?? []) if (members[id]) ids.add(id)
  return [...ids].sort((a, b) => members[a].name.localeCompare(members[b].name))
}

/** Member ids in an expense (payers, people in the split, and in its items). */
export function expenseMemberIds(e: {
  paidBy: Record<MemberId, unknown>
  splits: Record<MemberId, unknown>
  items?: Array<{ members: MemberId[] }>
}): MemberId[] {
  return [...new Set([...Object.keys(e.paidBy), ...Object.keys(e.splits), ...(e.items ?? []).flatMap((it) => it.members)])]
}

/**
 * Who to list on Balances and Members: everyone in the group now, plus anyone removed who still
 * has money in it (old data): money is never hidden.
 */
export function listedMemberIds(members: Record<MemberId, Pick<Member, 'name' | 'removedAt'>>, net: Record<MemberId, number>): MemberId[] {
  return Object.keys(members).filter((id) => !isRemovedEntry(members[id]) || !isSettled(net[id] ?? 0))
}
const isRemovedEntry = (m: Pick<Member, 'removedAt'> | undefined) => typeof m?.removedAt === 'number'

/** A balance in minor units counts as settled when nothing is owed either way (below one paisa/cent). */
export const isSettled = (balance: number) => Math.abs(balance) < 1

/**
 * What can happen to a member on the Members screen or a Balances row:
 *  - remove: someone else, settled, and you may remove them,
 *  - leave: it's you and you may leave (your balance is settled and you didn't create the group),
 *  - creator: it's you and you created the group (delete it instead),
 *  - unsettled: they still owe (owes) or are owed money in the group,
 *  - pending: they're in an expense waiting for an OK, which isn't counted yet,
 *  - repeating: they're in a repeating expense that still runs (its next copies would charge them),
 *  - not-allowed: they joined with an account and only the group's creator may remove them (the rules say so),
 *  - removed: they already left (listed only while old data leaves money against them).
 */
export type MemberRemoval =
  | { kind: 'remove' }
  | { kind: 'leave' }
  | { kind: 'creator' }
  | { kind: 'unsettled'; owes: boolean; amount: number }
  | { kind: 'pending' }
  | { kind: 'repeating'; expenseId: string; description: string }
  | { kind: 'not-allowed' }
  | { kind: 'removed' }

export function memberRemoval(a: {
  memberId: MemberId
  member: Pick<Member, 'uid' | 'removedAt'>
  /** The viewer's own member id in the group. */
  me?: MemberId
  myUid: string
  createdBy: string
  balance: number
  /** Member ids in expenses that wait for an OK (not in the balance yet). */
  inPending?: ReadonlySet<MemberId>
  /** Member id → a repeating expense that still runs and includes them (repeatingByMember). */
  repeating?: ReadonlyMap<MemberId, { id: string; description: string }>
}): MemberRemoval {
  const self = a.memberId === a.me
  const creator = a.createdBy === a.myUid
  if (typeof a.member.removedAt === 'number') return { kind: 'removed' }
  // Others' joined entries: the rules allow only the creator to remove them.
  if (!self && a.member.uid && !creator) return { kind: 'not-allowed' }
  // The creator can't leave at all (they delete the group instead), settled or not.
  if (self && creator) return { kind: 'creator' }
  if (!isSettled(a.balance)) return { kind: 'unsettled', owes: a.balance < 0, amount: Math.abs(a.balance) }
  if (a.inPending?.has(a.memberId)) return { kind: 'pending' }
  const rep = a.repeating?.get(a.memberId)
  if (rep) return { kind: 'repeating', expenseId: rep.id, description: rep.description }
  if (self) return { kind: 'leave' }
  return { kind: 'remove' }
}

/**
 * What swiping a member's row reveals: the red Remove (or Leave) when that's allowed; otherwise a
 * neutral Settle up when money is still owed, and a muted Remove/Leave that only explains why not
 * (the toast from useRemoveMember), so the row never hides why nothing happens.
 */
export type MemberAction = 'remove' | 'leave' | 'settle' | 'explain'
export function memberActions(r: MemberRemoval, balance: number): MemberAction[] {
  switch (r.kind) {
    case 'remove':
      return ['remove']
    case 'leave':
      return ['leave']
    case 'unsettled':
      return ['settle', 'explain']
    case 'removed':
      return isSettled(balance) ? [] : ['settle']
    default:
      return ['explain']
  }
}

/**
 * A repeating expense still runs while it is not deleted, has a recurrence, and its next date is
 * within its end date (src/lib/recurrence.ts drops `recurrence` once a series ends). Its future
 * copies (makeOccurrence) repeat paidBy/splits, so everyone in it would keep being charged.
 */
export const stillRepeats = (e: { deletedAt?: number; recurrence?: { nextDate: string; until?: string } }) =>
  typeof e.deletedAt !== 'number' && !!e.recurrence && (!e.recurrence.until || e.recurrence.nextDate <= e.recurrence.until)

/** Member id → the first still-running repeating expense they pay or share in. */
export function repeatingByMember(
  expenses: ReadonlyArray<{
    id: string
    description: string
    deletedAt?: number
    recurrence?: { nextDate: string; until?: string }
    paidBy: Record<MemberId, unknown>
    splits: Record<MemberId, unknown>
  }>,
): Map<MemberId, { id: string; description: string }> {
  const out = new Map<MemberId, { id: string; description: string }>()
  for (const e of expenses) {
    if (!stillRepeats(e)) continue
    for (const id of [...Object.keys(e.paidBy), ...Object.keys(e.splits)]) if (!out.has(id)) out.set(id, { id: e.id, description: e.description })
  }
  return out
}

/** Member ids that appear (paid or split) in the given expenses. */
export function membersIn(expenses: ReadonlyArray<{ paidBy: Record<string, unknown>; splits: Record<string, unknown> }>): Set<MemberId> {
  const out = new Set<MemberId>()
  for (const e of expenses) for (const id of [...Object.keys(e.paidBy), ...Object.keys(e.splits)]) out.add(id)
  return out
}

/** The line under a member's name: whether they have an account in the group yet. */
export function memberState(m: Pick<Member, 'uid' | 'email' | 'removedAt'>): string {
  if (typeof m.removedAt === 'number') return 'Left the group'
  return m.uid ? 'Joined' : m.email ? `${m.email} · not joined yet` : 'Not joined yet. Share the invite link'
}
