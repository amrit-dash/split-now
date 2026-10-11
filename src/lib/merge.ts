import type { Group, MemberId, MergeRequest } from '@/types'
import { mergeDirection, mergeProblem } from '../../shared/merge-members'
import { activeMembers } from './members'

/*
 * Two entries that are one person (shared/merge-members.ts): what the Members screen, the chat
 * card and the Inbox offer. The merge itself runs on the server (or demo mode's data layer).
 */

/** Suggestions and requests still waiting, newest first. */
export const openMergeRequests = (reqs: MergeRequest[] | null | undefined): MergeRequest[] =>
  (reqs ?? []).filter((r) => r.status === 'suggested' || r.status === 'pending')

/** Who `from` can be merged with: everyone else in the group now, unless both have their own accounts. */
export function mergeCandidates(members: Group['members'], from: MemberId): MemberId[] {
  return Object.keys(activeMembers(members)).filter((id) => id !== from && !mergeProblem(members, from, id))
}

/** Which of the two stays, as the merge will do it (the one with an account). */
export const keptOf = (members: Group['members'], a: MemberId, b: MemberId): MemberId => mergeDirection(members, a, b).into

export type MergeCardState =
  /** a suggestion: anyone in the group may merge or dismiss it */
  | { kind: 'suggested'; canDecide: true }
  /** waiting for the creator: they decide, everyone else waits */
  | { kind: 'pending'; canDecide: boolean }
  | { kind: 'done' | 'declined'; canDecide: false }

/** What a merge card shows to this person. */
export function mergeCardState(r: Pick<MergeRequest, 'status' | 'approverUid'>, myUid: string): MergeCardState {
  if (r.status === 'suggested') return { kind: 'suggested', canDecide: true }
  if (r.status === 'pending') return { kind: 'pending', canDecide: r.approverUid === myUid }
  return { kind: r.status, canDecide: false }
}

/** Whether both entries of a request are still there to merge (a stale suggestion is hidden). */
export function mergeStillPossible(members: Group['members'], r: Pick<MergeRequest, 'from' | 'into'>): boolean {
  return !mergeProblem(members, r.from, r.into)
}
