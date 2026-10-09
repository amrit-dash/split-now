/*
 * Demo mode's stand-in for Quick add with AI (the callable quickAddAi needs the server). It reads
 * one sentence shape on the phone: "create a group Goa trip with Rahul and Priya and add dinner
 * 2400 paid by me split equally" (create / make / start / set up; "and add", "then add" or a
 * comma), and answers in the callable's contract, so the demo walks the same confirm-then-form
 * path. Anything else is 'unknown' and Quick add reads the line as it does without AI.
 */
import type { QuickAiRequest, QuickAiResult } from '../../shared/quick-ai'
import { parseNlExpense } from './nl-expense'
import { guessGroup } from './groupTypes'
import { QUICK_GROUP_TYPES } from '../../shared/quick-ai'

const SHAPE =
  /^\s*(?:please\s+)?(?:create|make|start|set\s*up|setup|open)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:group|grp|trip)\s+(?:called\s+|named\s+)?(.+?)\s+with\s+(.+?)\s*(?:,|\band\b|\bthen\b)\s*(?:then\s+)?(?:add|record|log)\s+(.+)$/iu
const SEP = /\s*(?:,|&|\+|\band\b)\s*/iu

export function demoQuickAi(req: QuickAiRequest): QuickAiResult {
  const m = req.text.match(SHAPE)
  if (!m) return { action: 'unknown' }
  const name = m[1].replace(/\s+/g, ' ').trim().slice(0, 60)
  const members = [
    ...new Set(
      m[2]
        .split(SEP)
        .map((s) => s.trim())
        .filter((s) => s && !/^(me|i|myself)$/i.test(s)),
    ),
  ].slice(0, 20)
  if (!name || !members.length) return { action: 'unknown' }
  const rest = m[3].replace(/\bsplit\s+(?:it\s+)?(?:equally|evenly)\b/i, ' ')
  const p = parseNlExpense(rest, { members: members.map((n) => ({ id: n, name: n })), me: 'me', currency: req.currency, today: req.today })
  if (p.amount === undefined && !p.description) return { action: 'unknown' }
  const guessed = guessGroup(name)?.type
  const type = guessed && (QUICK_GROUP_TYPES as readonly string[]).includes(guessed) ? (guessed as (typeof QUICK_GROUP_TYPES)[number]) : undefined
  return {
    action: 'group_and_expense',
    group: { name: name[0].toUpperCase() + name.slice(1), ...(type ? { type } : {}), members },
    expense: {
      description: p.description,
      ...(p.amount !== undefined ? { amount: p.amount } : {}),
      currency: p.currency,
      ...(p.date ? { date: p.date } : {}),
      paidBy: p.payer,
      split: 'equal',
      ...(p.participants?.length ? { participants: p.participants } : {}),
    },
  }
}
