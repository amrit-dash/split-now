/*
 * Asking to join: nobody joins a private group (docs/VAULT.md), or an ordinary group whose creator
 * turned on "New people need my OK" (`approveJoins`), from its invite; they ask, and its creator
 * approves or declines (functions/src/vault.ts ops requestJoin, joinStatus, decideJoin, addContact;
 * functions/src/join.ts for ordinary groups). One request per person at a time
 * (groups/{gid}/joinRequests/{uid}), and after a decline a day before they may ask again. Pure.
 */

export const COOLDOWN_MS = 24 * 60 * 60 * 1000

export type JoinStatus = 'pending' | 'approved' | 'declined'

export interface JoinRequestDoc {
  uid: string
  /** their account name: sealed with the group's key in a private group, as it is in an ordinary one */
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

/** What someone asking is called: their account name, else the sign-in's, else "Member" (at most 60 characters). */
export const accountName = (displayName: unknown, fallback?: unknown): string =>
  String(displayName ?? fallback ?? 'Member')
    .trim()
    .slice(0, 60) || 'Member'

/** The colour a new entry gets, by how many entries the group has (the app's member palette). */
export const MEMBER_COLORS = [
  '#8b5cf6',
  '#ec4899',
  '#f97316',
  '#10b981',
  '#0ea5e9',
  '#eab308',
  '#ef4444',
  '#14b8a6',
  '#6366f1',
  '#d946ef',
  '#84cc16',
  '#f43f5e',
]

type Entry = Record<string, unknown> & { uid?: string; removedAt?: unknown }

/**
 * The entry someone the creator lets in becomes: the placeholder the creator picked, now theirs
 * (`taken` when someone else got it first), or a new one named `name` (their old one, if they
 * left, so their history joins up, no longer removed).
 */
export function admission(
  members: Record<string, Entry | undefined>,
  who: string,
  name: string,
  placeholder: string | undefined,
  rand: string,
): { taken: true } | { memberId: string; entry: Entry } {
  if (placeholder) {
    if (!isOpenPlaceholder(members, placeholder)) return { taken: true }
    return { memberId: placeholder, entry: { ...members[placeholder], uid: who } }
  }
  const memberId = memberIdFor(members, who, rand)
  const { removedAt: _r, ...prev } = members[memberId] ?? {}
  return { memberId, entry: { ...prev, name, uid: who, color: MEMBER_COLORS[Object.keys(members).length % MEMBER_COLORS.length] } }
}

/** Their entry in the group, when they're in it already (they joined some other way meanwhile). */
export const memberIdOf = (members: Record<string, Entry | undefined>, uid: string): string | undefined =>
  Object.entries(members).find(([, m]) => m?.uid === uid && m.removedAt === undefined)?.[0]
