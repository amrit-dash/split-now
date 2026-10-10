/**
 * Deleting a group is safe: it goes to "Recently deleted" for TRASH_DAYS days (deletedAt,
 * deletedBy on the group), out of every list, total, reminder and capture match, and any member
 * may restore it. After that the daily purge (functions/src/trash.ts) removes it for good, and
 * onGroupDeleted sweeps up what was in it. Shared by the app and the functions. Pure.
 */

export const TRASH_DAYS = 30
const DAY_MS = 86_400_000

export interface Trashable {
  deletedAt?: number
  deletedBy?: string
}

export const isDeletedGroup = (g: Trashable): boolean => typeof g.deletedAt === 'number'

/** When a group deleted at `deletedAt` is removed for good. */
export const purgeAt = (deletedAt: number): number => deletedAt + TRASH_DAYS * DAY_MS

/** Whether the purge should remove it now. */
export const purgeDue = (g: Trashable, now: number): boolean => isDeletedGroup(g) && now >= purgeAt(g.deletedAt as number)

/** Whole days left to restore it (at least 1 while it's still there, 0 once due). */
export function daysLeft(deletedAt: number, now: number): number {
  const ms = purgeAt(deletedAt) - now
  return ms <= 0 ? 0 : Math.max(1, Math.ceil(ms / DAY_MS))
}
