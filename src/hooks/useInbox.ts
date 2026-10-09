import { useMemo, useSyncExternalStore } from 'react'
import { useMe } from './auth'
import { usePendingCaptures, useRecentActivity, type GroupData } from './data'
import { awaitingMyApproval } from '@/lib/trust'
import { collapseRuns, inboxSeenAt, onInboxSeen, unreadCount } from '@/lib/inbox'

/**
 * Everything the Inbox holds: captured payments to sort, expenses waiting for your OK, and the
 * activity log of your groups (`updates`, your own actions included). `unread` counts only what
 * other people did since this device last opened Updates; your own actions never count.
 */
export function useInbox(data: GroupData[] | null) {
  const { user } = useMe()
  const captures = usePendingCaptures()
  const ids = useMemo(() => (data ? data.filter((d) => d.group.type !== 'personal').map((d) => d.group.id) : null), [data])
  // The same per-group feeds a group's Activity tab reads (one listener each, shared).
  const raw = useRecentActivity(ids)
  const seenAt = useSyncExternalStore(onInboxSeen, inboxSeenAt)
  return useMemo(() => {
    const approvals = (data ?? []).flatMap((d) => d.pending.filter((e) => awaitingMyApproval(e, d.group, user.uid)).map((e) => ({ e, d })))
    // One row per import / burst of adds, so a big import is one update (and at most one unread).
    const feed = collapseRuns(raw)
    const updates = feed
    const unread = unreadCount(updates, user.uid, seenAt)
    const toSort = (captures?.length ?? 0) + approvals.length
    return { loading: !captures || !data, captures: captures ?? [], approvals, feed, updates, unread, seenAt, toSort, count: toSort + unread }
  }, [data, captures, raw, seenAt, user.uid])
}
