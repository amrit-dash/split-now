/**
 * Archiving a group is personal: it takes the group out of *your* totals, Balances, pickers,
 * capture matching and reminders, and nobody else's. Each person who archived it is in
 * `archivedBy` (their uid). Before it was personal, `archived: true` archived a group for
 * everyone; such a group still counts as archived for every member until one of them unarchives
 * it, which turns the old flag into `archivedBy` (everyone else stays archived).
 *
 * Shared by the app (data layer) and the functions (reminders, capture), so both agree. Pure.
 */

export interface Archivable {
  /** Legacy: archived for everyone (never written any more). */
  archived?: boolean
  archivedBy?: readonly string[]
}

/** Whether `uid` has this group archived. */
export function isArchivedFor(g: Archivable, uid: string | null | undefined): boolean {
  if (g.archived === true) return true
  return !!uid && !!g.archivedBy?.includes(uid)
}

/**
 * The write that archives (`on`) or unarchives the group for `uid`, or null when there is
 * nothing to do. `add` / `remove` are single-uid changes (the data layer uses an atomic array
 * union / remove, so two people archiving at once don't overwrite each other). Unarchiving a
 * group archived the old way replaces the flag with everyone else's uids (`convert`), so only
 * you see it again.
 */
export type ArchiveWrite = { add: string } | { remove: string } | { convert: { archivedBy: string[] } }

export function archiveWrite(g: Archivable & { memberUids: readonly string[] }, uid: string, on: boolean): ArchiveWrite | null {
  if (on) return isArchivedFor(g, uid) ? null : { add: uid }
  if (g.archived === true) {
    const rest = [...new Set([...(g.archivedBy ?? []), ...g.memberUids])].filter((u) => u !== uid)
    return { convert: { archivedBy: rest } }
  }
  return g.archivedBy?.includes(uid) ? { remove: uid } : null
}

/**
 * A new expense or payment brings the group back for the people it involves (`involved`, their
 * uids): their balance has changed, so it belongs in their totals again. Anyone else who is
 * still square stays archived. Null when none of them had it archived. A group archived the
 * old way becomes `archivedBy` everyone but them.
 */
export type UnarchiveWrite = { remove: string[] } | { convert: { archivedBy: string[] } }

export function unarchiveInvolved(g: Archivable & { memberUids: readonly string[] }, involved: readonly string[]): UnarchiveWrite | null {
  const back = new Set(involved)
  if (g.archived === true) {
    const rest = [...new Set([...(g.archivedBy ?? []), ...g.memberUids])].filter((u) => !back.has(u))
    return { convert: { archivedBy: rest } }
  }
  const remove = (g.archivedBy ?? []).filter((u) => back.has(u))
  return remove.length ? { remove } : null
}

/** The member ids an expense involves: whoever paid and whoever has a share. */
export function expenseMemberIds(e: { paidBy?: Record<string, number>; splits?: Record<string, number> }): string[] {
  const ids = new Set<string>()
  for (const [id, v] of Object.entries(e.paidBy ?? {})) if (v > 0) ids.add(id)
  for (const [id, v] of Object.entries(e.splits ?? {})) if (v > 0) ids.add(id)
  return [...ids]
}

/** The accounts behind member ids, trusting only uids in memberUids (members[*].uid can be typed in). */
export function uidsOfMembers(members: Record<string, { uid?: string }> | undefined, ids: readonly string[], memberUids: readonly string[]): string[] {
  const allowed = new Set(memberUids)
  const out = new Set<string>()
  for (const id of ids) {
    const u = members?.[id]?.uid
    if (u && allowed.has(u)) out.add(u)
  }
  return [...out]
}
