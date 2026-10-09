import { describe, expect, it } from 'vitest'
import { allocateAcrossGroups, proportional } from './settleMulti'

const amounts = (plan: ReturnType<typeof allocateAcrossGroups>) => plan.allocations.map((a) => a.amount)
const signedSum = (parts: { signed: number }[], plan: ReturnType<typeof allocateAcrossGroups>) =>
  plan.allocations.reduce((s, a, i) => s + Math.sign(parts[i].signed) * a.amount, 0)

describe('proportional', () => {
  it('splits exactly, largest remainder first, ties to the earlier weight', () => {
    expect(proportional(100, [100, 100, 100])).toEqual([34, 33, 33])
    expect(proportional(10, [3, 7])).toEqual([3, 7])
    expect(proportional(5, [3, 7])).toEqual([2, 3]) // 1.5 / 3.5: tie → first
    expect(proportional(0, [3, 7])).toEqual([0, 0])
    expect(proportional(50, [])).toEqual([])
  })
  it('never goes past a weight and copes with huge balances', () => {
    expect(proportional(999, [1000, 1])).toEqual([998, 1])
    const big = 9_000_000_000_000
    const r = proportional(big, [big, big])
    expect(r).toEqual([big / 2, big / 2])
  })
})

describe('allocateAcrossGroups', () => {
  it('full payment clears every group', () => {
    const parts = [
      { key: 'a', signed: 3000 },
      { key: 'b', signed: 1000 },
    ]
    const plan = allocateAcrossGroups(parts, 4000)
    expect(plan.net).toBe(4000)
    expect(amounts(plan)).toEqual([3000, 1000])
    expect(plan.clearsAll).toBe(true)
  })

  it('partial payment is shared in proportion and adds up to the payment', () => {
    const parts = [
      { key: 'a', signed: 3000 },
      { key: 'b', signed: 1000 },
    ]
    const plan = allocateAcrossGroups(parts, 2000)
    expect(amounts(plan)).toEqual([1500, 500])
    expect(plan.allocations.map((a) => a.left)).toEqual([1500, 500])
    expect(plan.clearsAll).toBe(false)
    expect(signedSum(parts, plan)).toBe(2000)
  })

  it('works the same when you owe them (negative net)', () => {
    const parts = [
      { key: 'a', signed: -2500 },
      { key: 'b', signed: -2500 },
    ]
    const plan = allocateAcrossGroups(parts, 1001)
    expect(plan.net).toBe(-5000)
    expect(amounts(plan)).toEqual([501, 500])
    expect(signedSum(parts, plan)).toBe(-1001)
  })

  it('mixed directions: counter groups always clear; the rest covers payment + what cancelled', () => {
    // They owe you 5000 in a and 1000 in c; you owe them 2000 in b. Net: they pay you 4000.
    const parts = [
      { key: 'a', signed: 5000 },
      { key: 'b', signed: -2000 },
      { key: 'c', signed: 1000 },
    ]
    const full = allocateAcrossGroups(parts, 4000)
    expect(full.net).toBe(4000)
    expect(amounts(full)).toEqual([5000, 2000, 1000])
    expect(full.clearsAll).toBe(true)
    expect(signedSum(parts, full)).toBe(4000)

    const part = allocateAcrossGroups(parts, 1000)
    // b cleared in full (2000); a + c share 2000 + 1000 = 3000 in a 5:1 ratio.
    expect(amounts(part)).toEqual([2500, 2000, 500])
    expect(signedSum(parts, part)).toBe(1000)
  })

  it('net zero clears everything with no payment', () => {
    const parts = [
      { key: 'a', signed: 1200 },
      { key: 'b', signed: -1200 },
    ]
    const plan = allocateAcrossGroups(parts, 500)
    expect(plan.payment).toBe(0)
    expect(amounts(plan)).toEqual([1200, 1200])
    expect(plan.clearsAll).toBe(true)
  })

  it('clamps the payment to 0…|net|', () => {
    const parts = [
      { key: 'a', signed: 1000 },
      { key: 'b', signed: 500 },
    ]
    expect(allocateAcrossGroups(parts, 99999).payment).toBe(1500)
    expect(amounts(allocateAcrossGroups(parts, 99999))).toEqual([1000, 500])
    expect(amounts(allocateAcrossGroups(parts, -5))).toEqual([0, 0])
    expect(amounts(allocateAcrossGroups(parts, Number.NaN))).toEqual([0, 0])
  })

  it('a zero payment in a mixed balance still nets the counter groups out', () => {
    const parts = [
      { key: 'a', signed: 3000 },
      { key: 'b', signed: -1000 },
    ]
    const plan = allocateAcrossGroups(parts, 0)
    expect(amounts(plan)).toEqual([1000, 1000])
    expect(signedSum(parts, plan)).toBe(0)
  })
})
