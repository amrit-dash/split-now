import type { Member, MemberId } from '@/types'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Words of a name; an email-like name ("priya.s@gmail.com") counts as its local part. */
function words(name: string): string[] {
  const s = name.trim()
  const base = s.includes('@') && !/\s/.test(s) ? s.split('@')[0] : s
  return base.split(/\s+/).filter(Boolean)
}

/** "K." from "Kumar" (first letter of the last word that has one). */
function lastInitial(ws: string[]): string | undefined {
  if (ws.length < 2) return undefined
  const ch = ws[ws.length - 1].match(/\p{L}|\p{N}/u)?.[0]
  return ch ? `${ch.toUpperCase()}.` : undefined
}

/**
 * Short labels for members: their first name, "Rahul S." / "Rahul K." when two share a first
 * name, the full name when even that is ambiguous. `me` is labelled "You" (and so never clashes).
 */
export function shortNames(members: Record<MemberId, Pick<Member, 'name'>>, me?: MemberId): Record<MemberId, string> {
  const ids = Object.keys(members)
  const others = ids.filter((id) => id !== me)
  const ws = Object.fromEntries(others.map((id) => [id, words(members[id]?.name ?? '')]))
  const first = (id: MemberId) => ws[id][0] ?? (members[id]?.name.trim() || '?')
  const out: Record<MemberId, string> = {}
  const byFirst = new Map<string, MemberId[]>()
  for (const id of others) {
    const k = fold(first(id))
    byFirst.set(k, [...(byFirst.get(k) ?? []), id])
  }
  for (const group of byFirst.values()) {
    if (group.length === 1) { out[group[0]] = first(group[0]); continue }
    const label = (id: MemberId) => { const i = lastInitial(ws[id]); return i ? `${first(id)} ${i}` : first(id) }
    const counts = new Map<string, number>()
    for (const id of group) counts.set(fold(label(id)), (counts.get(fold(label(id))) ?? 0) + 1)
    for (const id of group) out[id] = counts.get(fold(label(id)))! > 1 ? members[id].name.trim() || first(id) : label(id)
  }
  if (me !== undefined && me in members) out[me] = 'You'
  return out
}
