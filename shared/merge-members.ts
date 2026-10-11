/*
 * Merging two member entries of one group into one person: someone added twice (a placeholder
 * "Priya" and the account "Priya Shah"), or two accounts that turned out to be the same person
 * (functions/src/lib/move-uid.ts suggests it). `from` folds into `into`: every amount `from` paid
 * or owes is added to `into`'s, every list that named `from` names `into` (once), and a payment
 * between the two disappears (it was one person paying themselves, so balances don't change).
 * The `from` entry stays in the group as removed with `mergedInto`, so history still has a name
 * for it. Balances before and after are the same in total: `into`'s is the sum of both.
 *
 * Pure and structural (no @/types): the Cloud Function (functions/src/merge-members.ts) and
 * demo mode (src/data/localRepo.ts) both apply it.
 */

export interface MergeMember {
  name?: string
  email?: string
  uid?: string
  removedAt?: number
  mergedInto?: string
}

/** Why two entries can't be merged, or '' when they can. */
export function mergeProblem(members: Record<string, MergeMember> | undefined, from: string, into: string): string {
  const a = members?.[from]
  const b = members?.[into]
  if (!a || !b || from === into) return 'Pick two different people in this group'
  if (typeof a.removedAt === 'number' || typeof b.removedAt === 'number') return 'Someone who left the group can’t be merged'
  if (a.uid && b.uid && a.uid !== b.uid) return 'Both have their own accounts. Each signs in separately, so they can’t be one person here'
  return ''
}

/**
 * Which way to merge two entries: the one with an account stays (so the person keeps signing in
 * as themselves); otherwise the one picked to stay.
 */
export function mergeDirection(members: Record<string, MergeMember>, from: string, into: string): { from: string; into: string } {
  return members[from]?.uid && !members[into]?.uid ? { from: into, into: from } : { from, into }
}

/** A map keyed by member: `from`'s value added onto `into`'s. Untouched maps come back as the same object. */
export function foldMap<V extends number>(m: Record<string, V> | undefined, from: string, into: string): Record<string, V> | undefined {
  if (!m || !(from in m)) return m
  const out: Record<string, number> = { ...m }
  out[into] = (out[into] ?? 0) + (out[from] ?? 0)
  delete out[from]
  return out as Record<string, V>
}

/** A list of members: `from` becomes `into`, once. */
export function foldList(list: string[] | undefined, from: string, into: string): string[] | undefined {
  if (!list?.includes(from)) return list
  return [...new Set(list.map((id) => (id === from ? into : id)))]
}

export interface MergeExpense {
  paidBy?: Record<string, number>
  splits?: Record<string, number>
  splitInput?: {
    selected?: string[]
    exact?: Record<string, number>
    percent?: Record<string, number>
    shares?: Record<string, number>
    adjust?: Record<string, number>
    items?: Array<{ members?: string[]; shares?: Record<string, number> }>
  }
  dispute?: Record<string, { memberId?: string }>
}

/** The fields of an expense that change, or null when it never names `from`. */
export function mergeExpense<E extends MergeExpense>(e: E, from: string, into: string): Partial<E> | null {
  const patch: Partial<MergeExpense> = {}
  const paidBy = foldMap(e.paidBy, from, into)
  if (paidBy !== e.paidBy) patch.paidBy = paidBy
  const splits = foldMap(e.splits, from, into)
  if (splits !== e.splits) patch.splits = splits
  const si = e.splitInput
  if (si) {
    const next = {
      ...si,
      selected: foldList(si.selected, from, into),
      exact: foldMap(si.exact, from, into),
      percent: foldMap(si.percent, from, into),
      shares: foldMap(si.shares, from, into),
      adjust: foldMap(si.adjust, from, into),
      items: si.items?.map((it) => {
        const members = foldList(it.members, from, into)
        const shares = foldMap(it.shares, from, into)
        return members === it.members && shares === it.shares ? it : { ...it, ...(members ? { members } : {}), ...(shares ? { shares } : {}) }
      }),
    }
    const changed =
      next.selected !== si.selected ||
      next.exact !== si.exact ||
      next.percent !== si.percent ||
      next.shares !== si.shares ||
      next.adjust !== si.adjust ||
      (si.items ?? []).some((it, i) => next.items?.[i] !== it)
    if (changed) {
      for (const k of ['selected', 'exact', 'percent', 'shares', 'adjust', 'items'] as const) if (next[k] === undefined) delete next[k]
      patch.splitInput = next
    }
  }
  if (e.dispute && Object.values(e.dispute).some((f) => f.memberId === from)) {
    patch.dispute = Object.fromEntries(Object.entries(e.dispute).map(([k, f]) => [k, f.memberId === from ? { ...f, memberId: into } : f]))
  }
  return Object.keys(patch).length ? (patch as Partial<E>) : null
}

/** A payment after the merge: the fields that change, 'delete' when it was between the two, or null when untouched. */
export function mergeSettlement(s: { from?: string; to?: string }, from: string, into: string): { from?: string; to?: string } | 'delete' | null {
  const f = s.from === from ? into : s.from
  const t = s.to === from ? into : s.to
  if (f === s.from && t === s.to) return null
  if (f === t) return 'delete'
  return { ...(f !== s.from ? { from: f } : {}), ...(t !== s.to ? { to: t } : {}) }
}

/** An open item's "might have paid" list after the merge, or null when untouched. */
export function mergeOpenItem(o: { suspects?: string[] }, from: string, into: string): { suspects: string[] } | null {
  const suspects = foldList(o.suspects, from, into)
  return suspects === o.suspects || !suspects ? null : { suspects }
}

/** A Pay me link of this group after the merge (who owes, who is paid, its parts), or null when untouched. */
export function mergePayLink(
  l: { from?: string; to?: string; parts?: Array<{ from?: string; to?: string }> },
  from: string,
  into: string,
): { from?: string; to?: string; parts?: Array<{ from?: string; to?: string }> } | null {
  const patch: { from?: string; to?: string; parts?: Array<{ from?: string; to?: string }> } = {}
  if (l.from === from) patch.from = into
  if (l.to === from) patch.to = into
  if (l.parts?.some((p) => p.from === from || p.to === from))
    patch.parts = l.parts.map((p) => ({ ...p, ...(p.from === from ? { from: into } : {}), ...(p.to === from ? { to: into } : {}) }))
  return Object.keys(patch).length ? patch : null
}

/**
 * The two member entries after the merge (mergeDirection has put any account on `into`): `into`
 * gains `from`'s email when it has none (so linking by that email still finds this person),
 * `from` is marked removed and merged.
 */
export function mergedEntries(
  members: Record<string, MergeMember>,
  from: string,
  into: string,
  now: number,
): { into: Partial<MergeMember>; from: Partial<MergeMember> } {
  const a = members[from]!
  const b = members[into]!
  return {
    into: !b.email && a.email ? { email: a.email } : {},
    from: { removedAt: now, mergedInto: into },
  }
}

/**
 * Whose OK a merge needs before it happens, or null to merge now. Merging into someone who has an
 * account moves money onto them, so it needs that person (unless it's them asking). Otherwise,
 * when the creator turned on "Merging people needs my OK" (`mergeNeedsOk`), someone else's merge
 * needs the creator. Only people still in the group can be asked.
 */
export function mergeApprover(
  g: { createdBy?: string; mergeNeedsOk?: boolean; memberUids?: string[]; members?: Record<string, MergeMember> },
  into: string,
  caller: string,
): string | null {
  const inGroup = (u: string | undefined): u is string => !!u && (g.memberUids ?? []).includes(u)
  const owner = g.members?.[into]?.uid
  if (inGroup(owner) && owner !== caller) return owner
  if (g.mergeNeedsOk && inGroup(g.createdBy) && g.createdBy !== caller) return g.createdBy
  return null
}
