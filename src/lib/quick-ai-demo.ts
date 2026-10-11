/*
 * Demo mode's stand-in for Quick add with AI (the callable quickAddAi needs the server). It reads
 * one sentence shape on the phone: "create a group Goa trip with Rahul and Priya and add dinner
 * 2400 paid by me split equally" (create / make / start / set up; "and add", "then add" or a
 * comma), or just "create a group for my Bali trip with Rahul, Priya and Subramaniam" (a group
 * with no cost, for an app that sends `groupOnly`), and answers in the callable's contract, so the demo walks the same confirm-then-form
 * path. Anything else is 'unknown' and Quick add reads the line as it does without AI.
 */
import type { QuickAiRequest, QuickAiResult } from '../../shared/quick-ai'
import { parseNlExpense } from './nl-expense'
import { guessGroup } from './groupTypes'
import { QUICK_GROUP_TYPES } from '../../shared/quick-ai'

const SHAPE =
  /^\s*(?:please\s+)?(?:create|make|start|set\s*up|setup|open)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:group|grp|trip)\s+(?:called\s+|named\s+)?(.+?)\s+with\s+(.+?)\s*(?:,|\band\b|\bthen\b)\s*(?:then\s+)?(?:add|record|log)\s+(.+)$/iu
const SEP = /\s*(?:,|&|\+|\band\b)\s*/iu
const GROUP_ONLY =
  /^\s*(?:please\s+)?(?:create|make|start|set\s*up|setup|open)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:group|grp|trip)\s+(?:called\s+|named\s+|for\s+(?:my\s+|our\s+|the\s+)?)?(.+?)\s+with\s+(.+?)\s*\.?\s*$/iu

const peopleIn = (s: string) =>
  [
    ...new Set(
      s
        .split(SEP)
        .map((x) => x.trim())
        .filter((x) => x && !/^(me|i|myself)$/i.test(x)),
    ),
  ].slice(0, 20)
const typeFor = (name: string) => {
  const guessed = guessGroup(name)?.type
  return guessed && (QUICK_GROUP_TYPES as readonly string[]).includes(guessed) ? (guessed as (typeof QUICK_GROUP_TYPES)[number]) : undefined
}
const titled = (name: string) =>
  name
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .replace(/(^|\s)\p{Ll}/gu, (c) => c.toUpperCase())

export function demoQuickAi(req: QuickAiRequest): QuickAiResult {
  const m = req.text.match(SHAPE)
  if (!m) {
    const g = req.groupOnly ? req.text.match(GROUP_ONLY) : null
    if (!g) return { action: 'unknown' }
    const name = titled(g[1])
    const members = peopleIn(g[2])
    if (!name || !members.length) return { action: 'unknown' }
    const type = typeFor(name)
    return { action: 'group', group: { name, ...(type ? { type } : {}), members } }
  }
  const name = m[1].replace(/\s+/g, ' ').trim().slice(0, 60)
  const members = peopleIn(m[2])
  if (!name || !members.length) return { action: 'unknown' }
  const rest = m[3].replace(/\bsplit\s+(?:it\s+)?(?:equally|evenly)\b/i, ' ')
  const p = parseNlExpense(rest, { members: members.map((n) => ({ id: n, name: n })), me: 'me', currency: req.currency, today: req.today })
  if (p.amount === undefined && !p.description) return { action: 'unknown' }
  const type = typeFor(name)
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
