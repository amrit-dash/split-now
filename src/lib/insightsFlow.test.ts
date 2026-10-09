import { describe, expect, it } from 'vitest'
import { LABEL_GAP, LABEL_H, compactMoney, flowCurve, flowKey, flowSpeed, flowWidth, layoutRing, mergeDebts, netOf, shortNames } from './insightsFlow'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `m${i}`)

describe('layoutRing', () => {
  for (const width of [280, 296, 326, 358]) {
    for (const n of [1, 2, 3, 5, 8, 11, 12]) {
      for (const center of [null, 'me'] as const) {
        it(`keeps every label box inside the card (w=${width}, n=${n}, centre=${center})`, () => {
          const L = layoutRing({ width, ids: ids(n), center })
          expect(L.nodes).toHaveLength(n + (center ? 1 : 0))
          for (const d of L.nodes) {
            expect(d.x - d.labelW / 2).toBeGreaterThanOrEqual(-0.01)
            expect(d.x + d.labelW / 2).toBeLessThanOrEqual(width + 0.01)
            expect(d.y - d.size / 2 - (d.above ? LABEL_GAP + LABEL_H : 0)).toBeGreaterThanOrEqual(-0.01)
            expect(d.y + d.size / 2 + (d.above ? 0 : LABEL_GAP + LABEL_H)).toBeLessThanOrEqual(L.height + 0.01)
          }
        })
        it(`node blocks never overlap (w=${width}, n=${n}, centre=${center})`, () => {
          const L = layoutRing({ width, ids: ids(n), center })
          const box = (d: (typeof L.nodes)[number]) => ({ l: d.x - d.labelW / 2, r: d.x + d.labelW / 2, t: d.y - d.size / 2 - (d.above ? LABEL_GAP + LABEL_H : 0), b: d.y + d.size / 2 + (d.above ? 0 : LABEL_GAP + LABEL_H) })
          for (let i = 0; i < L.nodes.length; i++) {
            for (let j = i + 1; j < L.nodes.length; j++) {
              const a = box(L.nodes[i]), b = box(L.nodes[j])
              const overlap = a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5
              expect(overlap, `${L.nodes[i].id} vs ${L.nodes[j].id}`).toBe(false)
            }
          }
        })
      }
    }
  }

  it('puts the centre person in the middle and the first ring person at the top', () => {
    const L = layoutRing({ width: 300, ids: ids(5), center: 'me' })
    const c = L.byId.get('me')!
    expect(c.center).toBe(true)
    expect(c.x).toBeCloseTo(150)
    expect(c.y).toBeCloseTo(L.cy)
    expect(L.byId.get('m0')!.y).toBeLessThan(c.y)
  })

  it('a reserved middle slot is not a node', () => {
    const L = layoutRing({ width: 300, ids: ids(4), center: '@' })
    expect(L.nodes.map((d) => d.id)).toEqual(ids(4))
  })

  it('two people face each other side by side', () => {
    const [a, b] = layoutRing({ width: 300, ids: ids(2) }).nodes
    expect(a.y).toBeCloseTo(b.y)
    expect(a.x).toBeLessThan(b.x)
  })
})

describe('flowCurve', () => {
  const a = { x: 0, y: 0, r: 10 }, b = { x: 100, y: 0, r: 10 }
  it('trims ends to the avatar edge and points from a to b', () => {
    const g = flowCurve(a, b, { x: 50, y: 50 }, 0, 0)
    expect(g.d.startsWith('M10,0')).toBe(true)
    expect(g.d.endsWith('90,0')).toBe(true)
    expect(g.length).toBeCloseTo(80, 0)
    expect(Math.abs(g.arrow.angle)).toBeLessThan(1)
  })
  it('A→B and B→A bow to opposite sides', () => {
    const ab = flowCurve(a, b, { x: 50, y: 0 }, 0, 12)
    const ba = flowCurve(b, a, { x: 50, y: 0 }, 0, 12)
    expect(Math.sign(ab.mid.y)).toBe(-Math.sign(ba.mid.y))
  })
})

describe('helpers', () => {
  it('width and speed scale with the amount', () => {
    expect(flowWidth(100, 100)).toBe(10)
    expect(flowWidth(0, 100)).toBe(2)
    expect(flowSpeed(100, 100)).toBeLessThan(flowSpeed(10, 100))
  })
  it('mergeDebts joins repeated pairs and drops zero/self rows', () => {
    const m = mergeDebts([{ from: 'a', to: 'b', amount: 5 }, { from: 'a', to: 'b', amount: 7 }, { from: 'b', to: 'a', amount: 3 }, { from: 'c', to: 'c', amount: 9 }, { from: 'c', to: 'a', amount: 0 }])
    expect(m.map((d) => [flowKey(d), d.amount])).toEqual([['a>b', 12], ['b>a', 3]])
  })
  it('netOf', () => {
    expect(Object.fromEntries(netOf([{ from: 'a', to: 'b', amount: 5 }, { from: 'c', to: 'b', amount: 2 }]))).toEqual({ a: -5, b: 7, c: -2 })
  })
  it('shortNames uses first names and disambiguates', () => {
    expect(shortNames({ a: 'Kodai Gandhi', b: 'Kodai rao', c: 'Priya', d: '  Venkataraghavan Subramaniam ' })).toEqual({ a: 'Kodai G', b: 'Kodai R', c: 'Priya', d: 'Venkataraghavan' })
  })
  it('compactMoney', () => {
    expect(compactMoney(1234567890, 'INR', 'en-IN')).toBe('₹1.2Cr')
    expect(compactMoney(450000, 'INR', 'en-IN')).toBe('₹4.5K')
    expect(compactMoney(95050, 'INR', 'en-IN')).toBe('₹951')
    expect(compactMoney(700000, 'INR', 'en-IN')).toBe('₹7K')
    expect(compactMoney(137744418, 'INR', 'en-IN')).toBe('₹13.8L')
    expect(compactMoney(-1234567890, 'AUD', 'en-AU')).toBe('-$12.3M')
    expect(compactMoney(4550, 'AUD', 'en-AU')).toBe('$46')
    expect(compactMoney(450, 'AUD', 'en-AU')).toBe('$4.5')
  })
})
