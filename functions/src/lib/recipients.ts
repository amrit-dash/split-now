/** Who hears about a new expense: members with an account who paid or owe, except whoever added it. */

export interface MemberLite {
  name?: string
  uid?: string
}

export interface ExpenseRecipient {
  uid: string
  memberId: string
  share: number
  paid: number
}

/**
 * `memberUids` is the group's list of signed-up members, which the rules keep honest (a uid
 * only ever gets in through a join). A `members[*].uid` that isn't in it was typed in by the
 * group's creator and must never be pushed to: that would let anyone send notifications to any
 * uid they have seen.
 */
export function expenseRecipients(
  members: Record<string, MemberLite> | undefined,
  e: { paidBy?: Record<string, number>; splits?: Record<string, number>; createdBy?: string },
  memberUids: string[] = [],
): ExpenseRecipient[] {
  const out = new Map<string, ExpenseRecipient>()
  const ids = new Set([...Object.keys(e.paidBy ?? {}), ...Object.keys(e.splits ?? {})])
  for (const memberId of ids) {
    const uid = members?.[memberId]?.uid
    const share = e.splits?.[memberId] ?? 0
    const paid = e.paidBy?.[memberId] ?? 0
    if (!uid || uid === e.createdBy || !memberUids.includes(uid) || (share <= 0 && paid <= 0)) continue
    // one account could (in theory) hold two member slots: add them up
    const prev = out.get(uid)
    out.set(uid, prev ? { ...prev, share: prev.share + share, paid: prev.paid + paid } : { uid, memberId, share, paid })
  }
  return [...out.values()]
}

/** The uid behind a member id, only if that uid really is a member of the group. */
export function memberUid(members: Record<string, MemberLite> | undefined, memberId: string | undefined, memberUids: string[] = []): string | undefined {
  const uid = memberId ? members?.[memberId]?.uid : undefined
  return uid && memberUids.includes(uid) ? uid : undefined
}

/** Display name of the member whose account is `uid` in this group. */
export function memberNameForUid(members: Record<string, MemberLite> | undefined, uid: string | undefined): string | undefined {
  if (!uid) return undefined
  return Object.values(members ?? {}).find((m) => m.uid === uid)?.name
}
