import { describe, expect, it } from 'vitest'
import type { Expense, Recurrence } from '@/types'
import {
  daysInMonth, dueOccurrences, firstNextDate, makeOccurrence, MAX_CATCH_UP, nextAfter, nthOccurrence, occurrenceId, planCatchUp,
} from './recurrence'

const tpl = (date: string, recurrence?: Recurrence) => ({ date, recurrence })

describe('daysInMonth', () => {
  it('knows month lengths and leap years', () => {
    expect(daysInMonth(2026, 1)).toBe(31)
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2100, 2)).toBe(28) // not a leap year
    expect(daysInMonth(2000, 2)).toBe(29) // divisible by 400
    expect(daysInMonth(2026, 4)).toBe(30)
    expect(daysInMonth(2026, 12)).toBe(31)
  })
})

describe('nthOccurrence', () => {
  it('weekly and fortnightly add days, crossing months and years', () => {
    expect(nthOccurrence('2026-12-28', 'weekly', 1)).toBe('2027-01-04')
    expect(nthOccurrence('2026-02-20', 'fortnightly', 1)).toBe('2026-03-06')
    expect(nthOccurrence('2028-02-22', 'weekly', 1)).toBe('2028-02-29')
    expect(nthOccurrence('2026-01-01', 'weekly', 0)).toBe('2026-01-01')
  })

  it('monthly clamps to the last day of short months without drifting', () => {
    const a = '2026-01-31'
    expect([1, 2, 3, 4, 5].map((n) => nthOccurrence(a, 'monthly', n))).toEqual([
      '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30',
    ])
  })

  it('monthly uses Feb 29 in leap years', () => {
    expect(nthOccurrence('2028-01-31', 'monthly', 1)).toBe('2028-02-29')
    expect(nthOccurrence('2028-01-30', 'monthly', 1)).toBe('2028-02-29')
    expect(nthOccurrence('2028-01-29', 'monthly', 1)).toBe('2028-02-29')
    expect(nthOccurrence('2028-01-28', 'monthly', 1)).toBe('2028-02-28')
  })

  it('monthly rolls over the year', () => {
    expect(nthOccurrence('2026-11-15', 'monthly', 2)).toBe('2027-01-15')
    expect(nthOccurrence('2026-12-31', 'monthly', 2)).toBe('2027-02-28')
    expect(nthOccurrence('2026-12-31', 'monthly', 14)).toBe('2028-02-29')
  })

  it('yearly clamps Feb 29 to Feb 28 and returns to Feb 29 on leap years', () => {
    expect(nthOccurrence('2028-02-29', 'yearly', 1)).toBe('2029-02-28')
    expect(nthOccurrence('2028-02-29', 'yearly', 4)).toBe('2032-02-29')
    expect(nthOccurrence('2026-07-04', 'yearly', 3)).toBe('2029-07-04')
  })

  it('firstNextDate is the occurrence after the anchor', () => {
    expect(firstNextDate('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(firstNextDate('2026-10-07', 'weekly')).toBe('2026-10-14')
  })
})

describe('nextAfter', () => {
  it('skips past occurrences up to and including the cutoff', () => {
    expect(nextAfter('2026-01-31', 'monthly', '2026-10-07')).toBe('2026-10-31')
    expect(nextAfter('2026-01-31', 'monthly', '2026-10-31')).toBe('2026-11-30')
    expect(nextAfter('2026-10-01', 'weekly', '2026-10-07')).toBe('2026-10-08')
  })
  it('never returns the anchor itself, even when the anchor is in the future', () => {
    expect(nextAfter('2026-12-25', 'yearly', '2026-10-07')).toBe('2027-12-25')
  })
})

describe('dueOccurrences', () => {
  it('returns nothing for non-recurring expenses', () => {
    expect(dueOccurrences(tpl('2026-01-01'), '2026-12-31')).toEqual({ dates: [], recurrence: undefined, changed: false })
  })

  it('returns nothing when the next date is in the future', () => {
    const r: Recurrence = { freq: 'monthly', nextDate: '2026-11-07' }
    expect(dueOccurrences(tpl('2026-10-07', r), '2026-10-31')).toEqual({ dates: [], recurrence: r, changed: false })
  })

  it('includes an occurrence due exactly today', () => {
    const r = dueOccurrences(tpl('2026-10-07', { freq: 'weekly', nextDate: '2026-10-14' }), '2026-10-14')
    expect(r.dates).toEqual(['2026-10-14'])
    expect(r.recurrence).toEqual({ freq: 'weekly', nextDate: '2026-10-21' })
    expect(r.changed).toBe(true)
  })

  it('catches up every missed weekly occurrence', () => {
    const r = dueOccurrences(tpl('2026-09-01', { freq: 'weekly', nextDate: '2026-09-08' }), '2026-10-07')
    expect(r.dates).toEqual(['2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06'])
    expect(r.recurrence?.nextDate).toBe('2026-10-13')
  })

  it('catches up fortnightly', () => {
    const r = dueOccurrences(tpl('2026-08-01', { freq: 'fortnightly', nextDate: '2026-08-15' }), '2026-09-12')
    expect(r.dates).toEqual(['2026-08-15', '2026-08-29', '2026-09-12'])
    expect(r.recurrence?.nextDate).toBe('2026-09-26')
  })

  it('catches up monthly from the 31st with clamping', () => {
    const r = dueOccurrences(tpl('2026-01-31', { freq: 'monthly', nextDate: '2026-02-28' }), '2026-05-01')
    expect(r.dates).toEqual(['2026-02-28', '2026-03-31', '2026-04-30'])
    expect(r.recurrence?.nextDate).toBe('2026-05-31')
  })

  it('resumes mid-series without drifting from the anchor day', () => {
    // nextDate already advanced past a clamped February.
    const r = dueOccurrences(tpl('2026-01-31', { freq: 'monthly', nextDate: '2026-03-31' }), '2026-04-30')
    expect(r.dates).toEqual(['2026-03-31', '2026-04-30'])
    expect(r.recurrence?.nextDate).toBe('2026-05-31')
  })

  it('snaps a hand-edited nextDate to the next real occurrence', () => {
    const r = dueOccurrences(tpl('2026-01-10', { freq: 'monthly', nextDate: '2026-03-01' }), '2026-04-15')
    expect(r.dates).toEqual(['2026-03-10', '2026-04-10'])
  })

  it('catches up yearly across a leap day', () => {
    const r = dueOccurrences(tpl('2028-02-29', { freq: 'yearly', nextDate: '2029-02-28' }), '2032-03-01')
    expect(r.dates).toEqual(['2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29'])
    expect(r.recurrence?.nextDate).toBe('2033-02-28')
  })

  it('stops at until (inclusive) and ends the series', () => {
    const r = dueOccurrences(tpl('2026-01-15', { freq: 'monthly', nextDate: '2026-02-15', until: '2026-04-15' }), '2026-10-07')
    expect(r.dates).toEqual(['2026-02-15', '2026-03-15', '2026-04-15'])
    expect(r.recurrence).toBeUndefined()
    expect(r.changed).toBe(true)
  })

  it('keeps the series alive while the next date is still before until', () => {
    const r = dueOccurrences(tpl('2026-01-15', { freq: 'monthly', nextDate: '2026-02-15', until: '2026-12-31' }), '2026-03-20')
    expect(r.dates).toEqual(['2026-02-15', '2026-03-15'])
    expect(r.recurrence).toEqual({ freq: 'monthly', nextDate: '2026-04-15', until: '2026-12-31' })
  })

  it('ends a series whose until is before the next date even with nothing due', () => {
    const r = dueOccurrences(tpl('2026-01-15', { freq: 'monthly', nextDate: '2026-02-15', until: '2026-02-01' }), '2026-01-20')
    expect(r.dates).toEqual([])
    expect(r.recurrence).toBeUndefined()
    expect(r.changed).toBe(true)
  })

  it('does not end a series early just because until is in the future', () => {
    const r = dueOccurrences(tpl('2026-10-01', { freq: 'weekly', nextDate: '2026-10-08', until: '2027-01-01' }), '2026-10-07')
    expect(r).toEqual({ dates: [], recurrence: { freq: 'weekly', nextDate: '2026-10-08', until: '2027-01-01' }, changed: false })
  })

  it('caps a very long catch-up and resumes on the next call', () => {
    const first = dueOccurrences(tpl('2000-01-01', { freq: 'weekly', nextDate: '2000-01-08' }), '2026-10-07')
    expect(first.dates).toHaveLength(MAX_CATCH_UP)
    const second = dueOccurrences(tpl('2000-01-01', first.recurrence), '2026-10-07')
    expect(second.dates[0]).toBe(first.recurrence!.nextDate)
    expect(second.dates[0] > first.dates.at(-1)!).toBe(true)
  })

  it('is idempotent: catching up twice yields nothing new', () => {
    const t = tpl('2026-08-31', { freq: 'monthly', nextDate: '2026-09-30' })
    const a = dueOccurrences(t, '2026-10-07')
    expect(a.dates).toEqual(['2026-09-30'])
    const b = dueOccurrences({ ...t, recurrence: a.recurrence }, '2026-10-07')
    expect(b).toEqual({ dates: [], recurrence: a.recurrence, changed: false })
  })

  it('is deterministic for two clients starting from the same state', () => {
    const t = tpl('2026-06-30', { freq: 'monthly', nextDate: '2026-07-30' })
    expect(dueOccurrences(t, '2026-10-07')).toEqual(dueOccurrences(t, '2026-10-07'))
  })
})

describe('occurrences', () => {
  const template: Expense = {
    id: 'e_rent', groupId: 'g1', description: 'Rent', amount: 120000, category: 'rent', date: '2026-01-31',
    paidBy: { a: 120000 }, splits: { a: 60000, b: 60000 }, splitType: 'equal', splitInput: { selected: ['a', 'b'] },
    receiptUrl: 'https://example.com/r.jpg', receiptPath: 'receipts/g1/e_rent-abc.jpg', createdBy: 'u1', createdAt: 1, updatedAt: 1,
    recurrence: { freq: 'monthly', nextDate: '2026-02-28' },
  }

  it('uses deterministic ids', () => {
    expect(occurrenceId('e_rent', '2026-02-28')).toBe('e_rent_2026-02-28')
  })

  it('copies the split but not the recurrence or receipt', () => {
    const o = makeOccurrence(template, '2026-02-28', 99)
    expect(o.id).toBe('e_rent_2026-02-28')
    expect(o.date).toBe('2026-02-28')
    expect(o.recurringFrom).toBe('e_rent')
    expect(o.recurrence).toBeUndefined()
    expect(o.receiptUrl).toBeUndefined()
    expect(o).not.toHaveProperty('receiptPath')
    expect(o.splits).toEqual(template.splits)
    expect(o.createdAt).toBe(99)
  })

  it('planCatchUp returns occurrences and the advanced template', () => {
    const plan = planCatchUp(template, '2026-04-01', 5)!
    expect(plan.occurrences.map((o) => o.id)).toEqual(['e_rent_2026-02-28', 'e_rent_2026-03-31'])
    expect(plan.template.recurrence).toEqual({ freq: 'monthly', nextDate: '2026-04-30' })
    expect(planCatchUp(plan.template, '2026-04-01')).toBeNull()
  })

  it('planCatchUp returns null for a plain expense', () => {
    expect(planCatchUp({ ...template, recurrence: undefined }, '2026-12-01')).toBeNull()
  })
})
