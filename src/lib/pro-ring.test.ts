import { describe, expect, it } from 'vitest'
import { bendWord, circleTrack, pathPoints, proRing, proTileRing, ringLetterHeight, ringRepeats, roundedSquareTrack, tileRingLength } from './pro-ring'
import { PRO_D } from './pro-glyph'

describe('ringLetterHeight', () => {
  it('is about 8% of the photo, between 3.8 and 5.6 px', () => {
    expect(ringLetterHeight(58)).toBeCloseTo(4.64)
    expect(ringLetterHeight(20)).toBe(3.8)
    expect(ringLetterHeight(200)).toBe(5.6)
  })
})

describe('ringRepeats', () => {
  it('fits whole words around the track, at least four', () => {
    expect(ringRepeats(10, 4)).toBe(4)
    const h = 4.64
    const n = ringRepeats(2 * Math.PI * (29 + 2 + h / 2), h)
    expect(n).toBeGreaterThanOrEqual(8)
    expect(n).toBeLessThanOrEqual(11)
  })
})

describe('proRing', () => {
  it('bends every point of every word onto the circle, r ± h/2', () => {
    for (const photo of [48, 58, 60, 72]) {
      const art = proRing(photo)
      const r = photo / 2 + 2 + art.h / 2
      expect(art.words.length).toBe(ringRepeats(2 * Math.PI * r, art.h))
      expect(art.dots.length).toBe(art.words.length)
      for (const w of art.words) {
        for (const [x, y] of pathPoints(w)) {
          const d = Math.hypot(x, y)
          expect(d).toBeGreaterThanOrEqual(r - art.h / 2 - 0.02)
          expect(d).toBeLessThanOrEqual(r + art.h / 2 + 0.02)
        }
      }
      for (const dot of art.dots) expect(Math.hypot(dot.x, dot.y)).toBeCloseTo(r, 1)
      // the SVG is big enough to hold it
      expect(art.size / 2).toBeGreaterThanOrEqual(r + art.h / 2)
    }
  })
  it('keeps the photo clear: nothing inside photo/2 + 2', () => {
    const art = proRing(58)
    for (const w of art.words) for (const [x, y] of pathPoints(w)) expect(Math.hypot(x, y)).toBeGreaterThanOrEqual(29 + 2 - 0.02)
  })
  it('cuts straight edges into short pieces so they follow the curve', () => {
    // big letters, so the horizontal edges are several px long: each becomes several pieces
    const straight = PRO_D.match(/[HVL]/g)?.length ?? 0
    expect(bendWord(circleTrack(100), 0, 40).match(/L/g)?.length ?? 0).toBeGreaterThan(straight * 2)
  })
})

describe('bendWord', () => {
  it('keeps the command letters of the source and only absolute ones', () => {
    const d = bendWord(circleTrack(40), 0, 5)
    expect(d.startsWith('M')).toBe(true)
    expect(d.match(/Z/g)?.length).toBe(PRO_D.match(/Z/g)?.length)
    expect(/[a-z]/.test(d)).toBe(false)
  })
  it('centres the word on s0: the middle of the word sits at the top of the circle for s0 = 0', () => {
    const pts = pathPoints(bendWord(circleTrack(40), 0, 5))
    const xs = pts.map((p) => p[0])
    expect(Math.abs(Math.min(...xs) + Math.max(...xs))).toBeLessThan(0.5)
    expect(Math.max(...pts.map((p) => p[1]))).toBeLessThan(0)
  })
})

describe('DEV and PRO DEV rings', () => {
  it('fit fewer repeats of the longer word, evenly, on the same circle', () => {
    const pro = proRing(58, 'pro')
    const dev = proRing(58, 'dev')
    const both = proRing(58, 'prodev')
    expect(dev.words.length).toBe(pro.words.length)
    expect(both.words.length).toBeLessThan(pro.words.length)
    expect(both.words.length).toBeGreaterThanOrEqual(2)
    const r = 29 + 2 + both.h / 2
    for (const w of both.words) for (const [x, y] of pathPoints(w)) expect(Math.abs(Math.hypot(x, y) - r)).toBeLessThanOrEqual(both.h / 2 + 0.02)
    expect(proTileRing(56, 16, 0, 'prodev').words.length).toBeLessThan(proTileRing(56, 16, 0, 'pro').words.length)
  })
})

describe('roundedSquareTrack', () => {
  it('walks the outline: corners on the arcs, sides straight, length 4·side + 2πR', () => {
    const t = roundedSquareTrack(80, 20)
    expect(t.length).toBeCloseTo(4 * 40 + 2 * Math.PI * 20)
    expect(t.at(0)).toMatchObject({ x: 0, y: -40, nx: 0, ny: -1 })
    const right = t.at(20 + Math.PI * 10 + 20)
    expect(right.x).toBeCloseTo(40)
    expect(right.y).toBeCloseTo(0)
    expect(right.nx).toBeCloseTo(1)
    // halfway round the top-right corner: on the arc, pointing out diagonally
    const c = t.at(20 + Math.PI * 5)
    expect(Math.hypot(c.x - 20, c.y + 20)).toBeCloseTo(20)
    expect(c.nx).toBeCloseTo(Math.SQRT1_2)
    expect(c.ny).toBeCloseTo(-Math.SQRT1_2)
    // wraps
    expect(t.at(t.length).x).toBeCloseTo(0)
    expect(t.at(-1).x).toBeCloseTo(-1)
  })
})

describe('proTileRing', () => {
  it('stays in its box and outside the tile; the offset turns it along the outline', () => {
    const tile = 56
    const a = proTileRing(tile, 16)
    const b = proTileRing(tile, 16, 7)
    expect(a.words.length).toBe(b.words.length)
    expect(a.words[0]).not.toBe(b.words[0])
    // a whole turn brings it back
    expect(proTileRing(tile, 16, tileRingLength(tile, 16)).words[0]).toBe(a.words[0])
    for (const w of a.words)
      for (const [x, y] of pathPoints(w)) {
        expect(Math.max(Math.abs(x), Math.abs(y))).toBeLessThanOrEqual(a.size / 2)
        // at least the gap away from the tile's own rounded outline
        const qx = Math.abs(x) - (tile / 2 - 16)
        const qy = Math.abs(y) - (tile / 2 - 16)
        const dist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 16
        expect(dist).toBeGreaterThanOrEqual(2.6 - 0.05)
      }
  })
})
