import { afterEach, describe, expect, it } from 'vitest'
import type { Category, Expense, Group } from '@/types'
import {
  bucketFor,
  budgetRunUp,
  byCategory,
  byGroup,
  collectRows,
  compactMoney,
  counted,
  DEFAULT_FILTERS,
  daysBetween,
  filtersFromParams,
  filtersToParams,
  firstOfLastMonth,
  foldSlices,
  formatChange,
  headline,
  monthPace,
  overTime,
  paceWeeks,
  paidVsShare,
  previousBounds,
  rangeBounds,
  type Source,
} from './insights'
import { initLocale } from './locale'

initLocale({ region: 'IN', currency: 'INR', locale: 'en-IN', known: true })

let n = 0
const exp = (date: string, amount: number, splits: Record<string, number>, paidBy: Record<string, number>, category: Category = 'food'): Expense => ({
  id: `e${n++}`,
  groupId: 'g',
  description: 'x',
  amount,
  category,
  date,
  paidBy,
  splits,
  splitType: 'exact',
  splitInput: {},
  createdBy: 'me',
  createdAt: 0,
  updatedAt: 0,
})
const group = (id: string, type: Group['type'] = 'trip', currency = 'INR'): Group =>
  ({
    id,
    name: id.toUpperCase(),
    emoji: '🧪',
    type,
    currency,
    simplify: true,
    inviteCode: 'X',
    members: { me: { name: 'Me', color: '#000' }, b: { name: 'Bea', color: '#111' }, c: { name: 'Cal', color: '#222' } },
    memberUids: [],
    createdBy: 'me',
    createdAt: 0,
    updatedAt: 0,
  }) as unknown as Group

describe('date ranges', () => {
  const today = '2026-10-08'
  it('presets', () => {
    expect(rangeBounds({ range: 'month' }, today)).toEqual({ from: '2026-10-01', to: today })
    expect(rangeBounds({ range: '3m' }, today)).toEqual({ from: '2026-07-10', to: today })
    expect(rangeBounds({ range: 'year' }, today)).toEqual({ from: '2026-01-01', to: today })
    expect(rangeBounds({ range: 'all' }, today, '2025-03-02')).toEqual({ from: '2025-03-02', to: today })
  })
  it('custom falls back and swaps reversed bounds', () => {
    expect(rangeBounds({ range: 'custom', from: '2026-09-01' }, today)).toEqual({ from: '2026-09-01', to: today })
    expect(rangeBounds({ range: 'custom', to: '2026-09-30' }, today, '2026-01-05')).toEqual({ from: '2026-01-05', to: '2026-09-30' })
    expect(rangeBounds({ range: 'custom', from: '2026-09-30', to: '2026-09-01' }, today)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })
  it('previous period: same days last month / year, else the window before', () => {
    expect(previousBounds('month', { from: '2026-10-01', to: '2026-10-08' })).toEqual({ from: '2026-09-01', to: '2026-09-08' })
    expect(previousBounds('month', { from: '2026-03-01', to: '2026-03-31' })).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(previousBounds('month', { from: '2026-01-01', to: '2026-01-15' })).toEqual({ from: '2025-12-01', to: '2025-12-15' })
    expect(previousBounds('year', { from: '2026-01-01', to: '2026-10-08' })).toEqual({ from: '2025-01-01', to: '2025-10-08' })
    expect(previousBounds('3m', { from: '2026-07-10', to: '2026-10-08' })).toEqual({ from: '2026-04-10', to: '2026-07-09' })
    expect(previousBounds('all', { from: '2026-01-01', to: '2026-10-08' })).toBeNull()
  })
  it('daysBetween is inclusive', () => {
    expect(daysBetween('2026-10-01', '2026-10-08')).toBe(8)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(3) // across a DST change in many zones
  })
})

describe('rows and headline', () => {
  const g = group('g')
  const p = group('p', 'personal')
  const src: Source = {
    group: g,
    me: 'me',
    expenses: [
      exp('2026-10-02', 3000, { me: 1000, b: 1000, c: 1000 }, { b: 3000 }),
      exp('2026-10-05', 2000, { b: 1000, c: 1000 }, { me: 2000 }, 'transport'), // I paid, not my share
      exp('2026-09-03', 900, { me: 300, b: 300, c: 300 }, { me: 900 }, 'stay'),
      exp('2026-11-01', 999, { me: 999 }, { me: 999 }), // outside
    ],
  }
  const mine: Source = { group: p, me: 'me', expenses: [exp('2026-10-03', 500, { me: 500 }, { me: 500 }, 'groceries')] }
  const b = { from: '2026-10-01', to: '2026-10-08' }

  it('my share vs total; personal groups count in full', () => {
    const r = collectRows([src, mine], b, { categories: [], basis: 'mine' })
    expect(r.map((x) => x.value)).toEqual([1000, 0, 500])
    expect(r[1].paid).toBe(2000) // kept for paid vs share, but worth 0 on my basis
    const t = collectRows([src, mine], b, { categories: [], basis: 'total' })
    expect(t.map((x) => x.value)).toEqual([3000, 2000, 500])
  })
  it('category filter and conversion', () => {
    const r = collectRows([src], b, { categories: ['transport'], basis: 'total' }, (v) => v * 2)
    expect(r).toHaveLength(1)
    expect(r[0].value).toBe(4000)
  })
  it('headline: count excludes zero rows, change vs previous', () => {
    const r = collectRows([src, mine], b, { categories: [], basis: 'mine' })
    const prev = collectRows([src], { from: '2026-09-01', to: '2026-09-08' }, { categories: [], basis: 'mine' })
    const h = headline(r, b, '2026-10-08', prev)
    expect(h).toMatchObject({ total: 1500, count: 2, days: 8, dailyAvg: 188, prevTotal: 300, change: 4 })
    expect(headline(r, { from: '2026-10-01', to: '2026-12-31' }, '2026-10-08', null).days).toBe(8)
  })
  it('byGroup sorts and only counts paid/share for shared groups', () => {
    const r = collectRows([src, mine], b, { categories: [], basis: 'mine' })
    expect(byGroup(r)).toEqual([
      { id: 'g', name: 'G', emoji: '🧪', value: 1000, paid: 2000, share: 1000 },
      { id: 'p', name: 'P', emoji: '🧪', value: 500, paid: 0, share: 0 },
    ])
  })
  it('paidVsShare per member, me first', () => {
    const r = collectRows([src], b, { categories: [], basis: 'total' })
    expect(paidVsShare(src, r).map((m) => [m.id, m.paid, m.share])).toEqual([
      ['me', 2000, 1000],
      ['b', 3000, 2000],
      ['c', 0, 2000],
    ])
  })
})

describe('categories', () => {
  const mk = (category: Category, value: number) => ({
    e: exp('2026-10-01', value, {}, {}, category),
    src: { group: group('g'), expenses: [] },
    value,
    paid: 0,
    share: 0,
  })
  const rows = [mk('food', 500), mk('rent', 3000), mk('food', 500), mk('gifts', 200), mk('stay', 800)]
  it('sorts by value with shares', () => {
    const c = byCategory(rows)
    expect(c.map((s) => [s.key, s.value])).toEqual([
      ['rent', 3000],
      ['food', 1000],
      ['stay', 800],
      ['gifts', 200],
    ])
    expect(c[0].share).toBeCloseTo(0.6)
  })
  it('folds the tail and uncoloured categories into one last slice', () => {
    const f = foldSlices(byCategory(rows), 2, (c) => c !== 'gifts')
    expect(f.map((s) => [s.key, s.value])).toEqual([
      ['rent', 3000],
      ['food', 1000],
      ['other-fold', 1000],
    ])
    expect(foldSlices(byCategory(rows), 9, () => true).some((s) => s.key === 'other-fold')).toBe(false)
  })
})

describe('over time', () => {
  const mk = (date: string, value: number) => ({ e: exp(date, value, {}, {}), src: { group: group('g'), expenses: [] }, value, paid: 0, share: 0 })
  it('picks bucket by length', () => {
    expect(bucketFor({ from: '2026-10-01', to: '2026-10-08' })).toBe('day')
    expect(bucketFor({ from: '2026-07-10', to: '2026-10-08' })).toBe('week')
    expect(bucketFor({ from: '2026-01-01', to: '2026-10-08' })).toBe('month')
  })
  it('monthly buckets include empty months and mark the current one', () => {
    const pts = overTime([mk('2026-07-15', 100), mk('2026-09-02', 50), mk('2026-09-30', 50)], { from: '2026-07-10', to: '2026-10-08' }, '2026-10-08', 'month')
    expect(pts.map((p) => [p.key, p.value, p.current])).toEqual([
      ['2026-07', 100, false],
      ['2026-08', 0, false],
      ['2026-09', 100, false],
      ['2026-10', 0, true],
    ])
  })
  it('weeks count back from the end, the first clipped to the range', () => {
    const pts = overTime([mk('2026-10-01', 10), mk('2026-10-02', 5)], { from: '2026-09-20', to: '2026-10-08' }, '2026-10-08', 'week')
    expect(pts.map((p) => [p.start, p.end, p.value])).toEqual([
      ['2026-09-20', '2026-09-24', 0],
      ['2026-09-25', '2026-10-01', 10],
      ['2026-10-02', '2026-10-08', 5],
    ])
  })
  it('days', () => {
    const pts = overTime([mk('2026-10-02', 7)], { from: '2026-10-01', to: '2026-10-03' }, '2026-10-03')
    expect(pts.map((p) => [p.key, p.value, p.current])).toEqual([
      ['2026-10-01', 0, false],
      ['2026-10-02', 7, false],
      ['2026-10-03', 0, true],
    ])
  })
  it('month pace: cumulative this month to today, last month in full', () => {
    const p = monthPace([mk('2026-09-01', 100), mk('2026-09-10', 50), mk('2026-09-30', 10), mk('2026-10-01', 40), mk('2026-10-08', 80)], '2026-10-08')
    expect(p.points).toHaveLength(31)
    expect(p.points[7]).toEqual({ day: 8, thisMonth: 120, lastMonth: 100 })
    expect(p.points[8].thisMonth).toBeUndefined()
    expect(p.points[29].lastMonth).toBe(160)
    expect(p.points[30].lastMonth).toBeUndefined() // September has 30 days
    expect(p).toMatchObject({ thisTotal: 120, lastToDate: 100, lastTotal: 160 })
  })
  it('pace weeks: week-of-month buckets, current week partial, future weeks empty', () => {
    const p = monthPace([mk('2026-09-01', 100), mk('2026-09-10', 50), mk('2026-09-30', 10), mk('2026-10-01', 40), mk('2026-10-08', 80)], '2026-10-08')
    const w = paceWeeks(p.points, '2026-10-08')
    expect(w.map((x) => [x.from, x.to, x.thisMonth, x.lastMonth, x.current])).toEqual([
      [1, 7, 40, 100, false],
      [8, 14, 80, 50, true],
      [15, 21, undefined, 0, false],
      [22, 28, undefined, 0, false],
      [29, 31, undefined, 10, false], // September stops at the 30th
    ])
  })
  it('month pace across new year', () => {
    const p = monthPace([mk('2025-12-31', 5), mk('2026-01-01', 3)], '2026-01-02')
    expect(p).toMatchObject({ thisTotal: 3, lastTotal: 5, lastToDate: 0 })
  })
})

describe('formatting', () => {
  it('compact money uses Indian units for INR', () => {
    expect(compactMoney(0, 'INR', '₹')).toBe('₹0')
    expect(compactMoney(95000, 'INR', '₹')).toBe('₹950')
    expect(compactMoney(4500000, 'INR', '₹')).toBe('₹45k')
    expect(compactMoney(25000000, 'INR', '₹')).toBe('₹2.5L')
    expect(compactMoney(1200000000, 'INR', '₹')).toBe('₹1.2Cr')
    expect(compactMoney(250000000, 'USD', '$')).toBe('$2.5M')
    expect(compactMoney(15000, 'JPY', '¥')).toBe('¥15k')
  })
  it('change', () => {
    expect(formatChange(0.123)).toBe('+12%')
    expect(formatChange(-0.08)).toBe('−8%')
    expect(formatChange(0.001)).toBe('±0%')
  })
})

describe('filters in the URL', () => {
  it('reads params with defaults and drops junk', () => {
    expect(filtersFromParams(new URLSearchParams(''))).toEqual(DEFAULT_FILTERS)
    expect(filtersFromParams(new URLSearchParams('r=year&b=total&cat=food,nope,stay,food'))).toEqual({
      range: 'year',
      basis: 'total',
      categories: ['food', 'stay'],
    })
    expect(filtersFromParams(new URLSearchParams('r=9y&b=x'))).toEqual(DEFAULT_FILTERS)
    expect(filtersFromParams(new URLSearchParams('r=custom&from=2026-09-01&to=bad'))).toEqual({
      range: 'custom',
      from: '2026-09-01',
      categories: [],
      basis: 'mine',
    })
    // from/to only mean something for a custom range
    expect(filtersFromParams(new URLSearchParams('r=month&from=2026-09-01')).from).toBeUndefined()
  })
  it('writes only non-defaults and keeps the group selection', () => {
    const out = filtersToParams({ range: 'custom', from: '2026-09-01', categories: ['food'], basis: 'total' }, new URLSearchParams('group=a,b&r=year'))
    expect(Object.fromEntries(out)).toEqual({ group: 'a,b', r: 'custom', b: 'total', cat: 'food', from: '2026-09-01' })
    expect(filtersToParams(DEFAULT_FILTERS, new URLSearchParams('r=year&b=total&group=a')).toString()).toBe('group=a')
  })
  it('round-trips', () => {
    const f = { range: 'custom' as const, from: '2026-01-01', to: '2026-02-01', categories: ['rent' as Category], basis: 'total' as const }
    expect(filtersFromParams(filtersToParams(f, new URLSearchParams()))).toEqual(f)
  })
})

/*
 * Date correctness, carried over from the audit's version of this module (its compute() is gone, the
 * behaviour is checked here against the functions that replaced it): a month is the calendar month
 * written on the expense, whatever the device's time zone.
 */
// Node re-reads TZ on change; reached through globalThis because the app's tsconfig has no Node types.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env

describe('local calendar dates', () => {
  const tz = env.TZ
  afterEach(() => {
    if (tz === undefined) delete env.TZ
    else env.TZ = tz
  })
  const mk = (date: string, value: number) => ({ e: exp(date, value, {}, {}), src: { group: group('g'), expenses: [] }, value, paid: 0, share: 0 })

  for (const zone of ['Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Kiritimati', 'UTC']) {
    it(`keys months by the date written on the expense and includes the current month (${zone})`, () => {
      env.TZ = zone
      const b = { from: '2026-07-10', to: '2026-10-08' }
      const pts = overTime([mk('2026-10-01', 1000), mk('2026-09-30', 500), mk('2026-08-01', 200), mk('2026-08-31', 1)], b, '2026-10-08', 'month')
      expect(pts.map((p) => [p.key, p.start, p.end, p.value])).toEqual([
        ['2026-07', '2026-07-01', '2026-07-31', 0],
        ['2026-08', '2026-08-01', '2026-08-31', 201],
        ['2026-09', '2026-09-01', '2026-09-30', 500],
        ['2026-10', '2026-10-01', '2026-10-31', 1000],
      ])
      expect(rangeBounds({ range: 'month' }, '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-01' })
      expect(firstOfLastMonth('2026-10-31')).toBe('2026-09-01')
      expect(firstOfLastMonth('2026-01-01')).toBe('2025-12-01')
      expect(daysBetween('2026-02-28', '2026-03-01')).toBe(2)
      expect(daysBetween('2024-02-28', '2024-03-01')).toBe(3)
    })
  }

  it('months across a year boundary, starting at the first expense for all time', () => {
    const b = rangeBounds({ range: 'all' }, '2026-03-15', '2025-11-20')
    const pts = overTime([mk('2025-11-20', 100), mk('2026-01-10', 300)], b, '2026-03-15', 'month')
    expect(pts.map((p) => p.key)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02', '2026-03'])
    expect(pts.at(-1)!.current).toBe(true)
    expect(previousBounds('all', b)).toBeNull()
  })

  it('ignores future-dated expenses (the presets end today)', () => {
    const src: Source = {
      group: group('g'),
      me: 'me',
      expenses: [exp('2026-10-01', 1000, { me: 500, b: 500 }, { me: 1000 }), exp('2026-12-25', 5000, { me: 2500, b: 2500 }, { me: 5000 })],
    }
    const rows = collectRows([src], rangeBounds({ range: '3m' }, '2026-10-08'), { categories: [], basis: 'mine' })
    expect(rows.map((r) => r.value)).toEqual([500])
  })

  it('skips expenses you are not part of under "mine"', () => {
    const b = { from: '2026-10-01', to: '2026-10-08' }
    const notMine: Source = { group: group('g'), me: 'me', expenses: [exp('2026-10-01', 100, { b: 100 }, { b: 100 })] }
    expect(collectRows([notMine], b, { categories: [], basis: 'mine' })).toHaveLength(0)
    const noMe: Source = { group: group('g'), expenses: [exp('2026-10-01', 100, { me: 50, b: 50 }, { me: 100 })] }
    expect(counted(collectRows([noMe], b, { categories: [], basis: 'mine' }))).toHaveLength(0)
  })
})

describe('budget run-up', () => {
  it('accumulates over the whole group, from the trip start', () => {
    const g = { budget: 1000, startDate: '2026-09-28' }
    const r = budgetRunUp({ group: g, expenses: [exp('2026-10-03', 300, {}, {}), exp('2026-10-01', 100, {}, {}), exp('2026-10-01', 50, {}, {})] })
    expect(r).toEqual({
      budget: 1000,
      spent: 450,
      points: [
        { key: '2026-09-28', label: '28 Sept', value: 0 },
        { key: '2026-10-01', label: '1 Oct', value: 150 },
        { key: '2026-10-03', label: '3 Oct', value: 450 },
      ],
    })
    expect(budgetRunUp({ group: {}, expenses: [] })).toBeNull()
  })
})
