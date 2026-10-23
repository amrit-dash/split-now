/*
 * Quick add: which reader a line goes to. The built-in grammar (src/lib/nl-expense.ts and
 * src/lib/quick-group.ts) reads most lines on the phone; only a line it can't handle goes to
 * Quick add with AI (callable quickAddAi), and only when that is allowed for this person. Pure.
 */
import type { GroupInText } from './quick-group'

export type QuickRouteWhy = 'asks_for_group' | 'several_steps' | 'no_amount' | 'unknown_people' | 'who_paid' | 'uneven_split' | 'payment' | 'choose_group'
export type QuickRoute = { route: 'local' } | { route: 'ai'; why: QuickRouteWhy }

/** "create a group …", "start a new trip …", "set up a group …": asks for a group the grammar can't make from a sentence. */
const ASKS_FOR_GROUP = /\b(?:create|make|start|set\s*up|setup|open|form)\s+(?:a\s+|an\s+|the\s+|our\s+|my\s+)?(?:new\s+)?(?:group|grp|trip)\b/i
/** "… and add dinner 2400", "then record …": more than one step in one line. */
const SEVERAL_STEPS = /\b(?:and|then|&)\s+(?:then\s+)?(?:add|record|log|put|enter)\b/i

/** "they paid", "he got the bill", "she covered it": a payer the grammar can't point at. */
const PRONOUN_PAYER = /\b(?:they|he|she|them|him|her)\s+(?:paid|got|covered|picked|took|settled)\b/i
/** Parts that aren't equal: "Rahul owes 400", "60/40", "30%", "2 shares", "rest me", "everyone except Rohan", "only for Rahul". */
const UNEVEN =
  /%|\bpercent\b|\bshares?\b|\bowes?\b|\brest\b|\b\d{1,3}\s*\/\s*\d{1,3}\b|\bexcept\b|\bbut not\b|\bonly\b|\bon behalf\b|'s (?:ticket|share|order)\b/i
/** Money back to settle up, not a cost: "paid Rahul 500 back", "sent Priya 300", "settled up with Rahul". */
const PAYMENT =
  /\b(?:paid|sent|gave|returned|transferred|repaid)\b[^.]*\bback\b|\bpaid\s+me\b|\bsent\s+(?:me|him|her|\p{Lu}\p{L}*)\s+(?:₹|rs\.?\s*)?\d|\bsettled?\s+up\b|\bpaid\s+(?:him|her|\p{Lu}\p{L}*)\s+(?:₹|rs\.?\s*)?\d/iu

/**
 * Simple enough for the phone when the line has an amount, every name in it matched someone in
 * the group it goes to, and it asks for nothing beyond one even expense: no "create a group … and
 * add …", no payment back, no "they paid", no uneven parts, and (outside a group) no people to find
 * a group for. Those go to Quick add with AI when it's allowed; otherwise the phone does its best. "in a new group Bali trip" stays local: the grammar reads that and GroupForm makes the group.
 * `parse` is the grammar's reading of the line (without the group words) against the target group.
 */
export function quickRoute(
  line: string,
  parse: { amount?: number; unmatched: string[]; participants?: string[]; payerExplicit?: boolean; payer?: string },
  named: GroupInText,
  /** the person is in the group the line goes to (its page, or picked it); else the people named choose the group */
  sure = true,
): QuickRoute {
  if (ASKS_FOR_GROUP.test(line)) return { route: 'ai', why: 'asks_for_group' }
  if (SEVERAL_STEPS.test(line)) return { route: 'ai', why: 'several_steps' }
  if (PAYMENT.test(line)) return { route: 'ai', why: 'payment' }
  if (PRONOUN_PAYER.test(line)) return { route: 'ai', why: 'who_paid' }
  if (UNEVEN.test(line)) return { route: 'ai', why: 'uneven_split' }
  // Not inside a group and the line names people: AI looks for the group that has them (a 1:1 for one).
  if (!sure && named.kind === 'none' && parse.participants?.length) return { route: 'ai', why: 'choose_group' }
  if (parse.amount === undefined) return { route: 'ai', why: 'no_amount' }
  // A line for a new group names people the picked group doesn't have: they're for the new group.
  if (named.kind !== 'new' && parse.unmatched.length) return { route: 'ai', why: 'unknown_people' }
  return { route: 'local' }
}

/**
 * With no groups yet every line starts one, which the phone does well from a plain line ("Goa trip
 * with Rahul and Priya", "dinner 1200 with Rahul"): only a line that asks for a group in words, or
 * does several things, is worth Quick add with AI.
 */
export function quickRouteNoGroups(line: string): QuickRoute {
  if (ASKS_FOR_GROUP.test(line)) return { route: 'ai', why: 'asks_for_group' }
  if (SEVERAL_STEPS.test(line)) return { route: 'ai', why: 'several_steps' }
  return { route: 'local' }
}

/**
 * May this line go to Quick add with AI? Both switches must be on (the admin's `aiQuickAdd` flag and
 * the person's own "Quick add with AI", under the AI master switch), the phone must be online, and a
 * key must be able to serve the account: Split Now's (the bills allowance) unless they chose only
 * their own, or their own unless they chose only Split Now's. In the demo the reader is a small
 * stand-in on the phone (src/lib/quick-ai-demo.ts), so only the flag counts.
 */
export function quickAiAllowed(o: {
  mode: 'firebase' | 'demo'
  flag: boolean
  online: boolean
  prefs: { aiEnabled: boolean; aiQuickAdd: boolean; aiSource: string; aiFreeOk?: boolean } | null | undefined
  /** the aiStatus answer (undefined while loading, null when it can't be checked) */
  status: { app: { images: string; engine?: string } } | null | undefined
  hasOwnKey: boolean
}): boolean {
  if (!o.flag) return false
  if (o.mode === 'demo') return true
  if (!o.online || !o.prefs?.aiEnabled || !o.prefs.aiQuickAdd) return false
  // Split Now's free AI (Gemma) serves only people who agreed to it.
  const shared = o.prefs.aiSource !== 'own' && o.status?.app.images === 'available' && (o.status.app.engine !== 'gemma' || o.prefs.aiFreeOk === true)
  const own = o.prefs.aiSource !== 'app' && o.hasOwnKey
  return shared || own
}
