import { describe, expect, it } from 'vitest'
import { cleanMerchant, findSmsDate, maskSms, merchantFromVpa, parseAmountMinor, parseBankSms, titleCase } from './sms-parse'

/** Debit samples: [label, sms, sender, expected subset]. Wording follows real Indian bank SMS formats. */
const DEBITS: Array<[string, string, string | undefined, Record<string, unknown>]> = [
  ['HDFC UPI to VPA',
    'Rs.250.00 debited from a/c XX1234 on 07-10-26 to VPA swiggy@icici (UPI Ref No 628112345678). Not you? Call 18002586161 to report',
    'VM-HDFCBK', { amount: 25000, merchant: 'Swiggy', vpa: 'swiggy@icici', ref: '628112345678', date: '2026-10-07', account: '1234', bank: 'HDFC Bank', method: 'upi' }],
  ['HDFC "Sent ... To NAME On"',
    'Sent Rs.500.00 From HDFC Bank A/C *1234 To RAHUL SHARMA On 07/10/26 Ref 628112345678 Not You? Call 18002586161/SMS BLOCK UPI to 7308080808',
    'AD-HDFCBK', { amount: 50000, merchant: 'Rahul Sharma', ref: '628112345678', date: '2026-10-07', account: '1234', bank: 'HDFC Bank' }],
  ['HDFC credit card spend',
    'Spent Rs 1,234.00 on HDFC Bank Card x1234 at AMAZON on 2026-10-07:14:32:11.Not You? To Block+Reissue Call 18002586161/SMS BLOCK CC 1234 to 7308080808',
    'VM-HDFCBK', { amount: 123400, merchant: 'Amazon', date: '2026-10-07', account: '1234', method: 'card' }],
  ['HDFC card "Txn" alert with balance',
    'Txn Rs.840.00 On HDFC Bank Card 1234 At SWIGGY LIMITED by UPI 628112345678 On 07-10. Not You? Call 18002586161',
    undefined, { amount: 84000, merchant: 'Swiggy' }],
  ['ICICI UPI "; X credited"',
    'ICICI Bank Acct XX123 debited for Rs 250.00 on 07-Oct-26; SWIGGY credited. UPI:628112345678. Call 18002662 for dispute. SMS BLOCK 123 to 9215676766',
    'JM-ICICIT', { amount: 25000, merchant: 'Swiggy', ref: '628112345678', date: '2026-10-07', account: '123', bank: 'ICICI Bank' }],
  ['ICICI credit card spend',
    'INR 1,999.00 spent using ICICI Bank Card XX4321 on 07-Oct-26 on MAKEMYTRIP INDIA PVT LTD. Avl Limit: INR 1,23,456.00. If not you, call 1800 2662/SMS BLOCK 4321 to 9215676766',
    'VK-ICICIT', { amount: 199900, merchant: 'MakeMyTrip', account: '4321', date: '2026-10-07', method: 'card' }],
  ['SBI UPI "debited by" without currency',
    'Dear UPI user A/C X1234 debited by 250.0 on date 07Oct26 trf to SWIGGY Refno 628112345678. If not u? call 1800111109. -SBI',
    'JD-SBIUPI', { amount: 25000, merchant: 'Swiggy', ref: '628112345678', date: '2026-10-07', account: '1234', bank: 'SBI' }],
  ['SBI debit card',
    'Your A/C XXXXX123456 Debited INR 1,500.00 on 07/10/26 -Transferred to Mr. RAHUL KUMAR. Avl Balance INR 12,345.67-SBI',
    'BZ-SBIINB', { amount: 150000, merchant: 'Rahul Kumar', account: '3456', date: '2026-10-07', bank: 'SBI' }],
  ['Axis UPI narration',
    'INR 250.00 debited A/c no. XX1234 07-10-26 14:32:11 UPI/P2M/628112345678/SWIGGY Not you? SMS BLOCKUPI Cust ID to 919951860002 Axis Bank',
    'AX-AXISBK', { amount: 25000, merchant: 'Swiggy', ref: '628112345678', date: '2026-10-07', account: '1234', bank: 'Axis Bank' }],
  ['Axis credit card',
    'Spent INR 3,450.00 Axis Bank Card no. XX9876 07-10-26 20:15:02 IST BLUE TOKAI COFFEE Avl Limit: INR 98,765.43 Not you? SMS BLOCK 9876 to 919951860002',
    'AX-AXISBK', { amount: 345000, merchant: 'Blue Tokai Coffee', account: '9876', date: '2026-10-07' }],
  ['Kotak UPI',
    'Sent Rs.250.00 from Kotak Bank AC X1234 to zomato-order@paytm on 07-10-26.UPI Ref 628112345678. Not you, kotak.com/fraud',
    'VM-KOTAKB', { amount: 25000, merchant: 'Zomato', ref: '628112345678', account: '1234', bank: 'Kotak Bank' }],
  ['Yes Bank',
    'INR 799.00 debited from A/c XX5678 on 07-OCT-2026 towards UPI/P2M/628112345678/BOOKMYSHOW. Avl Bal INR 4,321.00. Not you? Call 18001200',
    'VM-YESBNK', { amount: 79900, merchant: 'BookMyShow', date: '2026-10-07', bank: 'Yes Bank' }],
  ['IDFC First',
    'Your A/C XXXXXXX1234 has been debited by INR 1,200.00 on 07/10/2026 for UPI txn to uber.rides@icici. UPI Ref 628112345678. Avl Bal: INR 10,000.00 - IDFC FIRST Bank',
    'VM-IDFCFB', { amount: 120000, merchant: 'Uber', date: '2026-10-07', bank: 'IDFC First Bank' }],
  ['IndusInd card',
    'Your IndusInd Bank Credit Card XX4567 has been used for INR 2,340.00 at DOMINOS PIZZA on 07-10-2026 14:05. Avl Lmt: INR 50,000.00',
    'VM-INDUSB', { amount: 234000, merchant: "Domino's", account: '4567', bank: 'IndusInd Bank' }],
  ['PNB',
    'A/c XX1234 debited INR 600.00 Dt 07-10-26 14:02:31 thru UPI:628112345678.Bal INR 5,432.10 Not u?Fwd this SMS to 9264092640 to block UPI.-PNB',
    'VM-PNBSMS', { amount: 60000, ref: '628112345678', date: '2026-10-07', bank: 'PNB' }],
  ['Bank of Baroda',
    'Rs.450.00 Dr. from A/C XXXXXX1234 and Cr. to blinkit@hdfcbank. Ref:628112345678. AvlBal:Rs9,876.50(2026:10:07 15:16:17). Not you? Call 18005700-BOB',
    'VM-BOBTXN', { amount: 45000, merchant: 'Blinkit', ref: '628112345678' }],
  ['AU Bank',
    'Debit INR 1,050.00 A/c XX1234 on 07-10-26 at ZEPTO MARKETPLACE PRIVATE LIMITED. Avl Bal INR 20,000.00 - AU Small Finance Bank',
    'VM-AUBANK', { amount: 105000, merchant: 'Zepto', bank: 'AU Bank' }],
  ['Federal Bank',
    'Rs 320.00 debited from your A/c XX1234 to VPA rapido.bike@axl on 07-10-2026. UPI Ref no 628112345678. Not you? Call 18004251199 - Federal Bank',
    'VM-FEDBNK', { amount: 32000, merchant: 'Rapido', bank: 'Federal Bank' }],
  ['Paytm Payments Bank',
    'Paid Rs.150 to Chaayos Cafe from Paytm Payments Bank a/c XX1234. UPI Ref:628112345678. Not you? Call 01204456456',
    'VM-PAYTMB', { amount: 15000, merchant: 'Chaayos Cafe', ref: '628112345678', bank: 'Paytm Payments Bank' }],
  ['Airtel Payments Bank',
    'Rs.99.00 debited from Airtel Payments Bank a/c XX1234 to irctc@sbi on 07-10-26. UPI Ref No 628112345678.',
    'VM-AIRBNK', { amount: 9900, merchant: 'IRCTC', bank: 'Airtel Payments Bank' }],
  ['Lakh amount with ₹',
    '₹1,00,000.00 debited from A/c XX1234 on 07-10-26 to A/c XX5678 IMPS Ref 628112345678. Not you? Call 1800',
    'VM-HDFCBK', { amount: 10000000, method: 'imps' }],
  ['QR VPA gives no merchant name; "to" fallback does not pick the VPA',
    'Rs.60.00 debited from a/c XX1234 on 07-10-26 to VPA q823456789@ybl (UPI Ref No 628112345678).',
    undefined, { amount: 6000, merchant: undefined, vpa: 'q823456789@ybl' }],
  ['Foreign currency card spend',
    'USD 25.00 spent on ICICI Bank Card XX4321 on 07-Oct-26 at AMAZON WEB SERVICES. Avl Limit: INR 1,23,456.00',
    undefined, { amount: 2500, currency: 'USD', merchant: 'Amazon' }],
  ['e-mandate debit is a real debit',
    'Rs 649.00 debited from A/c XX1234 on 07-10-26 towards NETFLIX e-mandate. Ref 628112345678 -HDFC Bank',
    undefined, { amount: 64900, merchant: 'Netflix' }],
  ['ATM withdrawal',
    'Rs.2,000.00 withdrawn at ATM S1AW123456 from A/c XX1234 on 07-10-26. Avl Bal Rs.8,000.00 -SBI',
    undefined, { amount: 200000, method: 'atm' }],
  ['Personal VPA',
    'Rs.300.00 debited from a/c XX1234 on 07-10-26 to VPA rahul.sharma@okhdfcbank (UPI Ref No 628112345678).',
    undefined, { amount: 30000, merchant: 'Rahul Sharma' }],
  ['PhonePe-style "paid to"',
    'You have paid Rs.120 to Sharma General Store via PhonePe. UPI Ref 628112345678',
    undefined, { amount: 12000, merchant: 'Sharma General Store', ref: '628112345678' }],
  ['SBI credit card',
    'Rs 1,250.00 spent on your SBI Credit Card ending 5678 at UBER INDIA SYSTEMS on 07/10/26. Trxn. Ref No. 123456789012.',
    'VM-SBICRD', { amount: 125000, merchant: 'Uber', account: '5678', ref: '123456789012', method: 'card' }],
]

describe('parseBankSms: debits', () => {
  for (const [label, sms, sender, expected] of DEBITS) {
    it(label, () => {
      const p = parseBankSms(sms, { sender })
      expect(p.kind).toBe('debit')
      for (const [k, v] of Object.entries(expected)) expect(p[k as keyof typeof p], k).toEqual(v)
    })
  }
})

/** Messages that must never become a capture. */
const NOT_DEBITS: Array<[string, string, string]> = [
  ['otp', 'OTP for txn of INR 1,999.00 at AMAZON on HDFC Bank card ending 1234 is 482913. Valid till 14:35. Do not share OTP for security reasons.', 'otp'],
  ['otp leading code', '482913 is your OTP to complete the transaction of Rs.840 at Swiggy. Never share it with anyone. -ICICI Bank', 'otp'],
  ['credited UPI', 'Rs.500.00 credited to HDFC Bank A/c XX1234 on 07-10-26 from VPA rahul@okicici (UPI 628112345678)', 'credit'],
  ['SBI credit', 'Dear SBI UPI User, ur A/cX1234 credited by Rs500 on 07Oct26 by (Ref no 628112345678)', 'credit'],
  ['refund', 'Refund of Rs 249.00 from SWIGGY has been credited to your HDFC Bank Card XX1234 on 07-10-26.', 'credit'],
  ['salary', 'INR 85,000.00 deposited in A/c XX1234 on 07-10-26 by NEFT from ACME PVT LTD. Avl Bal INR 1,02,345.00', 'credit'],
  ['card bill payment received', 'Payment of Rs 15,000.00 received towards your ICICI Bank Credit Card XX4321 on 07-Oct-26. Thank you.', 'credit'],
  ['balance alert', 'Your A/c XX1234 has Avl Bal of INR 12,345.67 as on 07-10-26 10:00. -Axis Bank', 'balance'],
  ['balance enquiry', 'Available balance in A/c XX1234 is Rs 4,567.89 as on 07/10/2026. Kotak Bank', 'balance'],
  ['declined', 'Txn of Rs 1,234.00 on HDFC Bank Card x1234 at AMAZON has been declined due to insufficient balance.', 'failed'],
  ['failed UPI', 'Your UPI transaction of Rs.250.00 to swiggy@icici has failed. Amount if debited will be refunded in 3 working days. Ref 628112345678', 'failed'],
  ['reversed', 'Rs 840.00 debited earlier from A/c XX1234 on 07-10-26 has been reversed to your account. Ref 628112345678 -SBI', 'failed'],
  ['collect request', 'RAHUL SHARMA has requested money from you on Google Pay. On approving the request, INR 500.00 will be debited from your account.', 'request'],
  ['collect request 2', 'You have received a collect request of Rs 1,200.00 from zomato@hdfcbank. Approve only if you want to pay. -HDFC Bank', 'request'],
  ['promo', 'Get cashback up to Rs 500 on your first UPI payment with HDFC Bank! Click here: hdfc.bank/upi T&C apply', 'promo'],
  ['pre-approved loan', 'Congratulations! You are eligible for a pre-approved personal loan of Rs 5,00,000. Apply now: icici.co/pl', 'promo'],
  ['EMI reminder', 'Your EMI of Rs 12,500.00 for loan XX5678 is due on 10-10-2026. Please maintain sufficient balance in A/c XX1234.', 'reminder'],
  ['auto-debit reminder', 'Rs 649.00 will be debited from your A/c XX1234 on 10-10-26 towards NETFLIX mandate. -HDFC Bank', 'reminder'],
  ['credit card due', 'Your ICICI Bank Credit Card XX4321 statement: total amount due Rs 23,456.00, minimum due Rs 1,200.00, due date 15-Oct-26.', 'reminder'],
  ['empty', '', 'unknown'],
]

describe('parseBankSms: not debits', () => {
  for (const [label, sms, kind] of NOT_DEBITS) {
    it(label, () => expect(parseBankSms(sms).kind).toBe(kind))
  }
})

describe('helpers', () => {
  it('parses lakh grouping and decimals to paise', () => {
    expect(parseAmountMinor('1,00,000.00')).toBe(10000000)
    expect(parseAmountMinor('250.0')).toBe(25000)
    expect(parseAmountMinor('1,999')).toBe(199900)
    expect(parseAmountMinor('0')).toBeNaN()
    expect(parseAmountMinor('1200', 'JPY')).toBe(1200)
  })

  it('reads Indian date formats', () => {
    expect(findSmsDate('on 07-10-26 at')).toBe('2026-10-07')
    expect(findSmsDate('on 07/10/2026')).toBe('2026-10-07')
    expect(findSmsDate('on 07Oct26 trf')).toBe('2026-10-07')
    expect(findSmsDate('on 07-OCT-2026.')).toBe('2026-10-07')
    expect(findSmsDate('on 7 Oct 2026')).toBe('2026-10-07')
    expect(findSmsDate('on Oct 07, 2026')).toBe('2026-10-07')
    expect(findSmsDate('on 2026-10-07:14:32')).toBe('2026-10-07')
    expect(findSmsDate('on 31-02-26')).toBeUndefined()
    expect(findSmsDate('Rs 1,234.00 only')).toBeUndefined()
  })

  it('does not mistake the payee’s UPI handle for the sender’s bank', () => {
    expect(parseBankSms('Rs.250.00 debited from a/c XX1234 on 07-10-26 to VPA swiggy@icici').bank).toBeUndefined()
    expect(parseBankSms('Rs.250.00 debited from a/c XX1234 on 07-10-26 to VPA swiggy@icici', { sender: 'VM-HDFCBK' }).bank).toBe('HDFC Bank')
  })

  it('names merchants from VPAs', () => {
    expect(merchantFromVpa('swiggy@icici')).toBe('Swiggy')
    expect(merchantFromVpa('zomato-order@paytm')).toBe('Zomato')
    expect(merchantFromVpa('paytm-dominos@paytm')).toBe("Domino's")
    expect(merchantFromVpa('swiggyupi@axb')).toBe('Swiggy')
    expect(merchantFromVpa('bookmyshow.razorpay@icici')).toBe('BookMyShow')
    expect(merchantFromVpa('q123456789@ybl')).toBeUndefined()
    expect(merchantFromVpa('paytmqr281005050101abcd@paytm')).toBeUndefined()
    expect(merchantFromVpa('9876543210@ybl')).toBeUndefined()
    expect(merchantFromVpa('rahul.sharma@okhdfcbank')).toBe('Rahul Sharma')
    expect(merchantFromVpa('cafecoffeeday@hdfcbank')).toBe('Cafecoffeeday')
  })

  it('cleans and title-cases payee names', () => {
    expect(titleCase('RAHUL SHARMA')).toBe('Rahul Sharma')
    expect(titleCase('KFC BPCL')).toBe('KFC BPCL')
    expect(cleanMerchant('MAKEMYTRIP INDIA PVT LTD')).toBe('MakeMyTrip')
    expect(cleanMerchant('BLUE TOKAI COFFEE ROASTERS PVT LTD')).toBe('Blue Tokai Coffee Roasters')
    expect(cleanMerchant('AMAZON PAY*PRIME')).toBe('Amazon')
    expect(cleanMerchant('A/c XX5678')).toBeUndefined()
    expect(cleanMerchant('9215676766')).toBeUndefined()
  })

  it('masks account numbers, card numbers and balances but keeps refs', () => {
    const m = maskSms('Rs.250 debited from A/c 50100123456789 card 4111 1111 1111 1234 UPI Ref No 628112345678. Avl Bal INR 12,345.67')
    expect(m).toContain('A/c XX6789')
    expect(m).toContain('XX1234')
    expect(m).not.toContain('4111')
    expect(m).toContain('628112345678')
    expect(m).toContain('Avl Bal Rs ***')
    expect(m).not.toContain('12,345.67')
    expect(maskSms('x'.repeat(600)).length).toBe(500)
  })
})
