import { describe, expect, it } from 'vitest'
import { SPLASH_MS, splashHoldMs } from './splash'

const base = { elapsed: 0, standalone: true, seen: false, reducedMotion: false }

describe('splashHoldMs', () => {
  it('holds an installed app launch until the animation has played', () => {
    expect(splashHoldMs(base)).toBe(SPLASH_MS)
    expect(splashHoldMs({ ...base, elapsed: 600.4 })).toBe(SPLASH_MS - 600)
  })
  it('does not hold once the animation is over', () => {
    expect(splashHoldMs({ ...base, elapsed: SPLASH_MS + 1 })).toBe(0)
  })
  it('never holds a browser tab, a second launch in the session, or reduced motion', () => {
    expect(splashHoldMs({ ...base, standalone: false })).toBe(0)
    expect(splashHoldMs({ ...base, seen: true })).toBe(0)
    expect(splashHoldMs({ ...base, reducedMotion: true })).toBe(0)
  })
})
