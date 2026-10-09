/*
 * Quick add with AI, on the app's side: what the line sends (buildQuickRequest), and what the
 * validated answer becomes (planQuickAi): an expense form prefilled in an existing group, or a
 * new group to confirm first and then the form in it. Also the "New group" prefill Quick add hands
 * GroupForm when the line names people (newGroupPrefill → ?name=&people=). Nothing here saves
 * anything; the expense form always opens for a check. Pure.
 */
import type { Group, GroupType, Member, MemberId } from '@/types'
import type { QuickAiRequest, QuickAiResult } from '../../shared/quick-ai'
import { colorFor } from './colors'
import { GROUP_TYPES, guessGroup, isSharedType } from './groupTypes'
import type { QuickPrefill } from './nl-expense'
import type { KnownPerson } from './people'
import { titleCase } from './text'
import { activeMembers } from './members'

const MAX_GROUPS = 25
const MAX_MEMBERS = 30
export const MAX_PREFILL_PEOPLE = 20

const fold = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * The callable's input: the line, the picked group first, then the others (at most 25, 30 members
 * each), each without the caller (who is "me"). Names only travel with their member ids; never uids.
 */
export function buildQuickRequest(o: {
  text: string
  groups: Group[]
  uid: string
  me: string
  /** the picked group (its currency is the line's) */
  target: Group
  today: string
}): QuickAiRequest {
  const ordered = [o.target, ...o.groups.filter((g) => g.id !== o.target.id)].slice(0, MAX_GROUPS)
  return {
    text: o.text.trim().slice(0, 300),
    today: o.today,
    currency: o.target.currency,
    me: o.me,
    groupId: o.target.id,
    groups: ordered.map((g) => ({
      id: g.id,
      name: g.name,
      type: g.type,
      members: Object.entries(activeMembers(g.members))
        .filter(([, m]) => m.uid !== o.uid)
        .slice(0, MAX_MEMBERS)
        .map(([id, m]) => ({ id, name: m.name })),
    })),
  }
}

/** A name from the line against the people you already share groups with: the whole name, else a first name only one of them has. */
export function matchKnown(name: string, known: KnownPerson[]): KnownPerson | undefined {
  const n = fold(name)
  if (!n) return undefined
  const full = known.filter((k) => fold(k.name) === n)
  if (full.length) return full[0]
  const first = known.filter((k) => fold(k.name).split(' ')[0] === n)
  return first.length === 1 ? first[0] : undefined
}

/** One name from the line as a group member: a known person by their full name (and email), else as typed, title-cased when typed all lower case. */
export function personFor(typed: string, known: KnownPerson[]): { name: string; email?: string } | undefined {
  const t = typed.replace(/\s+/g, ' ').trim().slice(0, 40)
  if (!t) return undefined
  const k = matchKnown(t, known)
  const name = k?.name ?? (t === t.toLowerCase() ? titleCase(t) : t)
  return k?.email ? { name, email: k.email } : { name }
}

/** The people for a new group, no repeats, at most 20. */
export function peopleFor(names: string[], known: KnownPerson[]): Array<{ name: string; email?: string }> {
  const out: Array<{ name: string; email?: string }> = []
  for (const raw of names) {
    const p = personFor(raw, known)
    if (!p || out.some((x) => fold(x.name) === fold(p.name))) continue
    out.push(p)
    if (out.length >= MAX_PREFILL_PEOPLE) break
  }
  return out
}

export type NewGroupDraft = Omit<Group, 'id' | 'createdAt' | 'updatedAt' | 'inviteCode'>

export type QuickAiPlan =
  | { kind: 'expense'; groupId: string; prefill: QuickPrefill }
  | { kind: 'create'; group: NewGroupDraft; people: string[]; prefill: QuickPrefill }
  | { kind: 'fallback' }

/**
 * The validated answer → what Quick add does. An expense in an existing group maps 'me' to your
 * member id and keeps only ids that group has. A new group is built the way GroupForm builds one
 * (you plus the named people, matched to people you know; type from the answer, else guessed from
 * the name), with ids from `makeId`, and the expense is mapped onto those ids.
 */
export function planQuickAi(
  result: QuickAiResult,
  o: {
    line: string
    groups: Group[]
    uid: string
    me: { name: string; email?: string }
    currency: string
    today: string
    known: KnownPerson[]
    makeId: () => string
  },
): QuickAiPlan {
  if (result.action === 'expense') {
    const g = o.groups.find((x) => x.id === result.group.existingId)
    const meId = g && Object.entries(g.members).find(([, m]) => m.uid === o.uid)?.[0]
    if (!g || !meId) return { kind: 'fallback' }
    const map = (p: string): MemberId | undefined => (p === 'me' ? meId : p in activeMembers(g.members) ? p : undefined)
    return { kind: 'expense', groupId: g.id, prefill: toPrefill(result.expense, o.line, map, meId) }
  }
  if (result.action === 'group_and_expense') {
    const type: GroupType = result.group.type ?? guessGroup(result.group.name)?.type ?? 'trip'
    const kind = isSharedType(type) ? type : 'trip'
    const meId = o.uid
    const members: Record<MemberId, Member> = { [meId]: { name: o.me.name, uid: o.uid, ...(o.me.email ? { email: o.me.email } : {}), color: colorFor(0) } }
    // Each name as the answer typed it ("Rahul") → its member id; two names for one known person share it.
    const byName = new Map<string, MemberId>()
    const people: string[] = []
    for (const typed of result.group.members) {
      const p = personFor(typed, o.known)
      if (!p) continue
      const same = Object.entries(members).find(([, m]) => fold(m.name) === fold(p.name))?.[0]
      const id = same ?? o.makeId()
      if (!same) {
        if (people.length >= MAX_PREFILL_PEOPLE) continue
        members[id] = { ...p, color: colorFor(people.length + 1) }
        people.push(p.name)
      }
      byName.set(fold(typed), id)
    }
    const map = (p: string): MemberId | undefined => (p === 'me' ? meId : byName.get(fold(p)))
    const info = GROUP_TYPES[kind]
    const name = result.group.name.slice(0, 60)
    const group: NewGroupDraft = {
      name,
      emoji: guessGroup(name)?.emoji ?? info.emoji,
      type: kind,
      currency: o.currency,
      simplify: true,
      members,
      memberUids: [o.uid],
      createdBy: o.uid,
      ...(info.datesToday ? { startDate: o.today, endDate: o.today } : {}),
    }
    return { kind: 'create', group, people, prefill: toPrefill(result.expense, o.line, map, meId) }
  }
  return { kind: 'fallback' }
}

function toPrefill(
  e: Extract<QuickAiResult, { expense: unknown }>['expense'],
  line: string,
  map: (p: string) => MemberId | undefined,
  meId: MemberId,
): QuickPrefill {
  const participants = [...new Set((e.participants ?? []).map(map).filter((x): x is MemberId => !!x))]
  let exact: Record<MemberId, number> | undefined
  if (e.split !== 'equal') {
    const entries = Object.entries(e.split).map(([p, v]) => [map(p), v] as const)
    if (entries.every(([id]) => !!id)) exact = Object.fromEntries(entries as Array<[MemberId, number]>)
  }
  return {
    text: line,
    description: e.description ? titleCase(e.description) : '',
    ...(e.amount !== undefined ? { amount: e.amount } : {}),
    currency: e.currency,
    payer: map(e.paidBy) ?? meId,
    ...(participants.length ? { participants } : {}),
    ...(exact ? { exact } : {}),
    ...(e.date ? { date: e.date } : {}),
  }
}

/** "Create “Goa trip” with Rahul and Priya?" — the people as one readable list. */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

// ---- "New group" from Quick add, without AI ---------------------------------------------

/** Words the grammar can leave among the "names" of a sentence ("with Rahul and Priya and add …"). */
const NOT_NAMES = new Set(['add', 'and', 'then', 'also', 'record', 'log', 'split', 'equally', 'paid', 'me', 'i', 'everyone', 'all', 'us', 'the', 'group'])
const STOP = String.raw`(?:with|and|for|paid|split|add|then|on|at|by|including|between|yesterday|today|\d)`
const CREATE_NAME = new RegExp(
  String.raw`\b(?:create|make|start|set\s*up|setup|open)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:group|grp|trip)\s+(?:called\s+|named\s+)?((?:(?!${STOP}\b)[\p{L}\p{N}'’-]+\s*){1,4})`,
  'iu',
)
const TRIP_WORDS = 'trip|getaway|holiday|vacation|weekend|wedding|party|reunion|offsite|trek'
const NAMED_TRIP = new RegExp(String.raw`(?:^|[^\p{L}])([\p{L}][\p{L}'’-]*\s+(?:${TRIP_WORDS}))(?![\p{L}])`, 'iu')
const NOT_A_NAME = /^(?:the|a|an|our|my|this|that|new|group|last|next|road|day|work|office)$/i

/** A new group's name from the line: "create a group Goa trip with …", else "Goa trip …"; '' when it names none. */
export function quickGroupName(text: string): string {
  const c = text.match(CREATE_NAME)?.[1]?.trim()
  const t =
    c ||
    (() => {
      const m = text.match(NAMED_TRIP)?.[1]
      return m && !NOT_A_NAME.test(m.split(/\s+/)[0]) ? m : ''
    })()
  const name = (t ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
  return name ? name[0].toUpperCase() + name.slice(1) : ''
}

/**
 * What Quick add's "New group" hands GroupForm: the name (from "new group Bali trip", else from the
 * line), a guessed type, and the people the line names (`unmatched`: the grammar read the line
 * against just you, so every other name is unmatched), matched to people you know.
 */
export function newGroupPrefill(o: { text: string; freshName?: string; unmatched: string[]; known: KnownPerson[] }): {
  name: string
  type?: GroupType
  people: string[]
} {
  const name = (o.freshName || quickGroupName(o.text)).trim()
  const nameWords = new Set(fold(name).split(' '))
  const names = o.unmatched.filter((n) => !NOT_NAMES.has(fold(n)) && !nameWords.has(fold(n)) && /\p{L}/u.test(n))
  const type = name ? guessGroup(name)?.type : undefined
  return { name, ...(type ? { type } : {}), people: peopleFor(names, o.known).map((p) => p.name) }
}

/** GroupForm's ?people= ("Rahul Sharma,Priya"): clean names, no repeats, at most 20. */
export function parsePeopleParam(v: string | null | undefined): string[] {
  const out: string[] = []
  for (const raw of (v ?? '').split(',')) {
    const n = raw
      .replace(/\p{Cc}+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40)
    if (n && !out.some((x) => fold(x) === fold(n))) out.push(n)
    if (out.length >= MAX_PREFILL_PEOPLE) break
  }
  return out
}
