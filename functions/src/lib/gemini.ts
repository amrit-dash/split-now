/*
 * Gemini (Google AI Studio API) for reading receipts and, as a fallback, bank SMS the regex
 * parser couldn't make sense of. Responses are constrained by a JSON schema, then validated
 * again here, so nothing the model returns reaches Firestore or the app unchecked.
 */

/** Cheapest model with image input and structured output; the alias is the fallback if it's retired. */
export const GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-flash-lite-latest']

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

type Schema = Record<string, unknown>
const num = (description: string): Schema => ({ type: 'NUMBER', nullable: true, description })
const str = (description: string): Schema => ({ type: 'STRING', nullable: true, description })

export const RECEIPT_SCHEMA: Schema = {
  type: 'OBJECT',
  properties: {
    isReceipt: { type: 'BOOLEAN', description: 'false if the image is not a bill, receipt or invoice' },
    merchant: str('restaurant or shop name as printed, in normal title case'),
    date: str('bill date as YYYY-MM-DD'),
    currency: str('ISO 4217 code, e.g. INR'),
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: 'item name, multi-line names joined, no quantity or price' },
          quantity: num('quantity, if printed'),
          unitPrice: num('price per unit, if printed'),
          amount: { type: 'NUMBER', description: 'line total for this item (quantity × unit price), before tax' },
        },
        required: ['name', 'amount'],
        propertyOrdering: ['name', 'quantity', 'unitPrice', 'amount'],
      },
    },
    subtotal: num('sum of items before tax, if printed'),
    taxes: {
      type: 'ARRAY',
      description: 'taxes added on top of the items (GST, CGST, SGST, IGST, VAT, cess). Empty if prices include tax.',
      items: {
        type: 'OBJECT',
        properties: { label: { type: 'STRING' }, amount: { type: 'NUMBER' } },
        required: ['label', 'amount'],
        propertyOrdering: ['label', 'amount'],
      },
    },
    charges: num('service charge, packing, delivery or convenience fees added on top'),
    tip: num('tip or gratuity, only if printed on the bill'),
    discount: num('total discount as a positive number, only if printed'),
    roundOff: num('round-off adjustment, negative if it reduces the bill'),
    total: num('final amount payable'),
  },
  required: ['isReceipt', 'items', 'taxes'],
  propertyOrdering: ['isReceipt', 'merchant', 'date', 'currency', 'items', 'subtotal', 'taxes', 'charges', 'tip', 'discount', 'roundOff', 'total'],
}

export const RECEIPT_PROMPT = `Read this bill and fill the schema.
Rules:
- items: only the things ordered. Never include subtotal, tax, service charge, discount, round-off, total, payment or change lines.
- amount is the line total in the bill's currency as a plain number (580.00 → 580), after quantity, before tax.
- taxes: only taxes added on top of the item prices. If the bill says prices include GST/VAT, leave taxes empty.
- tip and discount: null unless printed on the bill. discount is positive.
- Ignore GSTIN, FSSAI, phone numbers, table/KOT/bill numbers and dates when reading amounts.
- If a value isn't on the bill, use null. Don't guess.`

export const STATEMENT_SCHEMA: Schema = {
  type: 'OBJECT',
  properties: {
    isStatement: { type: 'BOOLEAN', description: 'false if the images show no list of payments' },
    transactions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          date: { type: 'STRING', description: 'YYYY-MM-DD' },
          name: { type: 'STRING', description: 'who was paid or who paid, as shown' },
          amount: { type: 'NUMBER', description: 'positive number, no currency symbol' },
          direction: { type: 'STRING', enum: ['debit', 'credit'], description: 'debit = money paid out; credit = received (shown with + or in green)' },
          kind: { type: 'STRING', enum: ['payment', 'self_transfer', 'refund', 'other'], description: 'self_transfer = between the user\'s own accounts or wallets (e.g. bank to UPI Lite, wallet top-up)' },
          note: str('extra text on the row, e.g. "Paid for aradhi"'),
          status: { type: 'STRING', enum: ['success', 'failed', 'pending'] },
        },
        required: ['date', 'name', 'amount', 'direction', 'kind', 'status'],
        propertyOrdering: ['date', 'name', 'amount', 'direction', 'kind', 'note', 'status'],
      },
    },
    currency: str('ISO 4217 code of the amounts, INR for ₹'),
  },
  required: ['isStatement', 'transactions'],
  propertyOrdering: ['isStatement', 'currency', 'transactions'],
}

export const statementPrompt = (today: string) => `These are screenshots of a payments app or bank statement (Google Pay, PhonePe, Paytm, a bank app). List every transaction row, in order, once.
Rules:
- Today is ${today}. Dates shown without a year are within the last 12 months, never in the future; section headers like "Today", "Yesterday" or a month name apply to the rows under them.
- If screenshots overlap, list a repeated row only once.
- Ignore headers, filters, balances, ads and summary totals.
- amount is a positive number. direction is credit when the row shows +, "received" or green money.
- Never invent rows or values.`

export const SMS_SCHEMA: Schema = {
  type: 'OBJECT',
  properties: {
    kind: { type: 'STRING', enum: ['debit', 'credit', 'otp', 'other'], description: 'debit = money left the account (payment, purchase, transfer out, ATM withdrawal)' },
    amount: num('amount debited, as a plain number'),
    currency: str('ISO 4217 code, INR unless the message says otherwise'),
    merchant: str('who was paid, in title case, without "UPI", "VPA" or reference numbers'),
    date: str('transaction date as YYYY-MM-DD, if in the message'),
    ref: str('UPI / bank reference number, if any'),
  },
  required: ['kind'],
  propertyOrdering: ['kind', 'amount', 'currency', 'merchant', 'date', 'ref'],
}

export const SMS_PROMPT = `This is a bank or UPI SMS from India. Extract the transaction. If it is not a debit (money leaving the account), set kind accordingly and leave the rest null. Never invent values.`

export interface GeminiPart { text?: string; inlineData?: { mimeType: string; data: string } }

export class GeminiError extends Error {
  constructor(message: string, readonly status?: number) { super(message) }
}

/** One structured-output call. Tries the next model only if the first is unknown (404). */
export async function generateJson(key: string, parts: GeminiPart[], schema: Schema, fetchImpl: typeof fetch = fetch, timeoutMs = 25_000): Promise<unknown> {
  let last: GeminiError | undefined
  for (const model of GEMINI_MODELS) {
    const res = await fetchImpl(`${ENDPOINT}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens: 8192 },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (res.status === 404) { last = new GeminiError(`model ${model} not found`, 404); continue }
    if (!res.ok) throw new GeminiError(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status)
    const body = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    try {
      return JSON.parse(text)
    } catch {
      throw new GeminiError('Gemini returned invalid JSON')
    }
  }
  throw last ?? new GeminiError('no Gemini model available')
}

// ---- Validation --------------------------------------------------------------------

/** Major units → hundredths (the app's OCR contract; the client converts to the currency's minor units). */
const hundredths = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(/[,₹\s]/g, '')) : v
  return typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e9 ? Math.round(n * 100) : undefined
}
const text = (v: unknown, max: number): string | undefined => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
  return s ? s.slice(0, max) : undefined
}
const isoDate = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined
  const d = new Date(s + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? undefined : s
}
const currencyCode = (v: unknown) => (typeof v === 'string' && /^[A-Z]{3}$/.test(v.trim().toUpperCase()) ? v.trim().toUpperCase() : undefined)

/** Same shape as the app's on-device ParsedReceipt (amounts in hundredths). */
export interface AiReceipt {
  merchant?: string
  date?: string
  currency?: string
  total?: number
  items: Array<{ name: string; amount: number; quantity?: number }>
  tax?: number
  tip?: number
  discount?: number
}

export function normaliseReceipt(raw: unknown): AiReceipt | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.isReceipt === false) return null
  const items: AiReceipt['items'] = []
  for (const it of Array.isArray(r.items) ? r.items.slice(0, 200) : []) {
    const o = (it ?? {}) as Record<string, unknown>
    const name = text(o.name, 80)
    const amount = hundredths(o.amount)
    if (!name || !amount || amount <= 0) continue
    const q = typeof o.quantity === 'number' && Number.isFinite(o.quantity) && o.quantity > 0 && o.quantity < 1000 ? o.quantity : undefined
    items.push(q && q !== 1 ? { name, amount, quantity: q } : { name, amount })
  }
  const taxes = (Array.isArray(r.taxes) ? r.taxes : []).reduce<number>((s, t) => s + Math.max(0, hundredths((t as Record<string, unknown>)?.amount) ?? 0), 0)
  const roundOff = hundredths(r.roundOff) ?? 0
  const tax = taxes + Math.max(0, hundredths(r.charges) ?? 0) + Math.max(0, roundOff)
  const discount = Math.abs(hundredths(r.discount) ?? 0) + Math.max(0, -roundOff)
  const tip = Math.max(0, hundredths(r.tip) ?? 0)
  const total = hundredths(r.total)
  const out: AiReceipt = { items }
  const merchant = text(r.merchant, 60)
  if (merchant) out.merchant = merchant
  const date = isoDate(r.date)
  if (date) out.date = date
  const currency = currencyCode(r.currency)
  if (currency) out.currency = currency
  if (total && total > 0) out.total = total
  if (tax) out.tax = tax
  if (tip) out.tip = tip
  if (discount) out.discount = discount
  return out.items.length || out.total ? out : null
}

export interface AiSms { kind: 'debit' | 'credit' | 'otp' | 'other'; amount?: number; currency: string; merchant?: string; date?: string; ref?: string }

/** amount in minor units (paise), only for debits. */
export function normaliseSms(raw: unknown, minorDigits: (currency: string) => number = () => 2): AiSms | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const kind = r.kind === 'debit' || r.kind === 'credit' || r.kind === 'otp' ? r.kind : 'other'
  const currency = currencyCode(r.currency) ?? 'INR'
  const out: AiSms = { kind, currency }
  if (kind !== 'debit') return out
  const h = hundredths(r.amount)
  if (h && h > 0) out.amount = Math.round(h / 10 ** (2 - minorDigits(currency)))
  const merchant = text(r.merchant, 100)
  if (merchant && !/^(upi|vpa|na|null|unknown)$/i.test(merchant)) out.merchant = merchant
  const date = isoDate(r.date)
  if (date) out.date = date
  const ref = typeof r.ref === 'string' ? r.ref.replace(/[^A-Za-z0-9]/g, '').slice(0, 40) : ''
  if (ref) out.ref = ref
  return out
}

export interface AiTxn { date: string; name: string; amount: number; direction: 'debit' | 'credit'; kind: 'payment' | 'self_transfer' | 'refund' | 'other'; note?: string }

/** Successful rows only, amounts in hundredths, deduplicated (same date, name and amount). */
export function normaliseStatement(raw: unknown, today: string): { currency?: string; transactions: AiTxn[] } | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.isStatement === false) return null
  const out: AiTxn[] = []
  const seen = new Set<string>()
  for (const t of Array.isArray(r.transactions) ? r.transactions.slice(0, 300) : []) {
    const o = (t ?? {}) as Record<string, unknown>
    if (o.status === 'failed') continue
    const date = isoDate(o.date)
    const name = text(o.name, 100)
    const amount = hundredths(o.amount)
    if (!date || date > today || !name || !amount || amount <= 0) continue
    const direction = o.direction === 'credit' ? 'credit' : 'debit'
    const kind = o.kind === 'self_transfer' || o.kind === 'refund' || o.kind === 'other' ? o.kind : 'payment'
    const key = `${date}|${name.toLowerCase()}|${amount}|${direction}`
    if (seen.has(key)) continue
    seen.add(key)
    const note = text(o.note, 120)
    out.push(note ? { date, name, amount, direction, kind, note } : { date, name, amount, direction, kind })
  }
  const currency = currencyCode(r.currency)
  return { ...(currency ? { currency } : {}), transactions: out }
}
