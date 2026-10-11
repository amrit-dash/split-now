import { guessCategory } from './categories'
import { parseNlExpense, type NlContext } from './nl-expense'
import type { OpenItemInput } from './open-items'

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
