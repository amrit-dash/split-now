import { describe, expect, it } from 'vitest'
import {
  EARN_PRO_PATH,
  badgeLabel,
  badgeTapTarget,
  badgeWord,
  devShown,
  friendBadge,
  hasEarnedPro,
  memberBadge,
  memberPro,
  proShown,
  proTapTarget,
  withProAwarded,
} from './pro'

describe('hasEarnedPro / proShown', () => {
  it('earned means a real date', () => {
    expect(hasEarnedPro(undefined)).toBe(false)
    expect(hasEarnedPro({})).toBe(false)
    expect(hasEarnedPro({ proAt: 0 })).toBe(false)
    expect(hasEarnedPro({ proAt: Number.NaN })).toBe(false)
    expect(hasEarnedPro({ proAt: '1' as unknown as number })).toBe(false)
    expect(hasEarnedPro({ proAt: 1_700_000_000_000 })).toBe(true)
  })
  it('shown unless turned off; turning it off keeps the date', () => {
    expect(proShown({ proAt: 5 })).toBe(true)
    expect(proShown({ proAt: 5, proHidden: false })).toBe(true)
    expect(proShown({ proAt: 5, proHidden: true })).toBe(false)
    expect(hasEarnedPro({ proAt: 5, proHidden: true })).toBe(true)
    expect(proShown({ proHidden: false })).toBe(false)
  })
})

describe('memberPro', () => {
  it('only true counts', () => {
    expect(memberPro({ pro: true })).toBe(true)
    expect(memberPro({ pro: 'true' })).toBe(false)
    expect(memberPro({ pro: false })).toBe(false)
    expect(memberPro({})).toBe(false)
    expect(memberPro(undefined)).toBe(false)
  })
})

describe('withProAwarded', () => {
  it('sets the date once', () => {
    const p = { uid: 'u', proHidden: true }
    expect(withProAwarded(p, 42)).toEqual({ uid: 'u', proHidden: true, proAt: 42 })
    expect(withProAwarded({ uid: 'u', proAt: 7 }, 42)).toBeNull()
  })
})

describe('tapping a mark', () => {
  it('opens Help → Earn Pro only for someone who has not earned it', () => {
    expect(proTapTarget(false)).toBe(EARN_PRO_PATH)
    expect(EARN_PRO_PATH).toBe('/help/earn-pro')
    expect(proTapTarget(true)).toBeNull()
    expect(badgeLabel('pro', true)).toBe('Pro. How to earn it')
    expect(badgeLabel('pro', false)).toBe('Pro')
  })
  it('DEV and PRO DEV are never links', () => {
    expect(badgeTapTarget('pro', false)).toBe(EARN_PRO_PATH)
    expect(badgeTapTarget('pro', true)).toBeNull()
    expect(badgeTapTarget('dev', false)).toBeNull()
    expect(badgeTapTarget('prodev', false)).toBeNull()
    expect(badgeLabel('dev', false)).toBe('Dev')
    expect(badgeLabel('prodev', false)).toBe('Pro, Dev')
  })
})

describe('badgeWord', () => {
  it('(proAt, proHidden, admin, devHidden) → the word, the two switches independent', () => {
    const cases: Array<[number | undefined, boolean | undefined, boolean, boolean | undefined, string | null]> = [
      [undefined, undefined, false, undefined, null],
      [5, undefined, false, undefined, 'pro'],
      [5, true, false, undefined, null],
      [undefined, undefined, true, undefined, 'dev'],
      [undefined, undefined, true, true, null],
      [5, undefined, true, undefined, 'prodev'],
      [5, true, true, undefined, 'dev'],
      [5, undefined, true, true, 'pro'],
      [5, true, true, true, null],
      // devHidden means nothing for someone who isn't an admin
      [5, false, false, false, 'pro'],
    ]
    for (const [proAt, proHidden, admin, devHidden, want] of cases) expect(badgeWord({ proAt, proHidden, devHidden }, admin)).toBe(want)
    expect(devShown({}, true)).toBe(true)
    expect(devShown({ devHidden: true }, true)).toBe(false)
  })
})

describe('memberBadge / friendBadge', () => {
  it('reads pro and dev from a member entry or profile', () => {
    expect(memberBadge({ pro: true })).toBe('pro')
    expect(memberBadge({ dev: true })).toBe('dev')
    expect(memberBadge({ pro: true, dev: true })).toBe('prodev')
    expect(memberBadge({ pro: 'true', dev: 1 })).toBeNull()
    expect(memberBadge(undefined)).toBeNull()
  })
  it('a 1:1’s friend', () => {
    const members = { me: { name: 'A', dev: true }, f: { name: 'R', pro: true } }
    expect(friendBadge({ type: 'direct', peer: 'f', members })).toBe('pro')
    expect(friendBadge({ type: 'direct', peer: 'me', members })).toBe('dev')
    expect(friendBadge({ type: 'direct', members })).toBeNull()
    expect(friendBadge({ type: 'trip', peer: 'f', members })).toBeNull()
  })
})
