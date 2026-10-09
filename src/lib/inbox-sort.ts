import type { Capture, Group } from '@/types'
import { inTripWindow, rankGroupsForCapture } from './capture'

/*
 * Inbox helpers: which group a captured payment belongs to, and when several pending captures
 * can be added to one live trip in a single tap.
 */

type Rankable = Pick<Group, 'id' | 'type' | 'currency' | 'updatedAt' | 'startDate' | 'endDate' | 'archived'>

/**
 * The group a capture should go to: the server's suggestion when it is still one of the user's
 * groups (the webhook knows the key's scope), else the best trip-window match.
 */
export function targetGroupFor<G extends Rankable>(c: Pick<Capture, 'suggestedGroup' | 'date' | 'currency'>, groups: G[]): string | undefined {
  if (c.suggestedGroup && groups.some((g) => g.id === c.suggestedGroup && !g.archived)) return c.suggestedGroup
  return rankGroupsForCapture(
    groups.filter((g) => !g.archived),
    c,
  ).best
}

export interface BulkCandidate<G> {
  group: G
  captures: Capture[]
}

/**
 * Pending captures that share a target group whose trip dates include each capture's date, in
 * the group's currency (so an equal split needs no conversion). Only groups with two or more
 * are worth a bulk action; the largest set first.
 */
export function bulkCandidates<G extends Rankable & { currency: string }>(captures: Capture[], groups: G[]): Array<BulkCandidate<G>> {
  const by = new Map<string, Capture[]>()
  for (const c of captures) {
    if (c.status !== 'pending') continue
    const id = targetGroupFor(c, groups)
    const g = id ? groups.find((x) => x.id === id) : undefined
    if (!g || !inTripWindow(g, c.date) || (c.currency && c.currency !== g.currency)) continue
    by.set(id!, [...(by.get(id!) ?? []), c])
  }
  return [...by.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([id, list]) => ({ group: groups.find((g) => g.id === id)!, captures: list }))
    .sort((a, b) => b.captures.length - a.captures.length)
}

/** Total of the ticked captures (minor units of the group currency). */
export const sumCaptures = (list: Capture[]) => list.reduce((s, c) => s + c.amount, 0)
