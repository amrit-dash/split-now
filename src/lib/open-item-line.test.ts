import { describe, expect, it } from 'vitest'
import { isOpenItemLine, openItemFromAi, openItemFromLine, openItemFromQuickLine } from './open-item-line'

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

describe('openItemFromAi', () => {
  const ctx = {
    members: [
      { id: 'me', name: 'Amrit' },
      { id: 'r', name: 'Rahul' },
    ],
    me: 'me',
    currency: 'INR',
    today: '2026-10-11',
  }
  const local = { title: 'Lunch Cafe Blue', date: '2026-10-02', category: 'food' as const }
  it('adds a tidier title and what the phone missed; the phone wins where both found something', () => {
    expect(openItemFromAi(local, { description: 'lunch at cafe blue', amount: 29000, date: '2026-10-05', payer: 'Rahul' }, ctx)).toEqual({
      title: 'Lunch At Cafe Blue',
      date: '2026-10-02',
      amount: 29000,
      category: 'food',
      suspects: ['r'],
    })
  })
  it('nothing new: null', () => {
    expect(openItemFromAi(local, { description: 'Lunch Cafe Blue' }, ctx)).toBeNull()
    expect(openItemFromAi(local, null, ctx)).toBeNull()
  })
  it('leaves out another currency, a future date and unknown people', () => {
    const r = openItemFromAi({ title: 'Taxi' }, { amount: 4000, currency: 'USD', date: '2026-12-01', payer: 'Zed', category: 'transport' }, ctx)
    expect(r).toEqual({ title: 'Taxi', category: 'transport' })
  })
})

describe('Quick add open-item lines', () => {
  const ctx = {
    members: [
      { id: 'me', name: 'Amrit' },
      { id: 'r', name: 'Rahul' },
      { id: 'p', name: 'Priya' },
    ],
    me: 'me',
    currency: 'INR',
    today: '2026-10-11',
  }
  it('spots the lines that ask to write something down', () => {
    for (const l of [
      'lunch Oct 2 Cafe Blue, who paid?',
      'not sure who paid for the taxi',
      'someone paid for parasailing 3600',
      'Rahul might have paid for the ferry',
      'maybe Priya paid for dinner',
      'note: ferry tickets, add later',
      'open item lunch at the shack',
      'boat ride, claim later',
    ])
      expect(isOpenItemLine(l), l).toBe(true)
  })
  it('leaves plain expenses alone', () => {
    for (const l of ['dinner 1200, I paid', 'Rahul paid 850 for cab', 'taxi 400 split 3 ways', 'lunch with Priya']) expect(isOpenItemLine(l), l).toBe(false)
  })
  it('reads the rest of the line, without the open-item words', () => {
    expect(openItemFromQuickLine('lunch Oct 2 Cafe Blue, who paid?', ctx)).toMatchObject({ title: 'Lunch Cafe Blue', date: '2026-10-02', category: 'food' })
    expect(openItemFromQuickLine('lunch Oct 2 Cafe Blue, who paid?', ctx).amount).toBeUndefined()
    const taxi = openItemFromQuickLine('not sure who paid for the taxi 450', ctx)
    expect(taxi.amount).toBe(45000)
    expect(taxi.title.toLowerCase()).toContain('taxi')
    expect(taxi.title.toLowerCase()).not.toContain('sure')
  })
  it('a guess names the suspects', () => {
    expect(openItemFromQuickLine('Rahul might have paid for the ferry', ctx)).toMatchObject({ suspects: ['r'] })
    expect(openItemFromQuickLine('dinner 2400, maybe Rahul or Priya paid', ctx).suspects).toEqual(['r', 'p'])
    expect(openItemFromQuickLine('lunch, who paid?', ctx).suspects).toBeUndefined()
  })
})
