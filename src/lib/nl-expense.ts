import type { Category, Cents, MemberId } from '@/types'
import { titleCase } from './text'
import { todayISO } from './id'
import { fromHundredths, minorDigits } from './money'
import { MONTH_WORD_RE, parseNlDate } from './nl-date'
import { allocate } from './splits'
import { excludedPeople, WRITER_OUT } from '../../shared/quick-exclude'
import { spokenNumbers } from './spoken-numbers'

/*
 * Quick add: "dinner 1200 with Rahul and Priya, I paid" → a prefilled expense form. A small
 * grammar, not a model: the amount (with an optional currency word or symbol), who paid, who
 * took part (first names matched against the group's members; "me"/"I" is the user), a split
 * hint ("3 ways", "only me") and a date (src/lib/nl-date.ts: "Oct 2", "2nd Oct", "last fri", "02/10/26"). The
 * date is read and cut first, so its day number is never taken for the amount. Whatever is left is the description. The result
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
  /** local ISO day the relative and year-less dates count back from (default todayISO()) */
  today?: string
  /** numeric dates as DD/MM (default, India and Australia); false reads MM/DD */
  dayFirst?: boolean
  /** full names to read as one person wherever they appear (default the members'): with every group's names, "Rahul Verma" never reads as this group's Rahul Sharma */
  knownNames?: string[]
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
  /** money received to share ("Rahul got a 1000 refund"), not spent: shared/received.ts */
  received?: boolean
  /** words that looked like people but matched nobody */
  unmatched: string[]
  /** exact minor units per person when the line gave uneven parts ("Rahul owes 400", "60/40", "2 shares"); they sum to `amount` */
  exact?: Record<MemberId, Cents>
  /** money paid back to settle up, not a cost ("paid Rahul 500 back", "Rahul paid me 300") */
  payment?: { from: MemberId; to: MemberId }
  /** a name two members share ("Rahul" with Rahul Sharma and Rahul Kapoor): the first is used until the person picks */
  ambiguous?: Array<{ token: string; ids: MemberId[] }>
  /** the line said who paid but not in a way the grammar could pin on someone ("they paid" with nobody named) */
  payerUnclear?: boolean
  /** "he paid" with two people named: one of these paid, the person picks */
  payerChoices?: MemberId[]
  confidence: NlConfidence
  /** a long line's words the reading didn't use (the description is a short name made from them) */
  leftover?: string
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
// A currency mark sticks to the number ("rs290", "₹ 290"); without one the number must stand on its own.
const AMOUNT_RE = new RegExp(
  String.raw`(?:(?<![\p{L}\d])(${MARK})\s*|(?<![\p{L}\d.,:/]))(\d(?:[\d,]*\d)?(?:\.\d+)?)(?:\s*(k|lakhs?|lacs?|crores?|cr)(?![\p{L}]))?(?:\s*(${WORD})(?![\p{L}]))?(\s*\/-)?`,
  'giu',
)
/** A number followed by one of these is a count, not money ("3 ways", "2 people", "20%"). */
const COUNT_AFTER = /^\s*(?:-?\s*ways?\b|people|persons?|ppl\b|pax\b|of us\b|%|percent\b|x\b|times\b|guys\b|folks\b|friends\b)/i
/** ...and one followed by these is an ordinal or a time of day ("2nd", "2pm", "2:30", "7 o'clock"). */
const NOT_MONEY_AFTER = /^(?:st|nd|rd|th)(?![\p{L}])|^\s*(?:am|pm|a\.m\.|p\.m\.|hrs|o['’]?clock)(?![\p{L}])|^:\d/iu
const wordBefore = (text: string, index: number) => text.slice(0, index).match(/([\p{L}.]+)[\s,]*$/u)?.[1] ?? ''
const wordAfter = (text: string) => text.match(/^[\s,]*([\p{L}.]+)/u)?.[1] ?? ''
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

const NAME = String.raw`[\p{L}][\p{L}'’.\u2060-]*`
/** Joins a full name's words so it reads as one name ("Rahul⁠Verma"); fold() and unjoin() turn it back into a space. */
const JOIN = '\u2060'
const unjoin = (s: string) => s.replaceAll(JOIN, ' ')
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Every multi-word full name in the line, longest first, joined into one token. */
function joinFullNames(text: string, names: string[]): string {
  const full = [...new Set(names.map((n) => n.trim().replace(/\s+/g, ' ')).filter((n) => n.includes(' ')))].sort((a, b) => b.length - a.length)
  for (const n of full)
    text = text.replace(new RegExp(String.raw`(?<![\p{L}${JOIN}])${escapeRe(n).replace(/ /g, '\\s+')}(?![\p{L}${JOIN}])`, 'giu'), (m) =>
      m.replace(/\s+/g, JOIN),
    )
  return text
}
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
  return nameMatches(token, members)[0]
}

/** How well a folded token fits a name: whole 5, first name 4, any part 3, prefix 2, suffixed 1. */
function nameScore(t: string, name: string): number {
  const full = fold(name)
  const parts = full.split(' ')
  if (full === t) return 5
  if (parts[0] === t) return 4
  if (parts.includes(t)) return 3
  if (t.length >= 3 && parts.some((p) => p.startsWith(t))) return 2
  if (t.length >= 4 && !t.includes(' ') && parts.some((p) => p.length >= 4 && t.startsWith(p))) return 1
  return 0
}

/** Every member a name fits best, in group order (two when the group has Rahul Sharma and Rahul Kapoor and the line says "Rahul"). */
export function nameMatches(token: string, members: NlMember[]): MemberId[] {
  const t = fold(token)
  if (!t) return []
  const scored = members.map((m) => ({ id: m.id, score: nameScore(t, m.name) }))
  const top = Math.max(0, ...scored.map((x) => x.score))
  return top ? scored.filter((x) => x.score === top).map((x) => x.id) : []
}

/** "me" / "I" is the user; anything else goes through matchName. */
export function resolveName(token: string, ctx: Pick<NlContext, 'members' | 'me'>): MemberId | undefined {
  return ME_RE.test(token.trim()) ? ctx.me : matchName(token, ctx.members)
}

/**
 * The people named one after another from `from` on: "me Rahul and Priya", "Rohan, Priya", "Rahul
 * & me". Stops at the first word that isn't a member, "me" or "I" (spaces, commas, "and" and "&"
 * between them). The ids in order and where the run ends; nothing when the first word isn't one.
 */
function nameRun(text: string, from: number, ctx: Pick<NlContext, 'members' | 'me'>): { ids: MemberId[]; end: number; tokens: string[] } {
  const ids: MemberId[] = []
  const tokens: string[] = []
  let end = from
  const step = new RegExp(String.raw`^(?:\s*(?:,|&|\+|\band\b)\s*|\s+)?(${NAME})`, 'iu')
  for (;;) {
    const m = text.slice(end).match(step)
    if (!m) break
    const id = resolveName(m[1], ctx)
    if (!id) break
    ids.push(id)
    tokens.push(m[1])
    end += m[0].length
    if (ids.length >= 30) break
  }
  return { ids, end, tokens }
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
    const [whole, mark, num, mult, word, dash] = m
    const after = text.slice(m.index + whole.length)
    const bare = !mark && !word && !dash
    if (bare && COUNT_AFTER.test(after)) continue
    if (bare && !mult && NOT_MONEY_AFTER.test(after)) continue
    const digits = num.replace(/[,.]/g, '')
    if (bare && !mult) {
      // a phone number, a year or day beside a month ("Oct 2026", "31 Feb"), a time after "at"
      if (/^\d+$/.test(num) && digits.length >= 10) continue
      if (/^\d{1,4}$/.test(num) && (MONTH_WORD_RE.test(wordBefore(text, m.index)) || MONTH_WORD_RE.test(wordAfter(after)))) continue
      if (/^\d{1,2}$/.test(num) && Number(num) <= 24 && /\bat\s*$/i.test(text.slice(0, m.index))) continue
    }
    const value = Number(num.replace(/,/g, '')) * (mult ? (MULT[mult.toLowerCase()] ?? 1) : 1)
    if (!Number.isFinite(value) || value <= 0) continue
    const currency = currencyOf(mark) ?? currencyOf(word)
    hits.push({
      index: m.index,
      length: whole.length,
      value,
      currency,
      strong: !!currency || !!mult || !!dash || /\./.test(num) || num.replace(/,/g, '').length >= 3,
    })
  }
  if (!hits.length) return undefined
  // A marked or clearly money-sized figure beats a bare small one ("2 pizzas 600" → 600).
  return hits.sort((a, b) => Number(!!b.currency) - Number(!!a.currency) || Number(b.strong) - Number(a.strong) || b.value - a.value)[0]
}

const cut = (text: string, index: number, length: number) => `${text.slice(0, index)} ${text.slice(index + length)}`
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim()

export function parseNlExpense(input: string, ctx: NlContext): NlParse {
  const today = ctx.today ?? todayISO()
  // "twelve hundred" → 1200: speech-to-text often writes the amount in words (src/lib/spoken-numbers.ts).
  let text = joinFullNames(tidy(spokenNumbers(input)), ctx.knownNames ?? ctx.members.map((m) => m.name))
  const unmatched: string[] = []
  const out: NlParse = { description: '', currency: ctx.currency, payer: ctx.me, payerExplicit: false, unmatched, confidence: 'low' }
  // A name two members share ("Rahul" in a group with two): read as the first, and noted so the person is asked.
  const noteSame = (token: string) => {
    const all = ME_RE.test(token.trim()) ? [] : nameMatches(token, ctx.members)
    if (all.length < 2 || out.ambiguous?.some((a) => a.token === token.trim())) return
    out.ambiguous = [...(out.ambiguous ?? []), { token: token.trim(), ids: all }]
  }

  // The date first, so "Oct 2" or "2nd Oct" never lends its day to the amount.
  const when = parseNlDate(text, today, ctx.dayFirst ?? true)
  if (when) {
    out.date = when.date
    text = cut(text, when.index, when.length)
  }

  // A payment back, not a cost: "paid Rahul 500 back", "I paid Rahul 500", "Rahul paid me 300".
  for (const [re, dir] of PAYMENT_PATTERNS) {
    const m = text.match(re)
    // "got 500 back from Rahul" carries its amount inside the match: it stays in the text for the amount reader.
    const [name, kept] = m?.[2] ? [m[2], m[1]] : [m?.[1], '']
    const who = m && name ? resolveName(name, ctx) : undefined
    if (!m || !who || who === ctx.me) continue
    noteSame(name!)
    out.payment = dir === 'to' ? { from: ctx.me, to: who } : { from: who, to: ctx.me }
    text = `${cut(text, m.index!, m[0].length).replace(/\bback\b/i, ' ')} ${kept}`
    break
  }

  // Uneven parts, before the amount so their numbers aren't taken for it: "Rahul owes 400",
  // "Rahul 30%", "Rahul 2 shares", "60/40", and who takes the rest ("rest me").
  const parts = out.payment ? null : readParts(text, ctx)
  if (parts) {
    text = parts.text
    for (const t of parts.tokens) noteSame(t)
  }

  // Then the amount: everything else is read from what remains.
  const amt = findAmount(text)
  if (amt) {
    const currency = amt.currency ?? ctx.currency
    out.currency = currency
    out.amount = Math.round(amt.value * 10 ** minorDigits(currency))
    text = cut(text, amt.index, amt.length)
  }

  // Split hints.
  text = text.replace(
    /\b(?:split\s+)?(\d+)\s*-?\s*ways?\b|\bbetween\s+(?:the\s+)?(\d+)\s+(?:of us|people|persons?)\b|\b(\d+)\s+(?:people|persons?|of us|pax|ppl)\b/i,
    (_, a, b, c) => {
      const n = Number(a ?? b ?? c)
      if (n >= 2 && n <= 60) out.ways = n
      return ' '
    },
  )
  let only: MemberId[] | undefined
  // "only Rohan and Priya (ate)", "just me": the people named right after "only" / "just".
  {
    const m = text.match(/\b(?:only|just)\s+(?:for\s+)?/iu)
    if (m) {
      const run = nameRun(text, m.index! + m[0].length, ctx)
      if (run.ids.length) {
        only = [...new Set(run.ids)]
        const tail = text.slice(run.end).match(/^\s+only\b/i)
        text = cut(text, m.index!, run.end - m.index! + (tail ? tail[0].length : 0))
      }
    }
  }
  // "me and Rohan only": the people named right before "only".
  if (!only) {
    const m = text.match(new RegExp(String.raw`((?:${NAME}(?:\s*(?:,|&|\band\b)\s*|\s+)){0,6}${NAME})\s+only\b`, 'iu'))
    if (m) {
      const words = m[1].split(/\s*(?:,|&|\band\b)\s*|\s+/i).filter(Boolean)
      // the names at the end of the run, back to the first word that isn't one
      const ids: MemberId[] = []
      let k = words.length - 1
      for (; k >= 0; k--) {
        const id = resolveName(words[k], ctx)
        if (!id) break
        ids.unshift(id)
      }
      if (ids.length) {
        only = [...new Set(ids)]
        text = text.replace(
          new RegExp(
            String.raw`${words
              .slice(k + 1)
              .map(escapeRe)
              .join(String.raw`(?:\s*(?:,|&|\band\b)\s*|\s+)`)}\s+only\b`,
            'iu',
          ),
          ' ',
        )
      }
    }
  }
  text = text.replace(/\bfor\s+(?:me|myself)\s+only\b/i, () => {
    only = [ctx.me]
    return ' '
  })
  let everyone = false
  text = text.replace(
    /\b(?:split\s+)?(?:with\s+|between\s+|among\s+)?(?:everyone|everybody|all of us|sab(?:ko)?)\b(?!\s+(?:but|except|minus|other\s+than|excluding))/i,
    () => {
      everyone = true
      return ' '
    },
  )
  text = text.replace(/\bsplit\s+(?:it\s+)?(?:equally|evenly|equal)\b|\bsplit\s+equal(?:ly)?\b|\bequally\b/i, ' ')

  // Money received ("I got 1000 back", "Rahul received the refund", "refund 500"): who got it is the payer slot.
  // "got" alone is buying ("got pizza 500"), so only "got back" / "got refunded" count.
  const GOT = String.raw`(?:received|got\s+(?:back|refunded|reimbursed)|was\s+(?:refunded|reimbursed))`
  const receivedPatterns: Array<[RegExp, (m: RegExpMatchArray) => MemberId | undefined]> = [
    [new RegExp(String.raw`\b(?:i|me)\s+${GOT}\b`, 'i'), () => ctx.me],
    [new RegExp(String.raw`\b(${NAME})\s+${GOT}\b`, 'iu'), (m) => matchName(m[1], ctx.members)],
    [/^\s*received\b/i, () => ctx.me],
  ]
  for (const [re, pick] of receivedPatterns) {
    const m = text.match(re)
    if (!m) continue
    const id = pick(m)
    if (!id) continue
    out.payer = id
    out.payerExplicit = true
    out.received = true
    text = cut(text, m.index!, m[0].length)
    break
  }
  if (/\b(?:refund(?:ed)?|reimburse(?:d|ment)?|cash\s*back)\b/i.test(text)) out.received = true

  // Who paid.
  const payerPatterns: Array<[RegExp, (m: RegExpMatchArray) => MemberId | undefined]> = [
    [/\b(?:i|me)\s+(?:paid|payed|pay)\b(?:\s+(?:for\s+)?(?:it|this|everything|all|the bill))?/i, () => ctx.me],
    [/\bpaid\s+by\s+(me|myself|i)\b/i, () => ctx.me],
    [new RegExp(String.raw`\bpaid\s+by\s+(${NAME})`, 'iu'), (m) => matchName(m[1], ctx.members)],
    [new RegExp(String.raw`\b(${NAME})\s+(?:paid|payed)\b(?:\s+(?:for\s+)?(?:it|this|everything|all|the bill))?`, 'iu'), (m) => matchName(m[1], ctx.members)],
    // "Rahul covered it", "Rahul got the bill", "Rahul picked up the tab", "dinner on Rahul".
    [
      new RegExp(String.raw`\b(${NAME})\s+(?:covered|got|picked\s+up|took\s+care\s+of|settled)\s+(?:it|this|the\s+(?:bill|tab|check|cheque))\b`, 'iu'),
      (m) => resolveName(m[1], ctx),
    ],
    [new RegExp(String.raw`\b(?:it'?s|was|is)?\s*on\s+(${NAME})\b(?!\s+\d)`, 'iu'), (m) => (/^(?:me|i)$/i.test(m[1]) ? ctx.me : matchName(m[1], ctx.members))],
    // "paid 500 for chai": nobody named, so the speaker paid.
    [/^\s*(?:paid|payed)\b(?:\s+(?:for\s+)?(?:it|this|everything|all|the bill))?/i, () => ctx.me],
  ]
  // "they paid", "he got the bill": the person the line names, once the people are read below.
  let pronounPaid = false
  const pronoun = out.received || out.payment ? null : text.match(PRONOUN_PAID)
  if (pronoun) {
    pronounPaid = true
    out.payerExplicit = true
    text = cut(text, pronoun.index!, pronoun[0].length)
  }
  for (const [re, pick] of out.received || out.payment || pronounPaid ? [] : payerPatterns) {
    const m = text.match(re)
    if (!m) continue
    const id = pick(m)
    if (!id) continue
    if (m[1]) noteSame(m[1])
    out.payer = id
    out.payerExplicit = true
    text = cut(text, m.index!, m[0].length)
    break
  }

  // Who took part: the first "with / for / between …" that names people ("For lunch with Rahul" skips "for lunch").
  // "for drinks, Rahul …" is the thing, not a list: "for" names people only when a name comes first.
  const w = [...text.matchAll(new RegExp(WITH_RE.source, 'giu'))].find(
    (m) => /^(with|w\/|between|among|amongst|incl|including)/i.test(m[1]) || !!resolveName(m[2].split(new RegExp(SEP, 'iu'))[0] ?? '', ctx),
  )
  if (w) {
    const keyword = w[1].toLowerCase()
    // Names with only spaces between ("between me Rahul and Priya") run on past the list the pattern saw.
    const start = w.index! + w[0].length - w[2].length
    const run = nameRun(text, start, ctx)
    const listEnd = run.ids.length && run.end > w.index! + w[0].length ? run.end : w.index! + w[0].length
    const names = run.ids.length && run.end > w.index! + w[0].length ? run.tokens : w[2].split(new RegExp(SEP, 'iu')).filter(Boolean)
    w[0] = text.slice(w.index!, listEnd)
    const ids: MemberId[] = []
    const misses: string[] = []
    for (const n of names) {
      // "amongst the rest", "between all of us": the group's own words, not someone's name.
      if (NOT_A_NAME.test(n.trim())) continue
      const id = resolveName(n, ctx)
      if (id) ids.push(id)
      else misses.push(n)
      noteSame(n)
    }
    // "with" and "between" always name people; "for" often introduces the thing ("for cab"), so it
    // only counts as a list of people when at least one name is known.
    const accept = ids.length > 0 || /^(with|w\/|between|among|amongst|incl|including)/.test(keyword)
    if (accept) {
      if (/^(with|w\/|incl)/.test(keyword)) ids.unshift(ctx.me)
      unmatched.push(...misses)
      // "she was with me": nobody but you named, so it says nothing about who shares it.
      const set = [...new Set(ids)]
      if (set.length && !(set.length === 1 && set[0] === ctx.me && !misses.length)) out.participants = set
      text = cut(text, w.index!, w[0].length)
    }
  }
  // "Neha and I had pizza", "me and Rahul went for lunch", "Rahul, Priya and I": the people around "and I".
  if (!w && !out.participants) {
    const before = text.match(new RegExp(String.raw`((?:${NAME}(?:\s*(?:,|&)\s*|\s+)){0,5}${NAME})\s+(?:and|&)\s+(?:i|me)\b`, 'iu'))
    const after = text.match(/\b(?:i|me)\s+(?:and|&)\s+/iu)
    if (before) {
      const ids = before[1].split(/\s*(?:,|&)\s*|\s+/).map((n) => resolveName(n, ctx))
      const tailIds: MemberId[] = []
      for (let k = ids.length - 1; k >= 0 && ids[k]; k--) tailIds.unshift(ids[k] as MemberId)
      if (tailIds.length) out.participants = [...new Set([ctx.me, ...tailIds])]
    } else if (after) {
      const run = nameRun(text, after.index! + after[0].length, ctx)
      if (run.ids.length) out.participants = [...new Set([ctx.me, ...run.ids])]
    }
  }
  if (only) out.participants = only
  else if (everyone) out.participants = undefined

  // "everyone except Rohan": the whole group but them, you included.
  const except = text.match(EXCEPT_RE)
  if (except) {
    const out_ = except[1]
      .split(new RegExp(SEP, 'iu'))
      .map((n) => resolveName(n, ctx))
      .filter((x): x is MemberId => !!x)
    if (out_.length) {
      out.participants = ctx.members.map((m) => m.id).filter((id) => !out_.includes(id))
      text = cut(text, except.index!, except[0].length)
    }
  }

  // Left out in plain words ("Aradhana was not a part of that lunch", "Rohan didn't come"): the
  // whole group (or the people named) but them (shared/quick-exclude.ts, as the check on AI's answer).
  const leftOut = excludedPeople(
    input,
    ctx.members.filter((m) => m.id !== ctx.me),
    ctx.me,
  )
  if (leftOut.length) {
    const base = out.participants ?? ctx.members.map((m) => m.id)
    const kept = base.filter((id) => !leftOut.includes(id))
    if (kept.length) out.participants = kept
    for (let i = unmatched.length - 1; i >= 0; i--) if (leftOut.includes(resolveName(unmatched[i], ctx) ?? '')) unmatched.splice(i, 1)
    // The clause that left them out is read: it isn't part of what the money was for.
    if (leftOut.includes(ctx.me)) text = text.replace(new RegExp(String.raw`[^.;,!?]*(?:${WRITER_OUT.source.replace(/'/g, "['’]")})[^.;,!?]*`, 'iu'), ' ')
    for (const id of leftOut) {
      const first = ctx.members.find((m) => m.id === id)?.name.split(' ')[0]
      if (first) text = text.replace(new RegExp(String.raw`[^.;,!?]*\b${escapeRe(first)}\b[^.;,!?]*`, 'iu'), ' ')
    }
  }

  // "500 each for me, Rahul and Priya": the amount is per person, so the cost is that times the people.
  {
    const each = text.match(/\beach\b|\bper\s+(?:head|person)\b|\b(?:a|per)\s+head\b/i)
    const n = out.participants?.length ?? out.ways
    if (each && n && n >= 2 && out.amount !== undefined) {
      out.amount *= n
      text = cut(text, each.index!, each[0].length)
    }
  }

  // "they paid": the one other person named (the last one, when several are).
  if (pronounPaid) {
    const others = [...new Set([...(out.participants ?? []), ...(parts?.people ?? [])].filter((id) => id !== ctx.me))]
    if (others.length === 1) out.payer = others[0]
    else if (others.length > 1) out.payerChoices = others
    else out.payerUnclear = true
  }

  // The parts as exact amounts: whoever shares the cost without a part of their own takes the rest.
  if (parts?.items.length && out.amount !== undefined) {
    const sharers = out.participants ?? [...new Set([out.payer, ...parts.items.map((p) => p.id)])]
    const exact = exactFromParts(out.amount, parts.items, parts.rest ?? null, sharers, out.payer)
    if (exact) {
      out.exact = exact
      out.participants = Object.keys(exact).filter((id) => exact[id] > 0)
    } else out.unmatched.push('the parts')
  }

  // How it was split, said in words the reading above already covers ("split it equally amongst the
  // rest", "split it accordingly", "where they had more shares"): read, so not left over.
  text = text.replace(SPLIT_SAID, ' ')

  // What's left is the description, without the filler around a spoken amount ("the bill was", "it came to").
  text = text.replace(
    /\b(?:(?:the|our)\s+)?(?:bill|total|cost|amount|price)\s+(?:was|is|came\s+to|of|=)\b|\b(?:it|that)\s+(?:was|cost|came\s+to)\b|\bcame\s+to\b/gi,
    ' ',
  )
  const rest = tidy(text.replace(/[,;!?]+|(?<!\d):|:(?!\d)/g, ' '))
    .replace(/^(?:(?:for|on|at|to|the|a|an|of|dated|-|–|—)\s+)+/i, '')
    .replace(/(?:\s+(?:for|on|at|to|with|the|a|an|and|of|dated|split|paid|-|–|—))+$/i, '')
    .trim()
  // What it was for; the words the reading didn't use are kept for Quick add to judge whether AI should read it.
  const told = rest ? storyDescription(rest, input, ctx.members) : { description: '' }
  out.description = told.description ? titleCase(unjoin(told.description)) : ''
  if (told.leftover) out.leftover = told.leftover
  for (let i = 0; i < unmatched.length; i++) unmatched[i] = unjoin(unmatched[i])
  for (const a of out.ambiguous ?? []) a.token = unjoin(a.token)

  out.confidence =
    out.amount === undefined
      ? 'low'
      : out.description && !unmatched.length && !out.payerUnclear && !out.payerChoices && !out.ambiguous?.length
        ? 'high'
        : out.payment && !unmatched.length
          ? 'high'
          : 'medium'
  return out
}

// ---- Payments back, uneven parts ------------------------------------------------------

const BACK = String.raw`(?:\s+back)?`
/** [pattern, direction]: 'to' is from you to the person named, 'from' from them to you. */
const PAYMENT_PATTERNS: Array<[RegExp, 'to' | 'from']> = [
  // "paid Rahul back 500", "paid Rahul 500 back", "I paid Rahul 500", "sent Priya 300", "returned Rohan 200"
  [new RegExp(String.raw`\b(?:i\s+)?(?:paid|payed|sent|gave|returned|repaid|transferred)\s+(?:to\s+)?(${NAME})${BACK}(?=\s+(?:₹|rs\.?\s*)?\d)`, 'iu'), 'to'],
  [new RegExp(String.raw`\bsettled?\s+(?:up\s+)?with\s+(${NAME})\s+(?:by\s+)?(?:paying|giving|sending)`, 'iu'), 'to'],
  // "Rahul paid me 300 back", "Priya sent me 300", "Rohan returned me 200", "got 500 back from Rahul"
  [new RegExp(String.raw`\b(${NAME})\s+(?:paid|payed|sent|gave|returned|repaid|transferred)\s+me${BACK}\b`, 'iu'), 'from'],
  [new RegExp(String.raw`\b(?:got|received)\s+((?:₹|rs\.?\s*)?[\d,.]+k?)\s*(?:back\s+)?from\s+(${NAME})`, 'iu'), 'from'],
]
/** "they paid", "he got the bill", "she covered it". */
const PRONOUN_PAID = /\b(?:they|he|she)\s+(?:paid|payed|covered(?:\s+it)?|got\s+(?:it|the\s+(?:bill|tab|check))|picked\s+up\s+the\s+(?:bill|tab))\b/i
const EXCEPT_RE = new RegExp(
  String.raw`\b(?:everyone|everybody|all(?:\s+of\s+us)?|the\s+group)?\s*(?:except(?:\s+for)?|but\s+not|minus|other\s+than|excluding|(?<=(?:everyone|everybody|all)\s*)but(?!\s+(?:i|we)\b))\s+(${NAME}(?:${SEP}${NAME})*)`,
  'iu',
)

/** An uneven part: an amount (minor units), a percent, or a number of shares. */
type Part = { id: MemberId; kind: 'amount' | 'percent' | 'shares'; value: number }

/**
 * The uneven parts in a line, cut out of it: "Rahul owes 400" / "Rahul's share 400" / "Rahul pays
 * 400" (an amount), "Rahul 30%" / "30 percent" (a percent), "Rahul 2 shares" (a weight), "60/40"
 * or "60-40" with one other person named (you first: yours / theirs), "Rahul 700, Priya 300" (two
 * or more bare name-amount pairs), and who takes the rest ("rest me", "remaining on Rahul").
 */
function readParts(input: string, ctx: NlContext): { text: string; items: Part[]; rest?: MemberId; people: MemberId[]; tokens: string[] } | null {
  let text = input
  const items: Part[] = []
  const tokens: string[] = []
  let rest: MemberId | undefined
  const take = (re: RegExp, f: (m: RegExpMatchArray) => boolean) => {
    for (;;) {
      const m = text.match(re)
      if (!m || !f(m)) return
      text = cut(text, m.index!, m[0].length)
    }
  }
  const num = (v: string) => Number(v.replace(/,/g, ''))
  const add = (who: string, kind: Part['kind'], value: number) => {
    const id = resolveName(who, ctx)
    if (!id || !(value > 0) || items.some((p) => p.id === id)) return false
    items.push({ id, kind, value })
    tokens.push(who)
    return true
  }
  // who takes the rest
  take(new RegExp(String.raw`\b(?:the\s+)?(?:rest|remaining|remainder|balance)\s+(?:is\s+)?(?:on\s+|by\s+|for\s+)?(${NAME})\b`, 'iu'), (m) => {
    const id = resolveName(m[1], ctx)
    if (!id) return false
    rest = id
    tokens.push(m[1])
    return true
  })
  // amounts are kept in minor units of the group's currency
  const minor = (v: number) => Math.round(v * 10 ** minorDigits(ctx.currency))
  take(
    new RegExp(
      String.raw`\b(${NAME})(?:'s\s+share(?:\s+is)?|\s+owes?|\s+pays?|\s+share)\s*(?:₹|rs\.?\s*)?(\d[\d,]*(?:\.\d+)?)\b(?!\s*(?:%|percent|shares?))`,
      'iu',
    ),
    (m) => add(m[1], 'amount', minor(num(m[2]))),
  )
  take(new RegExp(String.raw`\b(${NAME})\s*(?:pays\s+|owes\s+)?(\d{1,3}(?:\.\d+)?)\s*(?:%|percent)`, 'iu'), (m) => add(m[1], 'percent', num(m[2])))
  take(new RegExp(String.raw`\b(${NAME})\s+(\d{1,2})\s+shares?\b`, 'iu'), (m) => add(m[1], 'shares', num(m[2])))
  // "60/40" / "60-40" / "split 60 40": yours first, then the one other person named in the line.
  const ratio = text.match(/\b(?:split\s+)?(\d{1,2})\s*[/-]\s*(\d{1,2})\b(?!\s*\d)|\bsplit\s+(\d{1,2})\s+(\d{1,2})\b/i)
  if (ratio && !items.length) {
    const a = num(ratio[1] ?? ratio[3])
    const b = num(ratio[2] ?? ratio[4])
    const others = namedPeople(cut(text, ratio.index!, ratio[0].length), ctx).filter((id) => id !== ctx.me)
    if (a + b === 100 && others.length === 1) {
      items.push({ id: ctx.me, kind: 'percent', value: a }, { id: others[0], kind: 'percent', value: b })
      text = cut(text, ratio.index!, ratio[0].length)
    }
  }
  // "Rahul had 3 and I had 1": what each had, as shares (two or more people).
  {
    const had = [
      ...text.matchAll(new RegExp(String.raw`\b(${NAME})\s+(?:had|has|ate|drank|took|got)\s+(\d{1,2})\b(?!\s*(?:%|percent|rs|rupees|₹|\.\d|,\d|\d))`, 'giu')),
    ].filter((m) => resolveName(m[1], ctx))
    if (had.length >= 2 && !items.length) {
      for (const m of had.reverse()) if (add(m[1], 'shares', num(m[2]))) text = cut(text, m.index!, m[0].length)
    }
  }
  // Shares as a ratio with one other person: "the share was 2x3", "shares 2:3", "ratio 1 to 2".
  // Yours first, then theirs, unless the line says who had more ("they had more shares").
  const shareRatio = /\b(?:shares?|ratio|split(?:\s+it)?\s+\d{1,2}\s*(?:to|x|:|by)\s*\d{1,2})\b/i.test(text)
    ? text.match(/\b(?:(?:shares?|ratio)\s+(?:was|is|of|were|in\s+the\s+ratio)?\s*)?(\d{1,2})\s*(?:x|:|by|to|is\s+to|\/)\s*(\d{1,2})\b(?!\s*(?:%|percent|\d))/i)
    : null
  if (shareRatio && !items.length) {
    const a = num(shareRatio[1])
    const b = num(shareRatio[2])
    const others = namedPeople(cut(text, shareRatio.index!, shareRatio[0].length), ctx).filter((id) => id !== ctx.me)
    if (others.length === 1 && a > 0 && b > 0 && a + b !== 100) {
      const more = text.match(
        /\b(i|me|we|they|he|she|[\p{L}]+)\s+(?:had|has|have|get|gets|got|took|takes|ate|owe|owes)\s+(?:a\s+)?(more|bigger|larger|less|fewer|smaller)\b/iu,
      )
      let mine = a
      let theirs = b
      if (more) {
        const meMore = /^(?:i|me)$/i.test(more[1]) === /^(?:more|bigger|larger)$/i.test(more[2])
        mine = meMore ? Math.max(a, b) : Math.min(a, b)
        theirs = meMore ? Math.min(a, b) : Math.max(a, b)
      }
      items.push({ id: ctx.me, kind: 'shares', value: mine }, { id: others[0], kind: 'shares', value: theirs })
      text = cut(text, shareRatio.index!, shareRatio[0].length)
    }
  }
  // two or more bare pairs ("Rahul 700, Priya 300"), or one with a rest ("Rahul 700, rest me")
  const PAIR = new RegExp(String.raw`\b(${NAME})\s+(?:₹|rs\.?\s*)?(\d[\d,]*(?:\.\d+)?)\b(?!\s*(?:%|percent|shares?|ways?|people))`, 'giu')
  const pairs = [...text.matchAll(PAIR)].filter((m) => resolveName(m[1], ctx))
  // one pair counts when another number is left for the total ("hotel 6000 Priya 4000"); "lunch with Rahul 600" has none
  const total = pairs.length === 1 && findAmount(cut(text, pairs[0].index!, pairs[0][0].length))
  if (pairs.length >= 2 || (pairs.length === 1 && (rest || items.length || total))) {
    for (const m of pairs.reverse()) {
      if (add(m[1], 'amount', minor(num(m[2])))) text = cut(text, m.index!, m[0].length)
    }
  }
  if (!items.length && !rest) return null
  return { text, items, rest, people: [...items.map((p) => p.id), ...(rest ? [rest] : [])], tokens }
}

/** Members the line names anywhere (first names), for the "60/40 with Meera" reading. */
function namedPeople(text: string, ctx: NlContext): MemberId[] {
  const out: MemberId[] = []
  for (const w of text.match(new RegExp(NAME, 'gu')) ?? []) {
    if (w.length < 2 || STOP_WORDS.has(w.toLowerCase())) continue
    const id = ME_RE.test(w) ? undefined : matchName(w, ctx.members)
    if (
      id &&
      fold(ctx.members.find((m) => m.id === id)?.name ?? '')
        .split(' ')
        .some((p) => p === fold(w))
    )
      out.push(id)
  }
  return [...new Set(out)]
}
/** What a spoken story was for, when the words left over are a sentence rather than a name for it. */
const THINGS =
  /\b(breakfast|brunch|lunch|dinner|supper|coffee|tea|drinks|beers?|snacks|dessert|pizza|biryani|groceries|grocery|rent|electricity|wifi|internet|cab|taxi|uber|ola|auto|rickshaw|fuel|petrol|diesel|parking|tolls?|flights?|train|bus|tickets?|movie|hotel|stay|airbnb|room|villa|resort|homestay|hostel|cottage|camp|shopping|gift|party|cake|trek|boat|ferry|entry|museum|massage|laundry|medicine)\b/i
/** Words that are the telling, not the thing: people, pronouns, filler verbs. */
const TELLING = new Set(
  'i me my we us our you he she they them his her their it its this that there then so and but also just only really actually remember remembered forgot was were is are be been had has have went go going ate eat drank ordered order got get came come took take did do done which who where when what'.split(
    ' ',
  ),
)

/**
 * What it was for, from the words the reading left: a story's people, pronouns and filler verbs
 * dropped ("Neha and I had pizza" → Pizza, "lunch ate" → Lunch), else the thing it names (lunch,
 * cab, hotel …). `leftover` is what was left when any of it was dropped, for Quick add's routing.
 */
function storyDescription(rest: string, line: string, members: ReadonlyArray<{ name: string }>): { description: string; leftover?: string } {
  const words = rest.split(/\s+/).filter(Boolean)
  const names = new Set(members.flatMap((m) => fold(m.name).split(' ')))
  const keep = words.filter((w) => {
    const f = fold(w).replace(/[^\p{L}\p{N}']/gu, '')
    return f && !TELLING.has(f) && !names.has(f) && !/^(?:for|on|at|to|of|with|a|an|the|split|paid|pay)$/.test(f)
  })
  if (keep.length === words.length && words.length <= 5) return { description: rest }
  const thing = rest.match(THINGS) ?? line.match(THINGS)
  // A short one with no thing named ("Nobody paid for chai"): as it was, rather than a stub.
  if (!thing && words.length <= 5) return { description: rest, leftover: rest }
  const description = thing ? thing[1] : keep.slice(0, 4).join(' ')
  return { description, leftover: rest }
}

/** How it was split, in words: equally among the rest / everyone, accordingly, by all, who had more shares. */
const SPLIT_SAID =
  /\b(?:so\s+)?split\s+(?:it\s+)?\d{1,2}\s*(?:to|x|:|by)\s*\d{1,2}\b|\b(?:it\s+was\s+)?split\s+(?:it\s+)?(?:(?:equally|evenly)\s+)?(?:(?:among(?:st)?|between|by)\s+(?:the\s+rest(?:\s+of\s+us)?|the\s+others|everyone(?:\s+else)?|all(?:\s+of\s+us)?|us(?:\s+all)?))?(?:\s+accordingly)?\b|\b(?:where|and)?\s*(?:they|he|she|i|we|[\p{L}]+)\s+(?:had|has|have|got|get|took)\s+(?:a\s+)?(?:more|bigger|larger|less|fewer|smaller)(?:\s+shares?)?\b/giu

/** Words after "among" / "between" that mean the group, never a person. */
const NOT_A_NAME =
  /^(?:the\s+)?(?:rest|others?|lot|group|gang|team)(?:\s+of\s+(?:us|them))?$|^(?:the|us|them|all|all\s+of\s+us|everyone(?:\s+else)?|everybody(?:\s+else)?)$/i
const STOP_WORDS = new Set(['with', 'and', 'split', 'for', 'the', 'paid', 'rest', 'me', 'i', 'my', 'dinner', 'lunch'])

/**
 * Exact minor units from the parts: amounts as given, percents of the amount, shares as weights;
 * whoever shares it without a part (`rest`, else the sharers left over, else the payer) takes what's
 * left equally. null when it can't be exact (parts over the amount, or a rest nobody can take).
 */
export function exactFromParts(amount: Cents, parts: Part[], rest: MemberId | null, sharers: MemberId[], payer: MemberId): Record<MemberId, Cents> | null {
  const out: Record<MemberId, Cents> = {}
  let left = amount
  const amounts = parts.filter((p) => p.kind === 'amount')
  const percents = parts.filter((p) => p.kind === 'percent')
  const shares = parts.filter((p) => p.kind === 'shares')
  if (shares.length && (amounts.length || percents.length)) return null
  for (const p of amounts) {
    out[p.id] = p.value
    left -= p.value
  }
  if (percents.length) {
    const pct = percents.reduce((a, p) => a + p.value, 0)
    if (pct > 100) return null
    const pool = Math.round((amount * pct) / 100)
    const split = allocate(
      pool,
      percents.map((p) => [p.id, p.value]),
    )
    for (const p of percents) out[p.id] = (out[p.id] ?? 0) + split[p.id]
    left -= pool
  }
  if (shares.length) {
    const split = allocate(
      amount,
      shares.map((p) => [p.id, p.value]),
    )
    return split
  }
  if (left < 0) return null
  if (left > 0) {
    const takers = rest ? [rest] : sharers.filter((id) => !(id in out)).length ? sharers.filter((id) => !(id in out)) : [payer]
    if (!takers.length) return null
    const split = allocate(
      left,
      takers.map((id) => [id, 1]),
    )
    for (const id of takers) out[id] = (out[id] ?? 0) + split[id]
  }
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
  /** exact minor units per person (Quick add with AI, when the line said who owes what); they sum to `amount` */
  exact?: Record<MemberId, Cents>
  date?: string
  category?: Category
  /** money received to share, not an expense */
  received?: boolean
  /** an icon to start from (a claimed open item's): one emoji, `iconAuto` when it was the automatic one's AI pick */
  icon?: string
  iconAuto?: true
  /** a claimed open item's drawn icon or picture (dropped in a private group when the expense is saved) */
  iconSvg?: string
  iconImage?: string
}

export function toQuickPrefill(p: NlParse, text: string, category?: Category | null): QuickPrefill {
  return {
    text,
    description: p.description,
    amount: p.amount,
    currency: p.currency,
    payer: p.payer,
    participants: p.participants,
    ...(p.exact ? { exact: p.exact } : {}),
    date: p.date,
    category: category ?? undefined,
    received: p.received || undefined,
  }
}

/**
 * A line read before its group existed ("dinner 1200 in a new group Bali trip"): once the group
 * is made, `line` (the words without the group part) is read again against its members, so the
 * people it names and who paid are picked (and a name read as a word before, like "Priya paid",
 * leaves the description). The amount follows the new group's currency when the line gave none;
 * the date and category stay as first read.
 */
export function bindQuickPrefill(prefill: QuickPrefill, line: string, ctx: NlContext): QuickPrefill {
  const p = parseNlExpense(line, ctx)
  return {
    ...prefill,
    description: p.description || prefill.description,
    payer: p.payer,
    participants: p.participants,
    ...(p.amount !== undefined ? { amount: p.amount, currency: p.currency } : {}),
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
