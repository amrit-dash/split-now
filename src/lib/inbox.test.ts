import { describe, expect, it } from 'vitest'
import type { ActivityEntry, ActivityType } from '@/types'
import { activityHref, activityText } from './activity'
import { collapseRuns, isUnread, othersActivity, RUN_GAP_MS, unreadCount } from './inbox'

const a = (actorUid: string, createdAt: number, type: ActivityType = 'expense.created', groupId = 'g') =>
  ({
    id: `${actorUid}${createdAt}`,
    groupId,
    type,
    actorUid,
    actorName: actorUid,
    targetId: `e${createdAt}`,
    summary: `${actorUid} added “x${createdAt}”`,
    createdAt,
  }) as ActivityEntry

describe('inbox updates', () => {
  it('counts only other people’s entries newer than the last visit', () => {
    const feed = [a('me', 50), a('priya', 40, 'expense.updated'), a('rohan', 20, 'settlement.created'), a('priya', 5, 'expense.updated')]
    expect(othersActivity(feed, 'me')).toHaveLength(3)
    expect(unreadCount(feed, 'me', 10)).toBe(2)
    expect(unreadCount(null, 'me', 0)).toBe(0)
  })
  it('own actions are never new, however recent', () => {
    expect(isUnread(a('me', 100), 'me', 0)).toBe(false)
    expect(isUnread(a('priya', 100), 'me', 0)).toBe(true)
    expect(isUnread(a('priya', 100), 'me', 100)).toBe(false)
    const mine = [a('me', 300, 'expense.imported'), a('me', 200, 'member.added'), a('me', 100)]
    expect(unreadCount(mine, 'me', 0)).toBe(0)
  })
})

describe('collapseRuns', () => {
  it('folds a burst of adds by one person in one group into one row that opens the group', () => {
    const burst = Array.from({ length: 12 }, (_, i) => a('priya', 1000 - i))
    const out = collapseRuns([a('me', 2000, 'expense.updated'), ...burst, a('priya', 10, 'expense.updated')])
    expect(out).toHaveLength(3)
    const row = out[1]
    expect(row.type).toBe('expense.imported')
    expect(row.summary).toBe('priya added 12 expenses')
    expect(row.createdAt).toBe(1000)
    expect(activityHref(row)).toBe('/groups/g')
    expect(activityText({ ...row, actorUid: 'me', actorName: 'priya' }, 'me')).toBe('You added 12 expenses')
    // a burst by someone else counts as one unread, not twelve
    expect(unreadCount(out, 'me', 0)).toBe(2)
  })
  it('keeps short runs, other people, other groups and long gaps apart', () => {
    expect(collapseRuns([a('p', 30), a('p', 20)])).toHaveLength(2)
    expect(collapseRuns([a('p', 30), a('q', 20), a('p', 10)])).toHaveLength(3)
    expect(collapseRuns([a('p', 30, 'expense.created', 'g1'), a('p', 20, 'expense.created', 'g2'), a('p', 10, 'expense.created', 'g1')])).toHaveLength(3)
    const gap = RUN_GAP_MS + 1
    expect(collapseRuns([a('p', 3 * gap), a('p', 2 * gap), a('p', gap)])).toHaveLength(3)
    expect(collapseRuns(null)).toEqual([])
  })
  it('an import summary stays one entry and links to its group', () => {
    const imp = { ...a('me', 5, 'expense.imported'), targetId: 'g' }
    expect(collapseRuns([imp])).toEqual([imp])
    expect(activityHref(imp)).toBe('/groups/g')
  })
})
