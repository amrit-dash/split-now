/*
 * One person, one account. When two accounts turn out to be the same person (a guest who signs
 * up, or an email that had its own account and is added to another), everything the old account
 * was in moves to the account that stays. In a group that means the member entry's uid, the
 * memberUids list, who created it and who archived it; the old uid is kept on the entry as
 * `formerUids`, so expenses, chat and activity written under it still show the right name.
 *
 * When both accounts are already in the same group, two entries now belong to one person. The
 * old account's entry gives up its uid (it becomes a placeholder, so nothing about money
 * changes) and a merge of the two entries is suggested to the group (mergeRequests), which
 * combines their expenses and payments once someone confirms it.
 *
 * A guest (live table, Pay me link) is never a member. A Pay me link locked to the guest's phone
 * (forUid) is the one exact tie between a guest and a group's member entry: when they sign up,
 * that entry gets their account if it has none yet. Pure: accounts.ts reads and writes.
 */

export interface MoveMember {
  name?: string
  email?: string
  uid?: string
  removedAt?: number
  formerUids?: string[]
}

export interface MoveGroup {
  type?: string
  deletedAt?: number
  createdBy?: string
  memberUids?: string[]
  archivedBy?: string[]
  members?: Record<string, MoveMember>
}

export const MAX_MEMBER_UIDS = 60

export interface MemberPatch {
  uid?: string | null
  formerUids?: string[]
}

export interface GroupMove {
  /** member entries to change (uid null = drop the uid, the entry stays as a placeholder) */
  members: Record<string, MemberPatch>
  memberUids: string[]
  archivedBy?: string[]
  createdBy?: string
  /** two entries that now belong to one person: suggest merging `from` into `into` */
  suggest?: { from: string; into: string }
}

const withFormer = (m: MoveMember, uid: string) => [...new Set([...(m.formerUids ?? []), uid])].slice(-10)

/** The entry that holds this uid, if any (removed entries too: their history still names them). */
export function memberOf(members: Record<string, MoveMember> | undefined, uid: string): string | undefined {
  return Object.entries(members ?? {}).find(([, m]) => m.uid === uid)?.[0]
}

/** How a group changes when account `from` becomes account `into`; null when `from` isn't in it. */
export function planGroupMove(g: MoveGroup, from: string, into: string): GroupMove | null {
  if (from === into) return null
  const fromMid = memberOf(g.members, from)
  const uids = g.memberUids ?? []
  if (!fromMid && !uids.includes(from) && g.createdBy !== from) return null
  const intoMid = memberOf(g.members, into)
  const out: GroupMove = { members: {}, memberUids: uids.filter((u) => u !== from) }
  if (fromMid) {
    const m = g.members![fromMid]!
    if (intoMid) {
      // Both are in: the old entry keeps its name and money but no longer an account.
      out.members[fromMid] = { uid: null, formerUids: withFormer(m, from) }
      if (!isRemovedEntry(m) && !isRemovedEntry(g.members![intoMid])) out.suggest = { from: fromMid, into: intoMid }
    } else {
      out.members[fromMid] = { uid: into, formerUids: withFormer(m, from) }
      if (!isRemovedEntry(m) && !out.memberUids.includes(into)) out.memberUids.push(into)
    }
  }
  if (g.archivedBy?.includes(from)) out.archivedBy = [...new Set(g.archivedBy.map((u) => (u === from ? into : u)))]
  if (g.createdBy === from) out.createdBy = into
  return out
}

const isRemovedEntry = (m: MoveMember | undefined) => typeof m?.removedAt === 'number'

export interface GuestLink {
  groupId?: string
  /** the member who owes on the link: the guest's entry in the group */
  from?: string
}

/**
 * The group entry a guest's locked Pay me link points to gets the guest's new account: only an
 * entry with no account, still in the group, while the account isn't in the group yet (else a
 * merge is suggested when the entry is someone else's spot for the same person).
 */
export function planGuestClaim(g: MoveGroup, link: GuestLink, into: string): { link: string } | { suggest: { from: string; into: string } } | null {
  if (!link.from || typeof g.deletedAt === 'number' || g.type === 'personal') return null
  const m = g.members?.[link.from]
  if (!m || m.uid || isRemovedEntry(m)) return null
  const intoMid = memberOf(g.members, into)
  if (intoMid) return intoMid === link.from || isRemovedEntry(g.members![intoMid]) ? null : { suggest: { from: link.from, into: intoMid } }
  if ((g.memberUids ?? []).length >= MAX_MEMBER_UIDS) return null
  return { link: link.from }
}
