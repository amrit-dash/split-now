import { describe, expect, it } from 'vitest'
import { budgetPercent, budgetStatus, crossedThresholds } from './budget'

const fmt = (m: number) => `₹${m / 100}`

describe('budget thresholds', () => {
  it('percent', () => {
    expect(budgetPercent(8000, 10000)).toBe(80)
    expect(budgetPercent(0, 10000)).toBe(0)
    expect(budgetPercent(500, 0)).toBe(0)
    expect(budgetPercent(-5, 100)).toBe(0)
  })
  it('crossed thresholds, lowest first, minus those already announced', () => {
    expect(crossedThresholds(7999, 10000)).toEqual([])
    expect(crossedThresholds(8000, 10000)).toEqual([80])
    expect(crossedThresholds(12000, 10000)).toEqual([80, 100])
    expect(crossedThresholds(12000, 10000, [80])).toEqual([100])
    expect(crossedThresholds(12000, 10000, [80, 100])).toEqual([])
    expect(crossedThresholds(12000, 0)).toEqual([])
  })
  it('status for the bar and the card', () => {
    expect(budgetStatus(5000, 10000, fmt)).toMatchObject({ pct: 50, tone: 'ok', threshold: undefined, label: '₹50 left', short: '₹50 left' })
    expect(budgetStatus(8200, 10000, fmt)).toMatchObject({ pct: 82, tone: 'near', threshold: 80, label: '₹18 left', short: '82% of the budget used' })
    expect(budgetStatus(10000, 10000, fmt)).toMatchObject({ pct: 100, tone: 'over', threshold: 100, label: '₹0 left', short: 'Budget reached' })
    expect(budgetStatus(10300, 10000, fmt)).toMatchObject({ pct: 103, tone: 'over', threshold: 100, label: '₹3 over', short: 'Over budget' })
  })
})
