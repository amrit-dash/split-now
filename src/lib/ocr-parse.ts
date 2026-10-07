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

const AMOUNT_RE = /(?:[$€£₹¥]|AUD|USD|INR|EUR|GBP|NZD|Rs\.?)?\s*(-?\d{1,3}(?:[,\s]\d{3})*(?:[.,]\d{2})|-?\d+[.,]\d{2})(?!\d)/g

function toCents(s: string): Cents {
  let t = s.replace(/\s/g, '')
  // "1.234,56" (EU) → "1234.56"; "1,234.56" → "1234.56"
  if (/,\d{2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(/,/g, '')
  return Math.round(parseFloat(t) * 100)
}

function amountsIn(line: string): Cents[] {
  return [...line.matchAll(AMOUNT_RE)].map((m) => toCents(m[1])).filter((n) => Number.isFinite(n))
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

const SKIP_ITEM = /total|subtotal|sub-total|tax|gst|vat|change|cash|card|eftpos|visa|mastercard|amex|balance|tip|rounding|discount|payment|tender|due|saving/i

export function parseReceipt(text: string): ParsedReceipt {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let total: Cents | undefined
  let totalLine = -1

  // Prefer the last "total"-ish line that isn't a subtotal.
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]
    if (/(grand\s*total|total\s*(due|amount|aud|inc)?|amount\s*(due|paid)|balance\s*due|^total)/i.test(l) && !/sub\s*-?total/i.test(l)) {
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

  const merchant = lines.find((l) => /[A-Za-z]{3,}/.test(l) && !/receipt|invoice|tax|abn|tel|phone|www|http|@/i.test(l) && amountsIn(l).length === 0)

  const items: ParsedReceipt['items'] = []
  const end = totalLine >= 0 ? totalLine : lines.length
  for (let i = 0; i < end; i++) {
    const l = lines[i]
    if (SKIP_ITEM.test(l)) continue
    const m = l.match(/^(.*?[A-Za-z].*?)\s+(?:[$€£₹]\s*)?(\d+[.,]\d{2})\s*[A-Z]?$/)
    if (m) {
      const name = m[1].replace(/^\d+\s*[xX@]?\s*/, '').replace(/[.\s]+$/, '').trim()
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
  const payeeRe = /(?:paid|sent|transfer(?:red)?|payment)\s+(?:to|for)\s+([A-Z][A-Za-z'.-]+(?:[ \t]+[A-Z][A-Za-z'.-]+){0,3})/i
  const toRe = /\bto\s*:?\s+([A-Z][A-Za-z'.-]+(?:[ \t]+[A-Z][A-Za-z'.-]+){0,3})/
  for (const re of [payeeRe, toRe]) {
    const m = lines.map((l) => l.match(re)).find(Boolean) ?? flat.match(re)
    if (m) { payee = m[1].trim(); break }
  }

  // Amount: prefer the line with the biggest prominent currency figure near "paid"/"amount", else largest.
  let amount: Cents | undefined
  for (const l of lines) {
    if (/amount|paid|sent|total|you\s+(sent|paid)/i.test(l)) {
      const a = amountsIn(l).filter((v) => v > 0)
      if (a.length) { amount = a[0]; break }
    }
  }
  if (amount === undefined) {
    const all = lines.flatMap(amountsIn).filter((v) => v > 0)
    if (all.length) amount = Math.max(...all)
  }

  const method =
    /payid|osko/i.test(flat) ? 'PayID' :
    /upi|gpay|phonepe|paytm|google pay/i.test(flat) ? 'UPI' :
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
