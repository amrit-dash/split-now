import { describe, expect, it } from 'vitest'
import { nameIn, parseStatementText, statementDate } from './statement-ocr'

const TODAY = '2026-10-22'

describe('statementDate', () => {
  it('reads relative days and dates without a year', () => {
    expect(statementDate('Today', TODAY)).toBe(TODAY)
    expect(statementDate('Yesterday, 9:41 pm', TODAY)).toBe('2026-10-21')
    expect(statementDate('12 Oct', TODAY)).toBe('2026-10-12')
    expect(statementDate('Oct 3, 4:10 PM', TODAY)).toBe('2026-10-03')
    // A day after today is last year's.
    expect(statementDate('28 Dec', TODAY)).toBe('2025-12-28')
    expect(statementDate('12/10/2026', TODAY)).toBe('2026-10-12')
  })
  it('ignores words that only look like months', () => {
    expect(statementDate('Mayank 12', TODAY)).toBeUndefined()
    expect(statementDate('Swiggy', TODAY)).toBeUndefined()
  })
})

describe('nameIn', () => {
  it('keeps the name and drops amounts, prefixes and status words', () => {
    expect(nameIn('Paid to Swiggy ₹450')).toBe('Swiggy')
    expect(nameIn('Received from Rohan Sharma')).toBe('Rohan Sharma')
    expect(nameIn('12/10/2026 SWIGGY BANGALORE 450.00 Dr')).toBe('SWIGGY BANGALORE')
    expect(nameIn('Completed')).toBe('')
    expect(nameIn('₹500')).toBe('')
  })
})

describe('parseStatementText', () => {
  it('reads a GPay-style list (name, amount, date on their own lines)', () => {
    const r = parseStatementText(
      ['Rohan Sharma', '₹500', '12 Oct', 'Swiggy', '₹ 1,250.50', '11 Oct', 'Received from Meera', '+₹300', '10 Oct'].join('\n'),
      TODAY,
    )
    expect(r.currency).toBe('INR')
    expect(r.transactions).toEqual([
      { date: '2026-10-12', name: 'Rohan Sharma', amount: 50000, direction: 'debit', kind: 'payment' },
      { date: '2026-10-11', name: 'Swiggy', amount: 125050, direction: 'debit', kind: 'payment' },
      { date: '2026-10-10', name: 'Meera', amount: 30000, direction: 'credit', kind: 'payment' },
    ])
  })
  it('reads one-line rows under day headers', () => {
    const r = parseStatementText(['Today', 'Paid to Zomato ₹420', 'Yesterday', 'Paid to Uber ₹189', 'Refund from Amazon ₹999'].join('\n'), TODAY)
    expect(r.transactions.map((t) => [t.name, t.date, t.amount, t.direction, t.kind])).toEqual([
      ['Zomato', TODAY, 42000, 'debit', 'payment'],
      ['Uber', '2026-10-21', 18900, 'debit', 'payment'],
      ['Amazon', '2026-10-21', 99900, 'credit', 'refund'],
    ])
  })
  it('reads bank statement rows with Dr / Cr and skips balances', () => {
    const r = parseStatementText(
      ['Opening balance 12,000.00', '05/10/2026 IRCTC TICKETS 2,340.00 Dr', '06/10/2026 SALARY ACME 50,000.00 Cr', 'Closing balance 59,660.00'].join('\n'),
      TODAY,
    )
    expect(r.transactions).toEqual([
      { date: '2026-10-05', name: 'IRCTC TICKETS', amount: 234000, direction: 'debit', kind: 'payment' },
      { date: '2026-10-06', name: 'SALARY ACME', amount: 5000000, direction: 'credit', kind: 'payment' },
    ])
  })
  it('marks transfers to yourself', () => {
    expect(parseStatementText('Sent to self account\n₹2,000', TODAY).transactions[0].kind).toBe('self_transfer')
  })
  it('ignores reference numbers, phone numbers and lines with no name', () => {
    const r = parseStatementText(['UPI Ref No 427812345678', '+91 98765 43210', '₹500', 'Completed'].join('\n'), TODAY)
    expect(r.transactions).toEqual([])
  })
  it('uses one name line for one payment only', () => {
    const r = parseStatementText(['Chai Point', '₹60', '₹40'].join('\n'), TODAY)
    expect(r.transactions.map((t) => t.name)).toEqual(['Chai Point'])
  })
  it('returns nothing for empty text', () => {
    expect(parseStatementText('', TODAY)).toEqual({ transactions: [] })
  })
})
