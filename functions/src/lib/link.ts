/*
 * Linking people added to a group to their accounts. Someone added by email (or picked from
 * another group, which carries their email) used to stay a placeholder until they opened the
 * invite link, so a group made for them never showed up. The server now attaches the account
 * whose verified email matches, the way joining by the link does (their uid on the member entry
 * and in memberUids). Pure: the functions look accounts up and write (link-members.ts).
 */

export interface LinkMember {
  name?: string
  email?: string
  uid?: string
  removedAt?: number
}

export interface FoundAccount {
  uid: string
  /** only verified emails are trusted: anyone can sign up with an address they don't own */
  emailVerified: boolean
  disabled?: boolean
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** A comparable email, or '' when it isn't one. */
export function normEmail(e: unknown): string {
  const s = typeof e === 'string' ? e.trim().toLowerCase() : ''
  return EMAIL.test(s) && s.length <= 254 ? s : ''
}

/**
 * Placeholders worth looking up: no account yet, still in the group, with an email. With `before`
 * (the group as it was), only entries that are new or whose email changed, so an ordinary group
 * update (a new expense bumps updatedAt) costs no lookups.
 */
export function linkCandidates(
  members: Record<string, LinkMember> | undefined,
  before?: Record<string, LinkMember>,
): Array<{ memberId: string; email: string }> {
  const out: Array<{ memberId: string; email: string }> = []
  for (const [memberId, m] of Object.entries(members ?? {})) {
    if (!m || m.uid || typeof m.removedAt === 'number') continue
    const email = normEmail(m.email)
    if (!email) continue
    if (before && normEmail(before[memberId]?.email) === email && !before[memberId]?.uid) continue
    out.push({ memberId, email })
  }
  return out
}

export const MAX_MEMBER_UIDS = 60

/**
 * Which placeholders to link to which accounts. Skipped: no account, an unverified or disabled
 * account, a blocked one, someone already in the group (under another entry, or the person who
 * added them), and anything past the 60-account cap. Two entries with one email: the first wins.
 */
export function planLinks(o: {
  candidates: Array<{ memberId: string; email: string }>
  memberUids: string[]
  found: Record<string, FoundAccount | undefined>
  blocked?: Set<string>
}): Array<{ memberId: string; uid: string }> {
  const taken = new Set(o.memberUids)
  const out: Array<{ memberId: string; uid: string }> = []
  for (const c of o.candidates) {
    const a = o.found[c.email]
    if (!a?.emailVerified || a.disabled || o.blocked?.has(a.uid) || taken.has(a.uid)) continue
    if (taken.size >= MAX_MEMBER_UIDS) break
    taken.add(a.uid)
    out.push({ memberId: c.memberId, uid: a.uid })
  }
  return out
}

/** Emails with no account yet: remembered, so the group shows up once they sign up with it. */
export const pendingEmails = (candidates: Array<{ memberId: string; email: string }>, found: Record<string, FoundAccount | undefined>) =>
  candidates.filter((c) => !found[c.email])

/** The emailInvites entry key for a group's placeholder. */
export const inviteKey = (groupId: string, memberId: string) => `${groupId}__${memberId}`
