import { useMemo, useSyncExternalStore } from 'react'
import { useMe } from './auth'
import { useClaimedPayLinks, useMergeApprovals, usePendingCaptures, useRecentActivity, type GroupData } from './data'
import { awaitingMyApproval, paymentsToConfirm } from '@/lib/trust'
import { collapseRuns, inboxSeenAt, onInboxSeen, unreadCount, visibleUpdates } from '@/lib/inbox'
import { tuning } from '../../shared/app-tuning'
import { useInboxState } from './useInboxState'
import { dismissedNudges, nudgeCards, onNudgesDismissed, type NudgeGroupInfo } from '@/lib/nudge-inbox'
import { pendingSettlements } from '@/lib/settleAll'

/**
 * Everything the Inbox holds: captured payments to sort, expenses waiting for your OK, payments to
 * you waiting for your OK (or cleared by their screenshot this week, to check), live table
 * guests who say they've paid you (Pay me links waiting for you to confirm, any group or none), and the
 * activity log of your groups (`updates`, your own actions included), and `nudges`: reminders
 * from people you owe that this device hasn't dismissed (shown on Home and at the top of "To sort",
 * counted with it), and `merges`: two people in a group you created that someone asked to merge. `unread` counts only what other people did since this device last opened
 * Updates; your own actions never count.
 */
export function useInbox(data: GroupData[] | null) {
  const { user } = useMe()
  const captures = usePendingCaptures()
  const claims = useClaimedPayLinks()
  // Merges in groups I created that wait for my OK (only where I'm still in the group).
  const mergeAsks = useMergeApprovals()
  // Not archived or deleted groups (useGroups already leaves deleted ones out): nothing to hear from them.
  const ids = useMemo(() => (data ? data.filter((d) => d.group.type !== 'personal' && !d.group.archived).map((d) => d.group.id) : null), [data])
  // A small live window per group (config/app tuning.activityWindow, 15 by default): this runs on
  // every screen for the badge, so it stays cheap; Inbox → Show older reads further back.
  const raw = useRecentActivity(ids, tuning().activityWindow)
  const cleared = useInboxState()
  const seenAt = useSyncExternalStore(onInboxSeen, inboxSeenAt)
  const dismissed = useSyncExternalStore(onNudgesDismissed, dismissedNudges)
  return useMemo(() => {
    const approvals = (data ?? []).flatMap((d) => d.pending.filter((e) => awaitingMyApproval(e, d.group, user.uid)).map((e) => ({ e, d })))
    // Payments need the recipient's OK: payments to me waiting for it, and ones a screenshot cleared.
    const payments = paymentsToConfirm(data ?? [], user.uid, Date.now())
    // One row per import / burst of adds, so a big import is one update (and at most one unread).
    const feed = collapseRuns(raw)
    // What this person cleared (Clear all, ✕) stays hidden, on every device; it never counts as new.
    const updates = visibleUpdates(feed, cleared)
    const unread = unreadCount(updates, user.uid, seenAt)
    const groups: Record<string, NudgeGroupInfo> = {}
    for (const d of data ?? []) groups[d.group.id] = { name: d.group.name, emoji: d.group.emoji, currency: d.group.currency, me: d.me }
    const nudges = data ? nudgeCards({ feed: raw, rows: pendingSettlements(data), groups, myUid: user.uid, dismissed, now: Date.now() }) : []
    const merges = (mergeAsks ?? []).flatMap((r) => {
      const d = data?.find((x) => x.group.id === r.groupId)
      return d ? [{ r, d }] : []
    })
    const toSort = (captures?.length ?? 0) + approvals.length + payments.length + (claims?.length ?? 0) + nudges.length + merges.length
    return {
      loading: !captures || !data,
      captures: captures ?? [],
      approvals,
      payments,
      claims: claims ?? [],
      merges,
      nudges,
      feed,
      updates,
      ids,
      unread,
      seenAt,
      toSort,
      count: toSort + unread,
    }
  }, [data, ids, captures, claims, mergeAsks, raw, seenAt, dismissed, cleared, user.uid])
}
