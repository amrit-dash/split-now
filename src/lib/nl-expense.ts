import type { Category, Cents, MemberId } from '@/types'
import { titleCase } from './expense-draft'
import { todayISO } from './id'
import { fromHundredths, minorDigits } from './money'
import { addDaysISO } from './recents'

/*
 * Quick add: "dinner 1200 with Rahul and Priya, I paid" → a prefilled expense form. A small
 * grammar, not a model: the amount (with an optional currency word or symbol), who paid, who
 * took part (first names matched against the group's members; "me"/"I" is the user), a split
 * hint ("3 ways", "only me") and a day word. Whatever is left is the description. The result
 * always lands in the form for a look before anything is saved. When the local parse is unsure
 * and AI is on, the server's text reader (functions/src/ai.ts, kind 'text') answers in names
 * too; mergeAiParse() resolves those the same way.
 */

export interface NlMember {
  id: MemberId
  name: string
}
export interface NlContext {
  members: NlMember[]
  me: MemberId
  /** the group's currency: amounts without a currency word are in it */
  currency: string
  today?: string
}
export type NlConfidence = 'high' | 'medium' | 'low'

export interface NlParse {
  description: string
  /** minor units of `currency` */
  amount?: Cents
  currency: string
  payer: MemberId
  /** the text named the payer (else it defaults to the user) */
  payerExplicit: boolean
  /** undefined = everyone in the group */
  participants?: MemberId[]
  /** "split 3 ways" */
  ways?: number
  date?: string
  /** words that looked like people but matched nobody */
  unmatched: string[]
  confidence: NlConfidence
}

// ---- Words ------------------------------------------------------------------------

const CURRENCIES: Array<[RegExp, string]> = [
  [/^(?:₹|rs\.?|inr|rupees?|rupaye|rupaiya)$/, 'INR'],
  [/^(?:a\$|aud)$/, 'AUD'],
  [/^(?:s\$|sgd)$/, 'SGD'],
  [/^(?:nz\$|nzd)$/, 'NZD'],
  [/^(?:c\$|cad)$/, 'CAD'],
  [/^(?:\$|usd|dollars?|bucks)$/, 'USD'],
  [/^(?:€|eur|euros?)$/, 'EUR'],
  [/^(?:£|gbp|pounds?|quid)$/, 'GBP'],
  [/^(?:aed|dirhams?)$/, 'AED'],
  [/^(?:฿|thb|baht)$/, 'THB'],
  [/^(?:¥|jpy|yen)$/, 'JPY'],
]
const currencyOf = (word: string | undefined): string | undefined => {
  if (!word) return undefined
  const w = word.toLowerCase()
  return CURRENCIES.find(([re]) => re.test(w))?.[1]
}

const MARK = String.raw`₹|rs\.?|inr|a\$|s\$|nz\$|c\$|\$|€|£|฿|¥|aud|usd|sgd|nzd|cad|eur|gbp|aed|thb|jpy`
const WORD = String.raw`rupees?|rupaye|rupaiya|rs\.?|inr|dollars?|bucks|usd|aud|sgd|nzd|cad|euros?|eur|pounds?|quid|gbp|dirhams?|aed|baht|thb|yen|jpy`
const AMOUNT_RE = new RegExp(
  String.raw`(?:(?<![\p{L}\d])(${MARK})\s*)?(?<![\p{L}\d.,])(\d[\d,]*(?:\.\d+)?)(?:\s*(k|lakhs?|lacs?|crores?|cr))?(?:\s*(${WORD})(?![\p{L}]))?`,
  'giu',
)
/** A number followed by one of these is a count, not money ("3 ways", "2 people", "20%"). */
const COUNT_AFTER = /^\s*(?:-?\s*ways?|people|persons?|pax|of us|%|x\b|times|guys|folks)/i
const MULT: Record<string, number> = {
  k: 1_000,
  lakh: 100_000,
  lakhs: 100_000,
  lac: 100_000,
  lacs: 100_000,
  crore: 10_000_000,
  crores: 10_000_000,
  cr: 10_000_000,
}

const NAME = String.raw`[\p{L}][\p{L}'’.-]*`
const SEP = String.raw`\s*(?:,|&|\+|\band\b|\baur\b)\s*`
const WITH_RE = new RegExp(String.raw`\b(with|w/|incl\.?|including|for|between|among|amongst)\s+(${NAME}(?:${SEP}${NAME})*)`, 'iu')
const ME_RE = /^(?:me|i|myself|mujhe|main)$/i

const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * A typed or spoken name against the group: the whole name, a first name, any name part, a
 * first-name prefix of 3+ letters ("pri" → Priya), or a name with a suffix ("rahulji" → Rahul).
 */
export function matchName(token: string, members: NlMember[]): MemberId | undefined {
  const t = fold(token)
  if (!t) return undefined
  let best: { id: MemberId; score: number } | undefined
  for (const m of members) {
    const full = fold(m.name)
    const parts = full.split(' ')
    let score = 0
    if (full === t) score = 5
    else if (parts[0] === t) score = 4
    else if (parts.includes(t)) score = 3
    else if (t.length >= 3 && parts.some((p) => p.startsWith(t))) score = 2
    else if (t.length >= 4 && parts.some((p) => p.length >= 4 && t.startsWith(p))) score = 1
    if (score > (best?.score ?? 0)) best = { id: m.id, score }
  }
  return best?.id
}

/** "me" / "I" is the user; anything else goes through matchName. */
export function resolveName(token: string, ctx: Pick<NlContext, 'members' | 'me'>): MemberId | undefined {
  return ME_RE.test(token.trim()) ? ctx.me : matchName(token, ctx.members)
}

interface AmountHit {
  index: number
  length: number
  value: number
  currency?: string
  strong: boolean
}

function findAmount(text: string): AmountHit | undefined {
  const hits: AmountHit[] = []
  for (const m of text.matchAll(AMOUNT_RE)) {
    const [whole, mark, num, mult, word] = m
    const after = text.slice(m.index + whole.length)
    if (!mark && !word && COUNT_AFTER.test(after)) continue
    const value = Number(num.replace(/,/g, '')) * (mult ? (MULT[mult.toLowerCase()] ?? 1) : 1)
    if (!Number.isFinite(value) || value <= 0) continue
    const currency = currencyOf(mark) ?? currencyOf(word)
    hits.push({ index: m.index, length: whole.length, value, currency, strong: !!currency || !!mult || /\./.test(num) || num.replace(/,/g, '').length >= 3 })
  }
  if (!hits.length) return undefined
  // A marked or clearly money-sized figure beats a bare small one ("2 pizzas 600" → 600).
  return hits.sort((a, b) => Number(!!b.currency) - Number(!!a.currency) || Number(b.strong) - Number(a.strong) || b.value - a.value)[0]
}

const cut = (text: string, index: number, length: number) => `${text.slice(0, index)} ${text.slice(index + length)}`
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim()

export function parseNlExpense(input: string, ctx: NlContext): NlParse {
  const today = ctx.today ?? todayISO()
  let text = tidy(input)
  const unmatched: string[] = []
  const out: NlParse = { description: '', currency: ctx.currency, payer: ctx.me, payerExplicit: false, unmatched, confidence: 'low' }

  // Amount first: everything else is read from what remains.
  const amt = findAmount(text)
  if (amt) {
    const currency = amt.currency ?? ctx.currency
    out.currency = currency
    out.amount = Math.round(amt.value * 10 ** minorDigits(currency))
    text = cut(text, amt.index, amt.length)
  }

  // Day words.
  text = text.replace(/\b(?:the\s+)?day before yesterday\b/i, () => {
    out.date = addDaysISO(today, -2)
    return ' '
  })
  text = text.replace(/\byesterday\b|\bkal\b/i, () => {
    out.date = out.date ?? addDaysISO(today, -1)
    return ' '
  })
  text = text.replace(/\btoday\b|\baaj\b/i, () => {
    out.date = out.date ?? today
    return ' '
  })

  // Split hints.
  text = text.replace(
    /\b(?:split\s+)?(\d+)\s*-?\s*ways?\b|\bbetween\s+(?:the\s+)?(\d+)\s+(?:of us|people|persons?)\b|\b(\d+)\s+(?:people|persons?|of us|pax)\b/i,
    (_, a, b, c) => {
      const n = Number(a ?? b ?? c)
      if (n >= 2 && n <= 60) out.ways = n
      return ' '
    },
  )
  let only: MemberId[] | undefined
  text = text.replace(/\b(?:only|just)\s+(?:for\s+)?(me|myself|i|[\p{L}][\p{L}'’.-]*)(?:\s+only)?\b/iu, (whole, who: string) => {
    const id = resolveName(who, ctx)
    if (!id) return whole
    only = [id]
    return ' '
  })
  text = text.replace(/\bfor\s+(?:me|myself)\s+only\b/i, () => {
    only = [ctx.me]
    return ' '
  })
  let everyone = false
  text = text.replace(/\b(?:split\s+)?(?:with\s+|between\s+|among\s+)?(?:everyone|everybody|all of us|sab(?:ko)?)\b/i, () => {
    everyone = true
    return ' '
  })
  text = text.replace(/\bsplit\s+(?:it\s+)?(?:equally|evenly|equal)\b|\bsplit\s+equal(?:ly)?\b|\bequally\b/i, ' ')

  // Who paid.
  const payerPatterns: Array<[RegExp, (m: RegExpMatchArray) => MemberId | undefined]> = [
    [/\b(?:i|me)\s+(?:paid|payed|pay)\b(?:\s+(?:for\s+)?(?:it|this|everything|all|the bill))?/i, () => ctx.me],
    [/\bpaid\s+by\s+(me|myself|i)\b/i, () => ctx.me],
    [new RegExp(String.raw`\bpaid\s+by\s+(${NAME})`, 'iu'), (m) => matchName(m[1], ctx.members)],
    [new RegExp(String.raw`\b(${NAME})\s+(?:paid|payed)\b(?:\s+(?:for\s+)?(?:it|this|everything|all|the bill))?`, 'iu'), (m) => matchName(m[1], ctx.members)],
    // "paid 500 for chai": nobody named, so the speaker paid.
    [/^\s*(?:paid|payed)\b(?:\s+(?:for\s+)?(?:it|this|everything|all|the bill))?/i, () => ctx.me],
  ]
  for (const [re, pick] of payerPatterns) {
    const m = text.match(re)
    if (!m) continue
    const id = pick(m)
    if (!id) continue
    out.payer = id
    out.payerExplicit = true
    text = cut(text, m.index!, m[0].length)
    break
  }

  // Who took part.
  const w = text.match(WITH_RE)
  if (w) {
    const keyword = w[1].toLowerCase()
    const names = w[2].split(new RegExp(SEP, 'iu')).filter(Boolean)
    const ids: MemberId[] = []
    const misses: string[] = []
    for (const n of names) {
      const id = resolveName(n, ctx)
      if (id) ids.push(id)
      else misses.push(n)
    }
    // "with" and "between" always name people; "for" often introduces the thing ("for cab"), so it
    // only counts as a list of people when at least one name is known.
    const accept = ids.length > 0 || /^(with|w\/|between|among|amongst|incl|including)/.test(keyword)
    if (accept) {
      if (/^(with|w\/|incl)/.test(keyword)) ids.unshift(ctx.me)
      unmatched.push(...misses)
      if (ids.length) out.participants = [...new Set(ids)]
      text = cut(text, w.index!, w[0].length)
    }
  }
  if (only) out.participants = only
  else if (everyone) out.participants = undefined

  // What's left is the description.
  const rest = tidy(text.replace(/[,;:!?]+/g, ' '))
    .replace(/^(?:(?:for|on|at|to|the|a|an|of|-|–|—)\s+)+/i, '')
    .replace(/(?:\s+(?:for|on|at|to|with|the|a|an|and|of|-|–|—))+$/i, '')
    .trim()
  out.description = rest ? titleCase(rest) : ''

  out.confidence = out.amount === undefined ? 'low' : out.description && !unmatched.length ? 'high' : 'medium'
  return out
}

// ---- Hand-off to the form -----------------------------------------------------------

/** What Quick add hands the expense form (src/lib/pending.ts `pending.quick`). */
export interface QuickPrefill {
  /** what was typed or said, kept as a note of where the numbers came from */
  text: string
  description: string
  amount?: Cents
  currency: string
  payer: MemberId
  participants?: MemberId[]
  date?: string
  category?: Category
}

export function toQuickPrefill(p: NlParse, text: string, category?: Category | null): QuickPrefill {
  return {
    text,
    description: p.description,
    amount: p.amount,
    currency: p.currency,
    payer: p.payer,
    participants: p.participants,
    date: p.date,
    category: category ?? undefined,
  }
}

/** What the server's text reader returns (amount in hundredths, people as names). */
export interface AiTextExpense {
  description?: string
  amount?: number
  currency?: string
  date?: string
  payer?: string
  participants?: string[]
  category?: Category
}

/** The local parse, with the gaps the AI could fill: description, amount, people (names resolved here, unknown ones dropped). */
export function mergeAiParse(local: NlParse, ai: AiTextExpense | null | undefined, ctx: NlContext): NlParse & { category?: Category } {
  if (!ai) return local
  const out: NlParse & { category?: Category } = { ...local, unmatched: [...local.unmatched] }
  if (!out.description && ai.description?.trim()) out.description = titleCase(ai.description.trim())
  if (out.amount === undefined && typeof ai.amount === 'number' && ai.amount > 0) {
    const cur = ai.currency && /^[A-Z]{3}$/.test(ai.currency) ? ai.currency : ctx.currency
    out.currency = cur
    out.amount = fromHundredths(Math.round(ai.amount), cur)
  }
  if (!out.payerExplicit && ai.payer) {
    const id = resolveName(ai.payer, ctx)
    if (id) {
      out.payer = id
      out.payerExplicit = true
    }
  }
  if (!out.participants && Array.isArray(ai.participants) && ai.participants.length) {
    const ids = ai.participants.map((n) => resolveName(String(n), ctx)).filter((x): x is MemberId => !!x)
    if (ids.length) {
      out.participants = [...new Set(ids)]
      out.unmatched = []
    }
  }
  if (!out.date && ai.date && /^\d{4}-\d{2}-\d{2}$/.test(ai.date)) out.date = ai.date
  if (ai.category) out.category = ai.category
  out.confidence = out.amount === undefined ? 'low' : out.description && !out.unmatched.length ? 'high' : 'medium'
  return out
}
