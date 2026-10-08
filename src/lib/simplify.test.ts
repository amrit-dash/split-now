import { describe, expect, it } from 'vitest'
import { simplifyDebts } from './simplify'

const applied = (net: Record<string, number>) => {
  const after = { ...net }
  for (const d of simplifyDebts(net)) {
    after[d.from] += d.amount
    after[d.to] -= d.amount
  }
  return after
}

describe('simplifyDebts', () => {
  it('settles everyone with at most n-1 transfers and preserves every net', () => {
    const net = { a: 5000, b: -2000, c: -3000, d: 1500, e: -1500, f: 0 }
    const out = simplifyDebts(net)
    expect(out.length).toBeLessThanOrEqual(4)
    expect(Object.values(applied(net)).every((v) => v === 0)).toBe(true)
  })
  it('is deterministic: largest against largest, ties by member id', () => {
    expect(simplifyDebts({ b: 1000, a: 1000, c: -1000, d: -1000 })).toEqual([
      { from: 'c', to: 'a', amount: 1000 },
      { from: 'd', to: 'b', amount: 1000 },
    ])
  })
  it('keeps the lists ordered as remainders are re-inserted', () => {
    const net = { a: 700, b: 600, c: -100, d: -1200 }
    expect(simplifyDebts(net)).toEqual([
      { from: 'd', to: 'a', amount: 700 },
      { from: 'd', to: 'b', amount: 500 },
      { from: 'c', to: 'b', amount: 100 },
    ])
    expect(Object.values(applied(net)).every((v) => v === 0)).toBe(true)
  })
  it('does nothing when nobody owes anything', () => {
    expect(simplifyDebts({ a: 0, b: 0 })).toEqual([])
    expect(simplifyDebts({})).toEqual([])
  })
  it('random nets settle to zero', () => {
    let seed = 11
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed / 2 ** 31
    }
    for (let i = 0; i < 300; i++) {
      const n = 2 + Math.floor(rnd() * 15)
      const net: Record<string, number> = {}
      let total = 0
      for (let k = 0; k < n - 1; k++) {
        const v = Math.floor(rnd() * 20000) - 10000
        net[`m${k}`] = v
        total += v
      }
      net[`m${n - 1}`] = -total
      const out = simplifyDebts(net)
      expect(out.length).toBeLessThanOrEqual(n - 1)
      expect(Object.values(applied(net)).every((v) => v === 0)).toBe(true)
    }
  })
})
