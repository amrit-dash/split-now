/** The group fields trip matching needs (see Group in src/types.ts). */
export interface TripGroup {
  id: string
  name?: string
  type?: string
  startDate?: string
  endDate?: string
  updatedAt?: number
}

export const hasTripWindow = (g: Pick<TripGroup, 'startDate' | 'endDate'>) => Boolean(g.startDate || g.endDate)

/** Inclusive; a missing start or end is open-ended (same as inTripWindow in src/lib/capture.ts). */
export function inTripWindow(g: Pick<TripGroup, 'startDate' | 'endDate'>, date: string): boolean {
  if (!hasTripWindow(g)) return false
  if (g.startDate && date < g.startDate) return false
  if (g.endDate && date > g.endDate) return false
  return true
}

const windowDays = (g: TripGroup) =>
  g.startDate && g.endDate ? (Date.parse(g.endDate) - Date.parse(g.startDate)) / 86_400_000 : Infinity

/**
 * The trip a payment on `date` belongs to: among shared groups whose window contains the date,
 * the tightest window wins, then the most recently active. Undefined when no trip matches.
 */
export function pickTrip<G extends TripGroup>(groups: G[], date: string): G | undefined {
  return groups
    .filter((g) => g.type !== 'personal' && inTripWindow(g, date))
    .sort((a, b) => windowDays(a) - windowDays(b) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0]
}

export type ScopeResult = { kind: 'matched'; group: TripGroup } | { kind: 'outside' }

/**
 * A capture scoped to one group (by its token or the request): it matches if the group has no
 * trip window (always on) or the date is inside it; otherwise it's outside the trip.
 */
export function matchScoped(g: TripGroup, date: string): ScopeResult {
  return !hasTripWindow(g) || inTripWindow(g, date) ? { kind: 'matched', group: g } : { kind: 'outside' }
}
