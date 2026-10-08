import type { Cents, Category } from '@/types'
import { CATEGORIES, guessCategory } from './categories'
import { allocate } from './splits'
import { minorDigits } from './money'

/*
 * Import of a Splitwise group export ("Export as spreadsheet", a CSV) and of our own CSV
 * export (src/lib/export.ts) for a round-trip.
 *
 * Splitwise's CSV:
 *
 *   Date,Description,Category,Cost,Currency,Alice,Bob,Cara
 *                                                              ← (usually) a blank line
 *   2024-03-01,Dinner,Dining out,90.00,AUD,60.00,-30.00,-30.00
 *   2024-03-02,Bob paid Alice,Payment,30.00,AUD,-30.00,30.00,0.00
 *
 *   2024-03-10,Total balance, , ,AUD,30.00,0.00,-30.00
 *
 * Each member column is that member's NET for the row: what they paid minus their share.
 * Positive = they are owed, negative = they owe. The "Total balance" row (one per currency)
 * is each column's sum. Payments (Category "Payment") are written the same way: the payer
 * gets +amount, the receiver −amount.
 *
 * Nets alone don't tell us the original payer/share split (A paid 90 split three ways and
 * "A paid 60 for B and C" give the same nets), so we rebuild one that keeps every member's
 * net exactly — see `reconstruct()`. Balances after import therefore equal Splitwise's
 * totals to the cent, which `ImportResult.totalsMatch` checks.
 */

export type ImportSource = 'splitwise' | 'split-it'

export interface ImportedExpense {
  date: string
  description: string
  category: Category
  /** the category as the file wrote it */
  sourceCategory: string
  amount: Cents
  /** member name → minor units; both sum to `amount` */
  paidBy: Record<string, Cents>
  splits: Record<string, Cents>
  /** member name → paid − share (what Splitwise wrote) */
  nets: Record<string, Cents>
  notes?: string
}

export interface ImportedPayment {
  date: string
  description: string
  /** member name who paid */
  from: string
  /** member name who received */
  to: string
  amount: Cents
  method?: string
}

export interface ImportResult {
  source: ImportSource
  members: string[]
  currency: string
  expenses: ImportedExpense[]
  payments: ImportedPayment[]
  /** the file's own final totals for `currency` (Splitwise "Total balance"), when present */
  totals: Record<string, Cents> | null
  /** balances implied by the imported rows (paid − share ± payments) */
  balances: Record<string, Cents>
  /** totals present and equal to balances for every member */
  totalsMatch: boolean | null
  dateRange: { from: string; to: string } | null
  /** data rows not imported (other currency, zero effect, unreadable) */
  skipped: number
  warnings: string[]
}

export class ImportError extends Error {}

// ---------------------------------------------------------------------------------------
// CSV tokenising

/** RFC 4180-ish: quotes, "" escapes, CRLF/LF/CR, newlines inside quotes, BOM, , or ; or tab. */
export function parseCsvRows(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const delim = detectDelimiter(src)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0
  const endField = () => { row.push(field); field = '' }
  const endRow = () => { endField(); rows.push(row); row = [] }
  while (i < src.length) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue }
        quoted = false
      } else field += c
      i++
      continue
    }
    if (c === '"' && field.trim() === '') { field = ''; quoted = true }
    else if (c === delim) endField()
    else if (c === '\r' || c === '\n') {
      endRow()
      if (c === '\r' && src[i + 1] === '\n') i++
    } else field += c
    i++
  }
  if (field !== '' || row.length) endRow()
  return rows
}

function detectDelimiter(src: string): string {
  const first = src.split(/\r?\n/).find((l) => l.trim()) ?? ''
  const count = (ch: string) => {
    let n = 0, q = false
    for (const c of first) { if (c === '"') q = !q; else if (!q && c === ch) n++ }
    return n
  }
  const scores: Array<[string, number]> = [[',', count(',')], [';', count(';')], ['\t', count('\t')]]
  scores.sort((a, b) => b[1] - a[1])
  return scores[0][1] > 0 ? scores[0][0] : ','
}

const isBlank = (r: string[]) => r.every((c) => c.trim() === '')

// ---------------------------------------------------------------------------------------
// Values

/**
 * A decimal amount as written in a spreadsheet → minor units. Accepts "1,234.56", "1.234,56",
 * "12,50", "-5", "(5.00)", "−5.00", "$5", " 5.00 ". Returns NaN for anything else; "" → NaN.
 */
export function parseAmount(raw: string, currency = 'AUD'): Cents {
  let s = raw.trim().replace(/[−‒–]/g, '-')
  if (!s) return NaN
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  s = s.replace(/[^\d.,'\s-]/g, '').replace(/[\s']/g, '')
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1) }
  if (!s || !/^[\d.,]+$/.test(s) || !/\d/.test(s)) return NaN
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) {
    // Whichever comes last is the decimal mark.
    s = lastDot > lastComma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.')
  } else if (lastComma >= 0) {
    // "1,234" (thousands) vs "12,5" / "12,50" (decimal comma)
    const parts = s.split(',')
    s = parts.length === 2 && parts[1].length !== 3 ? `${parts[0]}.${parts[1]}` : parts.join('')
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, '') // "1.234.567"
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return NaN
  const v = Math.round(n * 10 ** minorDigits(currency))
  return neg ? -v : v
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const pad = (n: number) => String(n).padStart(2, '0')
const fullYear = (y: number) => (y < 100 ? 2000 + y : y)

function validDate(y: number, m: number, d: number): string | null {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1970 && y <= 2200)) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

/**
 * Parse one date cell to yyyy-mm-dd. `order` decides ambiguous slash dates (03/04/2024).
 * Accepts ISO (with time / T / Z), yyyy/mm/dd, d/m/y or m/d/y with / . - separators,
 * "10 Mar 2024", "Mar 10, 2024", "March 10 2024".
 */
export function parseDate(raw: string, order: 'dmy' | 'mdy' = 'dmy'): string | null {
  const s = raw.trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s])/)
  if (m) return validDate(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:$|[T\s,])/)
  if (m) {
    const [a, b, y] = [+m[1], +m[2], fullYear(+m[3])]
    return order === 'mdy' ? validDate(y, a, b) ?? validDate(y, b, a) : validDate(y, b, a) ?? validDate(y, a, b)
  }
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-z]{3,})\.?[\s-,]+(\d{2,4})/i)
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase())
    return mi >= 0 ? validDate(fullYear(+m[3]), mi + 1, +m[1]) : null
  }
  m = s.match(/^([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})/i)
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase())
    return mi >= 0 ? validDate(fullYear(+m[3]), mi + 1, +m[2]) : null
  }
  return null
}

/** Decide d/m vs m/d for a whole column: any first part > 12 ⇒ dmy, any second part > 12 ⇒ mdy. */
export function detectDateOrder(cells: string[]): 'dmy' | 'mdy' {
  let dmy = 0, mdy = 0
  for (const c of cells) {
    const m = c.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/)
    if (!m) continue
    if (+m[1] > 12) dmy++
    if (+m[2] > 12) mdy++
  }
  return mdy > dmy ? 'mdy' : 'dmy'
}

// ---------------------------------------------------------------------------------------
// Categories

/**
 * Splitwise subcategory (what the CSV writes, e.g. "Dining out") or parent category → ours.
 * Unknown or "General" falls back to a guess from the description, then 'other'.
 */
const SPLITWISE_CATEGORIES: Record<string, Category> = {
  // Food and drink
  'food and drink': 'food', 'dining out': 'food', liquor: 'food', groceries: 'groceries',
  // Transportation
  transportation: 'transport', 'bus/train': 'transport', car: 'transport', 'gas/fuel': 'transport',
  parking: 'transport', taxi: 'transport', bicycle: 'transport', hotel: 'stay', plane: 'travel',
  // Entertainment
  entertainment: 'entertainment', games: 'entertainment', movies: 'entertainment', music: 'entertainment', sports: 'entertainment',
  // Home
  home: 'shopping', electronics: 'shopping', furniture: 'shopping', 'household supplies': 'shopping',
  maintenance: 'utilities', services: 'utilities', pets: 'shopping', rent: 'rent', mortgage: 'rent',
  // Life
  clothing: 'shopping', gifts: 'gifts', 'medical expenses': 'health', insurance: 'health',
  education: 'other', childcare: 'other', taxes: 'other', life: 'other',
  // Utilities
  utilities: 'utilities', cleaning: 'utilities', electricity: 'utilities', 'heat/gas': 'utilities',
  trash: 'utilities', 'tv/phone/internet': 'utilities', water: 'utilities',
}

export function mapSplitwiseCategory(sourceCategory: string, description = ''): Category {
  const key = sourceCategory.trim().toLowerCase()
  const direct = SPLITWISE_CATEGORIES[key]
  if (direct) return direct
  // Our own export writes our labels ("Food & drink"); accept those and our ids too.
  for (const [id, c] of Object.entries(CATEGORIES) as Array<[Category, (typeof CATEGORIES)[Category]]>) {
    if (key === id || key === c.label.toLowerCase()) return id
  }
  return guessCategory(description) ?? 'other'
}

// ---------------------------------------------------------------------------------------
// Reconstruction

/**
 * Rebuild who-paid / who-owes from per-member nets so that, for every member,
 * paidBy − splits == net, and both maps sum to the amount.
 *
 *  - Owers (net < 0) get a share of −net and paid nothing.
 *  - Creditors (net > 0) paid net + x, with a share of x. The x's add up to
 *    R = amount − Σ positive nets (the part of the cost the creditors themselves consumed)
 *    and are spread in proportion to their nets (largest remainder, so it's cent-exact).
 *
 * With a single creditor this is exactly "they paid the whole bill and had a share of R",
 * which is how most Splitwise expenses were entered. When R = 0 the creditors paid only
 * for others. If the stated cost is smaller than Σ positive nets (inconsistent row), the
 * amount is raised to Σ positive nets so nets are still preserved.
 */
export function reconstruct(cost: Cents, nets: Record<string, Cents>, order: string[]): { amount: Cents; paidBy: Record<string, Cents>; splits: Record<string, Cents> } {
  const names = order.filter((n) => nets[n])
  const creditors = names.filter((n) => nets[n] > 0)
  const positive = creditors.reduce((s, n) => s + nets[n], 0)
  const amount = Math.max(Math.abs(cost), positive)
  const rest = amount - positive
  const extra = allocate(rest, creditors.map((n) => [n, nets[n]]))
  const paidBy: Record<string, Cents> = {}
  const splits: Record<string, Cents> = {}
  for (const n of names) {
    if (nets[n] < 0) splits[n] = -nets[n]
    else {
      paidBy[n] = nets[n] + (extra[n] ?? 0)
      if (extra[n]) splits[n] = extra[n]
    }
  }
  return { amount, paidBy, splits }
}

// ---------------------------------------------------------------------------------------
// Parsing

const lc = (s: string) => s.trim().toLowerCase()

/** Unique, trimmed column names ("Sam", "Sam" → "Sam", "Sam (2)"). */
function uniqueNames(raw: string[]): string[] {
  const seen = new Map<string, number>()
  return raw.map((r, i) => {
    const base = r.trim() || `Member ${i + 1}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n > 1 ? `${base} (${n})` : base
  })
}

function finish(r: Omit<ImportResult, 'balances' | 'totalsMatch' | 'dateRange'>): ImportResult {
  const balances: Record<string, Cents> = Object.fromEntries(r.members.map((m) => [m, 0]))
  for (const e of r.expenses) {
    for (const [m, v] of Object.entries(e.paidBy)) balances[m] += v
    for (const [m, v] of Object.entries(e.splits)) balances[m] -= v
  }
  for (const p of r.payments) { balances[p.from] += p.amount; balances[p.to] -= p.amount }
  const totalsMatch = r.totals ? r.members.every((m) => (r.totals![m] ?? 0) === balances[m]) : null
  const dates = [...r.expenses, ...r.payments].map((x) => x.date).sort()
  const dateRange = dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null
  return { ...r, balances, totalsMatch, dateRange }
}

export interface ParseOptions {
  /** Amounts are read in this currency's minor units (default: the file's main currency). */
  currency?: string
}

/** Detect the format and parse. Throws ImportError when the file is neither. */
export function parseImportCsv(text: string, opts: ParseOptions = {}): ImportResult {
  const rows = parseCsvRows(text)
  const headerIdx = rows.findIndex((r) => !isBlank(r))
  if (headerIdx < 0) throw new ImportError('The file is empty')
  const header = rows[headerIdx].map(lc)
  if (header.includes('type') && header.includes('paid by')) return parseSplitItRows(rows.slice(headerIdx), opts)
  return parseSplitwiseRows(rows.slice(headerIdx), opts)
}

export function parseSplitwiseCsv(text: string, opts: ParseOptions = {}): ImportResult {
  const rows = parseCsvRows(text)
  const headerIdx = rows.findIndex((r) => !isBlank(r))
  if (headerIdx < 0) throw new ImportError('The file is empty')
  return parseSplitwiseRows(rows.slice(headerIdx), opts)
}

function parseSplitwiseRows(rows: string[][], opts: ParseOptions): ImportResult {
  const warnings: string[] = []
  const header = rows[0].map(lc)
  let col = { date: header.indexOf('date'), desc: header.indexOf('description'), cat: header.indexOf('category'), cost: header.indexOf('cost'), cur: header.indexOf('currency') }
  if (Object.values(col).some((i) => i < 0)) {
    if (rows[0].length < 6) throw new ImportError('This doesn’t look like a Splitwise export (expected Date, Description, Category, Cost, Currency and one column per person)')
    // Localised exports translate the headers but keep the order.
    col = { date: 0, desc: 1, cat: 2, cost: 3, cur: 4 }
    warnings.push('Column names weren’t recognised, so Splitwise’s standard column order was assumed.')
  }
  const fixed = new Set(Object.values(col))
  const memberCols = rows[0].map((_, i) => i).filter((i) => !fixed.has(i) && i > Math.max(...fixed) && rows[0][i].trim() !== '')
  if (!memberCols.length) throw new ImportError('No people found: Splitwise puts one column per person after Currency')
  const members = uniqueNames(memberCols.map((i) => rows[0][i]))

  const body = rows.slice(1).filter((r) => !isBlank(r))
  const cell = (r: string[], i: number) => (r[i] ?? '').trim()
  const isTotals = (r: string[]) => /total/i.test(cell(r, col.desc)) && !cell(r, col.cost) || /^total balance$/i.test(cell(r, col.desc))
  const dataRows = body.filter((r) => !isTotals(r))
  const totalRows = body.filter(isTotals)

  // Main currency: as asked, else the most common in data rows.
  const curCount = new Map<string, number>()
  for (const r of dataRows) { const c = cell(r, col.cur).toUpperCase(); if (c) curCount.set(c, (curCount.get(c) ?? 0) + 1) }
  const fileCurrency = [...curCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? (cell(totalRows[0] ?? [], col.cur).toUpperCase() || 'AUD')
  const currency = opts.currency ?? fileCurrency
  const otherCurrencies = [...curCount.keys()].filter((c) => c !== fileCurrency)

  const order = detectDateOrder(dataRows.map((r) => cell(r, col.date)))
  const expenses: ImportedExpense[] = []
  const payments: ImportedPayment[] = []
  let skipped = 0
  let otherCurrencyRows = 0
  let zeroRows = 0

  for (const [n, r] of dataRows.entries()) {
    const line = `Row ${n + 1}`
    const rowCur = cell(r, col.cur).toUpperCase() || fileCurrency
    if (rowCur !== fileCurrency) { otherCurrencyRows++; skipped++; continue }
    const description = cell(r, col.desc) || 'Imported expense'
    const date = parseDate(cell(r, col.date), order)
    if (!date) { warnings.push(`${line} (“${description}”): unreadable date “${cell(r, col.date)}”, skipped.`); skipped++; continue }
    const nets: Record<string, Cents> = {}
    let bad = false
    memberCols.forEach((ci, k) => {
      const raw = cell(r, ci)
      const v = raw === '' ? 0 : parseAmount(raw, currency)
      if (Number.isNaN(v)) bad = true
      else if (v) nets[members[k]] = v
    })
    if (bad) { warnings.push(`${line} (“${description}”): unreadable amount, skipped.`); skipped++; continue }
    if (!Object.keys(nets).length) { zeroRows++; skipped++; continue }
    const drift = Object.values(nets).reduce((s, v) => s + v, 0)
    if (drift !== 0) {
      // Shouldn't happen (Splitwise rounds so each row nets to zero). Keep the row usable by
      // putting the difference on the largest-magnitude member; the totals check will show it.
      const big = Object.keys(nets).sort((a, b) => Math.abs(nets[b]) - Math.abs(nets[a]))[0]
      nets[big] -= drift
      if (!nets[big]) delete nets[big]
      warnings.push(`${line} (“${description}”): people’s amounts didn’t add up to zero; adjusted ${big} by ${drift / 10 ** minorDigits(currency)}.`)
    }
    const costRaw = parseAmount(cell(r, col.cost), currency)
    const cost = Number.isNaN(costRaw) ? 0 : costRaw
    const sourceCategory = cell(r, col.cat)
    const nonzero = Object.keys(nets)

    if (/^(payment|settle ?up|settlement)$/i.test(sourceCategory) && nonzero.length === 2) {
      const from = nonzero.find((m) => nets[m] > 0)!
      const to = nonzero.find((m) => nets[m] < 0)!
      payments.push({ date, description, from, to, amount: nets[from] })
      continue
    }
    if (/^payment$/i.test(sourceCategory)) warnings.push(`${line} (“${description}”): a payment between more than two people was imported as an expense.`)
    const rec = reconstruct(cost, nets, members)
    if (cost && rec.amount !== Math.abs(cost)) warnings.push(`${line} (“${description}”): cost was less than what people are owed; using ${rec.amount / 10 ** minorDigits(currency)}.`)
    expenses.push({ date, description, category: mapSplitwiseCategory(sourceCategory, description), sourceCategory, amount: rec.amount, paidBy: rec.paidBy, splits: rec.splits, nets })
  }

  if (otherCurrencyRows) warnings.push(`${otherCurrencyRows} row${otherCurrencyRows === 1 ? '' : 's'} in ${otherCurrencies.join(', ')} ${otherCurrencyRows === 1 ? 'was' : 'were'} skipped: a group has one currency (${fileCurrency}).`)
  if (zeroRows) warnings.push(`${zeroRows} row${zeroRows === 1 ? '' : 's'} didn’t change anyone’s balance (e.g. someone paid only for themselves) and ${zeroRows === 1 ? 'was' : 'were'} skipped.`)

  let totals: Record<string, Cents> | null = null
  const totalRow = totalRows.find((r) => (cell(r, col.cur).toUpperCase() || fileCurrency) === fileCurrency) ?? (totalRows.length === 1 && !cell(totalRows[0], col.cur) ? totalRows[0] : undefined)
  if (totalRow) {
    totals = {}
    memberCols.forEach((ci, k) => {
      const v = parseAmount(cell(totalRow, ci), currency)
      totals![members[k]] = Number.isNaN(v) ? 0 : v
    })
  } else warnings.push('No “Total balance” row found, so balances can’t be checked against Splitwise.')

  if (!expenses.length && !payments.length) throw new ImportError('No expenses found in this file')
  return finish({ source: 'splitwise', members, currency, expenses, payments, totals, skipped, warnings })
}

/**
 * Our own export (src/lib/export.ts): Date, Type, Description, Category, Amount, Currency,
 * Paid by, <one share column per member>, Notes. "Paid by" is a name, or "Name 12.00; Name 3.00".
 * Payment rows: Paid by = payer, the receiver's share column = amount, Category = method.
 */
function parseSplitItRows(rows: string[][], opts: ParseOptions): ImportResult {
  const warnings: string[] = []
  const header = rows[0].map(lc)
  const at = (k: string) => header.indexOf(k)
  const col = { date: at('date'), type: at('type'), desc: at('description'), cat: at('category'), amount: at('amount'), cur: at('currency'), paid: at('paid by'), notes: at('notes') }
  const end = col.notes >= 0 ? col.notes : rows[0].length
  const memberCols = rows[0].map((_, i) => i).filter((i) => i > col.paid && i < end)
  const cell = (r: string[], i: number) => (i < 0 ? '' : (r[i] ?? '').trim())
  // The export prefixes text starting with = + - @ with an apostrophe (formula injection guard),
  // member names in the header included.
  const unformula = (s: string) => (/^'[=+\-@]/.test(s) ? s.slice(1) : s)
  const members = uniqueNames(memberCols.map((i) => unformula(cell(rows[0], i))))
  const body = rows.slice(1).filter((r) => !isBlank(r))
  const fileCurrency = cell(body[0] ?? [], col.cur).toUpperCase() || 'AUD'
  const currency = opts.currency ?? fileCurrency
  const expenses: ImportedExpense[] = []
  const payments: ImportedPayment[] = []
  let skipped = 0
  const order = detectDateOrder(body.map((r) => cell(r, col.date)))
  const byName = new Map(members.map((m) => [m.toLowerCase(), m]))

  // Multi-payer cells are "Name 12.00; Name 3.00". Names may themselves contain ";" or end in
  // digits, so the cell is read name by name (longest known name first) rather than split on ";".
  const names = [...byName.keys()].sort((a, b) => b.length - a.length)
  const parsePaidBy = (raw: string, amount: Cents): Record<string, Cents> | null => {
    const exact = byName.get(raw.toLowerCase())
    if (exact) return { [exact]: amount }
    const out: Record<string, Cents> = {}
    const lower = raw.toLowerCase()
    let pos = 0
    while (pos < raw.length) {
      let step: { who: string; len: number; amount: Cents } | undefined
      for (const n of names) {
        if (!lower.startsWith(n, pos)) continue
        const m = raw.slice(pos + n.length).match(/^\s+(-?[\d.,]+)(?:;\s*|$)/)
        if (m) { step = { who: byName.get(n)!, len: n.length + m[0].length, amount: parseAmount(m[1], currency) }; break }
      }
      if (!step) return null
      out[step.who] = (out[step.who] ?? 0) + step.amount
      pos += step.len
    }
    return Object.keys(out).length ? out : null
  }

  for (const [n, r] of body.entries()) {
    const line = `Row ${n + 1}`
    const description = unformula(cell(r, col.desc)) || 'Imported expense'
    const date = parseDate(cell(r, col.date), order)
    const amount = parseAmount(cell(r, col.amount), currency)
    if (!date || !(amount > 0)) { warnings.push(`${line} (“${description}”): unreadable date or amount, skipped.`); skipped++; continue }
    if (cell(r, col.cur) && cell(r, col.cur).toUpperCase() !== fileCurrency) { skipped++; continue }
    const shares: Record<string, Cents> = {}
    memberCols.forEach((ci, k) => { const v = parseAmount(cell(r, ci), currency); if (v) shares[members[k]] = v })
    const paidRaw = unformula(cell(r, col.paid))
    if (/^payment$/i.test(cell(r, col.type))) {
      const from = byName.get(paidRaw.toLowerCase())
      const to = Object.keys(shares)[0]
      if (!from || !to || Object.keys(shares).length !== 1) { warnings.push(`${line} (“${description}”): unreadable payment, skipped.`); skipped++; continue }
      const method = cell(r, col.cat)
      payments.push({ date, description, from, to, amount, method: method && method !== 'Payment' ? method : undefined, })
      continue
    }
    const paidBy = parsePaidBy(paidRaw, amount)
    const sum = (o: Record<string, number>) => Object.values(o).reduce((s, v) => s + v, 0)
    if (!paidBy || sum(paidBy) !== amount || sum(shares) !== amount) { warnings.push(`${line} (“${description}”): who paid / shares don’t add up to the amount, skipped.`); skipped++; continue }
    const nets: Record<string, Cents> = {}
    for (const m of members) { const v = (paidBy[m] ?? 0) - (shares[m] ?? 0); if (v) nets[m] = v }
    const sourceCategory = cell(r, col.cat)
    const notes = unformula(cell(r, col.notes)) || undefined
    expenses.push({ date, description, category: mapSplitwiseCategory(sourceCategory, description), sourceCategory, amount, paidBy, splits: shares, nets, ...(notes ? { notes } : {}) })
  }
  if (!expenses.length && !payments.length) throw new ImportError('No expenses found in this file')
  return finish({ source: 'split-it', members, currency, expenses, payments, totals: null, skipped, warnings })
}

/** "bali-trip_2024-03-10_export.csv" → "Bali trip". */
export function groupNameFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '')
    .replace(/^split-(it|now)-/, '')
    .replace(/[_\s-]*\d{4}-\d{2}-\d{2}.*$/, '')
    .replace(/[_\s-]*export$/i, '')
    .replace(/[_-]+/g, ' ').trim()
  return base ? base[0].toUpperCase() + base.slice(1) : ''
}
