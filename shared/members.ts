/*
 * Removed ("former") members. Removing someone from a group keeps their entry in `members` with
 * `removedAt` (epoch ms) and drops their uid from `memberUids`, so they lose access while every
 * old expense and payment still names them and stays editable. Anything that lists the people in
 * a group now (pickers, Balances, Members, settle-up targets, counts, avatars, name matching,
 * nudges, invite claim spots) goes through these helpers; history reads `members[id]` directly.
 * Pure: shared by the app and Cloud Functions, matched structurally (no @/types).
 */

export interface MemberLike {
  name?: string
  uid?: string
  removedAt?: number
}

/** Whether this entry belongs to someone who was removed from (or left) the group. */
export const isRemoved = (m: MemberLike | undefined | null): boolean => typeof m?.removedAt === 'number'

// The same members object always gives the same filtered object back (React memo keys on it).
const cache = new WeakMap<object, object>()

/** The people in the group now: `members` without removed entries (the same object when nobody was removed). */
export function activeMembers<M extends MemberLike>(members: Record<string, M> | undefined | null): Record<string, M> {
  if (!members) return {}
  const hit = cache.get(members)
  if (hit) return hit as Record<string, M>
  const entries = Object.entries(members)
  const out = entries.some(([, m]) => isRemoved(m)) ? Object.fromEntries(entries.filter(([, m]) => !isRemoved(m))) : members
  cache.set(members, out)
  return out
}

/** Ids of the people in the group now. */
export const activeMemberIds = (members: Record<string, MemberLike> | undefined | null): string[] => Object.keys(activeMembers(members))

/**
 * A removed entry that is the same person as someone being added (same account, same email, or
 * for a placeholder the same name), so adding them again restores their old entry instead of
 * creating a duplicate. Account matches win over email, email over name.
 */
export function formerMemberMatch<M extends MemberLike & { name: string; email?: string; uid?: string }>(
  members: Record<string, M> | undefined | null,
  who: { name: string; email?: string; uid?: string },
): string | undefined {
  const former = Object.entries(members ?? {}).filter(([, m]) => isRemoved(m))
  const email = who.email?.trim().toLowerCase()
  const name = who.name.trim().toLowerCase()
  return (
    (who.uid ? former.find(([, m]) => m.uid === who.uid)?.[0] : undefined) ??
    (email ? former.find(([, m]) => m.email?.trim().toLowerCase() === email)?.[0] : undefined) ??
    former.find(([, m]) => !m.uid && !m.email && m.name.trim().toLowerCase() === name)?.[0]
  )
}
