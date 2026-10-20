import { beforeEach, describe, expect, it } from 'vitest'
import { markSeen, readSeen, unreadCount, unreadLabel } from './recent-unread'

const mem = new Map<string, string>()
beforeEach(() => {
  mem.clear()
  globalThis.localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
  } as unknown as Storage
})

describe('Recent activity: what is new', () => {
  const items = [
    { createdAt: 100, actorUid: 'rahul' },
    { createdAt: 200, actorUid: 'me' },
    { createdAt: 300, actorUid: 'priya' },
    { createdAt: 50, actorUid: 'priya' },
  ]
  it('counts what others did after the last look; nothing on a first visit', () => {
    expect(unreadCount(items, 90, 'me')).toBe(2)
    expect(unreadCount(items, 300, 'me')).toBe(0)
    expect(unreadCount(items, null, 'me')).toBe(0)
    // an expense row has no actor: it counts by time alone
    expect(unreadCount([{ createdAt: 500 }], 400, 'me')).toBe(1)
  })
  it('caps the pill', () => {
    expect(unreadLabel(3)).toBe('3')
    expect(unreadLabel(12)).toBe('9+')
  })
  it('a first visit stores now; opening marks everything read', () => {
    expect(readSeen('u1', 1000)).toBeNull()
    expect(readSeen('u1', 2000)).toBe(1000)
    markSeen('u1', 3000)
    expect(readSeen('u1')).toBe(3000)
    expect(readSeen('u2', 10)).toBeNull()
  })
})
