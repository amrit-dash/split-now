import { describe, expect, it } from 'vitest'
import { SWIPE_LOCK_PX, swipeAxis, swipeOpacity, swipeOutcome } from './swipe-dismiss'

describe('swipe to dismiss', () => {
  it('waits until the finger has moved far enough to tell the direction', () => {
    expect(swipeAxis(3, 2)).toBeNull()
    expect(swipeAxis(SWIPE_LOCK_PX, 1)).toBe('x')
    expect(swipeAxis(-12, 4)).toBe('x')
    expect(swipeAxis(4, 15)).toBe('y')
  })
  it('dismisses once dragged a third of the way, or flicked fast; else springs back', () => {
    expect(swipeOutcome({ dx: 140, dt: 600, width: 360 })).toBe('right')
    expect(swipeOutcome({ dx: -140, dt: 600, width: 360 })).toBe('left')
    expect(swipeOutcome({ dx: 60, dt: 600, width: 360 })).toBe('back')
    // a quick flick goes, a tiny fast twitch doesn't
    expect(swipeOutcome({ dx: -60, dt: 80, width: 360 })).toBe('left')
    expect(swipeOutcome({ dx: 10, dt: 5, width: 360 })).toBe('back')
    // no width measured yet: still decides
    expect(swipeOutcome({ dx: 0, dt: 0, width: 0 })).toBe('back')
  })
  it('fades as it nears the edge, never quite invisible', () => {
    expect(swipeOpacity(0, 300)).toBe(1)
    expect(swipeOpacity(150, 300)).toBeCloseTo(0.6)
    expect(swipeOpacity(-900, 300)).toBe(0.2)
  })
})
