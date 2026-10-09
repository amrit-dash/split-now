import { describe, expect, it } from 'vitest'
import { fitLabel, overflows } from './fit'

describe('fitLabel', () => {
  it('keeps the first label at full size when it fits', () => {
    expect(fitLabel([200, 150], 240)).toEqual({ index: 0, scale: 1 })
  })
  it('shrinks the first label when the shrink stays above the floor', () => {
    expect(fitLabel([250, 150], 225)).toEqual({ index: 0, scale: 0.9 })
  })
  it('falls back to a shorter label instead of shrinking past the floor', () => {
    expect(fitLabel([300, 220, 150], 230)).toEqual({ index: 1, scale: 1 })
    expect(fitLabel([300, 260, 150], 200)).toEqual({ index: 2, scale: 1 })
  })
  it('shrinks the last label as far as needed when nothing else fits', () => {
    expect(fitLabel([300, 200], 100)).toEqual({ index: 1, scale: 0.5 })
  })
  it('never scales up, and never returns a scale that overshoots the box', () => {
    expect(fitLabel([100], 1000).scale).toBe(1)
    const { scale } = fitLabel([301], 250, 0.5)
    expect(301 * scale).toBeLessThanOrEqual(250)
  })
  it('is safe before anything is measured', () => {
    expect(fitLabel([], 200)).toEqual({ index: 0, scale: 1 })
    expect(fitLabel([200], 0)).toEqual({ index: 0, scale: 1 })
  })
})

describe('overflows', () => {
  it('allows half a pixel of rounding', () => {
    expect(overflows(200.4, 200)).toBe(false)
    expect(overflows(201, 200)).toBe(true)
    expect(overflows(150, 200)).toBe(false)
  })
})
