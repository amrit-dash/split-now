import { guessCategory } from './categories'
import { fromHundredths } from './money'
import { parseNlExpense, resolveName, type AiTextExpense, type NlContext } from './nl-expense'
import type { OpenItemInput } from './open-items'
import { titleCase } from './text'

// Its own module: the Quick add grammar loads with the add sheet, not with every group screen.

/**
 * The one-line way in: "lunch 290 2nd Oct Cafe Blue" → title "Lunch Cafe Blue", ₹290, 2 Oct.
 * Read with the Quick add grammar; a name it reads as the payer ("Rahul paid") becomes a
 * suspect, since nobody is sure yet. Nothing is required but some words.
 */
export function openItemFromLine(line: string, ctx: NlContext): OpenItemInput {
  const p = parseNlExpense(line, ctx)
  const title = p.description || line.trim()
  const out: OpenItemInput = { title }
  // An amount in another currency than the group's would need a rate: leave it for the claimer.
  if (p.amount !== undefined && p.currency === ctx.currency) out.amount = p.amount
  if (p.date) out.date = p.date
  const category = guessCategory(title)
  if (category) out.category = category
  if (p.payerExplicit) out.suspects = [p.payer]
  return out
}

/**
 * What the AI reader (repo.parseTextAi, the same reader Quick add fills its gaps with) adds to
 * the phone's reading of a line: its tidier title, and the amount, date, category and "who paid"
 * when the phone found none. The phone's findings win where both have one. null when the AI adds
 * nothing new, so the sheet only offers it when it's worth a look. An amount in another currency,
 * a future date or a name nobody in the group has is left out.
 */
export function openItemFromAi(local: OpenItemInput, ai: AiTextExpense | null | undefined, ctx: NlContext & { today: string }): OpenItemInput | null {
  if (!ai) return null
  const out: OpenItemInput = { ...local }
  const title = ai.description?.trim()
  if (title) out.title = titleCase(title).slice(0, 120)
  const cur = ai.currency && /^[A-Z]{3}$/.test(ai.currency) ? ai.currency : ctx.currency
  if (out.amount === undefined && typeof ai.amount === 'number' && ai.amount > 0 && cur === ctx.currency)
    out.amount = fromHundredths(Math.round(ai.amount), cur)
  if (!out.date && ai.date && /^\d{4}-\d{2}-\d{2}$/.test(ai.date) && ai.date <= ctx.today) out.date = ai.date
  if (ai.category && ai.category !== 'other') out.category = ai.category
  const payer = ai.payer ? resolveName(ai.payer, ctx) : undefined
  if (payer && !out.suspects?.includes(payer)) out.suspects = [...(out.suspects ?? []), payer]
  const same =
    out.title === local.title &&
    out.amount === local.amount &&
    out.date === local.date &&
    out.category === local.category &&
    (out.suspects ?? []).length === (local.suspects ?? []).length
  return same ? null : out
}

// ---- Quick add: a line that is an open item ------------------------------------------------

/** Words that say "nobody's sure yet, write it down": the line is an open item, not an expense. */
const OPEN_RE =
  /(?:\bopen[\s-]item\b|\b(?:not sure|unsure|no idea|don'?t know|dunno|forgot|can'?t remember)\s+(?:who|how much)\b(?:\s+(?:paid|it was|was it))?|\bwho(?:ever)?\s+paid\b|\b(?:someone|somebody|one of us)\s+paid\b|\b(?:add|claim|sort(?:\s+it)?(?:\s+out)?)\s+(?:it\s+)?later\b|\bto\s+claim\b|\bnote(?:\s+down)?\s*:|\bnote\s+down\b|\bwrite\s+(?:it\s+)?down\b)\s*\??/giu
/** "Rahul might have paid", "maybe Priya paid", "Rahul or Priya paid?" (a guess, not a fact). */
const GUESS_RE =
  /\b(?:(?:maybe|probably|possibly|i\s+think)\s+)?([\p{L}]+)(?:\s*(?:or|\/|,)\s*([\p{L}]+))?\s+(?:(?:might|may|could)\s+have|probably|maybe|possibly)\s+paid\b\s*\??|\b(?:maybe|probably|possibly)\s+([\p{L}]+)(?:\s*(?:or|\/)\s*([\p{L}]+))?\s+paid\b\s*\??/giu
/** Words a guess can catch that are never a person. */
const NOT_A_NAME = new Set(['who', 'whoever', 'someone', 'somebody', 'anyone', 'nobody', 'one', 'it', 'they', 'we', 'us', 'he', 'she'])

/**
 * Whether a Quick add line asks to write something down rather than add it: "lunch Oct 2 Cafe
 * Blue, who paid?", "not sure who paid for the taxi", "Rahul might have paid for parasailing",
 * "note: ferry tickets, add later". A plain "dinner 1200, I paid" never is.
 */
export function isOpenItemLine(line: string): boolean {
  OPEN_RE.lastIndex = 0
  GUESS_RE.lastIndex = 0
  return OPEN_RE.test(line) || GUESS_RE.test(line)
}

/**
 * An open-item line → the sheet's fields: the open-item words cut out, the rest read like any
 * line (openItemFromLine), and the people it guesses at as "might have paid".
 */
export function openItemFromQuickLine(line: string, ctx: NlContext): OpenItemInput {
  const suspects: string[] = []
  const rest = line
    .replace(GUESS_RE, (whole, a?: string, b?: string, c?: string, d?: string) => {
      const ids = [a ?? c, b ?? d]
        .filter((n): n is string => !!n && !NOT_A_NAME.has(n.toLowerCase()))
        .map((n) => resolveName(n, ctx))
        .filter((id): id is string => !!id)
      suspects.push(...ids)
      return ids.length ? ' ' : whole
    })
    .replace(OPEN_RE, ' ')
    .replace(/\s*[,;]\s*(?=[,;]|$)/g, '')
    .replace(/\s+for\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  const out = openItemFromLine(rest || line, ctx)
  const all = [...new Set([...(out.suspects ?? []), ...suspects])]
  return { ...out, ...(all.length ? { suspects: all } : {}) }
}
