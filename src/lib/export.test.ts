import { describe, expect, it } from 'vitest'
import type { Expense, Group, Settlement } from '@/types'
import { centsToDecimal, csvField, csvFilename, groupCsv, toCsv } from './export'

/** Minimal RFC 4180 parser, used to check the output round-trips. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') q = false
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++ }
    else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

describe('csvField', () => {
  it('leaves plain values alone', () => {
    expect(csvField('Dinner')).toBe('Dinner')
    expect(csvField(12)).toBe('12')
    expect(csvField(undefined)).toBe('')
    expect(csvField(null)).toBe('')
  })
  it('quotes commas, quotes and newlines', () => {
    expect(csvField('Fish, chips')).toBe('"Fish, chips"')
    expect(csvField('The "best" pizza')).toBe('"The ""best"" pizza"')
    expect(csvField('line1\nline2')).toBe('"line1\nline2"')
    expect(csvField('a\r\nb')).toBe('"a\r\nb"')
  })
  it('quotes leading/trailing whitespace so it survives', () => {
    expect(csvField(' padded ')).toBe('" padded "')
  })
  it('neutralises spreadsheet formulas but keeps negative numbers numeric', () => {
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvField('+61 400')).toBe("'+61 400")
    expect(csvField('@sum')).toBe("'@sum")
    expect(csvField('-cmd')).toBe("'-cmd")
    expect(csvField('-5.00')).toBe('-5.00')
  })
  it('toCsv joins with CRLF and ends with a newline', () => {
    expect(toCsv([['a', 'b'], ['1', undefined]])).toBe('a,b\r\n1,\r\n')
  })
})

describe('centsToDecimal', () => {
  it('formats exactly', () => {
    expect(centsToDecimal(0)).toBe('0.00')
    expect(centsToDecimal(5)).toBe('0.05')
    expect(centsToDecimal(1234)).toBe('12.34')
    expect(centsToDecimal(-5)).toBe('-0.05')
    expect(centsToDecimal(100000001)).toBe('1000000.01')
  })
})

describe('groupCsv', () => {
  const group: Pick<Group, 'members' | 'currency'> = {
    currency: 'AUD',
    members: {
      a: { name: 'Alice', color: '#000' },
      b: { name: 'Bob', color: '#000' },
      c: { name: 'Carol', color: '#000' },
    },
  }
  const base = { groupId: 'g1', splitType: 'equal' as const, splitInput: {}, createdBy: 'u', updatedAt: 0 }
  const expenses: Expense[] = [
    { ...base, id: 'e2', description: 'Taxi, airport', amount: 4500, category: 'transport', date: '2026-03-02', createdAt: 2,
      paidBy: { b: 4500 }, splits: { a: 1500, b: 1500, c: 1500 }, notes: 'Said "never again"\nseriously' },
    { ...base, id: 'e1', description: 'Dinner', amount: 10001, category: 'food', date: '2026-03-01', createdAt: 1,
      paidBy: { a: 6001, c: 4000 }, splits: { a: 3334, b: 3334, c: 3333 } },
    { ...base, id: 'e3', description: 'Old tab', amount: 1000, category: 'other', date: '2026-03-03', createdAt: 3,
      paidBy: { a: 1000 }, splits: { a: 500, gone: 500 } },
  ]
  const settlements: Settlement[] = [
    { id: 's1', groupId: 'g1', from: 'b', to: 'a', amount: 2000, method: 'PayID', date: '2026-03-02', createdBy: 'u', createdAt: 5 },
  ]
  const rows = parseCsv(groupCsv(group, expenses, settlements))

  it('has a header with one share column per member, alphabetically, plus former members', () => {
    expect(rows[0]).toEqual(['Date', 'Type', 'Description', 'Category', 'Amount', 'Currency', 'Paid by', 'Alice', 'Bob', 'Carol', 'Former member (gone)', 'Notes'])
  })

  it('sorts rows by date then creation time', () => {
    expect(rows.slice(1).map((r) => r[2])).toEqual(['Dinner', 'Taxi, airport', 'Bob paid Alice', 'Old tab'])
  })

  it('writes amounts, payers and shares', () => {
    expect(rows[1]).toEqual(['2026-03-01', 'Expense', 'Dinner', 'Food & drink', '100.01', 'AUD', 'Alice 60.01; Carol 40.00', '33.34', '33.34', '33.33', '', ''])
    expect(rows[2]).toEqual(['2026-03-02', 'Expense', 'Taxi, airport', 'Transport', '45.00', 'AUD', 'Bob', '15.00', '15.00', '15.00', '', 'Said "never again"\nseriously'])
    expect(rows[4][10]).toBe('5.00')
  })

  it('writes settlements as owed entirely by the receiver', () => {
    expect(rows[3]).toEqual(['2026-03-02', 'Payment', 'Bob paid Alice', 'PayID', '20.00', 'AUD', 'Bob', '20.00', '', '', '', ''])
  })

  it('share columns sum to the amount on every row', () => {
    for (const r of rows.slice(1)) {
      const shares = r.slice(7, 11).reduce((s, v) => s + Math.round(Number(v || 0) * 100), 0)
      expect(shares).toBe(Math.round(Number(r[4]) * 100))
    }
  })

  it('disambiguates members with the same name', () => {
    const g = { currency: 'USD', members: { x: { name: 'Sam', color: '' }, y: { name: 'Sam', color: '' } } }
    expect(parseCsv(groupCsv(g, [], []))[0].slice(7, 9)).toEqual(['Sam', 'Sam (2)'])
  })

  it('handles an empty group', () => {
    const out = groupCsv(group, [], [])
    expect(parseCsv(out)).toHaveLength(1)
    expect(out.endsWith('\r\n')).toBe(true)
  })
})

describe('csvFilename', () => {
  it('slugifies the group name', () => {
    expect(csvFilename('Bali Trip 🏝️', '2026-10-07')).toBe('split-now-bali-trip-2026-10-07.csv')
    expect(csvFilename('Café / Flat #2', '2026-10-07')).toBe('split-now-cafe-flat-2-2026-10-07.csv')
    expect(csvFilename('🎉', '2026-10-07')).toBe('split-now-group-2026-10-07.csv')
  })
})
