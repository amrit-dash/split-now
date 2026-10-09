import { describe, expect, it } from 'vitest'
import { allocate, computeSplits, SplitError } from './splits'

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)
const M = ['a', 'b', 'c']

describe('allocate', () => {
  it('sums exactly and distributes remainder deterministically', () => {
    const r = allocate(1000, M.map((m) => [m, 1]))
    expect(sum(r)).toBe(1000)
    expect(r).toEqual({ a: 334, b: 333, c: 333 })
  })
  it('handles negatives', () => {
    expect(sum(allocate(-100, [['a', 1], ['b', 2]]))).toBe(-100)
  })
})

describe('computeSplits', () => {
  it('equal among selected', () => {
    expect(computeSplits(1001, 'equal', { selected: ['a', 'c'] }, M)).toEqual({ a: 501, c: 500 })
  })
  it('exact must match total', () => {
    expect(() => computeSplits(1000, 'exact', { exact: { a: 500, b: 400 } }, M)).toThrow(SplitError)
    expect(computeSplits(1000, 'exact', { exact: { a: 600, b: 400 } }, M)).toEqual({ a: 600, b: 400 })
  })
  it('percent', () => {
    const r = computeSplits(999, 'percent', { percent: { a: 50, b: 25, c: 25 } }, M)
    expect(sum(r)).toBe(999)
    expect(() => computeSplits(999, 'percent', { percent: { a: 50 } }, M)).toThrow(SplitError)
  })
  it('shares / ratio', () => {
    expect(computeSplits(1000, 'shares', { shares: { a: 2, b: 1, c: 1 } }, M)).toEqual({ a: 500, b: 250, c: 250 })
  })
  it('adjust', () => {
    const r = computeSplits(3000, 'adjust', { selected: M, adjust: { a: 300 } }, M)
    expect(r).toEqual({ a: 1200, b: 900, c: 900 })
  })
  it('itemized honours portions on a shared item', () => {
    const r = computeSplits(900, 'itemized', { items: [{ name: 'Beer', amount: 900, members: ['a', 'b'], shares: { a: 2, b: 1 } }] }, ['a', 'b'])
    expect(r).toEqual({ a: 600, b: 300 })
  })
  it('itemized spreads tax/tip proportionally', () => {
    const r = computeSplits(1100, 'itemized', {
      items: [
        { name: 'Pizza', amount: 600, members: ['a', 'b'] },
        { name: 'Beer', amount: 400, members: ['c'] },
      ],
    }, M)
    expect(sum(r)).toBe(1100)
    expect(r).toEqual({ a: 330, b: 330, c: 440 })
  })
})
