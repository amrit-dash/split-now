import type { ActivityEntry } from '@/types'

/*
 * Inbox "Updates": a log of everything that happened in your groups, your own actions
 * included. Only other people's entries can be new: "unread" means someone else's entry newer
 * than the last time this device opened the Updates tab (localStorage; a convenience, not
 * synced). Your own actions are never new and never count towards the badge.
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
  for (const l of listeners) l()
}

export function onInboxSeen(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Other people's entries, newest first. */
export const othersActivity = (entries: ActivityEntry[] | null, myUid: string) => (entries ?? []).filter((a) => a.actorUid !== myUid)

/** New = someone else did it after `seenAt`. Your own entries are never new. */
export const isUnread = (a: Pick<ActivityEntry, 'actorUid' | 'createdAt'>, myUid: string, seenAt: number) => a.actorUid !== myUid && a.createdAt > seenAt

export const unreadCount = (entries: ActivityEntry[] | null, myUid: string, seenAt: number) => (entries ?? []).filter((a) => isUnread(a, myUid, seenAt)).length

/** Runs of at least this many adds by one person in one group become one row. */
export const RUN_MIN = 3
/** ...when each add is within this long of the previous one. */
export const RUN_GAP_MS = 10 * 60_000

/**
 * The feed with bursts folded: when one person adds several expenses to a group in a row
 * (a bank statement import, a catch-up session), they show as one "added 12 expenses" row that
 * opens the group, instead of filling the feed. A file import is already one entry.
 * `entries` must be newest first; the result is too.
 */
export function collapseRuns(entries: ActivityEntry[] | null): ActivityEntry[] {
  const list = entries ?? []
  const out: ActivityEntry[] = []
  for (let i = 0; i < list.length; ) {
    const a = list[i]
    let j = i + 1
    if (a.type === 'expense.created') {
      while (
        j < list.length &&
        list[j].type === 'expense.created' &&
        list[j].actorUid === a.actorUid &&
        list[j].groupId === a.groupId &&
        list[j - 1].createdAt - list[j].createdAt <= RUN_GAP_MS
      )
        j++
    }
    const n = j - i
    if (n >= RUN_MIN) {
      out.push({
        id: `${a.id}+${n - 1}`,
        groupId: a.groupId,
        type: 'expense.imported',
        actorUid: a.actorUid,
        actorName: a.actorName,
        targetId: a.groupId,
        summary: `${a.actorName} added ${n} expenses`,
        after: { expenses: n },
        createdAt: a.createdAt,
      })
    } else {
      out.push(...list.slice(i, j))
    }
    i = j
  }
  return out
}
