import type { Cents } from '@/types'

export interface ParsedReceipt {
  merchant?: string
  total?: Cents
  date?: string
  items: Array<{ name: string; amount: Cents }>
}

export interface ParsedPayment {
  amount?: Cents
  payee?: string
  date?: string
  method?: string
}

/*
 * Amounts. With a currency marker (₹ 500, Rs.1,250, INR 2,00,000.00, $9.99) whole numbers count
 * and Indian lakh grouping (1,00,000) is understood. Without one, a figure needs two decimals
 * (so phone numbers, UPI reference numbers, dates and quantities aren't read as money).
 */
const CUR = String.raw`(?:[$€£₹¥]|\b(?:AUD|USD|INR|EUR|GBP|NZD|SGD|AED)\b|\bRs\.?|₨)`
const GROUPED = String.raw`\d{1,3}(?:,\d{2})*,\d{3}|\d{1,3}(?:[,\s]\d{3})+`
const AMOUNT_RE = new RegExp(
  String.raw`${CUR}\s*(-?(?:${GROUPED})(?:[.,]\d{1,2})?|-?\d+(?:[.,]\d{1,2})?)(?![\d,])` +
  String.raw`|(-?(?:\d{1,3}(?:,\d{2})*,\d{3}|\d{1,3}(?:,\d{3})*)[.,]\d{2}|-?\d+[.,]\d{2})(?!\d)`,
  'g',
)

function toCents(s: string): Cents {
  let t = s.replace(/\s/g, '')
  // "1.234,56" (EU) → "1234.56"; "1,234.56" / "1,00,000.00" (IN) → "1234.56" / "100000.00"
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, '')
  else t = t.replace(/,/g, '')
  return Math.round(parseFloat(t) * 100)
}

function matches(line: string): Array<{ cents: Cents; marked: boolean }> {
  return [...line.matchAll(AMOUNT_RE)]
    .map((m) => ({ cents: toCents(m[1] ?? m[2]), marked: m[1] !== undefined }))
    .filter((x) => Number.isFinite(x.cents))
}

function amountsIn(line: string): Cents[] {
  return matches(line).map((x) => x.cents)
}

/** All currency-looking amounts in a piece of text, in order of appearance (cents). */
export function findAmounts(text: string): Cents[] {
  return amountsIn(text)
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export function parseDate(text: string): string | undefined {
  const pad = (n: number) => String(n).padStart(2, '0')
  const valid = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 2000 && y < 2100
  let m = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/)
  if (m && valid(+m[1], +m[2], +m[3])) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`
  m = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/)
  if (m) {
    let y = +m[3]
    if (y < 100) y += 2000
    // Default to day-first (AU/UK/IN); fall back to month-first if day-first is impossible.
    let d = +m[1], mo = +m[2]
    if (mo > 12 && d <= 12) [d, mo] = [mo, d]
    if (valid(y, mo, d)) return `${y}-${pad(mo)}-${pad(d)}`
  }
  m = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(20\d{2})\b/)
  if (m) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1
    if (mo && valid(+m[3], mo, +m[1])) return `${m[3]}-${pad(mo)}-${pad(+m[1])}`
  }
  m = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(20\d{2})\b/)
  if (m) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1
    if (mo && valid(+m[3], mo, +m[2])) return `${m[3]}-${pad(mo)}-${pad(+m[2])}`
  }
  return undefined
}

// Not line items: totals, taxes (incl. Indian CGST / SGST / IGST / cess), charges, tenders.
const SKIP_ITEM = /total|subtotal|sub-total|tax|gst|vat|\bcess\b|service\s*charge|round(ing|\s*off|ed\s*off)|change|cash|card|eftpos|visa|mastercard|amex|rupay|\bupi\b|balance|tip|discount|payment|payable|net\s*amount|bill\s*amount|tender|due|saving|paid/i

const TOTAL_RE = /grand\s*total|net\s*(amount|payable|total)|amount\s*payable|total\s*payable|bill\s*amount|total\s*(due|amount|aud|inr|inc)?|amount\s*(due|paid)|balance\s*due|^total|to\s*pay\b/i

export function parseReceipt(text: string): ParsedReceipt {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let total: Cents | undefined
  let totalLine = -1

  // Prefer the last "total"-ish line that isn't a subtotal.
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]
    if (TOTAL_RE.test(l) && !/sub\s*-?total|total\s*(qty|quantity|items?|savings?|discount|tax|gst)\b/i.test(l)) {
      const a = amountsIn(l)
      const next = i + 1 < lines.length ? amountsIn(lines[i + 1]) : []
      const v = a.length ? a[a.length - 1] : next[0]
      if (v && v > 0) { total = v; totalLine = i; break }
    }
  }
  if (total === undefined) {
    const all = lines.flatMap(amountsIn).filter((v) => v > 0)
    if (all.length) total = Math.max(...all)
  }

  const merchant = lines.find((l) => /[A-Za-z]{3,}/.test(l) && !/receipt|invoice|tax|abn|gstin|fssai|\bcin\b|bill\s*no|order|table|kot|cashier|tel|phone|mob|www|http|@/i.test(l) && amountsIn(l).length === 0)

  const items: ParsedReceipt['items'] = []
  const end = totalLine >= 0 ? totalLine : lines.length
  for (let i = 0; i < end; i++) {
    const l = lines[i]
    if (SKIP_ITEM.test(l)) continue
    // "Paneer Tikka   2   280.00   560.00" → name + the last figure (the line total).
    const m = l.match(/^(.*?[A-Za-z].*?)\s+(?:(?:[$€£₹]|Rs\.?)\s*)?(\d{1,3}(?:,\d{2})*,\d{3}\.\d{2}|\d+[.,]\d{2})\s*[A-Z]?$/)
    if (m) {
      const name = m[1].replace(/^\d+\s*[xX@]?\s*/, '').replace(/(?:\s+(?:[$€£₹]|Rs\.?)?\s*[\d.,]+)+$/, '').replace(/[.\s]+$/, '').trim()
      const amount = toCents(m[2])
      if (name.length >= 2 && amount > 0 && (!total || amount <= total)) items.push({ name, amount })
    }
  }

  return { merchant: merchant?.slice(0, 60), total, date: parseDate(text), items }
}

export function parsePaymentScreenshot(text: string): ParsedPayment {
  const flat = text.replace(/\s+/g, ' ')
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let payee: string | undefined
  // "Paid to Rohan Sharma" (GPay), "Paid to\nROHAN SHARMA" (PhonePe), "Paid Successfully to" (Paytm)
  const payeeRe = /(?:paid|sent|transfer(?:red)?|payment)\s+(?:successfully\s+)?(?:to|for)\s+([A-Z][A-Za-z'.-]+(?:[ \t]+(?!Banking\b|UPI\b|Completed\b|Successful\b|Rs\b|INR\b)[A-Z][A-Za-z'.-]+){0,3})/i
  const toRe = /\b[Tt]o\s*:?\s+([A-Z][A-Za-z'.-]+(?:[ \t]+[A-Z][A-Za-z'.-]+){0,3})/
  for (const re of [payeeRe, toRe]) {
    const m = lines.map((l) => l.match(re)).find(Boolean) ?? flat.match(re)
    if (m) { payee = m[1].trim(); break }
  }

  // Amount: prefer the line with the biggest prominent currency figure near "paid"/"amount", else largest.
  let amount: Cents | undefined
  for (const l of lines) {
    if (/amount|paid|sent|total|you\s+(sent|paid)/i.test(l) && !/cashback|reward|balance/i.test(l)) {
      const a = amountsIn(l).filter((v) => v > 0)
      if (a.length) { amount = a[0]; break }
    }
  }
  // UPI apps show the amount on its own ("₹500"): take the first figure with a currency marker.
  if (amount === undefined) amount = lines.filter((l) => !/cashback|reward|balance/i.test(l)).flatMap(matches).find((x) => x.marked && x.cents > 0)?.cents
  if (amount === undefined) {
    const all = lines.flatMap(amountsIn).filter((v) => v > 0)
    if (all.length) amount = Math.max(...all)
  }

  const method =
    /payid|osko/i.test(flat) ? 'PayID' :
    /\bupi\b|gpay|g pay|phonepe|paytm|google pay|bhim|\butr\b|cred\b|amazon pay|@ok(axis|hdfcbank|icici|sbi)|@ybl|@ibl|@axl|@paytm/i.test(flat) ? 'UPI' :
    /paypal/i.test(flat) ? 'PayPal' :
    /revolut/i.test(flat) ? 'Revolut' :
    /venmo/i.test(flat) ? 'Venmo' :
    /bsb|bank|transfer/i.test(flat) ? 'Bank transfer' : undefined

  return { amount, payee, date: parseDate(text), method }
}

/** Fuzzy-match a name against member names. Returns best id or undefined. */
export function matchMember(name: string | undefined, members: Array<{ id: string; name: string }>): string | undefined {
  if (!name) return undefined
  const n = name.toLowerCase()
  let best: { id: string; score: number } | undefined
  for (const mem of members) {
    const parts = mem.name.toLowerCase().split(/\s+/)
    let score = 0
    if (mem.name.toLowerCase() === n) score = 3
    else if (parts.some((p) => p.length > 1 && n.includes(p))) score = 2
    else if (n.split(/\s+/).some((p) => p.length > 1 && mem.name.toLowerCase().includes(p))) score = 1
    if (score && (!best || score > best.score)) best = { id: mem.id, score }
  }
  return best?.id
}
