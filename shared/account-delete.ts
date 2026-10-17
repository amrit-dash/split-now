/*
 * Deleting an account (the deleteAccount callable, functions/src/delete-account.ts, and its
 * preview in Settings → Data): what happens to each group the person is in, and what stops it.
 * A group is shared money between people, so it can't simply vanish with one of them:
 *  - a Personal wallet, or a group nobody else with an account is in, is deleted with the account;
 *  - any other group keeps its history, and the person's entry becomes "Deleted account" (their
 *    name, email, photo and account are taken off it), exactly as if they had left; if they made
 *    the group, it passes to the longest-standing member with an account.
 * Leaving needs what leaving a group needs (src/lib/members.ts memberRemoval): a settled balance,
 * no expense of theirs still waiting for an OK, and no repeating expense still running with them,
 * so nobody is left owed money by an account that no longer exists.
 * Pure: shared by the app and Cloud Functions, matched structurally (no @/types).
 */

import { type BalanceExpense, type BalanceSettlement, isPendingApproval, netBalances } from './balances-core'

/** What a deleted person's entry in a group's members becomes. */
export const DELETED_NAME = 'Deleted account'

/** Under one minor unit (paise, cents) counts as settled, as in the app (src/lib/members.ts isSettled). */
const settled = (n: number) => Math.abs(n) < 1

export interface DeletionGroup {
  id: string
  type?: string
  createdBy?: string
  deletedAt?: number
  memberUids?: string[]
  members: Record<string, { uid?: string; removedAt?: number }>
}

export interface DeletionExpense extends BalanceExpense {
  id: string
  description?: string
  recurrence?: { nextDate: string; until?: string }
}

export type DeletionStep =
  /** delete the group with the account: a wallet, or nobody else has an account in it */
  | { kind: 'delete'; groupId: string; why: 'wallet' | 'alone' }
  /** take the person out and clear their entry; hand the group to `newCreator` when they made it */
  | { kind: 'leave'; groupId: string; memberId: string; newCreator?: string }

export type DeletionBlocker =
  | { groupId: string; reason: 'unsettled'; owes: boolean; amount: number }
  | { groupId: string; reason: 'pending' }
  | { groupId: string; reason: 'repeating'; description: string }

/** The person's own live entry in a group (the one with their account), if they're in it. */
export function ownEntry(uid: string, g: DeletionGroup): string | null {
  for (const [id, m] of Object.entries(g.members ?? {})) if (m.uid === uid && typeof m.removedAt !== 'number') return id
  return null
}

/** A repeating expense that still makes copies (src/lib/members.ts stillRepeats). */
const stillRepeats = (e: DeletionExpense) =>
  typeof e.deletedAt !== 'number' && !!e.recurrence && (!e.recurrence.until || e.recurrence.nextDate <= e.recurrence.until)

/**
 * What deleting `uid` does to one group, given its expenses and payments: a step, or why not.
 * Null: the person isn't in it (any more), so nothing to do.
 */
export function planGroup(
  uid: string,
  g: DeletionGroup,
  expenses: DeletionExpense[],
  settlements: BalanceSettlement[],
): { step: DeletionStep } | { blockers: DeletionBlocker[] } | null {
  const me = ownEntry(uid, g)
  if (!me) return null
  if (g.type === 'personal') return { step: { kind: 'delete', groupId: g.id, why: 'wallet' } }
  // Others with an account, in the order they came into the group (memberUids keeps that order).
  const live = new Set(
    Object.values(g.members)
      .filter((m) => m.uid && m.uid !== uid && typeof m.removedAt !== 'number')
      .map((m) => m.uid as string),
  )
  const others = [...(g.memberUids ?? []).filter((u) => live.has(u)), ...[...live].filter((u) => !(g.memberUids ?? []).includes(u))]
  if (others.length === 0) return { step: { kind: 'delete', groupId: g.id, why: 'alone' } }
  // A group in Recently deleted can be left whatever is owed in it (as the rules allow).
  if (typeof g.deletedAt !== 'number') {
    const blockers: DeletionBlocker[] = []
    const net = netBalances(expenses, settlements, { members: g.members })[me] ?? 0
    if (!settled(net)) blockers.push({ groupId: g.id, reason: 'unsettled', owes: net < 0, amount: Math.round(Math.abs(net)) })
    const mine = (e: DeletionExpense) => me in (e.paidBy ?? {}) || me in (e.splits ?? {})
    if (expenses.some((e) => typeof e.deletedAt !== 'number' && mine(e) && isPendingApproval(e, g.members))) blockers.push({ groupId: g.id, reason: 'pending' })
    const rep = expenses.find((e) => stillRepeats(e) && mine(e))
    if (rep) blockers.push({ groupId: g.id, reason: 'repeating', description: rep.description ?? '' })
    if (blockers.length) return { blockers }
  }
  return { step: { kind: 'leave', groupId: g.id, memberId: me, ...(g.createdBy === uid ? { newCreator: others[0] } : {}) } }
}

/** Every group's plan together: the steps to take, and everything that stops it (empty when it can go ahead). */
export function planDeletion(
  uid: string,
  groups: Array<{ group: DeletionGroup; expenses: DeletionExpense[]; settlements: BalanceSettlement[] }>,
): { steps: DeletionStep[]; blockers: DeletionBlocker[] } {
  const steps: DeletionStep[] = []
  const blockers: DeletionBlocker[] = []
  for (const { group, expenses, settlements } of groups) {
    const p = planGroup(uid, group, expenses, settlements)
    if (!p) continue
    if ('step' in p) steps.push(p.step)
    else blockers.push(...p.blockers)
  }
  return { steps, blockers }
}

/**
 * The person's member entry once they're gone: only the colour stays (so old expenses still draw
 * a dot), with the name every reader shows for a deleted account, and the time they left.
 */
export function clearedEntry(entry: Record<string, unknown>, now: number): Record<string, unknown> {
  const out: Record<string, unknown> = { name: DELETED_NAME, removedAt: typeof entry.removedAt === 'number' ? entry.removedAt : now }
  if (typeof entry.color === 'string') out.color = entry.color
  return out
}

/** A deletion can go ahead only within this long of signing in (the server checks the token's auth_time). */
export const RECENT_SIGN_IN_MS = 5 * 60 * 1000

export const signedInRecently = (authTimeSec: number | undefined, now: number): boolean =>
  typeof authTimeSec === 'number' && now - authTimeSec * 1000 <= RECENT_SIGN_IN_MS && authTimeSec * 1000 <= now + 60_000
