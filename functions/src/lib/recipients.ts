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

export function expenseRecipients(
  members: Record<string, MemberLite> | undefined,
  e: { paidBy?: Record<string, number>; splits?: Record<string, number>; createdBy?: string },
): ExpenseRecipient[] {
  const out = new Map<string, ExpenseRecipient>()
  const ids = new Set([...Object.keys(e.paidBy ?? {}), ...Object.keys(e.splits ?? {})])
  for (const memberId of ids) {
    const uid = members?.[memberId]?.uid
    const share = e.splits?.[memberId] ?? 0
    const paid = e.paidBy?.[memberId] ?? 0
    if (!uid || uid === e.createdBy || (share <= 0 && paid <= 0)) continue
    // one account could (in theory) hold two member slots: add them up
    const prev = out.get(uid)
    out.set(uid, prev ? { ...prev, share: prev.share + share, paid: prev.paid + paid } : { uid, memberId, share, paid })
  }
  return [...out.values()]
}

/** Display name of the member whose account is `uid` in this group. */
export function memberNameForUid(members: Record<string, MemberLite> | undefined, uid: string | undefined): string | undefined {
  if (!uid) return undefined
  return Object.values(members ?? {}).find((m) => m.uid === uid)?.name
}
