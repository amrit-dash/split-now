import { describe, expect, it } from 'vitest'
import { haptic, hapticPattern } from './haptics'

const on = { reducedMotion: false, canVibrate: true }

describe('hapticPattern', () => {
  it('gives a short tap for a save, a shorter one for a sheet and a double knock for an error', () => {
    expect(hapticPattern('save', on)).toBe(8)
    expect(hapticPattern('sheetClose', on)).toBe(6)
    expect(hapticPattern('error', on)).toEqual([10, 40, 10])
  })
  it('is off with reduced motion', () => {
    expect(hapticPattern('save', { reducedMotion: true, canVibrate: true })).toBeNull()
    expect(hapticPattern('error', { reducedMotion: true, canVibrate: true })).toBeNull()
  })
  it('is off without a vibration motor', () => {
    expect(hapticPattern('save', { reducedMotion: false, canVibrate: false })).toBeNull()
  })
})

describe('haptic', () => {
  it('does nothing and never throws where vibrate is missing', () => {
    expect(() => haptic('error')).not.toThrow()
  })
})
