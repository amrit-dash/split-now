/*
 * "New people need my OK" (group.approveJoins): an ordinary group whose creator lets people in.
 * Nobody joins it from the invite (firestore.rules isJoining); they ask through the joinApproval
 * callable (functions/src/join.ts) and the creator decides in the Inbox, as with a private group
 * (vault ops requestJoin / decideJoin) but with nothing sealed and no passkey. Pure: the steps'
 * shapes and the decisions the screens make.
 */
import type { JoinState } from './vault-api'

export type JoinApprovalRequest =
  | { op: 'status'; code: string }
  | { op: 'ask'; code: string }
  | { op: 'decide'; groupId: string; uid: string; approve: boolean; memberId?: string }

/** Where someone stands with the invite; `open`: the group lets people join from it again (its creator turned the setting off). */
export type AskState = JoinState | { status: 'open' }

/** Demo mode has only you: asking someone else to let you in needs the online app. */
export const DEMO_ASK_REFUSAL = 'Asking to join needs the online app: the demo has only you.'

type GroupLike = { type?: string; vault?: boolean; approveJoins?: boolean; createdBy?: string; deletedAt?: number }

/**
 * Whether the switch shows in a group's Approvals: to its creator (or whoever is making it), in a
 * group others join (not a 1:1, a wallet or a private group, which always asks). While the admin
 * switch is off it shows only where it is on already, so it can still be turned off.
 */
export function approveJoinsShown(g: { type: string; vault?: boolean; approveJoins?: boolean }, o: { flag: boolean; creator: boolean }): boolean {
  if (!o.creator || g.vault || g.type === 'direct' || g.type === 'personal') return false
  return o.flag || !!g.approveJoins
}

/** The groups whose join requests are yours to decide: live ones you made that are private or need your OK. */
export const decidesJoins = <G extends GroupLike & { id: string }>(groups: G[], uid: string): G[] =>
  groups.filter((g) => g.createdBy === uid && typeof g.deletedAt !== 'number' && (g.vault || g.approveJoins))

/** Requests still worth an answer: not from someone already in the group (they joined while the setting was off). */
export const waitingRequests = <R extends { groupId: string; uid: string }>(requests: R[], groups: { id: string; memberUids: string[] }[]): R[] =>
  requests.filter((r) => !groups.find((g) => g.id === r.groupId)?.memberUids.includes(r.uid))

/** The invite page: join at once, ask a private group's creator, or ask an ordinary group's (unless it said it is open again). */
export function invitePath(invite: { vault?: boolean; approveJoins?: boolean }, openAgain: boolean): 'join' | 'private' | 'ask' {
  if (invite.vault) return 'private'
  return invite.approveJoins && !openAgain ? 'ask' : 'join'
}

/**
 * Turning "New people need my OK" off while people are waiting to be let in: refused until each is
 * let in or declined (null: it can go off). Otherwise they'd be left asking a group that no longer asks.
 */
export function joinsOffBlocker(waiting: number): string | null {
  if (waiting <= 0) return null
  return `${waiting === 1 ? '1 person is' : `${waiting} people are`} waiting to be let in. Let them in or decline them in the Inbox first.`
}
