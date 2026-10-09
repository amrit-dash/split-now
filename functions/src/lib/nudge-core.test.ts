import { describe, expect, it } from 'vitest'
import { applyRateLimit } from './ratelimit'
import {
  DAY_MS,
  NUDGE_LIMIT,
  NUDGE_MAX_ITEMS,
  crossGroupPlan,
  nextNudgeAt,
  nudgeAmount,
  nudgeSummary,
  parseNudgeRequest,
  settleWithPath,
  type GroupNudge,
} from './nudge-core'
import { groupList, nudgeAcrossNote, nudgeNote } from './notify-text'

describe('nudge amount', () => {
  // a is owed 1500, b owes 1000, c owes 500
  const net = { a: 1500, b: -1000, c: -500 }
  it('is what the debtor owes, capped by what the sender is owed', () => {
    expect(nudgeAmount(net, 'a', 'b')).toBe(1000)
    expect(nudgeAmount(net, 'a', 'c')).toBe(500)
    expect(nudgeAmount({ a: 300, b: -1000, d: 700 }, 'a', 'b')).toBe(300)
  })
  it('clamps the figure the app shows, and ignores junk', () => {
    expect(nudgeAmount(net, 'a', 'b', 400)).toBe(400)
    expect(nudgeAmount(net, 'a', 'b', 5000)).toBe(1000)
    expect(nudgeAmount(net, 'a', 'b', -5)).toBe(1000)
    expect(nudgeAmount(net, 'a', 'b', 12.5)).toBe(1000)
    expect(nudgeAmount(net, 'a', 'b', 'lots')).toBe(1000)
  })
  it('is 0 when nothing is owed in that direction', () => {
    expect(nudgeAmount(net, 'b', 'a')).toBe(0)
    expect(nudgeAmount(net, 'b', 'c')).toBe(0)
    expect(nudgeAmount({}, 'a', 'b')).toBe(0)
  })
})

describe('nudge text', () => {
  it('summary and push copy carry the names, amount and the prefilled settle link', () => {
    expect(nudgeSummary('Priya', 'Rahul', 124000, 'INR')).toBe('Priya nudged Rahul to settle up (₹1,240)')
    const n = nudgeNote({
      groupId: 'g',
      groupName: 'Goa trip',
      emoji: '🏖️',
      fromName: 'Priya',
      owed: 124000,
      currency: 'INR',
      debtorMemberId: 'm_r',
      senderMemberId: 'm_p',
    })
    expect(n).toEqual({
      title: '🏖️ Goa trip',
      body: 'Priya reminded you: you owe ₹1,240 in Goa trip. Pay in one tap.',
      url: '/groups/g/settle?from=m_r&to=m_p&amount=124000',
      tag: 'nudge-g-m_p',
    })
  })
})

describe('one nudge per day per pair', () => {
  it('the second attempt in a day is refused, the next day allowed', () => {
    const first = applyRateLimit(undefined, 0, NUDGE_LIMIT)
    expect(first.allowed).toBe(true)
    expect(applyRateLimit(first.next, 60_000, NUDGE_LIMIT).allowed).toBe(false)
    expect(applyRateLimit(first.next, 2 * 3_600_000, NUDGE_LIMIT).allowed).toBe(false)
    expect(applyRateLimit(first.next, DAY_MS, NUDGE_LIMIT).allowed).toBe(true)
    expect(nextNudgeAt(first.next.dayStart, 60_000)).toBe(DAY_MS)
    expect(nextNudgeAt(undefined, 5)).toBe(5 + DAY_MS)
  })
})

describe('nudge request', () => {
  it('accepts the single-group call as before', () => {
    expect(parseNudgeRequest({ groupId: 'g1', memberId: 'm_r', amount: 500 })).toEqual({
      items: [{ groupId: 'g1', memberId: 'm_r', amount: 500 }],
      multi: false,
    })
    expect(parseNudgeRequest({ groupId: 'g1', memberId: 'm_r', amount: 'x' })).toEqual({ items: [{ groupId: 'g1', memberId: 'm_r' }], multi: false })
  })
  it('accepts a list of groups, dropping repeats of a group', () => {
    const r = parseNudgeRequest({
      items: [
        { groupId: 'g1', memberId: 'a', amount: 100 },
        { groupId: 'g2', memberId: 'b' },
        { groupId: 'g1', memberId: 'c' },
      ],
    })
    expect(r).toEqual({
      items: [
        { groupId: 'g1', memberId: 'a', amount: 100 },
        { groupId: 'g2', memberId: 'b' },
      ],
      multi: true,
    })
    // one group left: behaves like the old call
    expect(parseNudgeRequest({ items: [{ groupId: 'g1', memberId: 'a' }] })?.multi).toBe(false)
  })
  it('refuses junk, empty and oversized lists', () => {
    expect(parseNudgeRequest(null)).toBeNull()
    expect(parseNudgeRequest({ groupId: 'g/1', memberId: 'a' })).toBeNull()
    expect(parseNudgeRequest({ items: [] })).toBeNull()
    expect(parseNudgeRequest({ items: 'g1' })).toBeNull()
    expect(parseNudgeRequest({ items: [{ groupId: 'g1' }] })).toBeNull()
    const many = Array.from({ length: NUDGE_MAX_ITEMS + 1 }, (_, i) => ({ groupId: `g${i}`, memberId: 'a' }))
    expect(parseNudgeRequest({ items: many })).toBeNull()
    expect(parseNudgeRequest({ items: many.slice(0, NUDGE_MAX_ITEMS) })?.items).toHaveLength(NUDGE_MAX_ITEMS)
  })
})

describe('cross-group nudge', () => {
  const part = (over: Partial<GroupNudge>): GroupNudge => ({
    groupId: 'g',
    groupName: 'Goa trip',
    currency: 'INR',
    memberId: 'm_r',
    senderMemberId: 'm_p',
    owed: 0,
    owes: 0,
    ...over,
  })
  it('adds up what is owed across groups', () => {
    const plan = crossGroupPlan([part({ groupId: 'g1', owed: 200000 }), part({ groupId: 'g2', groupName: 'Flat', owed: 124000 })])
    expect(plan?.total).toBe(324000)
    expect(plan?.owed.map((p) => p.groupId)).toEqual(['g1', 'g2'])
  })
  it('nets out groups where the sender owes them, and skips other currencies and empty groups', () => {
    const plan = crossGroupPlan([
      part({ groupId: 'g0' }),
      part({ groupId: 'g1', owed: 300000 }),
      part({ groupId: 'g2', owes: 100000 }),
      part({ groupId: 'g3', owed: 5000, currency: 'USD' }),
    ])
    expect(plan).toEqual({ currency: 'INR', total: 200000, owed: [part({ groupId: 'g1', owed: 300000 })] })
  })
  it('is null when nothing is owed overall', () => {
    expect(crossGroupPlan([])).toBeNull()
    expect(crossGroupPlan([part({ owes: 100 })])).toBeNull()
    expect(crossGroupPlan([part({ groupId: 'g1', owed: 100 }), part({ groupId: 'g2', owes: 100 })])).toBeNull()
  })
  it('one push with the total, opening the cross-group Settle up', () => {
    expect(settleWithPath('uid_p', 'INR')).toBe('/settle/with/u%3Auid_p%7CINR')
    expect(
      nudgeAcrossNote({
        fromName: 'Priya',
        total: 324000,
        currency: 'INR',
        groupNames: ['Goa trip', 'Flat'],
        url: settleWithPath('uid_p', 'INR'),
        senderUid: 'uid_p',
      }),
    ).toEqual({
      title: 'Settle up',
      body: 'Priya reminded you: you owe ₹3,240 across Goa trip and Flat. Pay in one tap.',
      url: '/settle/with/u%3Auid_p%7CINR',
      tag: 'nudge-p-uid_p',
    })
  })
  it('names up to three groups', () => {
    expect(groupList(['A'])).toBe('A')
    expect(groupList(['A', 'B', 'C'])).toBe('A, B and C')
    expect(groupList(['A', 'B', 'C', 'D'])).toBe('A, B, C and 1 more group')
    expect(groupList(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C and 2 more groups')
  })
})
