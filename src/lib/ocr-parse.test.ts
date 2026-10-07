import { describe, expect, it } from 'vitest'
import { matchMember, parseDate, parsePaymentScreenshot, parseReceipt } from './ocr-parse'

describe('parseReceipt', () => {
  it('extracts merchant, items, total and date', () => {
    const r = parseReceipt(`THE GOOD CAFE
123 Smith St
Date: 14/09/2026 12:41
2 x Flat White   9.00
Avocado Toast   18.50
Subtotal 27.50
GST 2.50
TOTAL $27.50
EFTPOS 27.50`)
    expect(r.merchant).toBe('THE GOOD CAFE')
    expect(r.total).toBe(2750)
    expect(r.date).toBe('2026-09-14')
    expect(r.items).toEqual([{ name: 'Flat White', amount: 900 }, { name: 'Avocado Toast', amount: 1850 }])
  })
})

describe('parsePaymentScreenshot', () => {
  it('reads a PayID confirmation', () => {
    const p = parsePaymentScreenshot(`Payment sent
You paid $42.10
Paid to Sarah Connor
PayID: sarah@example.com
7 Oct 2026`)
    expect(p.amount).toBe(4210)
    expect(p.payee).toBe('Sarah Connor')
    expect(p.method).toBe('PayID')
    expect(p.date).toBe('2026-10-07')
  })
})

describe('helpers', () => {
  it('parseDate formats', () => {
    expect(parseDate('2026-03-05')).toBe('2026-03-05')
    expect(parseDate('Mar 5, 2026')).toBe('2026-03-05')
  })
  it('matchMember', () => {
    expect(matchMember('Sarah Connor', [{ id: '1', name: 'Sarah' }, { id: '2', name: 'John' }])).toBe('1')
  })
})
