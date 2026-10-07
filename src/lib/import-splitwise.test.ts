import { describe, expect, it } from 'vitest'
import type { Expense, Group, Settlement } from '@/types'
import { netBalances } from './balances'
import { groupCsv } from './export'
import {
  detectDateOrder, groupNameFromFilename, mapSplitwiseCategory, parseAmount, parseCsvRows, parseDate, parseImportCsv,
  parseSplitwiseCsv, reconstruct, ImportError, type ImportResult,
} from './import-splitwise'

/** Shaped like a real Splitwise "Export as spreadsheet" file: BOM, blank line after the header, totals at the end. */
const SPLITWISE = '﻿' + [
  'Date,Description,Category,Cost,Currency,Alice Nguyen,Bob Smith,Cara Lee',
  '',
  '2024-03-01,Dinner at Chin Chin,Dining out,90.00,AUD,60.00,-30.00,-30.00',
  '2024-03-02,"Uber, airport to hotel",Taxi,47.50,AUD,-15.83,31.67,-15.84',
  '2024-03-02,Airbnb,Hotel,600.00,AUD,-200.00,-200.00,400.00',
  '2024-03-03,"The ""best"" gelato",General,10.00,AUD,-5.00,5.00,0.00',
  '2024-03-04,Groceries,Groceries,100.00,AUD,50.00,0.00,-50.00',
  '2024-03-05,Bob S. paid Alice N.,Payment,30.00,AUD,-30.00,30.00,0.00',
  '2024-03-06,Coffee (just me),Dining out,5.00,AUD,0.00,0.00,0.00',
  '',
  '2024-03-10,Total balance, , ,AUD,-140.83,-163.33,304.16',
  '',
].join('\r\n')

function expectBalancesMatchTotals(r: ImportResult) {
  expect(r.totals).not.toBeNull()
  expect(r.totalsMatch).toBe(true)
  for (const m of r.members) expect(r.balances[m]).toBe(r.totals![m])
  // And each rebuilt expense is internally consistent.
  for (const e of r.expenses) {
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)
    expect(sum(e.paidBy)).toBe(e.amount)
    expect(sum(e.splits)).toBe(e.amount)
    for (const v of [...Object.values(e.paidBy), ...Object.values(e.splits)]) expect(v).toBeGreaterThan(0)
    for (const m of r.members) expect((e.paidBy[m] ?? 0) - (e.splits[m] ?? 0)).toBe(e.nets[m] ?? 0)
  }
}

/** Run the result through the app's own balance maths, as the import screen will store it. */
function appBalances(r: ImportResult) {
  const ids = Object.fromEntries(r.members.map((m, i) => [m, `m${i}`]))
  const remap = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [ids[k], v]))
  const expenses = r.expenses.map((e, i) => ({
    id: `e${i}`, groupId: 'g', description: e.description, amount: e.amount, category: e.category, date: e.date,
    paidBy: remap(e.paidBy), splits: remap(e.splits), splitType: 'exact', splitInput: { exact: remap(e.splits) },
    createdBy: 'u', createdAt: i, updatedAt: i,
  }) as Expense)
  const settlements = r.payments.map((p, i) => ({
    id: `s${i}`, groupId: 'g', from: ids[p.from], to: ids[p.to], amount: p.amount, method: 'other', date: p.date, createdBy: 'u', createdAt: i,
  }) as Settlement)
  const net = netBalances(expenses, settlements)
  return Object.fromEntries(r.members.map((m) => [m, net[ids[m]] ?? 0]))
}

describe('parseCsvRows', () => {
  it('handles BOM, quotes, escaped quotes, commas and newlines inside quotes', () => {
    const rows = parseCsvRows('﻿a,b,c\r\n"x, y","say ""hi""","multi\nline"\n1,2,3')
    expect(rows).toEqual([['a', 'b', 'c'], ['x, y', 'say "hi"', 'multi\nline'], ['1', '2', '3']])
  })
  it('keeps blank lines as empty rows and copes with a missing trailing newline / CR-only endings', () => {
    expect(parseCsvRows('a,b\r\n\r\n1,2')).toEqual([['a', 'b'], [''], ['1', '2']])
    expect(parseCsvRows('a,b\r1,2\r')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('detects semicolon and tab delimiters (Excel in comma-decimal locales)', () => {
    expect(parseCsvRows('Date;Cost\n2024-01-01;"12,50"')).toEqual([['Date', 'Cost'], ['2024-01-01', '12,50']])
    expect(parseCsvRows('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('parseAmount', () => {
  it('reads common spreadsheet number formats', () => {
    expect(parseAmount('12.34')).toBe(1234)
    expect(parseAmount('-0.05')).toBe(-5)
    expect(parseAmount('1,234.56')).toBe(123456)
    expect(parseAmount('1.234,56')).toBe(123456)
    expect(parseAmount('12,5')).toBe(1250)
    expect(parseAmount('1,234')).toBe(123400)
    expect(parseAmount('(5.00)')).toBe(-500)
    expect(parseAmount('−5.00')).toBe(-500)
    expect(parseAmount(' $7 ')).toBe(700)
    expect(parseAmount('0.29')).toBe(29)
  })
  it('uses the currency’s minor units', () => {
    expect(parseAmount('1200.00', 'JPY')).toBe(1200)
    expect(parseAmount('1.234', 'BHD')).toBe(1234)
  })
  it('rejects junk', () => {
    expect(parseAmount('')).toBeNaN()
    expect(parseAmount('abc')).toBeNaN()
    expect(parseAmount('-')).toBeNaN()
  })
})

describe('parseDate', () => {
  it('reads ISO and ISO-with-time', () => {
    expect(parseDate('2024-03-01')).toBe('2024-03-01')
    expect(parseDate('2024-03-01T10:22:00Z')).toBe('2024-03-01')
    expect(parseDate('2024/3/1 10:22')).toBe('2024-03-01')
  })
  it('reads slash dates with a column-wide order', () => {
    expect(parseDate('03/04/2024', 'dmy')).toBe('2024-04-03')
    expect(parseDate('03/04/2024', 'mdy')).toBe('2024-03-04')
    expect(parseDate('25/12/24', 'mdy')).toBe('2024-12-25') // impossible as m/d, falls back
    expect(parseDate('1.2.2024')).toBe('2024-02-01')
    expect(detectDateOrder(['01/02/2024', '12/25/2024'])).toBe('mdy')
    expect(detectDateOrder(['25/12/2024', '01/02/2024'])).toBe('dmy')
  })
  it('reads month names', () => {
    expect(parseDate('10 Mar 2024')).toBe('2024-03-10')
    expect(parseDate('March 10, 2024')).toBe('2024-03-10')
    expect(parseDate('Mar 9 2024')).toBe('2024-03-09')
  })
  it('rejects impossible dates', () => {
    expect(parseDate('2024-02-30')).toBeNull()
    expect(parseDate('yesterday')).toBeNull()
    expect(parseDate('')).toBeNull()
  })
})

describe('mapSplitwiseCategory', () => {
  it('maps Splitwise subcategories', () => {
    expect(mapSplitwiseCategory('Dining out')).toBe('food')
    expect(mapSplitwiseCategory('Groceries')).toBe('groceries')
    expect(mapSplitwiseCategory('Taxi')).toBe('transport')
    expect(mapSplitwiseCategory('Hotel')).toBe('stay')
    expect(mapSplitwiseCategory('Plane')).toBe('travel')
    expect(mapSplitwiseCategory('TV/Phone/Internet')).toBe('utilities')
    expect(mapSplitwiseCategory('Rent')).toBe('rent')
    expect(mapSplitwiseCategory('Medical expenses')).toBe('health')
    expect(mapSplitwiseCategory('Gifts')).toBe('gifts')
  })
  it('falls back to the description, then other', () => {
    expect(mapSplitwiseCategory('General', 'Pizza night')).toBe('food')
    expect(mapSplitwiseCategory('General', 'Mystery')).toBe('other')
    expect(mapSplitwiseCategory('', '')).toBe('other')
  })
  it('accepts our own labels', () => {
    expect(mapSplitwiseCategory('Food & drink')).toBe('food')
    expect(mapSplitwiseCategory('Flights & travel')).toBe('travel')
  })
})

describe('reconstruct', () => {
  const order = ['A', 'B', 'C']
  it('single payer who also had a share', () => {
    expect(reconstruct(9000, { A: 6000, B: -3000, C: -3000 }, order)).toEqual({
      amount: 9000, paidBy: { A: 9000 }, splits: { A: 3000, B: 3000, C: 3000 },
    })
  })
  it('payer paid only for others (cost = positive nets)', () => {
    expect(reconstruct(5000, { A: 5000, C: -5000 }, order)).toEqual({ amount: 5000, paidBy: { A: 5000 }, splits: { C: 5000 } })
  })
  it('several creditors share the remainder in proportion, cent-exact', () => {
    const r = reconstruct(10001, { A: 3000, B: 1000, C: -4000 }, order)
    expect(r.amount).toBe(10001)
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)
    expect(sum(r.paidBy)).toBe(10001)
    expect(sum(r.splits)).toBe(10001)
    expect(r.paidBy.A - r.splits.A).toBe(3000)
    expect(r.paidBy.B - r.splits.B).toBe(1000)
    expect(r.splits.C).toBe(4000)
  })
  it('raises an inconsistent (too small) cost so nets still hold', () => {
    expect(reconstruct(100, { A: 500, B: -500 }, order).amount).toBe(500)
  })
})

describe('parseSplitwiseCsv', () => {
  const r = parseSplitwiseCsv(SPLITWISE)
  it('finds members, currency, rows and dates', () => {
    expect(r.source).toBe('splitwise')
    expect(r.members).toEqual(['Alice Nguyen', 'Bob Smith', 'Cara Lee'])
    expect(r.currency).toBe('AUD')
    expect(r.expenses).toHaveLength(5)
    expect(r.payments).toEqual([{ date: '2024-03-05', description: 'Bob S. paid Alice N.', from: 'Bob Smith', to: 'Alice Nguyen', amount: 3000 }])
    expect(r.dateRange).toEqual({ from: '2024-03-01', to: '2024-03-05' })
    expect(r.skipped).toBe(1)
    expect(r.warnings.join(' ')).toMatch(/didn’t change anyone’s balance/)
  })
  it('keeps descriptions with commas and quotes', () => {
    expect(r.expenses.map((e) => e.description)).toContain('Uber, airport to hotel')
    expect(r.expenses.map((e) => e.description)).toContain('The "best" gelato')
  })
  it('maps categories', () => {
    expect(r.expenses.map((e) => e.category)).toEqual(['food', 'transport', 'stay', 'other', 'groceries'])
  })
  it('rebuilds the usual “one person paid, split between people” shape', () => {
    const dinner = r.expenses[0]
    expect(dinner.amount).toBe(9000)
    expect(dinner.paidBy).toEqual({ 'Alice Nguyen': 9000 })
    expect(dinner.splits).toEqual({ 'Alice Nguyen': 3000, 'Bob Smith': 3000, 'Cara Lee': 3000 })
  })
  it('balances equal Splitwise’s Total balance row exactly', () => {
    expect(r.totals).toEqual({ 'Alice Nguyen': -14083, 'Bob Smith': -16333, 'Cara Lee': 30416 })
    expectBalancesMatchTotals(r)
    expect(appBalances(r)).toEqual(r.totals)
  })
  it('flags totals that don’t match', () => {
    const bad = parseSplitwiseCsv(SPLITWISE.replace('-140.83,-163.33,304.16', '-140.00,-164.16,304.16'))
    expect(bad.totalsMatch).toBe(false)
  })
})

describe('parseSplitwiseCsv: tolerance', () => {
  it('works without the blank lines, BOM or totals row, with LF endings', () => {
    const r = parseSplitwiseCsv('Date,Description,Category,Cost,Currency,A,B\n2024-01-01,Lunch,General,20.00,USD,10.00,-10.00\n')
    expect(r.currency).toBe('USD')
    expect(r.expenses).toHaveLength(1)
    expect(r.totals).toBeNull()
    expect(r.totalsMatch).toBeNull()
    expect(r.warnings.join(' ')).toMatch(/Total balance/)
  })
  it('reads semicolon-separated, decimal-comma, d/m/y files (re-saved from Excel)', () => {
    const csv = [
      'Date;Description;Category;Cost;Currency;Ana;Bea',
      '25/12/2023;Christmas lunch;Dining out;"80,00";EUR;"40,00";"-40,00"',
      '01/01/2024;Taxi;Taxi;"12,40";EUR;"-6,20";"6,20"',
      ';Total balance;;;EUR;"33,80";"-33,80"',
    ].join('\n')
    const r = parseSplitwiseCsv(csv)
    expect(r.expenses.map((e) => e.date)).toEqual(['2023-12-25', '2024-01-01'])
    expectBalancesMatchTotals(r)
  })
  it('assumes Splitwise’s column order for translated headers', () => {
    const csv = 'Fecha,Descripción,Categoría,Coste,Moneda,Ana,Bea\n2024-01-01,Cena,General,30.00,EUR,15.00,-15.00\n\n2024-01-02,Saldo total, , ,EUR,15.00,-15.00\n'
    const r = parseSplitwiseCsv(csv)
    expect(r.members).toEqual(['Ana', 'Bea'])
    expect(r.warnings[0]).toMatch(/column order/)
    expectBalancesMatchTotals(r)
  })
  it('imports the main currency and skips (and reports) the others', () => {
    const csv = [
      'Date,Description,Category,Cost,Currency,A,B',
      '2024-01-01,Hotel,Hotel,200.00,THB,100.00,-100.00',
      '2024-01-02,Dinner,Dining out,40.00,AUD,20.00,-20.00',
      '2024-01-03,Bus,Bus/train,60.00,THB,-30.00,30.00',
      '',
      '2024-01-05,Total balance, , ,AUD,20.00,-20.00',
      '2024-01-05,Total balance, , ,THB,70.00,-70.00',
    ].join('\n')
    const r = parseSplitwiseCsv(csv)
    expect(r.currency).toBe('THB')
    expect(r.expenses).toHaveLength(2)
    expect(r.skipped).toBe(1)
    expect(r.warnings.join(' ')).toMatch(/AUD .*skipped/)
    expectBalancesMatchTotals(r)
  })
  it('handles zero-decimal currencies', () => {
    const r = parseSplitwiseCsv('Date,Description,Category,Cost,Currency,A,B\n2024-01-01,Ramen,Dining out,3000,JPY,1500,-1500\n2024-01-09,Total balance,,,JPY,1500,-1500')
    expect(r.expenses[0].amount).toBe(3000)
    expectBalancesMatchTotals(r)
  })
  it('repairs rows that don’t net to zero and says so', () => {
    const r = parseSplitwiseCsv('Date,Description,Category,Cost,Currency,A,B,C\n2024-01-01,Odd,General,10.00,AUD,6.67,-3.33,-3.33\n')
    expect(r.warnings.join(' ')).toMatch(/didn’t add up to zero/)
    const e = r.expenses[0]
    expect(Object.values(e.nets).reduce((a, b) => a + b, 0)).toBe(0)
  })
  it('disambiguates duplicate names and skips unreadable rows', () => {
    const r = parseSplitwiseCsv('Date,Description,Category,Cost,Currency,Sam,Sam\nnot a date,X,General,10,AUD,5,-5\n2024-01-01,Y,General,10,AUD,5,-5\n')
    expect(r.members).toEqual(['Sam', 'Sam (2)'])
    expect(r.expenses).toHaveLength(1)
    expect(r.skipped).toBe(1)
  })
  it('refuses files that aren’t exports', () => {
    expect(() => parseSplitwiseCsv('')).toThrow(ImportError)
    expect(() => parseSplitwiseCsv('name,age\nbob,3')).toThrow(ImportError)
    expect(() => parseSplitwiseCsv('Date,Description,Category,Cost,Currency,A,B\n')).toThrow(/No expenses/)
  })
  it('stays exact over many rounded rows', () => {
    const names = ['A', 'B', 'C']
    const lines = ['Date,Description,Category,Cost,Currency,A,B,C', '']
    const tot = [0, 0, 0]
    for (let i = 0; i < 300; i++) {
      const cost = 1000 + i * 7 // cents
      const payer = i % 3
      const base = Math.floor(cost / 3), extra = cost - base * 3
      const shares = names.map((_, k) => base + (k < extra ? 1 : 0))
      const nets = shares.map((s, k) => (k === payer ? cost : 0) - s)
      nets.forEach((v, k) => (tot[k] += v))
      lines.push(`2024-02-${String((i % 28) + 1).padStart(2, '0')},Item ${i},General,${(cost / 100).toFixed(2)},AUD,${nets.map((v) => (v / 100).toFixed(2)).join(',')}`)
    }
    lines.push('', `2024-03-01,Total balance, , ,AUD,${tot.map((v) => (v / 100).toFixed(2)).join(',')}`)
    const r = parseSplitwiseCsv(lines.join('\n'))
    expect(r.expenses).toHaveLength(300)
    expectBalancesMatchTotals(r)
    expect(appBalances(r)).toEqual(r.totals)
  })
})

describe('parseImportCsv: Split Now (split-it) CSV round-trip', () => {
  const group: Pick<Group, 'members' | 'currency'> = {
    currency: 'AUD',
    members: { a: { name: 'Alice', color: '#000' }, b: { name: 'Bob', color: '#000' }, c: { name: 'Cara, Jr', color: '#000' } },
  }
  const base = { groupId: 'g', category: 'food' as const, splitType: 'exact' as const, splitInput: {}, createdBy: 'u', updatedAt: 0 }
  const expenses: Expense[] = [
    { ...base, id: 'e1', description: 'Dinner, with "friends"', amount: 9001, date: '2024-05-01', paidBy: { a: 9001 }, splits: { a: 3001, b: 3000, c: 3000 }, createdAt: 1, notes: 'yum' },
    { ...base, id: 'e2', description: '=SUM(A1)', category: 'stay', amount: 10000, date: '2024-05-02', paidBy: { a: 6000, b: 4000 }, splits: { b: 5000, c: 5000 }, createdAt: 2 },
  ]
  const settlements: Settlement[] = [{ id: 's1', groupId: 'g', from: 'c', to: 'a', amount: 2500, method: 'PayID', date: '2024-05-03', createdBy: 'u', createdAt: 3 }]
  const csv = groupCsv(group, expenses, settlements)

  it('reads our export back', () => {
    const r = parseImportCsv(csv)
    expect(r.source).toBe('split-it')
    expect(r.members).toEqual(['Alice', 'Bob', 'Cara, Jr'])
    expect(r.expenses).toHaveLength(2)
    expect(r.expenses[0]).toMatchObject({ description: 'Dinner, with "friends"', amount: 9001, paidBy: { Alice: 9001 }, splits: { Alice: 3001, Bob: 3000, 'Cara, Jr': 3000 }, notes: 'yum', category: 'food' })
    expect(r.expenses[1]).toMatchObject({ description: '=SUM(A1)', paidBy: { Alice: 6000, Bob: 4000 }, category: 'stay' })
    expect(r.payments).toEqual([{ date: '2024-05-03', description: 'Cara, Jr paid Alice', from: 'Cara, Jr', to: 'Alice', amount: 2500, method: 'PayID' }])
  })
  it('reproduces the original balances', () => {
    const r = parseImportCsv(csv)
    const orig = netBalances(expenses, settlements)
    expect(appBalances(r)).toEqual({ Alice: orig.a, Bob: orig.b, 'Cara, Jr': orig.c })
  })
  it('still routes Splitwise files to the Splitwise parser', () => {
    expect(parseImportCsv(SPLITWISE).source).toBe('splitwise')
  })
})

describe('groupNameFromFilename', () => {
  it('cleans up export names', () => {
    expect(groupNameFromFilename('bali-trip_2024-03-10_export.csv')).toBe('Bali trip')
    expect(groupNameFromFilename('split-it-fitzroy-flat-2024-05-01.csv')).toBe('Fitzroy flat')
    expect(groupNameFromFilename('split-now-goa-trip-2026-10-07.csv')).toBe('Goa trip')
    expect(groupNameFromFilename('Housemates.csv')).toBe('Housemates')
  })
})
