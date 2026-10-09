import type { ActivityEntry, Cents, MemberId } from '@/types'
import { formatMoney } from './money'
import { andList } from './share-card'
import { settlePersonHref, type SettleRow } from './settleAll'

/*
 * The debtor's side of a nudge, without a push: the `nudge` callable writes a `settlement.nudged`
 * activity entry in the group (also when the debtor has notifications off), so when they next
 * open the app, Home and the Inbox show a small card, "Priya reminded you · you owe ₹1,240 in
 * Goa trip", with Settle up. Cards are per sender (a cross-group nudge, or nudges in several
 * groups, read as one), use what is owed now (paid since: no card), and are dismissed per nudge
 * on this device.
 */

/** Older nudges are not worth a card any more (the sender can nudge again daily). */
export const NUDGE_CARD_MAX_AGE_MS = 7 * 86_400_000

export interface NudgeCardGroup {
  groupId: string
  groupName: string
  groupEmoji: string
  /** what you owe there now */
  amount: Cents
}

export interface NudgeCard {
  /** `${senderUid}|${currency}` */
  key: string
  senderUid: string
  senderName: string
  currency: string
  total: Cents
  groups: NudgeCardGroup[]
  /** the prefilled Settle up: the group's, the cross-group one, or Balances */
  href: string
  /** the newest nudge behind the card */
  at: number
  /** every activity entry the card stands for: dismissing the card dismisses them all */
  ids: string[]
}

export interface NudgeGroupInfo {
  name: string
  emoji: string
  currency: string
  /** you, as a member id of this group */
  me?: MemberId
}

/**
 * Unseen nudges addressed to me, newest first, one card per sender and currency.
 *  - `feed`: activity across my groups (any order); only other people's `settlement.nudged`
 *    entries naming my member id in that group, within NUDGE_CARD_MAX_AGE_MS, not dismissed.
 *  - `rows`: my pending payments (pendingSettlements). A nudge only shows while I still owe in
 *    that group: the row to the sender when there is one, else what I owe there at most the
 *    nudge's figure (with "simplify" on, the payment may go to someone else).
 */
export function nudgeCards(input: {
  feed: ActivityEntry[] | null | undefined
  rows: SettleRow[] | null | undefined
  groups: Record<string, NudgeGroupInfo>
  myUid: string
  dismissed: ReadonlySet<string>
  now: number
}): NudgeCard[] {
  const { groups, myUid, dismissed, now } = input
  const owe = (input.rows ?? []).filter((r) => r.dir === 'owe')
  /** sender|currency → groupId → entries (newest first once sorted) */
  const bySender = new Map<string, { senderUid: string; currency: string; byGroup: Map<string, ActivityEntry[]> }>()
  for (const a of input.feed ?? []) {
    if (a.type !== 'settlement.nudged' || a.actorUid === myUid || dismissed.has(a.id)) continue
    if (now - a.createdAt >= NUDGE_CARD_MAX_AGE_MS) continue
    const g = groups[a.groupId]
    if (!g?.me || a.targetId !== g.me) continue
    const key = `${a.actorUid}|${g.currency}`
    const s = bySender.get(key) ?? { senderUid: a.actorUid, currency: g.currency, byGroup: new Map() }
    s.byGroup.set(a.groupId, [...(s.byGroup.get(a.groupId) ?? []), a])
    bySender.set(key, s)
  }

  const cards: NudgeCard[] = []
  for (const [key, s] of bySender) {
    const parts: Array<NudgeCardGroup & { href: string; direct: boolean; newest: ActivityEntry }> = []
    const ids: string[] = []
    for (const [groupId, entries] of s.byGroup) {
      entries.sort((x, y) => y.createdAt - x.createdAt)
      ids.push(...entries.map((e) => e.id))
      const newest = entries[0]
      const g = groups[groupId]
      const mine = owe.filter((r) => r.groupId === groupId)
      if (mine.length === 0) continue
      const toSender = mine.find((r) => r.uid === s.senderUid)
      const asked = typeof newest.after?.amount === 'number' && newest.after.amount > 0 ? newest.after.amount : Number.POSITIVE_INFINITY
      const amount = toSender
        ? toSender.amount
        : Math.min(
            asked,
            mine.reduce((t, r) => t + r.amount, 0),
          )
      parts.push({
        groupId,
        groupName: g.name,
        groupEmoji: g.emoji,
        amount,
        href: toSender ? toSender.href : `/groups/${encodeURIComponent(groupId)}/settle`,
        direct: !!toSender,
        newest,
      })
    }
    if (parts.length === 0) continue
    parts.sort((x, y) => y.newest.createdAt - x.newest.createdAt)
    const latest = parts[0].newest
    // Several groups: the cross-group Settle up with the sender, when every group's payment goes to them.
    const href = parts.length === 1 ? parts[0].href : parts.every((p) => p.direct) ? settlePersonHref({ key: `u:${s.senderUid}|${s.currency}` }) : '/settle'
    cards.push({
      key,
      senderUid: s.senderUid,
      senderName: latest.actorName || 'Someone',
      currency: s.currency,
      total: parts.reduce((t, p) => t + p.amount, 0),
      groups: parts.map(({ groupId, groupName, groupEmoji, amount }) => ({ groupId, groupName, groupEmoji, amount })),
      href,
      at: latest.createdAt,
      ids,
    })
  }
  return cards.sort((a, b) => b.at - a.at)
}

/** "Priya reminded you" / "You owe ₹1,240 in Goa Trip" (or "across Goa Trip and Indiranagar Flat"). */
export function nudgeCardText(c: Pick<NudgeCard, 'senderName' | 'total' | 'currency' | 'groups'>): { name: string; title: string; line: string } {
  const first = c.senderName.trim().split(/\s+/)[0] || c.senderName
  const where = c.groups.length > 1 ? `across ${andList(c.groups.map((g) => g.groupName))}` : `in ${c.groups[0]?.groupName ?? 'your group'}`
  return { name: first, title: `${first} reminded you`, line: `You owe ${formatMoney(c.total, c.currency)} ${where}` }
}

// ---- Dismissed on this device -------------------------------------------------------

export interface DismissStorage {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
}

let storage: DismissStorage | undefined = (() => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
})()

/** Tests: swap in an in-memory store (or undefined for "no storage"). */
export function setDismissStorage(s: DismissStorage | undefined) {
  storage = s
  memory.clear()
  cached = undefined
}

const KEY = 'splitit-nudges-dismissed'
const listeners = new Set<() => void>()
let cached: ReadonlySet<string> | undefined
/** This visit's dismissals, so a card still goes away where storage is blocked. */
const memory = new Set<string>()

function readMap(): Record<string, number> {
  try {
    const v = JSON.parse(storage?.getItem(KEY) ?? '{}') as unknown
    return v && typeof v === 'object' ? (v as Record<string, number>) : {}
  } catch {
    return {}
  }
}

/** The dismissed activity ids (a stable object between changes, for useSyncExternalStore). */
export function dismissedNudges(): ReadonlySet<string> {
  cached ??= new Set([...Object.keys(readMap()), ...memory])
  return cached
}

/** Hide these nudges on this device. Entries older than a card can live are forgotten. */
export function dismissNudges(ids: string[], at = Date.now()) {
  for (const id of ids) memory.add(id)
  try {
    const all = readMap()
    for (const [k, v] of Object.entries(all)) if (typeof v !== 'number' || at - v >= NUDGE_CARD_MAX_AGE_MS) delete all[k]
    for (const id of ids) all[id] = at
    storage?.setItem(KEY, JSON.stringify(all))
  } catch {
    /* storage unavailable */
  }
  cached = undefined
  for (const l of listeners) l()
}

/** Undo a dismissal. */
export function restoreNudges(ids: string[]) {
  for (const id of ids) memory.delete(id)
  try {
    const all = readMap()
    for (const id of ids) delete all[id]
    storage?.setItem(KEY, JSON.stringify(all))
  } catch {
    /* storage unavailable */
  }
  cached = undefined
  for (const l of listeners) l()
}

export function onNudgesDismissed(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
