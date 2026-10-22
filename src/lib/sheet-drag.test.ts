import { describe, expect, it } from 'vitest'
import { CLOSE_AT, pushSample, releaseVelocity, sheetExit, shouldCloseSheet, type DragSample } from './sheet-drag'

const drag = (pts: Array<[number, number]>) => pts.reduce<DragSample[]>((acc, [y, t]) => pushSample(acc, { y, t }), [])

describe('sheet drag', () => {
  it('measures the speed from the last moves only', () => {
    // a slow pull for half a second, then a quick flick at the end
    const s = drag([
      [0, 0],
      [10, 200],
      [20, 400],
      [30, 480],
      [60, 520],
    ])
    expect(s[0].t).toBeGreaterThanOrEqual(420)
    expect(releaseVelocity(s)).toBeCloseTo(0.75)
    // the whole drag averaged would have read as slow
    expect(60 / 520).toBeLessThan(0.3)
  })
  it('keeps at most six samples', () => {
    expect(drag(Array.from({ length: 20 }, (_, i) => [i, i] as [number, number]))).toHaveLength(6)
  })
  it('reads no speed from one sample or no time', () => {
    expect(releaseVelocity([])).toBe(0)
    expect(releaseVelocity([{ y: 5, t: 1 }])).toBe(0)
    expect(
      releaseVelocity([
        { y: 0, t: 5 },
        { y: 9, t: 5 },
      ]),
    ).toBe(0)
  })
  it('closes past the distance or on a downward flick, otherwise springs back', () => {
    expect(shouldCloseSheet(CLOSE_AT + 1, 0)).toBe(true)
    expect(shouldCloseSheet(30, 0.35)).toBe(true)
    expect(shouldCloseSheet(30, 0.25)).toBe(false)
    expect(shouldCloseSheet(0, 2)).toBe(false)
    expect(shouldCloseSheet(40, -1)).toBe(false)
  })
  it('slides out, or fades quickly with reduced motion', () => {
    expect(sheetExit(false)).toEqual({ ms: 200, panel: { transform: 'translateY(100%)', transition: 'transform 200ms cubic-bezier(0.32, 0.72, 0, 1)' } })
    expect(sheetExit(true).ms).toBe(150)
    expect(sheetExit(true).panel.transform).toBeUndefined()
  })
})
