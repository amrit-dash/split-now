import type { StatementTxn } from '@/data/repo'
import { amountMatches, parseDate } from './ocr-parse'
import { localISODate } from './id'

/*
 * Statement import without AI: the text the phone's OCR reads from a payment-app screenshot or a
 * printed statement, turned into payments. Screenshots are clean text, so OCR reads them well;
 * the hard part is the layout, which differs by app:
 *   GPay / PhonePe   "Rohan Sharma" / "₹500" / "12 Oct" on separate lines, "Received from" for money in
 *   Paytm            "Paid to Swiggy  ₹450" on one line, a day header ("Today", "12 Oct 2026") above
 *   a bank statement "12/10/2026  SWIGGY BANGALORE  450.00 Dr" in one row
 * So each line with an amount is one payment; its name is the words on that line, or the nearest
 * line above with words and no amount; its date is the date on that line or the line below, else
 * the last day header seen. It is less exact than AI; the person ticks what to add, so a stray row
 * costs a tap, not a wrong expense.
 */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTH_WORD = /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/

/** Lines that carry a figure but are not a payment. */
const NOT_A_PAYMENT = /balance|available|cashback|reward|opening|closing|total|limit|statement\s+period|minimum\s+due|interest/i
const CREDIT = /\breceived\b|\bfrom\b|\bcredited\b|\bcr\b|\brefund|\+\s*(?:[₹$€£]|rs\.?|inr)?\s*\d/i
const SELF = /\bself\b|own\s+account|to\s+self|between\s+your\s+accounts/i
const PREFIX = /^(?:paid\s+to|sent\s+to|received\s+from|refund\s+from|payment\s+to|transfer(?:red)?\s+to|money\s+sent\s+to|to|from)\s*:?\s+/i
/** Reference lines: their words are labels, not a payee. */
const REF_LINE = /\b(?:ref(?:erence)?\s*(?:no|number|id)?|utr|txn\s*id|transaction\s*id|upi\s*id|order\s*id)\b/i
/** Words with no name in them: status words, app chrome, reference numbers. */
const NOISE =
  /^(?:completed|successful|success|failed|pending|paid|debited|credited|dr|cr|upi|upi\s+id|ref(?:erence)?\s*(?:no\.?)?|utr|txn\s*id|today|yesterday|view\s+all|history|search|filter|split)$/i

const pad = (n: number) => String(n).padStart(2, '0')

/** "12 Oct", "Oct 12", "Today", "Yesterday" (no year: the latest such day not after today), or any full date. */
export function statementDate(line: string, today: string): string | undefined {
  const full = parseDate(line)
  if (full) return full
  const l = line.trim().toLowerCase()
  if (/^today\b/.test(l)) return today
  if (/^yesterday\b/.test(l)) {
    const d = new Date(`${today}T12:00:00`)
    d.setDate(d.getDate() - 1)
    return localISODate(d)
  }
  const m = l.match(/\b(\d{1,2})\s+([a-z]{3,9})\b/) ?? l.match(/\b([a-z]{3,9})\s+(\d{1,2})\b/)
  if (!m) return undefined
  const [day, mon] = /^\d/.test(m[1]) ? [+m[1], m[2]] : [+m[2], m[1]]
  const mo = MONTHS.indexOf(mon.slice(0, 3)) + 1
  if (!mo || day < 1 || day > 31 || !MONTH_WORD.test(mon)) return undefined
  let y = +today.slice(0, 4)
  if (`${y}-${pad(mo)}-${pad(day)}` > today) y -= 1
  return `${y}-${pad(mo)}-${pad(day)}`
}

/** The line with its amounts, dates, signs and status words taken out: what's left is a name, or nothing. */
export function nameIn(line: string): string {
  if (REF_LINE.test(line)) return ''
  const t = line
    .replace(/(?:[₹$€£]|\brs\.?|\binr\b)\s*[-+]?\s*[\d.,]+/gi, ' ')
    .replace(/[-+]?\b\d[\d.,]*\d\b|\b\d\b/g, ' ')
    .replace(/\b(?:dr|cr|debit|credit|debited|credited|completed|successful|failed|pending)\b\.?/gi, ' ')
    .replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b\.?,?/gi, ' ')
    .replace(/\b(?:today|yesterday|am|pm)\b/gi, ' ')
    .replace(/[|•·:,/*#@()[\]{}<>~_=]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(PREFIX, '')
    .trim()
  if (NOISE.test(t)) return ''
  return (t.match(/[A-Za-z]/g)?.length ?? 0) >= 2 ? t : ''
}

/** The payment's amount in a line: a figure with a currency marker, else one beside Dr / Cr, else a line that is only a figure. */
function amountIn(line: string): number | undefined {
  const all = amountMatches(line).filter((a) => a.cents !== 0)
  const marked = all.find((a) => a.marked)
  if (marked) return Math.abs(marked.cents)
  if (!all.length) return undefined
  if (/\b(?:dr|cr|debit|credit)\b/i.test(line) || /^[-+]?\s*[\d.,]+$/.test(line.trim())) return Math.abs(all[0].cents)
  return undefined
}

export interface OcrStatement {
  currency?: string
  transactions: StatementTxn[]
}

/** Payments read from one screenshot's or page's OCR text. `today` resolves "Today" and dates without a year. */
export function parseStatementText(text: string, today: string): OcrStatement {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const out: StatementTxn[] = []
  /** the last day header ("Today", "12 Oct 2026") */
  let day: string | undefined
  /** lines already used as a name, so one name doesn't label two payments */
  const used = new Set<number>()
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const amount = amountIn(line)
    if (amount === undefined) {
      const d = statementDate(line, today)
      if (d && !nameIn(line)) day = d
      continue
    }
    if (NOT_A_PAYMENT.test(line) || amount > 1e11) continue
    let name = nameIn(line)
    let nameAt = i
    for (let j = i - 1; !name && j >= Math.max(0, i - 3); j--) {
      if (used.has(j) || amountIn(lines[j]) !== undefined) break
      const n = nameIn(lines[j])
      if (n) {
        name = n
        nameAt = j
      }
    }
    if (!name) continue
    used.add(nameAt)
    const next = lines[i + 1]
    const date =
      statementDate(line, today) ??
      (nameAt !== i ? statementDate(lines[nameAt], today) : undefined) ??
      // GPay-style rows put the date under the amount; a one-line row's next line is the next row or day.
      (nameAt !== i && next && amountIn(next) === undefined && !nameIn(next) ? statementDate(next, today) : undefined) ??
      day ??
      today
    const context = lines.slice(nameAt, i + 1).join(' ')
    const credit = CREDIT.test(context)
    out.push({
      date,
      name,
      amount,
      direction: credit ? 'credit' : 'debit',
      kind: /refund/i.test(context) ? 'refund' : SELF.test(context) ? 'self_transfer' : 'payment',
    })
  }
  const currency = /₹|\brs\.?\s*\d|\binr\b/i.test(text) ? 'INR' : undefined
  return { ...(currency ? { currency } : {}), transactions: out }
}
