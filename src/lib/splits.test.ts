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
  it('ignores weights that are not finite and positive', () => {
    expect(allocate(1000, [['a', Infinity], ['b', 1]])).toEqual({ b: 1000 })
    expect(allocate(1000, [['a', NaN], ['b', -2], ['c', 0], ['d', 3]])).toEqual({ d: 1000 })
    expect(allocate(1000, [['a', 1e308], ['b', 1e308]])).toEqual({ a: 500, b: 500 })
  })
  it('always sums to the total (property)', () => {
    let seed = 7
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31 }
    for (let i = 0; i < 2000; i++) {
      const total = Math.floor(rnd() * 1e9)
      const n = 1 + Math.floor(rnd() * 12)
      const w = Array.from({ length: n }, (_, k) => [`m${k}`, Math.floor(rnd() * 1e9) + 1] as [string, number])
      expect(sum(allocate(total, w))).toBe(total)
    }
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
  it('rejects negative exact amounts, item amounts and shares', () => {
    expect(() => computeSplits(1000, 'exact', { exact: { a: 1500, b: -500 } }, M)).toThrow(/negative/)
    expect(() => computeSplits(1000, 'itemized', { items: [{ name: 'Refund', amount: -200, members: ['a'] }, { name: 'Beer', amount: 1200, members: ['b'] }] }, M)).toThrow(/negative/)
    expect(() => computeSplits(1000, 'shares', { shares: { a: -1, b: 1 } }, M)).toThrow(/negative/)
    expect(() => computeSplits(1000, 'percent', { percent: { a: 150, b: -50 } }, M)).toThrow(/negative/)
  })
  it('rejects non-finite input instead of storing NaN', () => {
    expect(() => computeSplits(1000, 'shares', { shares: { a: Infinity, b: Infinity } }, M)).toThrow(SplitError)
    expect(() => computeSplits(1000, 'shares', { shares: { a: 1e308, b: 1e308 } }, M)).not.toThrow()
    expect(() => computeSplits(1000, 'exact', { exact: { a: NaN, b: 1000 } }, M)).toThrow(SplitError)
    expect(() => computeSplits(1000, 'adjust', { selected: M, adjust: { a: NaN } }, M)).toThrow(SplitError)
    expect(() => computeSplits(1000, 'itemized', { items: [{ name: 'x', amount: NaN, members: ['a'] }] }, M)).toThrow(SplitError)
  })
  it('refuses an item whose people have all left the group (the amount would vanish)', () => {
    const items = [{ name: 'Pizza', amount: 600, members: ['a'] }, { name: 'Wine', amount: 400, members: ['z'] }]
    expect(() => computeSplits(1000, 'itemized', { items }, ['a', 'b'])).toThrow(/Wine.*left the group/)
    // A zero-amount orphan item is harmless.
    expect(computeSplits(600, 'itemized', { items: [items[0], { name: 'Water', amount: 0, members: ['z'] }] }, ['a', 'b'])).toEqual({ a: 600 })
  })
  it('words the exact-amount error in the currency when given one', () => {
    expect(() => computeSplits(1200, 'exact', { exact: { a: 1000 } }, M, 'INR')).toThrow(/Amounts add up to ₹10\.00, not ₹12\.00/)
    expect(() => computeSplits(1200, 'exact', { exact: { a: 1000 } }, M)).toThrow('Amounts add up to 10.00, not 12.00')
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
  it('itemized allows a discount (total below the items)', () => {
    const r = computeSplits(900, 'itemized', { items: [{ name: 'Pizza', amount: 600, members: ['a'] }, { name: 'Beer', amount: 400, members: ['b'] }] }, M)
    expect(r).toEqual({ a: 540, b: 360 })
  })
  it('every split type adds up to the total', () => {
    const cases: Array<[Parameters<typeof computeSplits>[1], Parameters<typeof computeSplits>[2]]> = [
      ['equal', { selected: M }], ['exact', { exact: { a: 1, b: 998 } }], ['percent', { percent: { a: 33.33, b: 33.33, c: 33.34 } }],
      ['shares', { shares: { a: 3, b: 2, c: 2 } }], ['adjust', { selected: M, adjust: { a: -100, c: 50 } }],
      ['itemized', { items: [{ name: 'x', amount: 333, members: M }, { name: 'y', amount: 500, members: ['a', 'b'], shares: { a: 3 } }] }],
    ]
    for (const [type, input] of cases) expect(sum(computeSplits(999, type, input, M))).toBe(999)
  })
})
