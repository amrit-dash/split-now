import { describe, expect, it } from 'vitest'
import type { ActivityEntry, ActivityType } from '@/types'
import { activityHref, activityText } from './activity'
import {
  canMarkAllRead,
  clearAllUpdates,
  collapseRuns,
  hideUpdate,
  isUnread,
  MAX_HIDDEN,
  mergeOlder,
  orderToSort,
  othersActivity,
  parseInboxState,
  RUN_GAP_MS,
  sortUpdates,
  unreadCount,
  visibleUpdates,
} from './inbox'

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

describe('clearing Updates (hidden for you, never deleted)', () => {
  const e = (id: string, createdAt: number, groupId = 'g1') => ({ id, createdAt, groupId })
  const list = [e('a', 30), e('b', 20), e('c', 10)]
  it('✕ hides one row; Clear all hides everything up to then, but not what comes after', () => {
    const one = hideUpdate(parseInboxState(null), 'b')
    expect(visibleUpdates(list, one).map((x) => x.id)).toEqual(['a', 'c'])
    const all = clearAllUpdates(25)
    expect(visibleUpdates(list, all).map((x) => x.id)).toEqual(['a'])
  })
  it('keeps at most MAX_HIDDEN single hides, and reads only what it stored', () => {
    let s = parseInboxState({})
    for (let i = 0; i < MAX_HIDDEN + 5; i++) s = hideUpdate(s, `x${i}`)
    expect(s.hidden).toHaveLength(MAX_HIDDEN)
    expect(s.hidden.at(-1)).toBe(`x${MAX_HIDDEN + 4}`)
    expect(parseInboxState({ clearedAt: 'soon', hidden: ['a', 3] })).toEqual({ clearedAt: 0, hidden: ['a'] })
  })
})

describe('sorting the Inbox', () => {
  const e = (id: string, createdAt: number, groupId: string) => ({ id, createdAt, groupId })
  const list = [e('a', 10, 'g1'), e('b', 30, 'g2'), e('c', 20, 'g1')]
  it('Updates newest, oldest or by group (most recently active group first)', () => {
    expect(sortUpdates(list, 'newest', String)[0].entries.map((x) => x.id)).toEqual(['b', 'c', 'a'])
    expect(sortUpdates(list, 'oldest', String)[0].entries.map((x) => x.id)).toEqual(['a', 'c', 'b'])
    const groups = sortUpdates(list, 'group', (id) => `Group ${id}`)
    expect(groups.map((g) => g.title)).toEqual(['Group g2', 'Group g1'])
    expect(groups[1].entries.map((x) => x.id)).toEqual(['c', 'a'])
  })
  it('Show older merges without duplicates, newest first', () => {
    expect(mergeOlder([e('a', 30, 'g'), e('b', 20, 'g')], [e('b', 20, 'g'), e('c', 5, 'g')]).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })
  it('To sort by when it arrived or the biggest amount first', () => {
    const items = [
      { at: 1, amt: 500 },
      { at: 3, amt: 100 },
      { at: 2, amt: 900 },
    ]
    const by = (o: 'newest' | 'oldest' | 'amount') =>
      orderToSort(
        items,
        o,
        (x) => x.at,
        (x) => x.amt,
      ).map((x) => x.at)
    expect(by('newest')).toEqual([3, 2, 1])
    expect(by('oldest')).toEqual([1, 2, 3])
    expect(by('amount')).toEqual([2, 1, 3])
  })
})

describe('canMarkAllRead', () => {
  const e = (actorUid: string, createdAt: number) => ({ id: `${actorUid}${createdAt}`, actorUid, createdAt }) as ActivityEntry
  it('shows while someone else has an entry newer than the last read', () => {
    expect(canMarkAllRead([e('bob', 200)], 'me', 100, 100)).toBe(true)
  })
  it('keeps showing while this visit still shows dots, even after Updates marked them read', () => {
    expect(canMarkAllRead([e('bob', 200)], 'me', 300, 100)).toBe(true)
  })
  it('hides when nothing is new, your own entries never count, and a missing list is nothing', () => {
    expect(canMarkAllRead([e('bob', 50), e('me', 500)], 'me', 100, 100)).toBe(false)
    expect(canMarkAllRead(null, 'me', 0, 0)).toBe(false)
  })
})
