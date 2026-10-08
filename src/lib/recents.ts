import type { Category, Expense, MemberId, SplitInput, SplitType } from '@/types'

/**
 * Small per-device memories that make the next entry faster: the last group used, the last
 * payer / split per group, the last settle-up method per recipient, and description suggestions
 * from a group's history. Everything here is a convenience: storage may be missing or full.
 */

export interface RecentsStorage {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
}

let storage: RecentsStorage | undefined = (() => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
})()

/** Tests: swap in an in-memory store (or undefined for "no storage"). */
export function setRecentsStorage(s: RecentsStorage | undefined) {
  storage = s
}

function readMap<T>(key: string): Record<string, T> {
  try {
    return (JSON.parse(storage?.getItem(key) ?? '{}') as Record<string, T>) ?? {}
  } catch {
    return {}
  }
}
function writeEntry<T>(key: string, id: string, value: T) {
  try {
    const m = readMap<T>(key)
    m[id] = value
    storage?.setItem(key, JSON.stringify(m))
  } catch {
    /* storage unavailable */
  }
}

// ---- Last-used group ---------------------------------------------------------------

const GROUP_KEY = 'splitit-last-group'

export function lastGroup(): string | undefined {
  try {
    return storage?.getItem(GROUP_KEY) ?? undefined
  } catch {
    return undefined
  }
}

export function rememberGroup(groupId: string) {
  try {
    storage?.setItem(GROUP_KEY, groupId)
  } catch {
    /* storage unavailable */
  }
}

// ---- Last payer / split per group ----------------------------------------------------

/** Split types worth repeating as-is. Exact / adjust amounts belong to one bill. */
const REPEATABLE: SplitType[] = ['equal', 'shares', 'percent']

export interface LastSplit {
  payer?: MemberId
  splitType?: SplitType
  input?: SplitInput
}

const SPLIT_KEY = 'splitit-last-split'

/** The last payer and split for this group, with members who have since left dropped. */
export function lastSplit(groupId: string, members: MemberId[]): LastSplit {
  const raw = readMap<LastSplit>(SPLIT_KEY)[groupId]
  return raw ? sanitizeSplit(raw, members) : {}
}

export function rememberSplit(groupId: string, s: LastSplit) {
  const keep = s.splitType && REPEATABLE.includes(s.splitType)
  writeEntry<LastSplit>(SPLIT_KEY, groupId, { payer: s.payer, ...(keep ? { splitType: s.splitType, input: s.input } : {}) })
}

/** Keep only what still fits the group's members; drop a split that no longer adds up. */
export function sanitizeSplit(s: LastSplit, members: MemberId[]): LastSplit {
  const has = (id: MemberId) => members.includes(id)
  const out: LastSplit = {}
  if (s.payer && has(s.payer)) out.payer = s.payer
  if (!s.splitType || !REPEATABLE.includes(s.splitType) || !s.input) return out
  const i = s.input
  if (s.splitType === 'equal') {
    const selected = (i.selected ?? []).filter(has)
    if (selected.length) {
      out.splitType = 'equal'
      out.input = { selected }
    }
  } else if (s.splitType === 'shares') {
    const shares = pick(i.shares, has)
    if (shares && Object.values(shares).some((v) => v > 0)) {
      out.splitType = 'shares'
      out.input = { shares }
    }
  } else if (s.splitType === 'percent') {
    const percent = pick(i.percent, has)
    if (percent && Math.abs(Object.values(percent).reduce((a, b) => a + b, 0) - 100) < 0.001) {
      out.splitType = 'percent'
      out.input = { percent }
    }
  }
  return out
}

function pick(r: Record<MemberId, number> | undefined, has: (id: MemberId) => boolean) {
  return r && Object.fromEntries(Object.entries(r).filter(([k, v]) => has(k) && Number.isFinite(v)))
}

/** The same split, ignoring key order (for the "Same as last time" hint). */
export function sameSplit(a: SplitType, ai: SplitInput, b?: SplitType, bi?: SplitInput): boolean {
  if (a !== b || !bi) return false
  const norm = (i: SplitInput) =>
    JSON.stringify({
      selected: a === 'equal' ? [...(i.selected ?? [])].sort() : undefined,
      shares: a === 'shares' ? sortObj(i.shares) : undefined,
      percent: a === 'percent' ? sortObj(i.percent) : undefined,
    })
  return norm(ai) === norm(bi)
}
const sortObj = (r?: Record<string, number>) =>
  r &&
  Object.fromEntries(
    Object.entries(r)
      .filter(([, v]) => v)
      .sort(([x], [y]) => x.localeCompare(y)),
  )

// ---- Settle-up method per recipient --------------------------------------------------

const METHOD_KEY = 'splitit-last-method'

export function lastMethod(groupId: string, to: MemberId): string | undefined {
  return readMap<string>(METHOD_KEY)[`${groupId}/${to}`]
}

export function rememberMethod(groupId: string, to: MemberId, method: string) {
  writeEntry(METHOD_KEY, `${groupId}/${to}`, method)
}

// ---- Description suggestions ----------------------------------------------------------

export interface Suggestion {
  description: string
  category: Category
  /** how many times it was used in the group */
  count: number
  /** the most recent use (its payer and split can be repeated) */
  last: Expense
}

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Past descriptions in a group, most useful first: frequent and recent. Each carries the
 * category it was last filed under and the latest expense (for its payer / split).
 */
export function descriptionHistory(expenses: Expense[]): Suggestion[] {
  const by = new Map<string, Suggestion>()
  const newest = (e: Expense) => `${e.date}|${String(e.createdAt).padStart(15, '0')}`
  for (const e of expenses) {
    if (e.deletedAt || !e.description.trim()) continue
    const k = key(e.description)
    const s = by.get(k)
    if (!s) by.set(k, { description: e.description.trim(), category: e.category, count: 1, last: e })
    else {
      s.count++
      if (newest(e) > newest(s.last)) {
        s.last = e
        s.description = e.description.trim()
        s.category = e.category
      }
    }
  }
  const list = [...by.values()]
  if (!list.length) return list
  // Rank: uses (log-ish) plus recency, so a one-off from last night beats a monthly bill from a year ago only a little.
  const dates = list.map((s) => Date.parse(s.last.date) || 0)
  const max = Math.max(...dates)
  const score = (s: Suggestion, i: number) => Math.log2(1 + s.count) * 2 - ((max - dates[i]) / (7 * 86400000)) * 0.25
  return list
    .map((s, i) => ({ s, v: score(s, i) }))
    .sort((a, b) => b.v - a.v || a.s.description.localeCompare(b.s.description))
    .map((x) => x.s)
}

/** Suggestions for what has been typed so far: everything when empty, else prefix / word matches. */
export function suggestDescriptions(history: Suggestion[], typed: string, limit = 6): Suggestion[] {
  const t = key(typed)
  if (!t) return history.slice(0, limit)
  const starts = history.filter((s) => key(s.description).startsWith(t) && key(s.description) !== t)
  const words = history.filter(
    (s) =>
      !starts.includes(s) &&
      key(s.description) !== t &&
      key(s.description)
        .split(' ')
        .some((w) => w.startsWith(t)),
  )
  return [...starts, ...words].slice(0, limit)
}

/** The category this group last used for exactly this description, if any. */
export function pastCategory(history: Suggestion[], description: string): Category | undefined {
  const t = key(description)
  return t ? history.find((s) => key(s.description) === t)?.category : undefined
}

// ---- Dates -----------------------------------------------------------------------------

/** yyyy-mm-dd shifted by whole days (local calendar). */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}
