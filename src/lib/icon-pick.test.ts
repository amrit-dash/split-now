import { describe, expect, it } from 'vitest'
import { autoPickTitle, EXPENSE_CHOICES, expensePickRequest, groupPickRequest, pickAnswer } from './icon-pick'

describe('the automatic icon asks AI', () => {
  it('only when offered, needed and the title says enough', () => {
    expect(autoPickTitle({ title: '  Toit  dinner ', offered: true, need: true })).toBe('Toit dinner')
    expect(autoPickTitle({ title: 'ab', offered: true, need: true })).toBeNull()
    expect(autoPickTitle({ title: 'Toit', offered: false, need: true })).toBeNull()
    expect(autoPickTitle({ title: 'Toit', offered: true, need: false })).toBeNull()
    expect(autoPickTitle({ title: 'x'.repeat(200), offered: true, need: true })?.length).toBe(80)
  })
  it('an expense chooses from the whole catalogue, and a category only while it is still Other', () => {
    expect(EXPENSE_CHOICES.length).toBeGreaterThan(50)
    expect(EXPENSE_CHOICES.length).toBeLessThanOrEqual(300)
    expect(new Set(EXPENSE_CHOICES).size).toBe(EXPENSE_CHOICES.length)
    const open = expensePickRequest('Toit', { category: 'other', catTouched: false })
    expect(open.categories).toContain('food')
    expect(open.categories).not.toContain('other')
    expect(expensePickRequest('Toit', { category: 'food', catTouched: false }).categories).toBeUndefined()
    expect(expensePickRequest('Toit', { category: 'other', catTouched: true }).categories).toBeUndefined()
  })
  it('a group chooses from the group icons, and a type only while none was chosen', () => {
    expect(groupPickRequest('Kasol', { typeTouched: false }).types).toEqual(['trip', 'outing', 'event', 'home', 'family', 'couple', 'office', 'sports'])
    expect(groupPickRequest('Kasol', { typeTouched: true }).types).toBeUndefined()
  })
  it('keeps only what was offered', () => {
    const req = expensePickRequest('Toit', { category: 'other', catTouched: false })
    const e = EXPENSE_CHOICES[0]
    expect(pickAnswer({ emoji: e, category: 'food' }, req)).toEqual({ emoji: e, category: 'food', type: undefined })
    expect(pickAnswer({ emoji: '🦄🦄', category: 'other' }, req)).toEqual({ emoji: undefined, category: undefined, type: undefined })
    // any single emoji, the app's or not, with a different second one to offer
    expect(pickAnswer({ emoji: '🐝', alt: '🇱🇰' }, req)).toEqual({ emoji: '🐝', alts: ['🇱🇰'], category: undefined, type: undefined })
    expect(pickAnswer({ emoji: '🐝', alt: '🇱🇰', alts: ['🇱🇰', '🍯', '🐝', '🍯', '🌴', '🌸', '🌺', '🌻'] }, req)?.alts).toEqual(['🇱🇰', '🍯', '🌴', '🌸', '🌺'])
    expect(pickAnswer({ emoji: '🍯', alt: '🍯' }, req)).toEqual({ emoji: '🍯', category: undefined, type: undefined })
    expect(pickAnswer({ emoji: null, alt: '🐝' }, req)?.alts).toBeUndefined()
    expect(pickAnswer({ unavailable: true, reason: 'off' }, req)).toBeNull()
    expect(pickAnswer(null, req)).toBeNull()
    const g = groupPickRequest('Kasol', { typeTouched: false })
    expect(pickAnswer({ emoji: null, type: 'trip' }, g)).toEqual({ emoji: undefined, category: undefined, type: 'trip' })
    expect(pickAnswer({ emoji: null, type: 'personal' }, g)?.type).toBeUndefined()
  })
})
