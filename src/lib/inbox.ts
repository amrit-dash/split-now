import type { ActivityEntry } from '@/types'

/*
 * Inbox "Updates": what other people did in your groups. "Unread" means newer than the last
 * time this device opened the Updates tab (localStorage; a convenience, not synced).
 */

const SEEN = 'splitit-inbox-seen'
const listeners = new Set<() => void>()

export function inboxSeenAt(): number {
  try {
    return Number(localStorage.getItem(SEEN)) || 0
  } catch {
    return 0
  }
}

export function markInboxSeen(at = Date.now()) {
  try {
    localStorage.setItem(SEEN, String(at))
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l())
}

export function onInboxSeen(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Other people's entries, newest first. */
export const othersActivity = (entries: ActivityEntry[] | null, myUid: string) => (entries ?? []).filter((a) => a.actorUid !== myUid)

export const unreadCount = (entries: ActivityEntry[] | null, myUid: string, seenAt: number) =>
  othersActivity(entries, myUid).filter((a) => a.createdAt > seenAt).length
