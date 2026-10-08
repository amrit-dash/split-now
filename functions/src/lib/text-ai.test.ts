import { describe, expect, it } from 'vitest'
import { crossedThresholds } from '../../../shared/budget'
import { EXPENSE_CATEGORIES, TEXT_SCHEMA, normaliseText, textPrompt } from './gemini'
import { budgetNote } from './notify-text'

describe('Quick add text reading', () => {
  const members = ['Rahul Sharma', 'Priya']
  it('keeps people to the listed names ("me" for the writer) and validates the rest', () => {
    const r = normaliseText(
      {
        isExpense: true,
        description: ' Dinner  at Toit ',
        amount: '1,200',
        currency: 'inr',
        date: '2026-10-07',
        payer: 'rahul',
        participants: ['Me', 'priya', 'Nobody', 'Rahul Sharma'],
        category: 'food',
      },
      members,
    )
    expect(r).toEqual({
      description: 'Dinner at Toit',
      amount: 120000,
      currency: 'INR',
      date: '2026-10-07',
      payer: 'Rahul Sharma',
      participants: ['me', 'Priya', 'Rahul Sharma'],
      category: 'food',
    })
  })
  it('drops invented people, unknown categories, bad dates and non-expenses', () => {
    expect(
      normaliseText(
        { isExpense: true, description: 'Cab', amount: 850, payer: 'Someone Else', participants: ['Nobody'], category: 'snacks', date: 'tomorrow' },
        members,
      ),
    ).toEqual({
      description: 'Cab',
      amount: 85000,
    })
    expect(normaliseText({ isExpense: false, description: 'hello', amount: 5 }, members)).toBeNull()
    expect(normaliseText({ isExpense: true }, members)).toBeNull()
    expect(normaliseText('x', members)).toBeNull()
  })
  it('the schema lists the app’s categories and the prompt names the people', () => {
    expect((TEXT_SCHEMA.properties as Record<string, { enum?: string[] }>).category.enum).toEqual([...EXPENSE_CATEGORIES])
    const p = textPrompt(members, 'INR', '2026-10-08')
    expect(p).toContain('Rahul Sharma, Priya')
    expect(p).toContain('Today is 2026-10-08')
    expect(p).toContain('untrusted')
  })
})

describe('budget alerts', () => {
  it('push copy for the two thresholds', () => {
    const base = { groupId: 'g', groupName: 'Goa trip', emoji: '🏖️', budget: 6000000, currency: 'INR' }
    expect(budgetNote({ ...base, threshold: 80, spent: 4920000 })).toEqual({
      title: '🏖️ Goa trip',
      body: 'Goa trip has used 82% of its ₹60,000 budget (₹49,200).',
      url: '/insights?group=g',
      tag: 'budget-g-80',
      urgency: 'normal',
    })
    expect(budgetNote({ ...base, threshold: 100, spent: 6150000 }).body).toBe('Goa trip is over its ₹60,000 budget: ₹61,500 spent so far.')
  })
  it('announces each threshold once, in order', () => {
    expect(crossedThresholds(4920000, 6000000, [])).toEqual([80])
    expect(crossedThresholds(6150000, 6000000, [80])).toEqual([100])
    expect(crossedThresholds(6150000, 6000000, [80, 100])).toEqual([])
  })
})
