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

/** "paid Rahul 500 back" (me → Rahul), "Rahul paid me 300 back" (Rahul → me). */
const PAY_TO = /^\s*(?:i\s+)?(?:paid|sent|gave|returned)\s+(\p{L}+)\s+(?:₹|rs\.?\s*)?(\d[\d,]*)\b/iu
const PAY_FROM = /^\s*(\p{L}+)\s+(?:paid|sent|gave)\s+me\s+(?:back\s+)?(?:₹|rs\.?\s*)?(\d[\d,]*)\b/iu
const PRONOUN_PAID = /\b(?:they|he|she)\s+paid\b/i

/** A member of the default group by first or full name: their id. */
function memberIn(req: QuickAiRequest, name: string): string | undefined {
  const g = req.groups.find((x) => x.id === req.groupId)
  const n = name.toLowerCase()
  return g?.members.find((m) => m.name.toLowerCase() === n || m.name.toLowerCase().split(' ')[0] === n)?.id
}

export function demoQuickAi(req: QuickAiRequest): QuickAiResult {
  // Payments back, in the default group.
  const to = req.payments && req.groupId ? req.text.match(PAY_TO) : null
  const from = !to && req.payments && req.groupId ? req.text.match(PAY_FROM) : null
  const pay = to ?? from
  if (pay && req.groupId) {
    const who = memberIn(req, pay[1])
    const amount = Math.round(Number(pay[2].replace(/,/g, '')) * 100)
    if (who && amount > 0)
      return {
        action: 'payment',
        group: { existingId: req.groupId },
        payment: { from: to ? 'me' : who, to: to ? who : 'me', amount, currency: req.currency },
      }
  }
  // "lunch with Rahul 1762, they paid": the one person named paid, shared by the two of you.
  if (PRONOUN_PAID.test(req.text) && req.groupId) {
    const g = req.groups.find((x) => x.id === req.groupId)
    const named = g?.members.filter((m) => new RegExp(`\\b${m.name.split(' ')[0]}\\b`, 'i').test(req.text)) ?? []
    if (g && named.length === 1) {
      const p = parseNlExpense(req.text.replace(PRONOUN_PAID, ' '), {
        members: g.members.map((m) => ({ id: m.id, name: m.name })),
        me: 'me',
        currency: req.currency,
        today: req.today,
      })
      if (p.amount !== undefined)
        return {
          action: 'expense',
          group: { existingId: g.id },
          expense: {
            description: p.description,
            amount: p.amount,
            currency: p.currency,
            paidBy: named[0].id,
            split: 'equal',
            participants: ['me', named[0].id],
          },
        }
    }
  }
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
