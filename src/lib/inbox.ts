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

/**
 * "Mark all read" shows while anything would still read as new: unread updates (counted on the
 * To sort tab's badge), or the dots this visit keeps on Updates after opening it marked them read.
 */
export const canMarkAllRead = (entries: ActivityEntry[] | null, myUid: string, seenAt: number, dotsSince: number) =>
  (entries ?? []).some((a) => isUnread(a, myUid, Math.min(seenAt, dotsSince)))

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

/*
 * Clearing Updates. Updates are the groups' own history, shared with everyone in them, so
 * clearing never deletes anything: it hides entries for you (users/{uid}/settings/inbox, so every
 * device agrees). Clear all hides everything up to that moment; ✕ hides one row.
 */
export interface InboxState {
  /** entries created at or before this are cleared */
  clearedAt: number
  /** single rows hidden with ✕ (newest last, at most MAX_HIDDEN) */
  hidden: string[]
}
export const EMPTY_INBOX_STATE: InboxState = { clearedAt: 0, hidden: [] }
export const MAX_HIDDEN = 200

/** The stored document → a state; anything malformed is dropped. */
export function parseInboxState(raw: unknown): InboxState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const clearedAt = typeof r.clearedAt === 'number' && Number.isFinite(r.clearedAt) && r.clearedAt > 0 ? r.clearedAt : 0
  const hidden = Array.isArray(r.hidden) ? r.hidden.filter((x): x is string => typeof x === 'string' && x.length <= 200).slice(-MAX_HIDDEN) : []
  return { clearedAt, hidden }
}

export const visibleUpdates = <T extends Pick<ActivityEntry, 'id' | 'createdAt'>>(entries: T[], s: InboxState): T[] => {
  const hidden = new Set(s.hidden)
  return entries.filter((a) => a.createdAt > s.clearedAt && !hidden.has(a.id))
}

/** ✕ on one row. */
export function hideUpdate(s: InboxState, id: string): InboxState {
  return { ...s, hidden: [...s.hidden.filter((x) => x !== id), id].slice(-MAX_HIDDEN) }
}

/** Clear all: everything up to `now`. Single hides before then no longer matter. */
export const clearAllUpdates = (now: number): InboxState => ({ clearedAt: now, hidden: [] })

export type UpdatesSort = 'newest' | 'oldest' | 'group'
export const UPDATES_SORTS: readonly UpdatesSort[] = ['newest', 'oldest', 'group']

/**
 * Updates in the chosen order, as sections: one untitled section for newest / oldest first, one
 * per group (most recently active group first, newest first inside) for By group.
 */
export function sortUpdates<T extends Pick<ActivityEntry, 'groupId' | 'createdAt'>>(
  entries: T[],
  sort: UpdatesSort,
  groupName: (id: string) => string,
): { title?: string; groupId?: string; entries: T[] }[] {
  const newest = [...entries].sort((a, b) => b.createdAt - a.createdAt)
  if (sort === 'newest') return [{ entries: newest }]
  if (sort === 'oldest') return [{ entries: newest.reverse() }]
  const byGroup = new Map<string, T[]>()
  for (const a of newest) byGroup.set(a.groupId, [...(byGroup.get(a.groupId) ?? []), a])
  return [...byGroup.entries()].map(([groupId, list]) => ({ title: groupName(groupId), groupId, entries: list }))
}

/** Older entries fetched with Show older, merged into what's live: no duplicates, newest first. */
export function mergeOlder<T extends Pick<ActivityEntry, 'id' | 'createdAt'>>(live: T[], older: T[]): T[] {
  const seen = new Set(live.map((a) => a.id))
  return [...live, ...older.filter((a) => !seen.has(a.id))].sort((a, b) => b.createdAt - a.createdAt)
}

export type ToSortOrder = 'newest' | 'oldest' | 'amount'
export const TO_SORT_ORDERS: readonly ToSortOrder[] = ['newest', 'oldest', 'amount']

/** Items to sort in the chosen order: by when they arrived, or the biggest amount first. */
export function orderToSort<T>(list: T[], order: ToSortOrder, at: (x: T) => number, amount: (x: T) => number): T[] {
  const out = [...list]
  if (order === 'amount') return out.sort((a, b) => amount(b) - amount(a) || at(b) - at(a))
  return out.sort((a, b) => (order === 'oldest' ? at(a) - at(b) : at(b) - at(a)))
}

/** The Inbox's sort choices, remembered on this device. */
const SORT_KEY = 'splitit-inbox-sort'
export function storedSorts(): { updates: UpdatesSort; toSort: ToSortOrder } {
  try {
    const v = JSON.parse(localStorage.getItem(SORT_KEY) ?? '{}') as Record<string, unknown>
    return {
      updates: UPDATES_SORTS.includes(v.updates as UpdatesSort) ? (v.updates as UpdatesSort) : 'newest',
      toSort: TO_SORT_ORDERS.includes(v.toSort as ToSortOrder) ? (v.toSort as ToSortOrder) : 'newest',
    }
  } catch {
    return { updates: 'newest', toSort: 'newest' }
  }
}
export function storeSorts(s: { updates: UpdatesSort; toSort: ToSortOrder }) {
  try {
    localStorage.setItem(SORT_KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable: it still applies for this visit */
  }
}
