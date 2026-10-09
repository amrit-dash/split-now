import { describe, expect, it } from 'vitest'
import { MARQUEE_GAP, MARQUEE_SPEED, marqueePlan } from './marquee'

describe('marqueePlan', () => {
  it('stays still when the text fits', () => {
    expect(marqueePlan({ textWidth: 200, boxWidth: 300, reducedMotion: false })).toEqual({ scroll: false, seconds: 0 })
    // Subpixel rounding is not overflow.
    expect(marqueePlan({ textWidth: 300.6, boxWidth: 300, reducedMotion: false }).scroll).toBe(false)
  })

  it('scrolls when the text is wider than its space, at a steady speed', () => {
    const p = marqueePlan({ textWidth: 600, boxWidth: 300, reducedMotion: false })
    expect(p.scroll).toBe(true)
    expect(p.seconds).toBeCloseTo((600 + MARQUEE_GAP) / MARQUEE_SPEED, 1)
    // Twice the text, about twice the time: the pace is the same.
    const q = marqueePlan({ textWidth: 1200, boxWidth: 300, reducedMotion: false })
    expect(q.seconds).toBeGreaterThan(p.seconds * 1.8)
  })

  it('never loops faster than the floor for barely-overflowing text', () => {
    expect(marqueePlan({ textWidth: 120, boxWidth: 100, reducedMotion: false })).toEqual({ scroll: true, seconds: 6 })
  })

  it('never moves with reduced motion (the text wraps instead)', () => {
    expect(marqueePlan({ textWidth: 2000, boxWidth: 300, reducedMotion: true })).toEqual({ scroll: false, seconds: 0 })
  })

  it('does not scroll before the box has a width (hidden, not laid out yet)', () => {
    expect(marqueePlan({ textWidth: 500, boxWidth: 0, reducedMotion: false }).scroll).toBe(false)
    expect(marqueePlan({ textWidth: Number.NaN, boxWidth: 300, reducedMotion: false }).scroll).toBe(false)
  })
})
