/*
 * Quick add: which reader a line goes to. The built-in grammar (src/lib/nl-expense.ts and
 * src/lib/quick-group.ts) reads most lines on the phone; only a line it can't handle goes to
 * Quick add with AI (callable quickAddAi), and only when that is allowed for this person. Pure.
 */
import type { GroupInText } from './quick-group'

export type QuickRouteWhy = 'asks_for_group' | 'several_steps' | 'no_amount' | 'unknown_people'
export type QuickRoute = { route: 'local' } | { route: 'ai'; why: QuickRouteWhy }

/** "create a group …", "start a new trip …", "set up a group …": asks for a group the grammar can't make from a sentence. */
const ASKS_FOR_GROUP = /\b(?:create|make|start|set\s*up|setup|open|form)\s+(?:a\s+|an\s+|the\s+|our\s+|my\s+)?(?:new\s+)?(?:group|grp|trip)\b/i
/** "… and add dinner 2400", "then record …": more than one step in one line. */
const SEVERAL_STEPS = /\b(?:and|then|&)\s+(?:then\s+)?(?:add|record|log|put|enter)\b/i

/**
 * Simple enough for the phone when the line has an amount, every name in it matched someone in
 * the group it goes to, and it asks for nothing beyond one expense (no "create a group … and add
 * …"). "in a new group Bali trip" stays local: the grammar reads that and GroupForm makes the group.
 * `parse` is the grammar's reading of the line (without the group words) against the target group.
 */
export function quickRoute(line: string, parse: { amount?: number; unmatched: string[] }, named: GroupInText): QuickRoute {
  if (ASKS_FOR_GROUP.test(line)) return { route: 'ai', why: 'asks_for_group' }
  if (SEVERAL_STEPS.test(line)) return { route: 'ai', why: 'several_steps' }
  if (parse.amount === undefined) return { route: 'ai', why: 'no_amount' }
  // A line for a new group names people the picked group doesn't have: they're for the new group.
  if (named.kind !== 'new' && parse.unmatched.length) return { route: 'ai', why: 'unknown_people' }
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
  prefs: { aiEnabled: boolean; aiQuickAdd: boolean; aiSource: string } | null | undefined
  /** the aiStatus answer (undefined while loading, null when it can't be checked) */
  status: { app: { images: string } } | null | undefined
  hasOwnKey: boolean
}): boolean {
  if (!o.flag) return false
  if (o.mode === 'demo') return true
  if (!o.online || !o.prefs?.aiEnabled || !o.prefs.aiQuickAdd) return false
  const shared = o.prefs.aiSource !== 'own' && o.status?.app.images === 'available'
  const own = o.prefs.aiSource !== 'app' && o.hasOwnKey
  return shared || own
}
