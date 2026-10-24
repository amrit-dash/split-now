/**
 * Deleting a group is safe: it goes to "Recently deleted" for TRASH_DAYS days (deletedAt,
 * deletedBy on the group), out of every list, total, reminder and capture match, and any member
 * may restore it. After that the daily purge (functions/src/trash.ts) removes it for good, and
 * onGroupDeleted sweeps up what was in it. Shared by the app and the functions. Pure.
 */

import { tuning } from './app-tuning'

/** The default; the live value is config/app's `tuning.trashDays` (shared/app-tuning.ts). */
export const TRASH_DAYS = 30
const DAY_MS = 86_400_000

export interface Trashable {
  deletedAt?: number
  deletedBy?: string
}

/** What a refused write in a deleted group says (the rules refuse it; demo mode says the same). */
export const DELETED_GROUP_WRITE = 'This group is in Recently deleted. Restore it to make changes.'

export const isDeletedGroup = (g: Trashable): boolean => typeof g.deletedAt === 'number'

/** When a group deleted at `deletedAt` is removed for good. */
export const purgeAt = (deletedAt: number, days = tuning().trashDays): number => deletedAt + days * DAY_MS

/** Whether the purge should remove it now. */
export const purgeDue = (g: Trashable, now: number, days = tuning().trashDays): boolean => isDeletedGroup(g) && now >= purgeAt(g.deletedAt as number, days)

/** Whole days left to restore it (at least 1 while it's still there, 0 once due). */
export function daysLeft(deletedAt: number, now: number, days = tuning().trashDays): number {
  const ms = purgeAt(deletedAt, days) - now
  return ms <= 0 ? 0 : Math.max(1, Math.ceil(ms / DAY_MS))
}

/**
 * Nothing in Recently deleted can be deleted for good in its first PURGE_HOLD_DAYS days, so a
 * mistaken or unilateral delete always leaves the others a week to see it and restore it
 * (firestore.rules `purgeHeld` carries the same number in ms).
 */
export const PURGE_HOLD_DAYS = 7

/** When something deleted at `deletedAt` may first be deleted for good. */
export const purgeOpensAt = (deletedAt: number): number => deletedAt + PURGE_HOLD_DAYS * DAY_MS

/** Whether "Delete forever" is still held for something deleted at `deletedAt`. */
export const purgeHeld = (deletedAt: number | undefined, now: number): boolean => typeof deletedAt === 'number' && now < purgeOpensAt(deletedAt)

/**
 * The week's hold is for the others: a group where nobody but its creator has an account (everyone
 * else added by name) has no one to restore it, so its creator may delete it for good straight
 * away (owner, 24 Oct 2026; firestore.rules `soloGroup` agrees).
 */
export const groupPurgeHeld = (g: { deletedAt?: number; createdBy: string; memberUids: readonly string[] }, now: number): boolean =>
  purgeHeld(g.deletedAt, now) && g.memberUids.some((u) => u !== g.createdBy)
