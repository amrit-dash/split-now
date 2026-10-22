/*
 * Saves land on the phone at once and reach the server in the background (Firestore's local
 * cache). These decide what the person is told while some haven't arrived yet: nothing for a
 * quick sync, "Saving…" when one takes a while, and the offline note with how many are waiting.
 * Pure.
 */

/** A sync that finishes within this is never mentioned (most saves take well under a second). */
export const SAVING_AFTER_MS = 2000

export type SyncNotice = { kind: 'offline'; pending: number } | { kind: 'saving'; pending: number } | null

/**
 * `pending`: writes the server hasn't confirmed; `waitedMs`: how long there have been any.
 * Offline always shows (with the count when something is waiting); online only once a save is slow.
 */
export function syncNotice(o: { pending: number; online: boolean; waitedMs: number }): SyncNotice {
  if (!o.online) return { kind: 'offline', pending: o.pending }
  if (o.pending > 0 && o.waitedMs >= SAVING_AFTER_MS) return { kind: 'saving', pending: o.pending }
  return null
}

export function syncText(n: Exclude<SyncNotice, null>): string {
  if (n.kind === 'saving') return n.pending === 1 ? 'Saving your change…' : `Saving ${n.pending} changes…`
  if (n.pending === 0) return 'Offline. Changes sync when you’re back'
  return `Offline. ${n.pending === 1 ? '1 change is' : `${n.pending} changes are`} saved on this phone and will sync when you’re back`
}
