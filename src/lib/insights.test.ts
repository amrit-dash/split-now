import { describe, expect, it } from 'vitest'
import type { Expense } from '@/types'
import { compute, dayNumber, deltaPercent, parseBasis, parsePeriod, periodDays, type InsightGroup } from './insights'
import { initLocale } from './locale'

initLocale({ region: 'IN', currency: 'INR', locale: 'en-IN', known: true })

const members = { me: { name: 'Amrit', uid: 'u1', color: '#1' }, ro: { name: 'Rohan Das', uid: 'u2', color: '#2' }, pr: { name: 'Priya', color: '#3' } }
let n = 0
const exp = (date: string, amount: number, extra: Partial<Expense> = {}): Expense =>
  ({
    id: `e${n++}`,
    groupId: 'g',
    description: 'x',
    amount,
    currency: 'INR',
    category: 'food',
    date,
    paidBy: { me: amount },
    splits: { me: amount / 2, ro: amount / 2 },
    splitType: 'equal',
    createdBy: 'u1',
    createdAt: 1,
    ...extra,
  }) as Expense
const group = (expenses: Expense[], extra: Partial<InsightGroup['group']> = {}, me: string | null = 'me'): InsightGroup => ({
  group: { id: 'g', name: 'Goa', emoji: '🏖️', type: 'trip', currency: 'INR', members, ...extra },
  expenses,
  me: me ?? undefined,
})

describe('parsing', () => {
  it('reads the URL params with defaults', () => {
    expect(parsePeriod('12m')).toBe('12m')
    expect(parsePeriod('9y')).toBe('3m')
    expect(parseBasis('total')).toBe('total')
    expect(parseBasis(null)).toBe('mine')
    expect(periodDays('1m')).toBe(28)
    expect(periodDays('all')).toBe(Infinity)
  })
  it('counts days without a time zone', () => {
    expect(dayNumber('2026-03-01') - dayNumber('2026-02-28')).toBe(1)
    expect(dayNumber('2024-03-01') - dayNumber('2024-02-28')).toBe(2)
  })
})

describe('compute: months', () => {
  it('keys buckets by the calendar month written on the expense and includes the current month', () => {
    const s = compute([group([exp('2026-10-05', 1000), exp('2026-09-30', 500), exp('2026-08-01', 200)])], '3m', 'total', undefined, '2026-10-08')
    expect(s.series.map((p) => p.key)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(s.series.map((p) => p.value)).toEqual([200, 500, 1000])
    expect(s.series.map((p) => p.label)).toEqual(['Aug', 'Sept', 'Oct'])
    expect(s.total).toBe(1700)
  })
  it('starts at the first expense inside the period (never before the cutoff) and shows the year across a year boundary', () => {
    const s = compute([group([exp('2025-11-20', 100), exp('2026-01-10', 300), exp('2024-01-01', 999)])], '12m', 'total', undefined, '2026-03-15')
    expect(s.series[0].key).toBe('2025-11')
    // nothing in range: just the current month (the screen shows its empty state anyway)
    expect(compute([group([exp('2024-01-01', 999)])], '12m', 'total', undefined, '2026-03-15').series.map((p) => p.key)).toEqual(['2026-03'])
    expect(s.series.at(-1)!.key).toBe('2026-03')
    expect(s.series.find((p) => p.key === '2026-01')!.label).toMatch(/Jan.*26/)
    expect(s.total).toBe(400)
  })
  it('ignores future-dated expenses and uses your share by default', () => {
    const s = compute([group([exp('2026-10-01', 1000), exp('2026-12-25', 5000)])], '3m', 'mine', undefined, '2026-10-08')
    expect(s.count).toBe(1)
    expect(s.total).toBe(500)
  })
  it('all time: every month since the first expense, no previous period', () => {
    const s = compute([group([exp('2026-04-03', 10), exp('2026-10-01', 20)])], 'all', 'total', undefined, '2026-10-08')
    expect(s.series).toHaveLength(7)
    expect(s.prevTotal).toBeNull()
  })
})

describe('compute: weeks', () => {
  it('uses four full weeks ending today, labelled by the week’s first day', () => {
    const s = compute(
      [group([exp('2026-10-08', 10), exp('2026-10-01', 20), exp('2026-09-11', 30), exp('2026-09-10', 999)])],
      '1m',
      'total',
      undefined,
      '2026-10-08',
    )
    expect(s.bucket).toBe('week')
    expect(s.series.map((p) => p.key)).toEqual(['2026-09-11', '2026-09-18', '2026-09-25', '2026-10-02'])
    expect(s.series.map((p) => p.value)).toEqual([30, 0, 20, 10])
    expect(s.total).toBe(60)
    expect(s.prevTotal).toBe(999)
  })
})

describe('compute: the rest', () => {
  it('previous-period delta', () => {
    const s = compute([group([exp('2026-10-01', 1200), exp('2026-06-01', 1000)])], '3m', 'total', undefined, '2026-10-08')
    expect(s.prevTotal).toBe(1000)
    expect(deltaPercent(s.total, s.prevTotal)).toBe(20)
    expect(deltaPercent(100, 0)).toBeNull()
    expect(deltaPercent(100, null)).toBeNull()
  })
  it('folds unlisted categories into Other, last', () => {
    const s = compute(
      [group([exp('2026-10-01', 100, { category: 'other' }), exp('2026-10-02', 50, { category: 'food' })])],
      '3m',
      'total',
      undefined,
      '2026-10-08',
    )
    expect(s.cats.map((c) => [c.label, c.value])).toEqual([
      ['Food & drink', 50],
      ['Other', 100],
    ])
  })
  it('paid vs share per member for one group, first names, sorted by activity', () => {
    const s = compute([group([exp('2026-10-01', 1000, { paidBy: { ro: 1000 }, splits: { me: 600, ro: 400 } })])], '3m', 'mine', undefined, '2026-10-08')
    expect(s.members).toEqual([
      { id: 'ro', name: 'Rohan', paid: 1000, share: 400 },
      { id: 'me', name: 'You', paid: 0, share: 600 },
    ])
    expect(s.people).toEqual([])
  })
  it('people you spend with across groups, top 5, matched by uid or name', () => {
    const g2: InsightGroup = {
      ...group([exp('2026-10-02', 300, { splits: { me: 100, pr2: 200 } })]),
      group: { ...group([]).group, id: 'h', members: { me: members.me, pr2: { name: 'priya', color: '#9' } } },
    }
    const s = compute([group([exp('2026-10-01', 400, { splits: { me: 200, ro: 100, pr: 100 } })]), g2], '3m', 'mine', undefined, '2026-10-08')
    expect(s.people).toEqual([
      { key: 'n:priya', name: 'Priya', value: 300 },
      { key: 'u:u2', name: 'Rohan Das', value: 200 },
    ])
    expect(s.members).toEqual([])
  })
  it('converts to the home currency when asked', () => {
    const s = compute([group([exp('2026-10-01', 100)])], '3m', 'total', (v) => v * 2, '2026-10-08')
    expect(s.total).toBe(200)
    expect(s.top[0].v).toBe(200)
  })
  it('budget run-up over the whole group, from the trip start', () => {
    const s = compute(
      [group([exp('2026-10-03', 300), exp('2026-10-01', 100), exp('2026-10-01', 50)], { budget: 1000, startDate: '2026-09-28' })],
      '1m',
      'total',
      undefined,
      '2026-10-08',
    )
    expect(s.budget).toEqual({
      budget: 1000,
      spent: 450,
      points: [
        { key: '2026-09-28', label: '28 Sept', value: 0 },
        { key: '2026-10-01', label: '1 Oct', value: 150 },
        { key: '2026-10-03', label: '3 Oct', value: 450 },
      ],
    })
    expect(compute([group([], {})], '1m', 'total', undefined, '2026-10-08').budget).toBeNull()
  })
  it('skips expenses you are not part of under "mine"', () => {
    expect(compute([group([exp('2026-10-01', 100, { splits: { ro: 100 } })])], '3m', 'mine', undefined, '2026-10-08').count).toBe(0)
    expect(compute([group([exp('2026-10-01', 100)], {}, null)], '3m', 'mine', undefined, '2026-10-08').count).toBe(0)
  })
})
