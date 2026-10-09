import { describe, expect, it } from 'vitest'
import { findAmounts, matchMember, parseDate, parsePaymentScreenshot, parseReceipt, stripTrailingFigures } from './ocr-parse'

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
    expect(r.items).toEqual([
      { name: 'Flat White', amount: 900 },
      { name: 'Avocado Toast', amount: 1850 },
    ])
  })
})

describe('parseReceipt extras', () => {
  it('reads CGST / SGST, service charge and discount on an Indian bill', () => {
    const r = parseReceipt(`SPICE ROUTE
Paneer Tikka 2 280.00 560.00
Butter Naan 4 60.00 240.00
Sub Total 800.00
Discount 10% 80.00
Service Charge 5% 36.00
CGST 2.50% 18.90
SGST 2.50% 18.90
Round Off 0.20
Grand Total Rs 794.00`)
    expect(r.items).toEqual([
      { name: 'Paneer Tikka', amount: 56000 },
      { name: 'Butter Naan', amount: 24000 },
    ])
    expect(r.total).toBe(79400)
    expect(r.tax).toBe(3600 + 1890 + 1890)
    expect(r.discount).toBe(8000)
    expect(r.tip).toBeUndefined()
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
    expect(
      matchMember('Sarah Connor', [
        { id: '1', name: 'Sarah' },
        { id: '2', name: 'John' },
      ]),
    ).toBe('1')
    expect(
      matchMember('PRIYA NAIR', [
        { id: 'a', name: 'Priya' },
        { id: 'b', name: 'Rohan' },
      ]),
    ).toBe('a')
  })
})

describe('India: amounts', () => {
  it('reads ₹ / Rs. / INR with lakh grouping and whole rupees', () => {
    expect(findAmounts('₹500')).toEqual([50000])
    expect(findAmounts('Rs. 1,250')).toEqual([125000])
    expect(findAmounts('Rs.2,450.50')).toEqual([245050])
    expect(findAmounts('INR 2,00,000.00')).toEqual([20000000])
    expect(findAmounts('₹ 1,00,000')).toEqual([10000000])
    expect(findAmounts('Total 12,34,567.89')).toEqual([123456789])
  })
  it('ignores phone numbers, UPI refs and quantities without a currency marker', () => {
    expect(findAmounts('+91 98765 43210')).toEqual([])
    expect(findAmounts('UPI transaction ID 628012345678')).toEqual([])
    expect(findAmounts('Qty 2')).toEqual([])
  })
})

describe('India: receipts', () => {
  it('restaurant bill with CGST/SGST and Grand Total', () => {
    const r = parseReceipt(`MAVALLI TIFFIN ROOMS
Lalbagh Road, Bengaluru
GSTIN: 29AAAAA0000A1Z5
FSSAI No. 11219999000000
Bill No: 4521   Table: 7
Date: 05/10/2026
Item            Qty  Rate   Amount
Masala Dosa      2   90.00  180.00
Rava Idli        1   75.00   75.00
Filter Coffee    3   40.00  120.00
Sub Total                   375.00
CGST @2.5%                    9.38
SGST @2.5%                    9.38
Round Off                     0.24
Grand Total              ₹394.00
Paid via UPI                394.00`)
    expect(r.merchant).toBe('MAVALLI TIFFIN ROOMS')
    expect(r.total).toBe(39400)
    expect(r.date).toBe('2026-10-05')
    expect(r.items).toEqual([
      { name: 'Masala Dosa', amount: 18000 },
      { name: 'Rava Idli', amount: 7500 },
      { name: 'Filter Coffee', amount: 12000 },
    ])
  })

  it('reads "Net Amount" and "Amount Payable" as the total', () => {
    expect(parseReceipt('DMart Ready\nAtta 5kg 245.00\nToor Dal 1kg 160.00\nNet Amount Rs. 405.00').total).toBe(40500)
    expect(parseReceipt('Shell Petrol Pump\nPetrol 8.5L 900.00\nIGST 0.00\nAmount Payable: 1,00,000.00').total).toBe(10000000)
    expect(parseReceipt('Hotel Saravana Bhavan\nMeals 2 x 150.00 300.00\nTotal Qty: 2\nTotal Amount 315.00').total).toBe(31500)
  })
})

describe('India: UPI payment screenshots', () => {
  it('Google Pay', () => {
    const p = parsePaymentScreenshot(`₹500
Paid to Rohan Sharma
rohan.sharma@okaxis
Completed
7 Oct 2026, 8:41 pm
UPI transaction ID
628012345678
To: ROHAN SHARMA (Banking name)
Google Pay • rohan.sharma@okaxis`)
    expect(p.amount).toBe(50000)
    expect(p.payee).toBe('Rohan Sharma')
    expect(p.method).toBe('UPI')
    expect(p.date).toBe('2026-10-07')
  })

  it('PhonePe', () => {
    const p = parsePaymentScreenshot(`Transaction Successful
08:41 pm on 07 Oct 2026
Paid to
PRIYA NAIR
+91 98450 12345
₹1,250
Transfer Details
Transaction ID
T2610072041123456789
Debited from
XXXXXXXX4321
UTR: 628012345679`)
    expect(p.amount).toBe(125000)
    expect(p.payee).toBe('PRIYA NAIR')
    expect(p.method).toBe('UPI')
    expect(p.date).toBe('2026-10-07')
  })

  it('Paytm', () => {
    const p = parsePaymentScreenshot(`Paid Successfully to
Arjun Mehta
Rs.2,000
Cashback ₹10
UPI Ref No: 628012345680
06 Oct 2026, 10:15 AM`)
    expect(p.amount).toBe(200000)
    expect(p.payee).toBe('Arjun Mehta')
    expect(p.method).toBe('UPI')
    expect(p.date).toBe('2026-10-06')
  })

  it('BHIM', () => {
    const p = parsePaymentScreenshot(`Payment successful
₹ 750.00
To: Kavya Iyer
kavya@upi
UPI Ref No: 628012345681
05/10/2026`)
    expect(p.amount).toBe(75000)
    expect(p.payee).toBe('Kavya Iyer')
    expect(p.method).toBe('UPI')
    expect(p.date).toBe('2026-10-05')
  })
})

describe('stripTrailingFigures', () => {
  const strip = stripTrailingFigures
  it('removes the quantity and price columns after an item name', () => {
    expect(strip('Paneer Tikka 2 280.00 560.00')).toBe('Paneer Tikka')
    expect(strip('Masala Dosa Rs. 120.00')).toBe('Masala Dosa')
    expect(strip('Coffee ₹ 90')).toBe('Coffee')
    expect(strip('Latte $4.50')).toBe('Latte')
    expect(strip('Naan 1,250.00')).toBe('Naan')
  })
  it('keeps the first word and a bare currency sign that has no figure after it', () => {
    expect(strip('2 3')).toBe('2')
    expect(strip('Tea Rs.')).toBe('Tea Rs.')
    expect(strip('Tea')).toBe('Tea')
  })
  it('keeps names that only contain digits inside words', () => {
    expect(strip('7Up')).toBe('7Up')
    expect(strip('Pepsi 500ml')).toBe('Pepsi 500ml')
  })
  it('stays fast on long, adversarial OCR lines (no catastrophic backtracking)', () => {
    const evil = [`x${'  ,'.repeat(5000)}!`, ` Rs${'., Rs'.repeat(5000)}!`, `a${' 1.'.repeat(5000)}x`]
    const t0 = performance.now()
    for (const s of evil) strip(s)
    expect(performance.now() - t0).toBeLessThan(200)
  })
})
