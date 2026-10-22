import { describe, expect, it } from 'vitest'
import { mayRestart, passTravel, shimmerPlan, shimmerTail } from './pro-shimmer'

// A small seeded generator so each run checks many different plans the same way.
const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

describe('shimmerPlan', () => {
  it('opens with sweep, glint, sweep inside the first ~3.5 s', () => {
    for (let s = 1; s < 40; s++) {
      const p = shimmerPlan(seeded(s))
      expect(p.slice(0, 3).map((x) => x.kind)).toEqual(['sweep', 'glint', 'sweep'])
      expect(p[0].at).toBeLessThanOrEqual(1000)
      expect(p[2].at).toBeLessThanOrEqual(3700)
    }
  })
  it('then spaces them 6–9 s, 10–16 s, then 20–40 s apart', () => {
    for (let s = 1; s < 40; s++) {
      const p = shimmerPlan(seeded(s), 12)
      const gap = (i: number) => p[i].at - p[i - 1].at
      for (const i of [3, 4]) expect(gap(i)).toBeGreaterThanOrEqual(5999)
      for (const i of [3, 4]) expect(gap(i)).toBeLessThanOrEqual(9001)
      for (const i of [5, 6, 7]) expect(gap(i)).toBeGreaterThanOrEqual(9999)
      for (const i of [5, 6, 7]) expect(gap(i)).toBeLessThanOrEqual(16001)
      for (const i of [8, 9, 10, 11]) expect(gap(i)).toBeGreaterThanOrEqual(19999)
      for (const i of [8, 9, 10, 11]) expect(gap(i)).toBeLessThanOrEqual(40001)
    }
  })
  it('is mostly sweeps after the opening, with an occasional glint', () => {
    const r = seeded(7)
    const kinds = Array.from({ length: 60 }, () => shimmerPlan(r, 12).slice(3)).flat()
    const glints = kinds.filter((k) => k.kind === 'glint').length
    expect(glints).toBeGreaterThan(0)
    expect(glints / kinds.length).toBeLessThan(0.4)
  })
  it('random gaps: two seeds give different plans', () => {
    expect(shimmerPlan(seeded(1))[4].at).not.toBe(shimmerPlan(seeded(2))[4].at)
  })
})

describe('shimmerTail', () => {
  it('keeps going 20–40 s apart', () => {
    const t = shimmerTail(seeded(3), 5)
    expect(t[0].at).toBeGreaterThanOrEqual(20_000)
    for (let i = 1; i < t.length; i++) expect(t[i].at - t[i - 1].at).toBeLessThanOrEqual(40_001)
  })
})

describe('mayRestart', () => {
  it('restarts the opening round at most once a minute', () => {
    expect(mayRestart(null, 5)).toBe(true)
    expect(mayRestart(1000, 30_000)).toBe(false)
    expect(mayRestart(1000, 61_000)).toBe(true)
  })
})

describe('passTravel', () => {
  it('sweeps go left to right, glints right to left', () => {
    expect(passTravel('sweep')).toEqual(['-110%', '110%'])
    expect(passTravel('glint')).toEqual(['110%', '-110%'])
  })
})
