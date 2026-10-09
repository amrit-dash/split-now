import { describe, expect, it } from 'vitest'
import { demoQuickAi } from './quick-ai-demo'

const req = (text: string) => ({ text, today: '2026-10-09', currency: 'INR', me: 'Asha', groups: [] })

describe('demoQuickAi', () => {
  it('reads "create a group … with … and add …" into a new group and an expense', () => {
    expect(demoQuickAi(req('create a group Goa trip with Rahul and Priya and add dinner 2400 paid by me split equally'))).toEqual({
      action: 'group_and_expense',
      group: { name: 'Goa trip', type: 'trip', members: ['Rahul', 'Priya'] },
      expense: { description: 'Dinner', amount: 240000, currency: 'INR', paidBy: 'me', split: 'equal' },
    })
  })
  it('a payer and a day from the line', () => {
    const r = demoQuickAi(req('Start a new group Flat 4B with Dev, Kiran then add rent 30000 Dev paid yesterday'))
    expect(r).toMatchObject({
      action: 'group_and_expense',
      group: { name: 'Flat 4B', members: ['Dev', 'Kiran'] },
      expense: { description: 'Rent', amount: 3000000, paidBy: 'Dev', date: '2026-10-08' },
    })
  })
  it('anything else is unknown', () => {
    expect(demoQuickAi(req('dinner 2400 with Rahul'))).toEqual({ action: 'unknown' })
    expect(demoQuickAi(req('create a group Goa trip'))).toEqual({ action: 'unknown' })
  })
})
