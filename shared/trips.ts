/*
 * Trip windows: which group a payment on a given date belongs to. One implementation for the
 * app (src/lib/capture.ts re-exports it: the Inbox card, the capture prompt, the wizard's demo)
 * and the capture webhook (functions/src/lib/trips.ts), so both always pick the same group.
 * Pure: no Firebase, no DOM, no '@/types' (the Group type is matched structurally).
 */

/** The group fields trip matching reads (see Group in src/types.ts). */
export interface TripGroup {
  id: string
  name?: string
  type?: string
  currency?: string
  startDate?: string
  endDate?: string
  updatedAt?: number
  /** a member paused auto-capture for this trip (group settings) */
  captureOff?: boolean
  /** archived groups never match a payment and are not offered */
  archived?: boolean
}

type Dated = Pick<TripGroup, 'startDate' | 'endDate'>

export const hasTripWindow = (g: Dated): boolean => Boolean(g.startDate || g.endDate)

/** Inclusive; a missing start or end is open-ended on that side. */
export function inTripWindow(g: Dated, date: string): boolean {
  if (!hasTripWindow(g)) return false
  if (g.startDate && date < g.startDate) return false
  if (g.endDate && date > g.endDate) return false
  return true
}

export const isLiveTrip = (g: Dated, today: string) => inTripWindow(g, today)

const windowDays = (g: Dated) => (g.startDate && g.endDate ? (Date.parse(g.endDate) - Date.parse(g.startDate)) / 86_400_000 : Infinity)

/** Groups a payment can be filed in: not the personal wallet, not archived. */
const candidate = (g: Pick<TripGroup, 'type' | 'archived'>) => g.type !== 'personal' && !g.archived

/**
 * Order shared groups for a captured transaction and pick the best match. Groups whose trip
 * window contains the date come first (tightest window first, then a matching currency, then
 * most recently active). The best match is only chosen from in-window groups, so an unrelated
 * group is never pre-selected.
 */
export function rankGroupsForCapture<G extends TripGroup>(
  groups: G[],
  c: { date: string; currency?: string },
): { ranked: Array<G & { inWindow: boolean }>; best?: string } {
  const sameCur = (g: G) => Number(!!c.currency && g.currency === c.currency)
  const ranked = groups
    .filter(candidate)
    .map((g) => ({ ...g, inWindow: inTripWindow(g, c.date) }))
    .sort(
      (a, b) =>
        Number(b.inWindow) - Number(a.inWindow) ||
        (a.inWindow ? windowDays(a) - windowDays(b) : 0) ||
        sameCur(b) - sameCur(a) ||
        (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
    )
  return { ranked, best: ranked[0]?.inWindow ? ranked[0].id : undefined }
}

/** The live trip to default a new expense to, if one is running today. */
export function liveTripFor<G extends TripGroup>(groups: G[], today: string): string | undefined {
  return rankGroupsForCapture(groups, { date: today }).best
}

/**
 * The trip the webhook files a payment under: the same ranking as rankGroupsForCapture, but
 * trips with capture paused are skipped. Undefined when no trip matches.
 */
export function pickTrip<G extends TripGroup>(groups: G[], date: string, currency?: string): G | undefined {
  const { ranked, best } = rankGroupsForCapture(
    groups.filter((g) => !g.captureOff),
    { date, currency },
  )
  return best ? ranked.find((g) => g.id === best) : undefined
}

/** A trip with capture paused whose window contains `date` (so the payment is skipped, not unsorted). */
export function pausedTrip<G extends TripGroup>(groups: G[], date: string): G | undefined {
  return groups.find((g) => candidate(g) && g.captureOff && inTripWindow(g, date))
}

export type ScopeResult<G extends TripGroup = TripGroup> = { kind: 'matched'; group: G } | { kind: 'outside' } | { kind: 'off'; group: G }

/**
 * A capture scoped to one group (by its token or the request): it matches if the group has no
 * trip window (always on) or the date is inside it; otherwise it's outside the trip. A trip with
 * capture paused, or archived, matches nothing.
 */
export function matchScoped<G extends TripGroup>(g: G, date: string): ScopeResult<G> {
  if (g.captureOff || g.archived) return { kind: 'off', group: g }
  return !hasTripWindow(g) || inTripWindow(g, date) ? { kind: 'matched', group: g } : { kind: 'outside' }
}
