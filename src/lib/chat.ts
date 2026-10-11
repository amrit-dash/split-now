import { groupLabels, memberIdOfUid } from './shortNames'
import { activeMembers } from './members'
import type { ActivityEntry, ActivityType, ChatMessage, Group, MemberId } from '@/types'
import { localISODate } from './id'
import { formatDate } from './locale'

/*
 * Group chat: a money-only chat per group ("who paid for lunch on the 2nd?"). Messages are
 * plain words or cards (an open item anyone can claim, a Pay me request, an expense). Everyone
 * in the group reads the whole history, including people who joined later.
 *
 * This file is every decision the chat screen makes: day headers, which bubbles run together,
 * where the "unread" line goes, the activity pills between messages, links in text, and the
 * unread dot (the last-read time is kept on this device: no "seen by", no extra writes).
 */

export const CHAT_MAX = 1000
/** Messages from one person closer together than this share one bubble run (one name, one tail). */
export const RUN_GAP_MS = 5 * 60_000

/** "Today", "Yesterday", "Monday" (within the week), "2 Oct", "2 Oct 2025". */
export function dayLabel(day: string, today: string): string {
  const diff = daysBetween(day, today)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff > 1 && diff < 7) return formatDate(day, { weekday: 'long' })
  return formatDate(day, day.slice(0, 4) === today.slice(0, 4) ? 'day' : 'dayYear')
}

/** Whole days from `a` to `b` (local ISO days), DST-proof. */
function daysBetween(a: string, b: string): number {
  const t = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))
  return Math.round((t(b) - t(a)) / 86_400_000)
}

/** Activity that shows as a quiet pill between messages: what changed the money, not edits of notes. */
const PILL_TYPES = new Set<ActivityType>([
  'expense.created',
  'expense.deleted',
  'expense.restored',
  'expense.imported',
  'settlement.created',
  'settlement.deleted',
  'settlement.restored',
  'settlement.approved',
  'settlement.flagged',
  'member.added',
  'member.removed',
])

export type ChatRow =
  | { type: 'day'; key: string; label: string }
  | { type: 'unread'; key: string }
  | { type: 'updates'; key: string; entries: ActivityEntry[] }
  | {
      type: 'message'
      key: string
      message: ChatMessage
      mine: boolean
      /** starts a run: show the name (others' messages) and leave a gap above */
      first: boolean
      /** ends a run: show the avatar (others') and the bubble's tail */
      last: boolean
    }

export interface RowOpts {
  /** the viewer's uid */
  me: string
  today: string
  /** the viewer's last-read time on this device; messages after it by others get the "unread" line */
  readAt?: number
  /** the group's activity (any order); only entries inside the loaded span of messages are used */
  activity?: ActivityEntry[]
  /** createdAt of the oldest message there is still to load (undefined: the start of the chat is loaded) */
  olderThan?: number
}

/**
 * The chat as rows, oldest first: a day header whenever the day changes, the unread line before
 * the first unread message, runs of bubbles, and consecutive activity collapsed into one pill.
 * An expense added from the chat already has its card, so its "added" entry isn't repeated.
 */
export function chatRows(messages: ChatMessage[], o: RowOpts): ChatRow[] {
  const carded = new Set(messages.filter((m) => m.kind === 'expense' && m.ref).map((m) => m.ref as string))
  // Activity older than the oldest loaded message would land at the top out of place: only once the start is loaded.
  const from = o.olderThan === undefined ? Number.NEGATIVE_INFINITY : (messages[0]?.createdAt ?? Number.POSITIVE_INFINITY)
  const pills = (o.activity ?? [])
    .filter((a) => PILL_TYPES.has(a.type) && a.createdAt >= from && !(a.type === 'expense.created' && carded.has(a.targetId)))
    .sort((a, b) => a.createdAt - b.createdAt)
  type Item = { at: number; m?: ChatMessage; a?: ActivityEntry }
  const items: Item[] = [...messages.map((m) => ({ at: m.createdAt, m })), ...pills.map((a) => ({ at: a.createdAt, a }))].sort((x, y) => x.at - y.at)

  const rows: ChatRow[] = []
  let day = ''
  let unreadDone = o.readAt === undefined
  let prev: ChatMessage | undefined
  let updates: Extract<ChatRow, { type: 'updates' }> | undefined
  for (const it of items) {
    const d = localISODate(it.at)
    if (d !== day) {
      day = d
      rows.push({ type: 'day', key: `day-${d}`, label: dayLabel(d, o.today) })
      prev = undefined
      updates = undefined
    }
    if (it.a) {
      if (updates) updates.entries.push(it.a)
      else {
        updates = { type: 'updates', key: `upd-${it.a.id}`, entries: [it.a] }
        rows.push(updates)
      }
      prev = undefined
      continue
    }
    const m = it.m as ChatMessage
    updates = undefined
    const mine = m.authorUid === o.me
    if (!unreadDone && !mine && m.createdAt > (o.readAt ?? 0)) {
      rows.push({ type: 'unread', key: 'unread' })
      unreadDone = true
      prev = undefined
    }
    const joins = !!prev && prev.authorUid === m.authorUid && m.createdAt - prev.createdAt < RUN_GAP_MS
    if (joins) {
      const last = rows[rows.length - 1]
      if (last.type === 'message') last.last = false
    }
    rows.push({ type: 'message', key: m.id, message: m, mine, first: !joins, last: true })
    prev = m
  }
  return rows
}

/** Messages by others newer than `readAt` (the badge on the chat button). */
export function unreadCount(messages: ChatMessage[] | null, readAt: number | undefined, me: string): number {
  if (!messages) return 0
  return messages.filter((m) => m.authorUid !== me && m.createdAt > (readAt ?? 0)).length
}

/**
 * The unread dot: the newest message is someone else's and came after the last read on this
 * device (a chat never opened here counts as unread until it is opened once).
 */
export function hasUnread(latest: ChatMessage | undefined, readAt: number | undefined, me: string): boolean {
  return !!latest && latest.authorUid !== me && latest.createdAt > (readAt ?? 0)
}

/** What a message box holds before it's sent: trimmed, at most two blank lines in a row, capped. */
export function cleanMessage(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, CHAT_MAX)
}

export type TextPart = { text: string; href?: string }

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]}]/gi

/** Text split into plain parts and http(s) links (never any other scheme), for safe rendering. */
export function linkParts(text: string): TextPart[] {
  const out: TextPart[] = []
  let at = 0
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0
    if (i > at) out.push({ text: text.slice(at, i) })
    out.push({ text: m[0], href: m[0] })
    at = i + m[0].length
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out.length ? out : [{ text }]
}

/** The member entry behind a message's author (for the avatar and colour), when they're still known. */
export function authorMember(group: Pick<Group, 'members'>, uid: string): MemberId | undefined {
  return memberIdOfUid(group.members, uid)
}

/**
 * A Pay me card, for the person looking at it: the author sees what they asked for; anyone else
 * gets "Pay" into a prefilled Settle up (from them to the author). null for a viewer who isn't
 * a member, or when the author has left the group.
 */
export function payCard(
  m: Pick<ChatMessage, 'amount' | 'authorUid'>,
  ctx: { groupId: string; me: string; myMember?: MemberId; authorMember?: MemberId },
): { mine: true } | { mine: false; href: string } | null {
  if (m.authorUid === ctx.me) return { mine: true }
  if (!ctx.myMember || !ctx.authorMember || !m.amount) return null
  const q = new URLSearchParams({ from: ctx.myMember, to: ctx.authorMember, amount: String(m.amount) })
  return { mine: false, href: `/groups/${encodeURIComponent(ctx.groupId)}/settle?${q}` }
}

/** One line for a message, where there's no room for the card (the chat button's hint, a reply). */
export function messagePreview(m: Pick<ChatMessage, 'kind' | 'text'>, card?: string): string {
  const words = m.text.trim().replace(/\s+/g, ' ')
  if (m.kind === 'text') return words
  const label = m.kind === 'openItem' ? 'Open item' : m.kind === 'pay' ? 'Pay me' : 'Expense'
  return [label + (card ? `: ${card}` : ''), words].filter(Boolean).join(' · ')
}

// ---- Last read, per device ----------------------------------------------------------------

const READ_PREFIX = 'splitit-chat-read:'

export function readAtOf(groupId: string): number | undefined {
  try {
    const v = Number(localStorage.getItem(READ_PREFIX + groupId))
    return Number.isFinite(v) && v > 0 ? v : undefined
  } catch {
    return undefined
  }
}

/** Remember the newest message seen (never moves backwards). */
export function markRead(groupId: string, at: number): void {
  try {
    if ((readAtOf(groupId) ?? 0) >= at) return
    localStorage.setItem(READ_PREFIX + groupId, String(at))
    window.dispatchEvent(new CustomEvent(READ_EVENT, { detail: groupId }))
  } catch {
    /* private mode */
  }
}

/** Fired on this window when a chat is marked read, so the group screen's dot updates without a reload. */
export const READ_EVENT = 'splitit-chat-read'

/**
 * Everyone's label for @mentions: the same for every reader (not "you"-relative), so "@Rahul S."
 * written on one phone is found on another. People who left aren't offered or matched.
 */
export function mentionLabels(members: Group['members']): Record<MemberId, string> {
  return groupLabels(activeMembers(members))
}
