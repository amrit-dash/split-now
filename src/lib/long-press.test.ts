import { describe, expect, it } from 'vitest'
import { isTap, LONG_PRESS_MS, MOVE_SLOP, movedTooFar } from './long-press'

describe('press and hold', () => {
  it('a small wobble is still a hold; more is a scroll', () => {
    expect(movedTooFar({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(false)
    expect(movedTooFar({ x: 0, y: 0 }, { x: 0, y: MOVE_SLOP + 1 })).toBe(true)
  })
  it('the click after a hold is not a tap', () => {
    expect(isTap(true)).toBe(false)
    expect(isTap(false)).toBe(true)
    expect(LONG_PRESS_MS).toBeGreaterThanOrEqual(400)
  })
})
