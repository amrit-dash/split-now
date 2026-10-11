import { describe, expect, it } from 'vitest'
import { openItemFromLine } from './open-item-line'

describe('openItemFromLine', () => {
  const ctx = {
    members: [
      { id: 'me', name: 'Amrit' },
      { id: 'r', name: 'Rahul' },
    ],
    me: 'me',
    currency: 'INR',
    today: '2026-10-11',
  }
  it('no amount, a date and a place', () => {
    const o = openItemFromLine('lunch Oct 2 Cafe Blue', ctx)
    expect(o.amount).toBeUndefined()
    expect(o.date).toBe('2026-10-02')
    expect(o.title.toLowerCase()).toContain('lunch')
    expect(o.title.toLowerCase()).toContain('cafe blue')
    expect(o.title).not.toMatch(/oct|\b2\b/i)
    expect(o.category).toBe('food')
  })
  it('an amount and an ordinal date', () => {
    const o = openItemFromLine('lunch 290 2nd Oct', ctx)
    expect(o.amount).toBe(29000)
    expect(o.date).toBe('2026-10-02')
    expect(o.title).toBe('Lunch')
  })
  it('a named payer becomes a suspect', () => {
    expect(openItemFromLine('taxi 400 Rahul paid', ctx).suspects).toEqual(['r'])
    expect(openItemFromLine('taxi 400', ctx).suspects).toBeUndefined()
  })
  it('an amount in another currency is left for the claimer', () => {
    expect(openItemFromLine('dinner $40', ctx).amount).toBeUndefined()
  })
})
