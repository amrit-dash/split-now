import { describe, expect, it } from 'vitest'
import type { ActivityEntry } from '@/types'
import { othersActivity, unreadCount } from './inbox'

const a = (actorUid: string, createdAt: number) =>
  ({
    id: `${actorUid}${createdAt}`,
    groupId: 'g',
    type: 'expense.created',
    actorUid,
    actorName: actorUid,
    targetId: 't',
    summary: '',
    createdAt,
  }) as ActivityEntry

describe('inbox updates', () => {
  it('counts only other people’s entries newer than the last visit', () => {
    const feed = [a('me', 50), a('priya', 40), a('rohan', 20), a('priya', 5)]
    expect(othersActivity(feed, 'me')).toHaveLength(3)
    expect(unreadCount(feed, 'me', 10)).toBe(2)
    expect(unreadCount(null, 'me', 0)).toBe(0)
  })
})
