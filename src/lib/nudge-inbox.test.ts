import { beforeEach, describe, expect, it } from 'vitest'
import type { ActivityEntry } from '@/types'
import {
  NUDGE_CARD_MAX_AGE_MS,
  dismissNudges,
  dismissedNudges,
  nudgeCardText,
  nudgeCards,
  restoreNudges,
  setDismissStorage,
  type NudgeGroupInfo,
} from './nudge-inbox'
import type { SettleRow } from './settleAll'

const NOW = 10 * 86_400_000

const nudged = (over: Partial<ActivityEntry>): ActivityEntry => ({
  id: 'a1',
  groupId: 'goa',
  type: 'settlement.nudged',
  actorUid: 'u_priya',
  actorName: 'Priya Nair',
  targetId: 'm_me',
  summary: 'Priya nudged Asha',
  after: { amount: 124000, memberId: 'm_me' },
  createdAt: NOW - 3_600_000,
  ...over,
})

const owe = (over: Partial<SettleRow>): SettleRow => ({
  key: 'k',
  groupId: 'goa',
  groupName: 'Goa trip',
  groupEmoji: '🏖️',
  currency: 'INR',
  me: 'm_me',
  memberId: 'm_priya',
  name: 'Priya Nair',
  color: '#000',
  uid: 'u_priya',
  amount: 124000,
  dir: 'owe',
  href: '/groups/goa/settle?from=m_me&to=m_priya&amount=124000',
  ...over,
})

const groups: Record<string, NudgeGroupInfo> = {
  goa: { name: 'Goa trip', emoji: '🏖️', currency: 'INR', me: 'm_me' },
  flat: { name: 'Flat', emoji: '🏠', currency: 'INR', me: 'f_me' },
  nyc: { name: 'NYC', emoji: '🗽', currency: 'USD', me: 'n_me' },
}
const base = { groups, myUid: 'u_me', dismissed: new Set<string>(), now: NOW }

describe('reminder cards for the person who owes', () => {
  it('shows a nudge addressed to me while I still owe, with the prefilled settle link', () => {
    const [c, ...rest] = nudgeCards({ ...base, feed: [nudged({})], rows: [owe({})] })
    expect(rest).toEqual([])
    expect(c).toMatchObject({ senderUid: 'u_priya', senderName: 'Priya Nair', total: 124000, currency: 'INR', href: owe({}).href, ids: ['a1'] })
    expect(nudgeCardText(c)).toEqual({ name: 'Priya', title: 'Priya reminded you', line: 'You owe ₹1,240.00 in Goa trip' })
  })

  it('uses what I owe now, and drops the card once paid', () => {
    expect(nudgeCards({ ...base, feed: [nudged({})], rows: [owe({ amount: 50000 })] })[0].total).toBe(50000)
    expect(nudgeCards({ ...base, feed: [nudged({})], rows: [] })).toEqual([])
    // a row where they owe me is not a debt of mine
    expect(nudgeCards({ ...base, feed: [nudged({})], rows: [owe({ dir: 'owed' })] })).toEqual([])
  })

  it('with simplified debts paying someone else: what I owe there, at most the nudge, via the group settle screen', () => {
    const rows = [owe({ memberId: 'm_rohan', uid: 'u_rohan', amount: 300000 })]
    const [c] = nudgeCards({ ...base, feed: [nudged({})], rows })
    expect(c.total).toBe(124000)
    expect(c.href).toBe('/groups/goa/settle')
  })

  it('ignores my own nudges, other people’s, other types, old and dismissed ones', () => {
    const rows = [owe({})]
    const none = (feed: ActivityEntry[], over = {}) => expect(nudgeCards({ ...base, ...over, feed, rows })).toEqual([])
    none([nudged({ actorUid: 'u_me' })])
    none([nudged({ targetId: 'm_someone' })])
    none([nudged({ type: 'settlement.created' })])
    none([nudged({ createdAt: NOW - NUDGE_CARD_MAX_AGE_MS })])
    none([nudged({ groupId: 'unknown' })])
    none([nudged({})], { dismissed: new Set(['a1']) })
    none([nudged({})], { groups: { goa: { ...groups.goa, me: undefined } } })
  })

  it('collapses one sender into one card: across groups, with the cross-group settle link', () => {
    const feed = [
      nudged({ id: 'a1', createdAt: NOW - 5000 }),
      nudged({ id: 'a0', createdAt: NOW - 90_000_000 }),
      nudged({ id: 'a2', groupId: 'flat', targetId: 'f_me', createdAt: NOW - 1000 }),
    ]
    const rows = [owe({}), owe({ groupId: 'flat', groupName: 'Flat', me: 'f_me', memberId: 'f_priya', amount: 200000 })]
    const [c, ...rest] = nudgeCards({ ...base, feed, rows })
    expect(rest).toEqual([])
    expect(c.total).toBe(324000)
    expect(c.groups.map((g) => g.groupName)).toEqual(['Flat', 'Goa trip'])
    expect(c.href).toBe('/settle/with/u%3Au_priya%7CINR')
    expect(new Set(c.ids)).toEqual(new Set(['a0', 'a1', 'a2']))
    expect(c.at).toBe(NOW - 1000)
    expect(nudgeCardText(c).line).toBe('You owe ₹3,240.00 across Flat and Goa trip')
    // one of them paid to someone else: back to the Balances screen
    const mixed = nudgeCards({ ...base, feed, rows: [owe({}), owe({ groupId: 'flat', me: 'f_me', memberId: 'x', uid: 'u_x', amount: 100 })] })
    expect(mixed[0].href).toBe('/settle')
  })

  it('one card per sender and currency, newest first', () => {
    const feed = [
      nudged({ id: 'a1', createdAt: NOW - 5000 }),
      nudged({ id: 'b1', actorUid: 'u_rohan', actorName: 'Rohan', createdAt: NOW - 1000 }),
      nudged({ id: 'c1', groupId: 'nyc', targetId: 'n_me', createdAt: NOW - 9000 }),
    ]
    const rows = [owe({}), owe({ memberId: 'm_rohan', uid: 'u_rohan', amount: 700 }), owe({ groupId: 'nyc', me: 'n_me', currency: 'USD', amount: 4000 })]
    const cards = nudgeCards({ ...base, feed, rows })
    expect(cards.map((c) => c.key)).toEqual(['u_rohan|INR', 'u_priya|INR', 'u_priya|USD'])
    expect(cards.map((c) => c.total)).toEqual([700, 124000, 4000])
  })
})

describe('dismissed on this device', () => {
  const mem = new Map<string, string>()
  beforeEach(() => {
    mem.clear()
    setDismissStorage({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) })
  })
  it('remembers, undoes, and forgets entries older than a card lives', () => {
    dismissNudges(['a1', 'a2'], 1000)
    expect([...dismissedNudges()].sort()).toEqual(['a1', 'a2'])
    restoreNudges(['a2'])
    expect([...dismissedNudges()]).toEqual(['a1'])
    dismissNudges(['b1'], 1000 + NUDGE_CARD_MAX_AGE_MS)
    expect(JSON.parse(mem.get('splitit-nudges-dismissed')!)).toEqual({ b1: 1000 + NUDGE_CARD_MAX_AGE_MS })
  })
  it('the set is stable between changes (useSyncExternalStore)', () => {
    expect(dismissedNudges()).toBe(dismissedNudges())
  })
  it('still hides a card for this visit when storage is blocked', () => {
    setDismissStorage(undefined)
    dismissNudges(['x'])
    expect(dismissedNudges().has('x')).toBe(true)
  })
})
