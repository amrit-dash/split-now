import { describe, expect, it } from 'vitest'
import { clampLimit, DEFAULT_LIMITS, LIMIT_META, LIMIT_NAMES, limitPair, resolveLimits } from './limits'

describe('resolveLimits', () => {
  it('returns the defaults for a missing or empty document', () => {
    expect(resolveLimits(undefined)).toEqual(DEFAULT_LIMITS)
    expect(resolveLimits(null)).toEqual(DEFAULT_LIMITS)
    expect(resolveLimits({})).toEqual(DEFAULT_LIMITS)
    expect(resolveLimits('nope')).toEqual(DEFAULT_LIMITS)
  })
  it('keeps values inside their range and drops the rest', () => {
    const r = resolveLimits({
      capturePerHour: 10,
      capturePerDay: 0,
      nudgePerDay: 3.5,
      fxPerUserPerHour: 'lots',
      aiOwnPerDay: 10000,
      aiOwnPerHour: 1001,
      extra: 1,
    })
    expect(r.capturePerHour).toBe(10)
    expect(r.capturePerDay).toBe(DEFAULT_LIMITS.capturePerDay)
    expect(r.nudgePerDay).toBe(DEFAULT_LIMITS.nudgePerDay)
    expect(r.fxPerUserPerHour).toBe(DEFAULT_LIMITS.fxPerUserPerHour)
    expect(r.aiOwnPerDay).toBe(10000)
    expect(r.aiOwnPerHour).toBe(DEFAULT_LIMITS.aiOwnPerHour)
    expect('extra' in r).toBe(false)
  })
  it('defaults match the constants the functions shipped with', () => {
    expect(DEFAULT_LIMITS).toEqual({
      capturePerHour: 60,
      capturePerDay: 300,
      aiOwnPerHour: 120,
      aiOwnPerDay: 600,
      nudgePerDay: 1,
      fxPerUserPerHour: 30,
      fxPerUserPerDay: 200,
    })
    for (const k of LIMIT_NAMES) {
      const m = LIMIT_META[k]
      expect(m.default).toBeGreaterThanOrEqual(m.min)
      expect(m.default).toBeLessThanOrEqual(m.max)
      expect(m.label.length).toBeGreaterThan(0)
    }
  })
})

describe('clampLimit / limitPair', () => {
  it('clamps and rounds, and falls back to the default for garbage', () => {
    expect(clampLimit('nudgePerDay', 99)).toBe(20)
    expect(clampLimit('nudgePerDay', 0)).toBe(1)
    expect(clampLimit('capturePerHour', 12.6)).toBe(13)
    expect(clampLimit('capturePerHour', Number.NaN)).toBe(60)
  })
  it('pairs an hour and a day limit for the rate limiter', () => {
    expect(limitPair(DEFAULT_LIMITS, 'fxPerUserPerHour', 'fxPerUserPerDay')).toEqual({ perHour: 30, perDay: 200 })
  })
})
