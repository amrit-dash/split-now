import type { Cents, Member, MemberId } from '@/types'
import { shortNames } from './shortNames'
import { MAX_MENTIONS } from '../../shared/mentions'
import { isOpenItemLine } from './open-item-line'
import { parseNlExpense, type NlMember, type NlParse } from './nl-expense'
import { fromHundredths } from './money'

/*
 * The chat's tools and the smarter message box (src/features/chat/Composer.tsx draws them):
 *  - the tools themselves (Pay me, Settle up, Add expense, Open item, Balances, Share an expense),
 *    each with a slash command ("/settle") and the words that suggest it
 *  - "/" at the start of the box lists the commands, narrowed as you type (like Slack)
 *  - "@" tags someone in the group (or @everyone); tags are stored as member ids
 *  - while you type, a line that reads like a tool ("can everyone settle up?", "we had lunch for
 *    ₹600", "Rahul pay me 500") offers that tool in one tap. Deterministic word rules, not a model:
 *    instant, offline, free, and the same answer every time. Nothing is sent without a tap.
 */

export type ChatTool = 'pay' | 'settle' | 'expense' | 'open' | 'balances' | 'share'

export interface ToolInfo {
  id: ChatTool
  /** the slash command, without "/" */
  command: string
  label: string
  hint: string
  /** other words the slash list matches ("/owe" finds Settle up) */
  aliases: string[]
}

export const CHAT_TOOLS: readonly ToolInfo[] = [
  {
    id: 'settle',
    command: 'settle',
    label: 'Settle up',
    hint: 'Ask everyone, or someone, to settle up with you.',
    aliases: ['square', 'owe', 'clear', 'dues'],
  },
  { id: 'pay', command: 'pay', label: 'Pay me', hint: 'Ask for an amount, from everyone or someone.', aliases: ['request', 'collect', 'ask'] },
  { id: 'expense', command: 'expense', label: 'Add expense', hint: 'Add it now; its card shows up here.', aliases: ['add', 'split', 'spent', 'bill'] },
  { id: 'open', command: 'open', label: 'Open item', hint: 'Not sure who paid or how much? Anyone can claim it.', aliases: ['who', 'claim', 'note'] },
  { id: 'balances', command: 'balances', label: 'Balances', hint: 'Show who owes whom right now.', aliases: ['owes', 'status', 'summary', 'totals'] },
  { id: 'share', command: 'share', label: 'Share an expense', hint: 'Point the group at one that’s already added.', aliases: ['link', 'find'] },
]

/** The tools this group can use (Open item has its own switch). */
export const toolsFor = (o: { openItemsOn: boolean }): ToolInfo[] => CHAT_TOOLS.filter((t) => t.id !== 'open' || o.openItemsOn)

// ---- Slash commands -------------------------------------------------------------------------

/** What is typed after "/" while the box holds only a command being typed ("/se" → "se"); null otherwise. */
export function slashQuery(text: string): string | null {
  const m = /^\/([a-z]*)$/i.exec(text)
  return m ? m[1].toLowerCase() : null
}

/** The commands for a slash query: command prefix first, then a word of the label or an alias. */
export function matchCommands(query: string, tools: readonly ToolInfo[]): ToolInfo[] {
  const q = query.toLowerCase()
  if (!q) return [...tools]
  const starts = tools.filter((t) => t.command.startsWith(q))
  const rest = tools.filter(
    (t) =>
      !starts.includes(t) &&
      (t.label
        .toLowerCase()
        .split(/\s+/)
        .some((w) => w.startsWith(q)) ||
        t.aliases.some((a) => a.startsWith(q))),
  )
  return [...starts, ...rest]
}

/** A full command line ("/pay 500 @Rahul"): the tool and the words after it; null when the first word is no command. */
export function parseSlash(text: string, tools: readonly ToolInfo[]): { tool: ChatTool; rest: string } | null {
  const m = /^\/([a-z]+)(?:\s+([\s\S]*))?$/i.exec(text.trim())
  if (!m) return null
  const word = m[1].toLowerCase()
  const t = tools.find((x) => x.command === word) ?? tools.find((x) => x.aliases.includes(word))
  return t ? { tool: t.id, rest: (m[2] ?? '').trim() } : null
}

// ---- Mentions -------------------------------------------------------------------------------

export const EVERYONE = 'all'

export interface Mentionable {
  /** a member id, or EVERYONE */
  id: string
  /** what follows "@" in the text: the short name ("Rahul", "Rahul S.") or "everyone" */
  label: string
}

/**
 * Who can be tagged: everyone still in the group but you, then @everyone. Labels are worked out
 * over everyone in the group, you included (the same as mentionLabels in src/lib/chat.ts), so
 * "@Rahul S." typed on one phone is the same tag on every other. `withMe` keeps you in the list
 * (to draw tags of you in messages).
 */
export function mentionables(members: Record<MemberId, Member>, me: MemberId | undefined, withMe = false): Mentionable[] {
  const active = Object.fromEntries(Object.entries(members).filter(([, m]) => typeof m.removedAt !== 'number'))
  const labels = shortNames(active)
  const people = Object.keys(active)
    .filter((id) => withMe || id !== me)
    .map((id) => ({ id, label: labels[id] }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const others = people.filter((p) => p.id !== me).length
  return others > 1 ? [...people, { id: EVERYONE, label: 'everyone' }] : people
}

/** The "@word" being typed at the caret: where its "@" is and what follows it; null when the caret isn't in one. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const m = /(^|[\s(])@([\p{L}\p{N}.'’-]{0,30})$/u.exec(before)
  if (!m) return null
  return { start: caret - m[2].length - 1, query: m[2] }
}

const fold = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()

/** People matching a typed "@ra": a word of their name starting with it ("everyone" also as "all"). */
export function matchMentions(query: string, list: Mentionable[]): Mentionable[] {
  const q = fold(query)
  if (!q) return list
  return list.filter(
    (p) =>
      fold(p.label)
        .split(/[\s.]+/)
        .some((w) => w.startsWith(q)) ||
      (p.id === EVERYONE && 'all'.startsWith(q)),
  )
}

/** The text with the "@query" at `start` replaced by "@Label ", and where the caret goes after it. */
export function applyMention(text: string, start: number, caret: number, label: string): { text: string; caret: number } {
  const insert = `@${label} `
  const after = text.slice(caret).replace(/^[\p{L}\p{N}.'’-]*\s?/u, '')
  return { text: text.slice(0, start) + insert + after, caret: start + insert.length }
}

const tagRe = (label: string) => new RegExp(String.raw`(^|[^\p{L}\p{N}])@${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\p{L}\p{N}])`, 'iu')

/** The tags still in the text when it's sent: ids whose "@Label" appears (EVERYONE for "@everyone" or "@all"). */
export function mentionsIn(text: string, list: Mentionable[]): string[] {
  const out = list.filter((p) => tagRe(p.label).test(text)).map((p) => p.id)
  if (!out.includes(EVERYONE) && list.some((p) => p.id === EVERYONE) && tagRe('all').test(text)) out.push(EVERYONE)
  // The rules keep at most MAX_MENTIONS; @everyone covers the rest anyway.
  return out.includes(EVERYONE) && out.length > MAX_MENTIONS ? [EVERYONE] : out.slice(0, MAX_MENTIONS)
}

export type MentionPart = { text: string; mention?: string }

/** Text split into plain parts and the "@Label" tags of `ids` (to draw them as tags). Longest labels win ("Rahul S." over "Rahul"). */
export function mentionParts(text: string, ids: string[] | undefined, list: Mentionable[]): MentionPart[] {
  const tags = list.filter((p) => ids?.includes(p.id)).sort((a, b) => b.label.length - a.label.length)
  if (ids?.includes(EVERYONE) && !tags.some((t) => t.id === EVERYONE)) tags.push({ id: EVERYONE, label: 'everyone' })
  if (ids?.includes(EVERYONE)) tags.push({ id: EVERYONE, label: 'all' })
  if (!tags.length) return [{ text }]
  const alt = tags.map((t) => t.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const re = new RegExp(String.raw`(^|[^\p{L}\p{N}])@(${alt})(?![\p{L}\p{N}])`, 'giu')
  const out: MentionPart[] = []
  let at = 0
  for (const m of text.matchAll(re)) {
    const i = (m.index ?? 0) + m[1].length
    if (i > at) out.push({ text: text.slice(at, i) })
    const label = m[2]
    const tag = tags.find((t) => t.label.toLowerCase() === label.toLowerCase())
    out.push({ text: `@${label}`, mention: tag?.id })
    at = i + label.length + 1
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}

// ---- Suggestions while typing -----------------------------------------------------------------

export interface ToolSuggestion {
  tool: ChatTool
  /** Pay me: the amount the line names */
  amount?: Cents
  /** Pay me / Settle up: who the line asks (member ids); absent = everyone */
  to?: MemberId[]
  /** Add expense: the line read by Quick add's grammar */
  expense?: NlParse
}

export interface SuggestCtx {
  tools: readonly ToolInfo[]
  members: NlMember[]
  me: MemberId
  currency: string
  /** ids tagged in the line (mentionsIn) */
  tagged: string[]
  today?: string
}

const SETTLE_RE =
  /\b(?:settle(?:d|s)?(?:\s+up)?|settling|settlement|square(?:d)?\s+up|clear(?:\s+up)?\s+(?:the\s+|our\s+|all\s+|my\s+|your\s+)?(?:dues|balances?|debts?|account|hisaab|hisab)|pay(?:\s+me)?\s+back|hisaab|hisab|what\s+you\s+owe\s+me)\b/i
const PAY_RE = /\b(?:pay\s+me|send\s+me|transfer\s+(?:it\s+)?(?:to\s+)?me|gpay\s+me|upi\s+me|paytm\s+me|phonepe\s+me|give\s+me|owe(?:s)?\s+me|pay\s+up)\b/i
const BALANCES_RE =
  /\b(?:who\s+owes|how\s+much\s+(?:do|does|did)\s+\S+(?:\s+\S+)?\s+owe|what\s+do\s+(?:i|we)\s+owe|where\s+do\s+we\s+stand|balances?\b|who\s+has\s+to\s+pay|how\s+much\s+is\s+(?:pending|left))/i
const SPEND_RE =
  /\b(?:had|paid|spent|spend|bought|got|ordered|booked|lunch|dinner|breakfast|brunch|coffee|tea|chai|snacks?|drinks?|beers?|taxi|cab|uber|ola|auto|rapido|fuel|petrol|diesel|tolls?|parking|tickets?|movie|hotel|stay|airbnb|rent|groceries|grocery|bill|food|swiggy|zomato|blinkit|zepto|shopping|gift)\b/i
const EVERYONE_RE = /\b(?:everyone|everybody|all\s+of\s+you|you\s+all|y['’]?all|guys|folks|team|sab(?:\s+log)?)\b/i

/** Members the line names by their first or full name (whole words only: "Pay" is never Payal). */
function namedIn(text: string, ctx: Pick<SuggestCtx, 'members' | 'me'>): MemberId[] {
  const words = new Set(
    fold(text)
      .split(/[^\p{L}]+/u)
      .filter((w) => w.length >= 3),
  )
  return ctx.members
    .filter((m) => m.id !== ctx.me)
    .filter((m) => {
      const parts = fold(m.name).split(/\s+/).filter(Boolean)
      return parts.length > 0 && words.has(parts[0])
    })
    .map((m) => m.id)
}

/** Who a Pay me or Settle up line asks: tagged people, else people it names; nobody (everyone) for "everyone"/@everyone. */
function whoIsAsked(text: string, ctx: SuggestCtx): MemberId[] | undefined {
  if (ctx.tagged.includes(EVERYONE) || EVERYONE_RE.test(text)) return undefined
  const ids = [...new Set([...ctx.tagged.filter((t) => t !== EVERYONE), ...namedIn(text, ctx)])]
  return ids.length ? ids : undefined
}

/**
 * The tool a line reads like, or null. In order: "pay me" with or without an amount, then "settle
 * up", then "who owes", then "who paid for…" (Open item), then something spent with an amount
 * (Add expense). Short lines and commands get nothing.
 */
export function suggestTool(text: string, ctx: SuggestCtx): ToolSuggestion | null {
  const t = text.trim()
  if (t.length < 6 || t.startsWith('/')) return null
  const has = (id: ChatTool) => ctx.tools.some((x) => x.id === id)
  const read = () => parseNlExpense(t, { members: ctx.members, me: ctx.me, currency: ctx.currency, today: ctx.today })
  if (PAY_RE.test(t) && has('pay')) {
    const p = read()
    const amount = p.amount !== undefined && p.currency === ctx.currency ? p.amount : undefined
    // "you owe me" or "pay me back" without an amount is a settle up: the app knows how much.
    if (amount === undefined && /\b(?:owe(?:s)?\s+me|pay\s+me\s+back)\b/i.test(t) && has('settle')) return { tool: 'settle', to: whoIsAsked(t, ctx) }
    return { tool: 'pay', ...(amount ? { amount } : {}), ...(whoIsAsked(t, ctx) ? { to: whoIsAsked(t, ctx) } : {}) }
  }
  if (SETTLE_RE.test(t) && has('settle')) {
    const to = whoIsAsked(t, ctx)
    return { tool: 'settle', ...(to ? { to } : {}) }
  }
  if (BALANCES_RE.test(t) && has('balances')) return { tool: 'balances' }
  if (isOpenItemLine(t) && has('open')) return { tool: 'open' }
  if (SPEND_RE.test(t) && has('expense') && !/\?\s*$/.test(t)) {
    const p = read()
    if (p.amount !== undefined && p.amount > 0) return { tool: 'expense', expense: p }
  }
  return null
}

/** The suggestion's one line ("Ask Rahul to settle up", "Add ₹600 lunch as an expense"). */
export function suggestionLabel(s: ToolSuggestion, name: (id: MemberId) => string, money: (c: Cents) => string): string {
  const who = s.to?.length ? listNames(s.to.map(name)) : 'everyone'
  switch (s.tool) {
    case 'settle':
      return `Ask ${who} to settle up`
    case 'pay':
      return s.amount ? `Ask ${who} to pay you ${money(s.amount)}` : `Ask ${who} to pay you`
    case 'balances':
      return 'Show who owes whom'
    case 'open':
      return 'Write it down as an open item'
    case 'expense':
      return `Add ${s.expense?.amount ? money(s.expense.amount) : ''}${s.expense?.description ? ` ${s.expense.description}` : ''} as an expense`.replace(
        /\s+/g,
        ' ',
      )
    default:
      return 'Use this tool'
  }
}

/** "Rahul", "Rahul and Priya", "Rahul, Priya and 2 more". */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`
}

// ---- Per-device choice ------------------------------------------------------------------------

const SUGGEST_KEY = 'splitit-chat-suggest'
const AI_KEY = 'splitit-chat-suggest-ai'

/** AI for suggestions: off unless turned on on this device (chat info, shown when the admin flag chatAi is on). */
export function aiSuggestOn(): boolean {
  try {
    return localStorage.getItem(AI_KEY) === '1'
  } catch {
    return false
  }
}

export function setAiSuggestOn(on: boolean): void {
  try {
    if (on) localStorage.setItem(AI_KEY, '1')
    else localStorage.removeItem(AI_KEY)
  } catch {
    /* private mode */
  }
}

/** Suggestions while typing: on unless turned off on this device (chat info). */
export function suggestOn(): boolean {
  try {
    return localStorage.getItem(SUGGEST_KEY) !== '0'
  } catch {
    return true
  }
}

export function setSuggestOn(on: boolean): void {
  try {
    if (on) localStorage.removeItem(SUGGEST_KEY)
    else localStorage.setItem(SUGGEST_KEY, '0')
  } catch {
    /* private mode */
  }
}

// ---- AI suggestions (optional) --------------------------------------------------------------

/** How long typing must pause before the AI is asked, and how many lines one chat screen may ask about. */
export const AI_PAUSE_MS = 1200
export const AI_ASK_MAX = 15
const AI_MIN_LENGTH = 10

/**
 * Whether to ask the AI about this line: turned on, the phone's rules found nothing, not a
 * command, long enough to mean something, not asked already, and under the per-screen cap.
 */
export function shouldAskAi(text: string, o: { on: boolean; local: ToolSuggestion | null; asked: ReadonlySet<string>; count: number }): boolean {
  const t = text.trim()
  return o.on && !o.local && !t.startsWith('/') && t.length >= AI_MIN_LENGTH && !o.asked.has(t) && o.count < AI_ASK_MAX
}

/**
 * The AI's answer (names, hundredths) as a suggestion the composer can offer: names mapped back
 * to member ids by their label; an expense read by the phone's grammar, with the AI's amount when
 * the grammar found none. null for "none" or a tool this chat doesn't have.
 */
export function suggestionFromAi(
  intent: { tool: string; amount?: number; to?: string[] },
  text: string,
  ctx: Pick<SuggestCtx, 'tools' | 'members' | 'me' | 'currency' | 'today'> & { people: Mentionable[] },
): ToolSuggestion | null {
  const tool = ctx.tools.find((t) => t.id === intent.tool)?.id
  if (!tool) return null
  const to = (intent.to ?? [])
    .map((n) => ctx.people.find((p) => p.id !== EVERYONE && p.label.toLowerCase() === n.toLowerCase())?.id)
    .filter((x): x is string => !!x)
  // The server answers in hundredths; the group's currency may have other minor units (yen has none).
  const minor = intent.amount ? fromHundredths(intent.amount, ctx.currency) : undefined
  switch (tool) {
    case 'settle':
      return { tool, ...(to.length ? { to } : {}) }
    case 'pay':
      return { tool, ...(minor ? { amount: minor } : {}), ...(to.length ? { to } : {}) }
    case 'expense': {
      const p = parseNlExpense(text, { members: ctx.members, me: ctx.me, currency: ctx.currency, today: ctx.today })
      const amount = p.amount ?? minor
      return amount ? { tool, expense: { ...p, amount } } : null
    }
    default:
      return { tool }
  }
}
