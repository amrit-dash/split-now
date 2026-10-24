/*
 * Quick add outside a group (Home, holding + elsewhere): the people a line names choose its group,
 * on the phone, before any AI. The line is read against each group's members (src/lib/nl-expense.ts);
 * a group fits when every person the line names is in it. The smallest fit wins (a 1:1 for one
 * person), several of the same size are asked about, and none means a new group with them. Pure.
 */
import type { Group, MemberId } from '@/types'
import { activeMembers } from './members'
import { type NlParse, parseNlExpense } from './nl-expense'
import { oneOff } from './quick-group'

export type PeopleGroup =
  /** the line names nobody: the default group stands */
  | { kind: 'nobody' }
  /** exactly one smallest group has everyone named */
  | { kind: 'one'; groupId: string }
  /** several groups of the same size have everyone: ask which, best first */
  | { kind: 'several'; groupIds: string[] }
  /** no group has them all: offer a new group with these names (a 1:1 for one) */
  | { kind: 'none'; names: string[] }

/** Who the reading names besides you: payer, sharers, parts, a payment's other side. */
export function namedIn(p: NlParse, me: MemberId): MemberId[] {
  const ids = [
    p.payerExplicit ? p.payer : undefined,
    ...(p.participants ?? []),
    ...Object.keys(p.exact ?? {}),
    p.payment?.from,
    p.payment?.to,
    ...(p.payerChoices ?? []),
  ]
  return [...new Set(ids.filter((x): x is MemberId => !!x && x !== me))]
}

export function peopleGroup(line: string, groups: Group[], uid: string, today?: string): PeopleGroup {
  const fits: Array<{ id: string; size: number; named: number }> = []
  let fewestMisses: { misses: string[]; named: number } | null = null
  let namesAnything = false
  const knownNames = allNames(groups)
  for (const g of groups) {
    const members = activeMembers(g.members)
    const me = Object.entries(members).find(([, m]) => m.uid === uid)?.[0]
    if (!me) continue
    const p = parseNlExpense(line, { members: Object.entries(members).map(([id, m]) => ({ id, name: m.name })), me, currency: g.currency, today, knownNames })
    const named = namedIn(p, me).length
    if (named || p.unmatched.length) namesAnything = true
    if (named && !p.unmatched.length) fits.push({ id: g.id, size: Object.keys(members).length, named })
    else if (p.unmatched.length && (!fewestMisses || p.unmatched.length < fewestMisses.misses.length)) fewestMisses = { misses: p.unmatched, named }
  }
  if (!namesAnything) return { kind: 'nobody' }
  if (!fits.length) return { kind: 'none', names: fewestMisses?.misses ?? [] }
  const smallest = Math.min(...fits.map((f) => f.size))
  const best = fits.filter((f) => f.size === smallest)
  return best.length === 1 ? { kind: 'one', groupId: best[0].id } : { kind: 'several', groupIds: best.map((f) => f.id) }
}

/** Every member name across the person's groups, so a full name from one group never reads as a namesake in another. */
export function allNames(groups: Group[]): string[] {
  return [...new Set(groups.flatMap((g) => Object.values(activeMembers(g.members)).map((m) => m.name)))]
}

/**
 * The groups to offer when the phone can't tell where a line goes ("Which group?"): any whose name
 * the line seems to say first (a word of it, cut short or one letter off, as speech mishears it),
 * then the most recently active. At most `n`.
 */
export function quickGroupChoices<G extends Pick<Group, 'id' | 'name' | 'updatedAt'>>(groups: G[], line: string, n: number): G[] {
  const fold = (x: string) => x.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  const said = fold(line).match(/\p{L}{3,}/gu) ?? []
  const hits = (g: G) =>
    fold(g.name)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 3 && said.some((t) => t === w || (t.length >= 4 && w.startsWith(t)) || oneOff(t, w))).length
  return [...groups].sort((a, b) => hits(b) - hits(a) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0)).slice(0, n)
}
