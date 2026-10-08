import type { Expense, Group, MemberId } from '@/types'
import { todayISO } from './id'
import { addDaysISO } from './recents'

/*
 * "Whose turn to pay?": a private, good-humoured hint for the moment the bill arrives. Over
 * the recent expenses of a group, the person who has fronted the least relative to what they
 * consumed (paid − share) is up next; ties go to whoever last paid longest ago. No score, no
 * ranking, nothing pushed: one line the viewer sees.
 */

export const TURN_WINDOW_DAYS = 90
/** Fewer recent expenses than this and the suggestion would be noise. */
export const TURN_MIN_EXPENSES = 2

export interface TurnSuggestion {
  memberId: MemberId
  name: string
  /** paid − share over the window (negative: has consumed more than fronted) */
  fronted: number
  /** the last day they paid for something, if ever in the window */
  lastPaid?: string
}

export function whoseTurn(
  d: { group: Pick<Group, 'members' | 'type'>; expenses: Expense[] },
  opts: { today?: string; windowDays?: number } = {},
): TurnSuggestion | null {
  const { group } = d
  if (group.type === 'personal') return null
  const today = opts.today ?? todayISO()
  const since = addDaysISO(today, -(opts.windowDays ?? TURN_WINDOW_DAYS))
  const recent = d.expenses.filter((e) => typeof e.deletedAt !== 'number' && e.date >= since && e.date <= today)
  if (recent.length < TURN_MIN_EXPENSES) return null

  const stats = new Map<MemberId, { fronted: number; lastPaid?: string; active: boolean }>()
  for (const id of Object.keys(group.members)) stats.set(id, { fronted: 0, active: false })
  for (const e of recent) {
    for (const [id, v] of Object.entries(e.paidBy)) {
      const s = stats.get(id)
      if (!s || !v) continue
      s.fronted += v
      s.active = true
      if (!s.lastPaid || e.date > s.lastPaid) s.lastPaid = e.date
    }
    for (const [id, v] of Object.entries(e.splits)) {
      const s = stats.get(id)
      if (!s || !v) continue
      s.fronted -= v
      s.active = true
    }
  }
  // Only people who took part recently are in the running (someone who just joined shouldn't be "up").
  const candidates = [...stats.entries()].filter(([, s]) => s.active)
  if (candidates.length < 2) return null
  candidates.sort(([ida, a], [idb, b]) => a.fronted - b.fronted || cmpLastPaid(a.lastPaid, b.lastPaid) || ida.localeCompare(idb))
  const [id, s] = candidates[0]
  const [, runnerUp] = candidates[1]
  // Everyone is square and nobody stands out: no hint is better than a random name.
  if (s.fronted === runnerUp.fronted && s.lastPaid === runnerUp.lastPaid) return null
  return { memberId: id, name: group.members[id]?.name ?? 'Someone', fronted: s.fronted, lastPaid: s.lastPaid }
}

/** Never paid sorts first (it is their turn more than anyone's), then the oldest last payment. */
const cmpLastPaid = (a?: string, b?: string) => (a === b ? 0 : !a ? -1 : !b ? 1 : a.localeCompare(b))

/** "Your turn to pay?" / "Rahul's turn to pay?" */
export function turnLine(t: TurnSuggestion, me: MemberId | undefined): string {
  if (t.memberId === me) return 'Your turn to pay?'
  const first = t.name.trim().split(/\s+/)[0] || t.name
  return `${first}${/s$/i.test(first) ? '’' : '’s'} turn to pay?`
}
