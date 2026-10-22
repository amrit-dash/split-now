import { describe, expect, it } from 'vitest'
import { EARN_PRO_PATH, hasEarnedPro, memberPro, proMarkLabel, proShown, proTapTarget, withProAwarded } from './pro'

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
    expect(proMarkLabel(true)).toBe('Pro. How to earn it')
    expect(proMarkLabel(false)).toBe('Pro')
  })
})
