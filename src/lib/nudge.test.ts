import { beforeEach, describe, expect, it } from 'vitest'
import type { ActivityEntry } from '@/types'
import { NUDGE_COOLDOWN_MS, lastNudgeAt, localNudgeAt, nudgeResultText, nudgedRecently, rememberNudge, setNudgeStorage } from './nudge'

const entry = (over: Partial<ActivityEntry>): ActivityEntry => ({
  id: 'a',
  groupId: 'g',
  type: 'settlement.nudged',
  actorUid: 'me',
  actorName: 'Priya',
  targetId: 'm_rahul',
  summary: 'Priya nudged Rahul',
  createdAt: 1000,
  ...over,
})

describe('last nudge from the feed', () => {
  it('finds the newest nudge by this user to this member', () => {
    const feed = [
      entry({ createdAt: 500 }),
      entry({ createdAt: 900 }),
      entry({ createdAt: 2000, actorUid: 'someone' }),
      entry({ createdAt: 3000, targetId: 'm_x' }),
    ]
    expect(lastNudgeAt(feed, 'me', 'm_rahul')).toBe(900)
    expect(lastNudgeAt(feed, 'me', 'm_none')).toBeUndefined()
    expect(lastNudgeAt(null, 'me', 'm_rahul')).toBeUndefined()
  })
  it('ignores other entry types', () => {
    expect(lastNudgeAt([entry({ type: 'settlement.created' })], 'me', 'm_rahul')).toBeUndefined()
  })
  it('cooldown is 24 hours', () => {
    expect(nudgedRecently(1000, 1000 + NUDGE_COOLDOWN_MS - 1)).toBe(true)
    expect(nudgedRecently(1000, 1000 + NUDGE_COOLDOWN_MS)).toBe(false)
    expect(nudgedRecently(undefined, 5)).toBe(false)
  })
})

describe('per-device memory', () => {
  const mem = new Map<string, string>()
  beforeEach(() => {
    mem.clear()
    setNudgeStorage({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) })
  })
  it('remembers within the cooldown and forgets stale entries', () => {
    rememberNudge('g', 'm', 1000)
    expect(localNudgeAt('g', 'm', 2000)).toBe(1000)
    expect(localNudgeAt('g', 'other', 2000)).toBeUndefined()
    expect(localNudgeAt('g', 'm', 1000 + NUDGE_COOLDOWN_MS)).toBeUndefined()
    rememberNudge('g', 'x', 1000 + NUDGE_COOLDOWN_MS)
    expect(JSON.parse(mem.get('splitit-nudged')!)).toEqual({ 'g/x': 1000 + NUDGE_COOLDOWN_MS })
  })
  it('survives a missing store', () => {
    setNudgeStorage(undefined)
    rememberNudge('g', 'm')
    expect(localNudgeAt('g', 'm')).toBeUndefined()
  })
})

describe('result copy', () => {
  const money = (c: number) => `₹${c / 100}`
  it('reads plainly for every outcome', () => {
    expect(nudgeResultText({ sent: true, amount: 124000 }, 'Rahul', money)).toBe('Nudged Rahul: you owe ₹1240')
    expect(nudgeResultText({ sent: false, reason: 'rate_limited' }, 'Rahul', money)).toContain('again tomorrow')
    expect(nudgeResultText({ sent: false, reason: 'no_push' }, 'Rahul', money)).toContain('Share a reminder')
    expect(nudgeResultText({ sent: false, reason: 'not_owed' }, 'Rahul', money)).toContain('doesn’t owe you')
    expect(nudgeResultText({ sent: false, reason: 'not_member' }, 'Rahul', money)).toContain('hasn’t joined')
    expect(nudgeResultText({ sent: false, reason: 'unavailable' }, 'Rahul', money)).toContain('Couldn’t send')
  })
})
