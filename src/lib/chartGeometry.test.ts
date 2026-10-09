import { describe, expect, it } from 'vitest'
import { arcPath, donutSegments, linearScale, monotonePath, nearestIndex, niceTicks, xLabelIndices } from './chartGeometry'

const TAU = Math.PI * 2

describe('donutSegments', () => {
  it('splits the circle in proportion, clockwise from the top', () => {
    const [a, b] = donutSegments([1, 3])
    expect(a.start).toBe(0)
    expect(a.end).toBeCloseTo(TAU / 4)
    expect(b.start).toBeCloseTo(TAU / 4)
    expect(b.end).toBeCloseTo(TAU)
  })
  it('takes the gap off each slice but not off a lone slice', () => {
    const [a, b] = donutSegments([1, 1], 0.1)
    expect(a.start).toBeCloseTo(0.05)
    expect(a.end).toBeCloseTo(Math.PI - 0.05)
    expect(b.end).toBeCloseTo(TAU - 0.05)
    const [only] = donutSegments([5, 0], 0.1)
    expect(only).toEqual({ start: 0, end: TAU })
  })
  it('gives empty slices for zero, negative and non-finite values', () => {
    expect(donutSegments([0, -1, Number.NaN])).toEqual([
      { start: 0, end: 0 },
      { start: 0, end: 0 },
      { start: 0, end: 0 },
    ])
    const [z, v] = donutSegments([0, 2])
    expect(z).toEqual({ start: 0, end: 0 })
    expect(v.end).toBeCloseTo(TAU)
  })
})

describe('arcPath', () => {
  it('draws a quarter ring starting at 12 o’clock', () => {
    const d = arcPath(50, 50, 40, 20, 0, Math.PI / 2)
    expect(d.startsWith('M50 10 A40 40 0 0 1 90 50')).toBe(true)
    expect(d).toContain('L70 50')
    expect(d.endsWith('Z')).toBe(true)
  })
  it('uses the large-arc flag past a half turn and returns nothing for an empty span', () => {
    expect(arcPath(0, 0, 10, 5, 0, Math.PI * 1.5)).toMatch(/A10 10 0 1 1/)
    expect(arcPath(0, 0, 10, 5, 1, 1)).toBe('')
  })
  it('closes a full ring without collapsing it', () => {
    const d = arcPath(0, 0, 10, 5, 0, TAU)
    expect(d).toMatch(/A10 10 0 1 1 -?0(\.\d+)? -10/)
  })
})

describe('monotonePath', () => {
  it('passes through every point in order', () => {
    const d = monotonePath([
      { x: 0, y: 10 },
      { x: 10, y: 0 },
      { x: 20, y: 5 },
    ])
    expect(d.startsWith('M0 10 C')).toBe(true)
    expect(d).toContain(' 10 0 C')
    expect(d.endsWith(' 20 5')).toBe(true)
  })
  it('does not overshoot a flat run (tangents are zero on both sides of equal points)', () => {
    const d = monotonePath([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 30, y: 0 },
    ])
    // second segment is flat: both control points sit on y=10
    const seg = d.split(' C')[2]
    expect(seg).toBe('13.33 10 16.67 10 20 10')
  })
  it('handles one or no points', () => {
    expect(monotonePath([])).toBe('')
    expect(monotonePath([{ x: 1, y: 2 }])).toBe('M1 2')
  })
})

describe('niceTicks', () => {
  it('uses 1-2-5 steps that cover the maximum', () => {
    expect(niceTicks(1234)).toEqual([0, 500, 1000, 1500])
    expect(niceTicks(9)).toEqual([0, 2.5, 5, 7.5, 10])
    expect(niceTicks(100, 4)).toEqual([0, 25, 50, 75, 100])
  })
  it('is just [0] for empty data', () => {
    expect(niceTicks(0)).toEqual([0])
    expect(niceTicks(Number.NaN)).toEqual([0])
  })
})

describe('scales', () => {
  it('maps and clamps', () => {
    const s = linearScale([0, 100], [200, 0])
    expect(s(0)).toBe(200)
    expect(s(50)).toBe(100)
    expect(s(150)).toBe(0)
    expect(linearScale([5, 5], [1, 9])(5)).toBe(1)
  })
  it('finds the nearest point', () => {
    expect(nearestIndex([0, 10, 20], 12)).toBe(1)
    expect(nearestIndex([0, 10, 20], 16)).toBe(2)
    expect(nearestIndex([0], 99)).toBe(0)
  })
})

describe('xLabelIndices', () => {
  // Labels never overlap: start-anchored first, end-anchored last, centred in between.
  const spans = (idx: number[], count: number, plotW: number, labelW: number) => {
    const step = plotW / (count - 1)
    return idx.map((i) => {
      const x = i * step
      return i === 0 ? [x, x + labelW] : i === count - 1 ? [x - labelW, x] : [x - labelW / 2, x + labelW / 2]
    })
  }
  const overlaps = (s: number[][]) => s.some((a, k) => k > 0 && s[k - 1][1] > a[0])

  it('always keeps the first and last of 14 days and never overlaps', () => {
    for (const plotW of [200, 260, 300, 340, 400, 600]) {
      const idx = xLabelIndices(14, plotW, 40)
      expect(idx[idx.length - 1]).toBe(13)
      expect(overlaps(spans(idx, 14, plotW, 40)), `width ${plotW}: ${idx}`).toBe(false)
    }
  })

  it('drops the label that would crowd the last one (the old overlap)', () => {
    // 14 points over 300px, 40px labels: every 3rd gives 0,3,6,9,12 and 12 sits on top of 13.
    expect(xLabelIndices(14, 300, 40)).toEqual([0, 3, 6, 9, 13])
  })

  it('labels every point when there is room', () => {
    expect(xLabelIndices(4, 600, 40)).toEqual([0, 1, 2, 3])
  })

  it('handles tiny inputs', () => {
    expect(xLabelIndices(0, 300, 40)).toEqual([])
    expect(xLabelIndices(1, 300, 40)).toEqual([0])
    expect(xLabelIndices(2, 60, 40)).toEqual([1])
    expect(xLabelIndices(2, 300, 40)).toEqual([0, 1])
  })
})
