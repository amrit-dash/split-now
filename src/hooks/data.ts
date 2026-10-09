import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { repo } from '@/data'
import { groupsKey, peekShared, peekSharedMeta, subscribeShared } from '@/data/store'
import type { NewGroup, SnapMeta, Unsub } from '@/data/repo'
import type { ActivityEntry, Capture, Expense, ExpenseComment, Group, MemberId, Settlement } from '@/types'
import { countable, netBalances, pairwiseDebts } from '@/lib/balances'
import { simplifyDebts } from '@/lib/simplify'
import { planCatchUp } from '@/lib/recurrence'
import { todayISO } from '@/lib/id'
import { mergeFeeds } from '@/lib/activity'
import { canPurge, countedSettlements, expiredTrash, isDisputed, isPending, liveItems, trashedItems } from '@/lib/trust'
import { markCreated, rewatchWhileFresh, watchGroupSettled } from '@/lib/fresh'
import { useMe } from './auth'

/*
 * Live data for screens. Every hook reads a shared, refcounted live query (src/data/store.ts)
 * keyed by what it watches, so Home, Groups, GroupDetail and the Inbox all share one listener
 * per group, a tab switch reuses the open listeners instead of re-syncing, and a screen that
 * mounts after the data has arrived renders it at once (no loading flash).
 *
 * The all-groups aggregate (useAllGroupData) is computed once in GroupDataProvider (hooks/
 * groupData.tsx, mounted in App) and handed to pages through context.
 */

/** Activity entries per group kept live: shared by the group's Activity tab and the Inbox feed. */
export const ACTIVITY_LIMIT = 50

const EMPTY: never[] = []

/** One shared live query by key: its current value, synchronously, or undefined until it reports. */
function useShared<T>(key: string | null, start: (cb: (v: T, meta?: SnapMeta) => void) => Unsub): T | undefined {
  // `start` only matters when the entry is first opened, so the latest one is fine.
  const startRef = useRef(start)
  startRef.current = start
  const subscribe = useCallback(
    (onChange: () => void) =>
      key
        ? subscribeShared<T>(
            key,
            (cb) => startRef.current(cb),
            () => onChange(),
          )
        : () => {},
    [key],
  )
  const read = useCallback(() => (key ? peekShared<T>(key) : undefined), [key])
  return useSyncExternalStore(subscribe, read, read)
}

/** Where a shared query's current value came from (undefined until it reports). */
function useSharedMeta(key: string | null, start: (cb: (v: unknown, meta?: SnapMeta) => void) => Unsub): SnapMeta | undefined {
  const startRef = useRef(start)
  startRef.current = start
  const subscribe = useCallback(
    (onChange: () => void) =>
      key
        ? subscribeShared<unknown>(
            key,
            (cb) => startRef.current(cb),
            () => onChange(),
          )
        : () => {},
    [key],
  )
  const read = useCallback(() => (key ? peekSharedMeta(key) : undefined), [key])
  return useSyncExternalStore(subscribe, read, read)
}

// ---- Keys and starters (one place, so the provider and the hooks share entries) ----------

const keys = {
  groups: groupsKey,
  captures: (uid: string) => `captures/${uid}`,
  group: (id: string) => `group/${id}`,
  expenses: (id: string) => `expenses/${id}`,
  settlements: (id: string) => `settlements/${id}`,
  activity: (id: string, max: number) => `activity/${id}/${max}`,
  history: (gid: string, tid: string) => `history/${gid}/${tid}`,
  comments: (gid: string, eid: string) => `comments/${gid}/${eid}`,
}

const startGroups = (uid: string) => (cb: (g: Group[], m?: SnapMeta) => void) => repo.watchGroups(uid, cb)
const startCaptures = (uid: string) => (cb: (c: Capture[], m?: SnapMeta) => void) => repo.watchCaptures(uid, cb)
// A group created a moment ago may not be on the server yet: wait for it rather than say "not found" (lib/fresh).
const startGroup = (id: string) => (cb: (g: Group | null, m?: SnapMeta) => void) => watchGroupSettled(repo.watchGroup, id, cb)
/** The group's expenses; the one place recurring catch-up runs (once per snapshot, whoever is watching). */
const startExpenses = (id: string) => (cb: (e: Expense[], m?: SnapMeta) => void) =>
  rewatchWhileFresh(id, () =>
    repo.watchExpenses(id, (l, m) => {
      cb(l, m)
      catchUpRecurring(l)
    }),
  )
const startSettlements = (id: string) => (cb: (s: Settlement[], m?: SnapMeta) => void) => rewatchWhileFresh(id, () => repo.watchSettlements(id, cb))
const startActivity = (id: string, max: number) => (cb: (a: ActivityEntry[], m?: SnapMeta) => void) =>
  rewatchWhileFresh(id, () => repo.watchActivity(id, cb, max))

// ---- Hooks ---------------------------------------------------------------------------------

export function useGroups(): Group[] | null {
  const { user } = useMe()
  return useShared(keys.groups(user.uid), startGroups(user.uid)) ?? null
}

/** The signed-in user's captured transactions (newest first). */
export function useCaptures(): Capture[] | null {
  const { user } = useMe()
  return useShared(keys.captures(user.uid), startCaptures(user.uid)) ?? null
}

/**
 * Sync state of the captures list: `fromCache` while the server hasn't confirmed it (the
 * Inbox can say "Checking for new captured payments…" instead of showing an empty list as final).
 */
export function useCapturesMeta(): SnapMeta | undefined {
  const { user } = useMe()
  return useSharedMeta(keys.captures(user.uid), startCaptures(user.uid))
}

export function usePendingCaptures() {
  const list = useCaptures()
  return useMemo(() => list?.filter((c) => c.status === 'pending') ?? null, [list])
}

/** undefined while loading, null when the group doesn't exist or the user can't read it. */
export function useGroup(id: string | undefined): Group | null | undefined {
  return useShared<Group | null>(id ? keys.group(id) : null, startGroup(id ?? ''))
}

/** Creates a group; screens opened right after treat it as loading until the server has it (see lib/fresh). */
export async function createGroup(g: NewGroup) {
  const id = await repo.createGroup(g)
  markCreated(id)
  return id
}

// Catch-up keys already attempted this session (template + nextDate), so repeated
// snapshots don't re-send the same write and a failing write isn't retried in a loop.
const attempted = new Set<string>()

/**
 * Recurring expenses: create any occurrences that came due since the group was last
 * opened. Runs on every expense snapshot for a member; writes are idempotent.
 */
export function catchUpRecurring(expenses: Expense[], today = todayISO()) {
  for (const e of expenses) {
    if (!e.recurrence || e.deletedAt) continue
    const key = `${e.groupId}/${e.id}@${e.recurrence.nextDate}|${e.recurrence.until ?? ''}`
    if (attempted.has(key)) continue
    const plan = planCatchUp(e, today)
    if (!plan) continue
    attempted.add(key)
    repo.saveRecurringOccurrences(plan.template, plan.occurrences).catch((err) => console.warn('Recurring catch-up failed', err))
  }
}

/** Every expense of the group, including those in "Recently deleted". */
export function useAllExpenses(groupId: string | undefined): Expense[] | null {
  return useShared(groupId ? keys.expenses(groupId) : null, startExpenses(groupId ?? '')) ?? null
}

/** The group's expenses, without trashed ones. */
export function useExpenses(groupId: string | undefined): Expense[] | null {
  const all = useAllExpenses(groupId)
  return useMemo(() => (all ? liveItems(all) : null), [all])
}

export function useAllSettlements(groupId: string | undefined): Settlement[] | null {
  return useShared(groupId ? keys.settlements(groupId) : null, startSettlements(groupId ?? '')) ?? null
}

/** The group's settlements, without trashed ones. */
export function useSettlements(groupId: string | undefined): Settlement[] | null {
  const all = useAllSettlements(groupId)
  return useMemo(() => (all ? liveItems(all) : null), [all])
}

// Expired trash already purged this session.
const purged = new Set<string>()

/**
 * "Recently deleted" for a group (last 30 days, newest first). Items older than that are
 * purged by whoever is allowed to (the deleter or the group creator) when they open it.
 */
export function useTrash(group: Group | null | undefined) {
  const { user } = useMe()
  const expenses = useAllExpenses(group?.id)
  const settlements = useAllSettlements(group?.id)
  useEffect(() => {
    if (!group || !expenses || !settlements) return
    for (const e of expiredTrash(expenses)) {
      if (purged.has(e.id) || !canPurge(e, group, user.uid)) continue
      purged.add(e.id)
      repo.purgeExpense(group.id, e.id).catch((err) => console.warn('Trash purge failed', err))
    }
    for (const s of expiredTrash(settlements)) {
      if (purged.has(s.id) || !canPurge(s, group, user.uid)) continue
      purged.add(s.id)
      repo.purgeSettlement(group.id, s.id).catch((err) => console.warn('Trash purge failed', err))
    }
  }, [group, expenses, settlements, user.uid])
  return useMemo(() => (expenses && settlements ? { expenses: trashedItems(expenses), settlements: trashedItems(settlements) } : null), [expenses, settlements])
}

/** A group's activity feed, newest first. */
export function useActivity(groupId: string | undefined, max = ACTIVITY_LIMIT): ActivityEntry[] | null {
  return useShared(groupId ? keys.activity(groupId, max) : null, startActivity(groupId ?? '', max)) ?? null
}

/** Edit history of one expense or settlement, newest first. */
export function useHistory(groupId: string | undefined, targetId: string | undefined): ActivityEntry[] | null {
  const key = groupId && targetId ? keys.history(groupId, targetId) : null
  return useShared(key, (cb: (a: ActivityEntry[], m?: SnapMeta) => void) => repo.watchHistory(groupId ?? '', targetId ?? '', cb)) ?? null
}

/**
 * Newest activity across the given groups. Each group's feed is a shared entry (the same one
 * its Activity tab reads), subscribed per id so a group joining or leaving the set doesn't
 * restart the others.
 */
export function useRecentActivity(groupIds: string[] | null, max = ACTIVITY_LIMIT): ActivityEntry[] | null {
  const [feeds, setFeeds] = useState<Record<string, ActivityEntry[]>>({})
  const key = groupIds ? [...groupIds].sort().join(',') : null
  const subs = useRef(new Map<string, Unsub>())
  useEffect(() => {
    const want = new Set(key ? key.split(',') : [])
    for (const [id, unsub] of subs.current) {
      if (want.has(id)) continue
      unsub()
      subs.current.delete(id)
      setFeeds(({ [id]: _, ...rest }) => rest)
    }
    for (const id of want) {
      if (subs.current.has(id)) continue
      subs.current.set(
        id,
        subscribeShared<ActivityEntry[]>(keys.activity(id, max), startActivity(id, max), (a) => setFeeds((p) => (p[id] === a ? p : { ...p, [id]: a }))),
      )
    }
  }, [key, max])
  useEffect(() => {
    const map = subs.current
    return () => {
      for (const u of map.values()) u()
      map.clear()
    }
  }, [])
  return useMemo(() => (key === null ? null : mergeFeeds(Object.values(feeds), max)), [feeds, key, max])
}

export function useComments(groupId: string | undefined, expenseId: string | undefined): ExpenseComment[] | null {
  const key = groupId && expenseId ? keys.comments(groupId, expenseId) : null
  return useShared(key, (cb: (c: ExpenseComment[], m?: SnapMeta) => void) => repo.watchComments(groupId ?? '', expenseId ?? '', cb)) ?? null
}

export function myMemberId(g: Group, uid: string): MemberId | undefined {
  return Object.entries(g.members).find(([, m]) => m.uid === uid)?.[0]
}

export function memberOrder(g: Group): MemberId[] {
  return Object.keys(g.members).sort((a, b) => g.members[a].name.localeCompare(g.members[b].name))
}

export interface GroupData {
  group: Group
  expenses: Expense[]
  settlements: Settlement[]
  me?: MemberId
  net: Record<MemberId, number>
  debts: ReturnType<typeof simplifyDebts>
  rawDebts: ReturnType<typeof simplifyDebts>
  /** waiting for approval: listed, but not in net/debts */
  pending: Expense[]
  /** flagged by someone: still counted in net/debts */
  disputed: Expense[]
}

// Malformed expenses (shares that don't add up) already reported in the console this session.
const reported = new Set<string>()

/**
 * Balances for a group. Trashed items never count; expenses still waiting for approval are
 * listed (in `expenses` and `pending`) but left out of `net` and the debts.
 */
export function computeGroupData(group: Group, expenses: Expense[], settlements: Settlement[], uid: string): GroupData {
  const live = liveItems(expenses)
  const liveSettlements = countedSettlements(settlements)
  // Checked once here, then every balance function gets the vetted list.
  const { ok, rejected } = countable(live.filter((e) => !isPending(e, group)))
  for (const e of rejected) {
    if (reported.has(e.id)) continue
    reported.add(e.id)
    console.warn(`Ignoring expense ${e.id} (“${e.description}”): paidBy/splits don’t add up to the amount`, e)
  }
  const net = netBalances(ok, liveSettlements)
  const rawDebts = pairwiseDebts(ok, liveSettlements)
  const debts = group.simplify ? simplifyDebts(net) : rawDebts
  return {
    group,
    expenses: live,
    settlements: liveSettlements,
    me: myMemberId(group, uid),
    net,
    debts,
    rawDebts,
    pending: live.filter((e) => isPending(e, group)),
    disputed: ok.filter(isDisputed),
  }
}

/** Set by GroupDataProvider; pages read it through useAllGroupData(). */
export const GroupDataCtx = createContext<GroupData[] | null | undefined>(undefined)

/** How long the all-groups view waits for the server to confirm an empty cached list before showing it. */
const SETTLE_WAIT_MS = 4000

/** A snapshot that is safe to show: confirmed by the server, has data, failed, or we're offline. */
const settled = (list: unknown[], meta: SnapMeta | undefined) =>
  !meta?.fromCache || meta.error || list.length > 0 || (typeof navigator !== 'undefined' && navigator.onLine === false)

interface Slot {
  exp?: Expense[]
  set?: Settlement[]
  expOk?: boolean
  setOk?: boolean
}

/**
 * Live data for every group the user belongs to. Normally called once, by GroupDataProvider;
 * `enabled: false` makes it inert (a page that finds the provider uses the context instead).
 * Per-group results are memoised on the identity of the group document and its two lists, so
 * a change in one group recomputes that group only.
 */
export function useAllGroupDataImpl(enabled: boolean): GroupData[] | null {
  const { user } = useMe()
  const groups = useShared(enabled ? keys.groups(user.uid) : null, startGroups(user.uid)) ?? null
  const [slots, setSlots] = useState<Record<string, Slot>>({})
  // Sorted, so re-ordering (every save bumps updatedAt) doesn't look like a change.
  const ids = groups
    ? groups
        .map((g) => g.id)
        .sort()
        .join(',')
    : null
  const subs = useRef(new Map<string, Unsub>())
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [waited, setWaited] = useState(false)

  // Subscribe to new groups and drop removed ones without restarting the others.
  useEffect(() => {
    if (ids === null) return
    const want = new Set(ids ? ids.split(',') : [])
    for (const [id, unsub] of subs.current) {
      if (want.has(id)) continue
      unsub()
      subs.current.delete(id)
      setSlots(({ [id]: _, ...rest }) => rest)
    }
    for (const id of want) {
      if (subs.current.has(id)) continue
      const a = subscribeShared<Expense[]>(keys.expenses(id), startExpenses(id), (e, m) =>
        setSlots((p) => (p[id]?.exp === e && p[id]?.expOk ? p : { ...p, [id]: { ...p[id], exp: e, expOk: settled(e, m) } })),
      )
      const b = subscribeShared<Settlement[]>(keys.settlements(id), startSettlements(id), (s, m) =>
        setSlots((p) => (p[id]?.set === s && p[id]?.setOk ? p : { ...p, [id]: { ...p[id], set: s, setOk: settled(s, m) } })),
      )
      subs.current.set(id, () => {
        a()
        b()
      })
    }
  }, [ids])
  useEffect(() => {
    const map = subs.current
    return () => {
      for (const u of map.values()) u()
      map.clear()
    }
  }, [])

  // Every group has reported, and nothing is an unconfirmed empty cache (which would read as
  // "all settled" for a beat on a device that is online but can't reach the server: hence the
  // grace period, after which whatever we have is shown).
  const allReported = !!groups && groups.every((g) => slots[g.id]?.exp && slots[g.id]?.set)
  const allSettled = allReported && groups!.every((g) => slots[g.id].expOk && slots[g.id].setOk)
  useEffect(() => {
    if (!enabled || !groups || allSettled) return
    const t = setTimeout(() => setWaited(true), SETTLE_WAIT_MS)
    return () => clearTimeout(t)
  }, [enabled, groups, allSettled])
  const loaded = allSettled || (allReported && waited)
  useEffect(() => {
    if (loaded) setInitialLoadDone(true)
  }, [loaded])

  const cache = useRef(new Map<string, { group: Group; exp: Expense[]; set: Settlement[]; uid: string; data: GroupData }>())
  return useMemo(() => {
    // Until every group has reported once, show a loader rather than a misleading "all settled".
    if (!groups || (!loaded && !initialLoadDone)) return null
    const next = new Map<string, { group: Group; exp: Expense[]; set: Settlement[]; uid: string; data: GroupData }>()
    const out = groups.map((g) => {
      const exp = slots[g.id]?.exp ?? EMPTY
      const set = slots[g.id]?.set ?? EMPTY
      const c = cache.current.get(g.id)
      const data = c && c.group === g && c.exp === exp && c.set === set && c.uid === user.uid ? c.data : computeGroupData(g, exp, set, user.uid)
      next.set(g.id, { group: g, exp, set, uid: user.uid, data })
      return data
    })
    cache.current = next
    return out
  }, [groups, slots, user.uid, loaded, initialLoadDone])
}

/** Live data for every group the user belongs to (for dashboard / friends / insights). */
export function useAllGroupData(): GroupData[] | null {
  const ctx = useContext(GroupDataCtx)
  const own = useAllGroupDataImpl(ctx === undefined)
  return ctx === undefined ? own : ctx
}
