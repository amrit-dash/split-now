import { describe, expect, it } from 'vitest'
import { applyRateLimit } from './ratelimit'
import { DAY_MS, NUDGE_LIMIT, nextNudgeAt, nudgeAmount, nudgeSummary } from './nudge-core'
import { nudgeNote } from './notify-text'

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
