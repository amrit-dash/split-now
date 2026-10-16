/*
 * Joining a private group (docs/VAULT.md): nobody joins one from its invite; they ask, and its
 * creator approves or declines (functions/src/vault.ts ops requestJoin, joinStatus, decideJoin,
 * addContact). One request per person at a time (groups/{gid}/joinRequests/{uid}), and after a
 * decline a day before they may ask again. Pure.
 */

export const COOLDOWN_MS = 24 * 60 * 60 * 1000

export type JoinStatus = 'pending' | 'approved' | 'declined'

export interface JoinRequestDoc {
  uid: string
  /** their account name, sealed with the group's key */
  name: string
  status: JoinStatus
  createdAt: number
  decidedAt?: number
  decidedBy?: string
  /** the entry they became: a placeholder the creator picked, or a new one */
  memberId?: string
}

/** What asking again does: start a request, say it's still waiting, or wait out a decline. */
export function joinGate(
  existing: Pick<JoinRequestDoc, 'status' | 'decidedAt'> | undefined,
  now: number,
): { kind: 'ask' } | { kind: 'pending' } | { kind: 'cooldown'; retryAt: number } {
  if (!existing || existing.status === 'approved') return { kind: 'ask' }
  if (existing.status === 'pending') return { kind: 'pending' }
  const retryAt = (existing.decidedAt ?? 0) + COOLDOWN_MS
  return now < retryAt ? { kind: 'cooldown', retryAt } : { kind: 'ask' }
}

type Members = Record<string, { uid?: string; removedAt?: unknown; name?: string } | undefined>

/** A placeholder the creator may hand to someone: in the group, not anyone's yet, not removed. */
export const isOpenPlaceholder = (members: Members, id: string | undefined): boolean => {
  const m = id ? members[id] : undefined
  return !!m && !m.uid && m.removedAt === undefined
}

/** Their entry id: the old one of someone who left (their history joins up), else a new one. */
export function memberIdFor(members: Members, uid: string, rand: string): string {
  const former = Object.entries(members).find(([, m]) => m?.uid === uid)?.[0]
  return former ?? `m_${uid.slice(0, 8)}_${rand}`
}

/** Whether the creator may add `other` directly: someone already in another live group with them. */
export const sharesAGroup = (groups: { id: string; memberUids?: string[]; deletedAt?: unknown }[], creator: string, other: string, except: string): boolean =>
  groups.some((g) => g.id !== except && typeof g.deletedAt !== 'number' && !!g.memberUids?.includes(creator) && g.memberUids.includes(other))
