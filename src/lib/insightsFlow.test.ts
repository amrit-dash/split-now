import { describe, expect, it } from 'vitest'
import { layoutFlow, ribbonPath } from './insightsFlow'

describe('layoutFlow', () => {
  it('empty', () => {
    expect(layoutFlow([])).toEqual({ pay: [], get: [], links: [], height: 0 })
    expect(layoutFlow([{ from: 'a', to: 'b', amount: 0 }]).links).toHaveLength(0)
  })

  const debts = [
    { from: 'c', to: 'a', amount: 1000 },
    { from: 'b', to: 'a', amount: 3000 },
    { from: 'c', to: 'd', amount: 500 },
  ]
  const L = layoutFlow(debts, { pitch: 50, labelSlot: 40, gap: 10, minBar: 4, pad: 0 })

  it('columns sorted by total, ids keyed to their side', () => {
    expect(L.pay.map((n) => [n.id, n.total])).toEqual([['b', 3000], ['c', 1500]])
    expect(L.get.map((n) => [n.id, n.total])).toEqual([['a', 4000], ['d', 500]])
  })

  it('bar heights are proportional, with a floor', () => {
    const k = (2 * 50 - 10) / 4500
    expect(L.pay[0].h).toBeCloseTo(3000 * k)
    expect(L.get[1].h).toBeCloseTo(Math.max(4, 500 * k))
  })

  it('slots never overlap and leave room for labels', () => {
    for (const col of [L.pay, L.get]) {
      for (let i = 1; i < col.length; i++) expect(col[i].cy - col[i - 1].cy).toBeGreaterThanOrEqual(40)
      for (const n of col) expect(n.y).toBeGreaterThanOrEqual(0)
    }
    expect(Math.max(...[...L.pay, ...L.get].map((n) => n.y + n.h))).toBeLessThanOrEqual(L.height + 0.001)
  })

  it('bands tile each bar exactly and keep the debt index', () => {
    expect(L.links.map((l) => l.index).sort()).toEqual([0, 1, 2])
    for (const n of L.pay) {
      const bands = L.links.filter((l) => l.debt.from === n.id).sort((a, b) => a.sy0 - b.sy0)
      expect(bands[0].sy0).toBeCloseTo(n.y)
      expect(bands[bands.length - 1].sy1).toBeCloseTo(n.y + n.h)
      for (let i = 1; i < bands.length; i++) expect(bands[i].sy0).toBeCloseTo(bands[i - 1].sy1)
    }
    for (const n of L.get) {
      const bands = L.links.filter((l) => l.debt.to === n.id)
      expect(bands.reduce((s, l) => s + l.ty1 - l.ty0, 0)).toBeCloseTo(n.h)
    }
  })

  it('a person can appear on both sides (raw debts)', () => {
    const r = layoutFlow([{ from: 'a', to: 'b', amount: 10 }, { from: 'b', to: 'c', amount: 10 }])
    expect(r.pay.map((n) => n.id)).toContain('b')
    expect(r.get.map((n) => n.id)).toContain('b')
  })

  it('ribbon path is closed', () => {
    expect(ribbonPath(L.links[0], 10, 100)).toMatch(/^M10,.* Z$/)
  })
})
