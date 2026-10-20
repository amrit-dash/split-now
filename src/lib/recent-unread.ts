/*
 * Home's Recent activity starts folded; its header says how many entries are new since this
 * device last opened it. "New" is anything someone else did after that moment (your own changes
 * are never news to you). The first visit stores now and marks nothing, so a new phone isn't
 * flooded. Kept on the device (localStorage), per account; storage that fails just shows no count.
 */

const KEY = 'splitnow:recent-seen'

/** How many entries are new: after `seenAt`, by someone other than `me`. Nothing before a first visit is stored. */
export function unreadCount(items: Array<{ createdAt: number; actorUid?: string }>, seenAt: number | null, me: string): number {
  if (seenAt === null) return 0
  return items.filter((i) => i.createdAt > seenAt && i.actorUid !== me).length
}

/** The pill's text: the count, capped so it stays a small pill. */
export const unreadLabel = (n: number) => (n > 9 ? '9+' : String(n))

/** When this account last opened Recent activity on this device; null when never (stores now, so the next visit counts from here). */
export function readSeen(uid: string, now = Date.now()): number | null {
  try {
    const v = localStorage.getItem(`${KEY}:${uid}`)
    if (v === null) {
      localStorage.setItem(`${KEY}:${uid}`, String(now))
      return null
    }
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/** Opened now: everything up to this moment is read. */
export function markSeen(uid: string, now = Date.now()) {
  try {
    localStorage.setItem(`${KEY}:${uid}`, String(now))
  } catch {
    /* storage unavailable: the count just comes back */
  }
}
