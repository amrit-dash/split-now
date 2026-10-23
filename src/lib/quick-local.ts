/*
 * Quick add on the phone, every decision in one place (src/hooks/useQuickRun.tsx carries them out):
 * which group the line goes to (the one you're in, else the people it names pick it), whether it's
 * a cost, a payment back or an open item, who paid, and whether anything needs the person (which
 * group, who paid) or AI (what the phone couldn't read for certain). Nothing is guessed: what the
 * phone can't settle is either asked or handed to AI. Pure; tested against src/lib/quick-cases.ts.
 */
import type { Group, Member, MemberId } from '@/types'
import { colorFor } from './colors'
import { activeMembers, formerMemberMatch } from './members'
import { type NlParse, parseNlExpense } from './nl-expense'
import { isOpenItemLine } from './open-item-line'
import { allNames, peopleGroup } from './quick-people'
import { type QuickRouteWhy, quickRoute } from './quick-route'
import { titleCase } from './text'
import { addPlan } from './vault-api'

export type QuickLocal =
  | { kind: 'expense'; groupId: string; parse: NlParse }
  | { kind: 'payment'; groupId: string; from: MemberId; to: MemberId; amount?: number }
  | { kind: 'openItem'; groupId: string }
  /** several groups fit as well as each other: the person picks */
  | { kind: 'askGroup'; groupIds: string[] }
  /** "he paid" with two people named: the person picks who */
  | { kind: 'askPayer'; groupId: string; choices: MemberId[]; parse: NlParse }
  /** a name two members share ("Rahul" with Rahul Sharma and Rahul Verma): which one; read as `ids[0]` until answered */
  | { kind: 'askWho'; groupId: string; token: string; ids: MemberId[]; parse: NlParse }
  /** names nobody in the group has, in a group the person is sure of: add them, or leave them out */
  | { kind: 'askUnknown'; groupId: string; names: string[]; parse: NlParse }
  /** no group has the people named: a new group with them (a 1:1 for one) */
  | { kind: 'newGroup'; names: string[] }
  /** the phone couldn't read it for certain: AI, when allowed (else the reading as it is, checked in the form) */
  | { kind: 'ai'; why: QuickRouteWhy; groupId: string; parse: NlParse }

export function quickLocal(o: {
  line: string
  groups: Group[]
  uid: string
  /** the group the person is in or picked (sure), else the default guess */
  groupId: string
  sure: boolean
  today?: string
  openItems?: boolean
}): QuickLocal {
  let groupId = o.groupId
  if (!o.sure) {
    const pg = peopleGroup(o.line, o.groups, o.uid, o.today)
    if (pg.kind === 'several') return { kind: 'askGroup', groupIds: pg.groupIds }
    if (pg.kind === 'none') return { kind: 'newGroup', names: pg.names }
    if (pg.kind === 'one') groupId = pg.groupId
  }
  const g = o.groups.find((x) => x.id === groupId)
  if (!g) return { kind: 'newGroup', names: [] }
  if (o.openItems && g.type !== 'personal' && isOpenItemLine(o.line)) return { kind: 'openItem', groupId }
  const members = activeMembers(g.members)
  const me = Object.entries(members).find(([, m]) => m.uid === o.uid)?.[0] ?? Object.keys(members)[0]
  const parse = parseNlExpense(o.line, {
    members: Object.entries(members).map(([id, m]) => ({ id, name: m.name })),
    me,
    currency: g.currency,
    today: o.today,
    knownNames: allNames(o.groups),
  })
  return quickNext(o.line, groupId, parse)
}

/**
 * What a reading needs next. Run again after each answer (swapPerson, leaveOut, withPayer), so one
 * line can ask "Which Rahul?" and then "Who paid?" before it opens the form.
 */
export function quickNext(line: string, groupId: string, parse: NlParse): QuickLocal {
  // Same names first: the answer changes who paid and who shares it, which everything below reads.
  const same = parse.ambiguous?.[0]
  if (same) return { kind: 'askWho', groupId, token: same.token, ids: same.ids, parse }
  const route = quickRoute(line, parse, { kind: 'none' }, true)
  // Someone the group doesn't have: only the person knows whether they belong in it (AI can't).
  const names = parse.unmatched.filter((n) => n !== 'the parts')
  if (route.route === 'ai' && route.why === 'unknown_people' && names.length) return { kind: 'askUnknown', groupId, names, parse }
  if (route.route === 'ai') return { kind: 'ai', why: route.why, groupId, parse }
  if (parse.payment)
    return { kind: 'payment', groupId, from: parse.payment.from, to: parse.payment.to, ...(parse.amount !== undefined ? { amount: parse.amount } : {}) }
  if (parse.payerChoices?.length) return { kind: 'askPayer', groupId, choices: parse.payerChoices, parse }
  return { kind: 'expense', groupId, parse }
}

/** The person's answer to "Which Rahul?": everywhere the reading had `from`, it now has `to`. */
export function swapPerson(p: NlParse, from: MemberId, to: MemberId): NlParse {
  if (from === to) return { ...p, ambiguous: p.ambiguous?.slice(1) }
  const sw = (id: MemberId) => (id === from ? to : id)
  return {
    ...p,
    payer: sw(p.payer),
    ...(p.participants ? { participants: [...new Set(p.participants.map(sw))] } : {}),
    ...(p.exact ? { exact: Object.fromEntries(Object.entries(p.exact).map(([id, v]) => [sw(id), v])) } : {}),
    ...(p.payment ? { payment: { from: sw(p.payment.from), to: sw(p.payment.to) } } : {}),
    ...(p.payerChoices ? { payerChoices: p.payerChoices.map(sw) } : {}),
    ambiguous: p.ambiguous?.slice(1),
  }
}

/** "Leave them out": the names stay out of the reading, which then goes on as if they were never said. */
export function leaveOut(p: NlParse): NlParse {
  return { ...p, unmatched: p.unmatched.filter((n) => n === 'the parts') }
}

/** "Who paid?" answered. */
export function withPayer(p: NlParse, payer: MemberId): NlParse {
  return { ...p, payer, payerExplicit: true, payerChoices: undefined, payerUnclear: undefined }
}

/**
 * May Quick add put new people in this group for the person? Not a 1:1 or Personal (they have a
 * fixed number of people), and only where Members would add them straight away: a private group,
 * or one whose new people need its creator's OK, sends anyone else to Members (src/lib/vault-api.ts).
 */
export function canAddPeople(g: Pick<Group, 'type' | 'vault' | 'approveJoins' | 'createdBy'>, uid: string): boolean {
  if (g.type === 'personal' || g.type === 'direct' || g.vault) return false
  return addPlan(g, g.createdBy === uid) === 'placeholder'
}

/** The entries "Add Kabir to Goa Trip" writes: someone who left comes back into their old entry, so their history joins up. */
export function newMembersFor(g: Pick<Group, 'members'>, names: string[], makeId: () => string): Record<MemberId, Member> {
  const out: Record<MemberId, Member> = {}
  let n = Object.keys(g.members).length
  for (const raw of names) {
    const name = titleCase(raw.trim())
    if (!name) continue
    const id = formerMemberMatch(g.members, { name }) ?? makeId()
    out[id] = { name, color: colorFor(n++) }
  }
  return out
}
