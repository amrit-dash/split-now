import { useMemo, useSyncExternalStore } from 'react'
import { useMe } from './auth'
import { usePendingCaptures, useRecentActivity, type GroupData } from './data'
import { awaitingMyApproval } from '@/lib/trust'
import { inboxSeenAt, onInboxSeen, othersActivity } from '@/lib/inbox'

/**
 * Everything the Inbox holds: captured payments to sort, expenses waiting for your OK, and what
 * other people did in your groups (unread = since this device last opened Updates).
 */
export function useInbox(data: GroupData[] | null) {
  const { user } = useMe()
  const captures = usePendingCaptures()
  const ids = useMemo(() => (data ? data.filter((d) => d.group.type !== 'personal').map((d) => d.group.id) : null), [data])
  // The same per-group feeds a group's Activity tab reads (one listener each, shared).
  const feed = useRecentActivity(ids)
  const seenAt = useSyncExternalStore(onInboxSeen, inboxSeenAt)
  return useMemo(() => {
    const approvals = (data ?? []).flatMap((d) => d.pending.filter((e) => awaitingMyApproval(e, d.group, user.uid)).map((e) => ({ e, d })))
    const updates = othersActivity(feed, user.uid)
    const unread = updates.filter((a) => a.createdAt > seenAt).length
    const toSort = (captures?.length ?? 0) + approvals.length
    return { loading: !captures || !data, captures: captures ?? [], approvals, feed, updates, unread, seenAt, toSort, count: toSort + unread }
  }, [data, captures, feed, seenAt, user.uid])
}
