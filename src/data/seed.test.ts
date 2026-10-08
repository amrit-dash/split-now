import { describe, expect, it } from 'vitest'
import { seedDemo } from './seed'
import { settleMethods } from '@/lib/payments'
import { todayISO } from '@/lib/id'

describe('demo seed', () => {
  const s = seedDemo(null, { uid: 'me', displayName: 'You' })
  const expenses = Object.values(s.expenses)

  it('is an Indian friend group in INR', () => {
    expect(Object.values(s.groups).map((g) => [g.name, g.currency])).toEqual([
      ['Goa Trip', 'INR'],
      ['Indiranagar Flat', 'INR'],
    ])
  })

  it('every expense balances to the paisa', () => {
    for (const e of expenses) {
      expect(Object.values(e.splits).reduce((a, b) => a + b, 0)).toBe(e.amount)
      expect(Object.values(e.paidBy).reduce((a, b) => a + b, 0)).toBe(e.amount)
    }
  })

  it('keeps the feature coverage: split types, recurring, foreign currency, settlement, capture, activity', () => {
    expect(new Set(expenses.map((e) => e.splitType))).toEqual(new Set(['equal', 'shares', 'exact', 'percent']))
    expect(expenses.filter((e) => e.recurrence)).toHaveLength(1)
    const fx = expenses.find((e) => e.original)!
    expect(fx.original).toMatchObject({ currency: 'USD', amount: 7200 })
    expect(fx.amount).toBe(605664)
    const [st] = Object.values(s.settlements)
    expect(settleMethods('INR')).toContain(st.method)
    const goa = s.groups.g_goa
    const cap = s.captures.c_demo
    expect(cap.currency).toBe('INR')
    expect(cap.date >= goa.startDate! && cap.date <= goa.endDate!).toBe(true)
    // Dates are local calendar days (the same "today" the app uses everywhere).
    expect(expenses.every((e) => e.date <= todayISO())).toBe(true)
    expect(Object.values(s.activity).every((a) => a.summary.includes('₹'))).toBe(true)
    expect(s.activity.a_e_g_goa_8.summary).toMatch(/US\$72\.00|\$72\.00/)
  })
})
