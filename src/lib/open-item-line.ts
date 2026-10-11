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
