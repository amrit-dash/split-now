/**
 * How people are named inside a group: by first name, as friends would. Two people who share a
 * first name get a last initial ("Rahul S." and "Rahul K."); if the initials clash too, both get
 * their full name. Someone without a last name keeps just the first name ("Rahul" next to
 * "Rahul K."), and two people with the same single name both stay "Rahul": there is nothing else
 * to tell them apart by. Full names stay where you check who someone is (Members, Edit group,
 * the CSV export). Shared by the app and the functions (pushes, activity lines). Pure.
 */

type Named = { name?: string }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Words of a name; an email-like name ("priya.s@gmail.com") counts as its local part. */
function words(name: string | undefined): string[] {
  const s = (name ?? '').trim()
  const base = s.includes('@') && !/\s/.test(s) ? s.split('@')[0] : s
  return base.split(/\s+/).filter(Boolean)
}

/** "K." from "Kumar" (first letter of the last word that has one). */
function lastInitial(ws: string[]): string | undefined {
  if (ws.length < 2) return undefined
  const ch = ws[ws.length - 1].match(/\p{L}|\p{N}/u)?.[0]
  return ch ? `${ch.toUpperCase()}.` : undefined
}

/** A person's first name (the local part of an email-like name), or "?" for a blank one. */
export function firstNameOf(name: string | undefined): string {
  return words(name ?? '')[0] ?? (name?.trim() || '?')
}

/**
 * Short labels for a set of people (a group's members, or everyone on a screen that spans
 * groups): see the rule above. `me` is labelled "You" and never causes a clash.
 */
export function shortNames(people: Record<string, Named | undefined>, me?: string): Record<string, string> {
  const ids = Object.keys(people)
  const others = ids.filter((id) => id !== me)
  const ws = Object.fromEntries(others.map((id) => [id, words(people[id]?.name ?? '')]))
  const first = (id: string) => ws[id][0] ?? (people[id]?.name?.trim() || '?')
  const out: Record<string, string> = {}
  const byFirst = new Map<string, string[]>()
  for (const id of others) {
    const k = fold(first(id))
    byFirst.set(k, [...(byFirst.get(k) ?? []), id])
  }
  for (const group of byFirst.values()) {
    if (group.length === 1) {
      out[group[0]] = first(group[0])
      continue
    }
    const label = (id: string) => {
      const i = lastInitial(ws[id])
      return i ? `${first(id)} ${i}` : first(id)
    }
    const counts = new Map<string, number>()
    for (const id of group) counts.set(fold(label(id)), (counts.get(fold(label(id))) ?? 0) + 1)
    for (const id of group) {
      const l = label(id)
      // Only a last initial that clashes falls back to the full name; a lone "Rahul" stays "Rahul".
      out[id] = counts.get(fold(l))! > 1 && l !== first(id) ? people[id]?.name?.trim() || first(id) : l
    }
  }
  if (me !== undefined && me in people) out[me] = 'You'
  return out
}

// One computation per members map and viewer: screens ask for many labels from the same group.
const cache = new WeakMap<object, Map<string, Record<string, string>>>()

/**
 * Every member's label in this group. With `me` (the viewer's member id) that member is "You"
 * and never causes a clash: to Rahul Sharma, Rahul Kumar is just "Rahul". Without it (text
 * everyone in the group reads, like activity lines) all members count.
 */
export function memberLabels(members: Record<string, Named | undefined>, me?: string): Record<string, string> {
  const byMe = cache.get(members) ?? new Map<string, Record<string, string>>()
  const hit = byMe.get(me ?? '')
  if (hit) return hit
  const labels = shortNames(members, me)
  byMe.set(me ?? '', labels)
  cache.set(members, byMe)
  return labels
}

/** One member's label; `fallback` for someone who isn't in the members map. */
export function labelOf(members: Record<string, Named | undefined> | undefined, id: string | undefined, fallback = 'Someone', me?: string): string {
  if (!members || !id || !members[id]) return fallback
  return memberLabels(members, me)[id] ?? fallback
}

/**
 * The member id of account `uid` (one still in the group first). An account merged into another
 * (functions/src/lib/move-uid.ts) is found through the entry's `formerUids`, so expenses and
 * messages written under the old account still show the right person.
 */
export function memberIdOfUid(
  members: Record<string, { uid?: string; removedAt?: unknown; formerUids?: string[] }> | undefined,
  uid: string | undefined,
): string | undefined {
  if (!members || !uid) return undefined
  const all = Object.entries(members).filter(([, m]) => m.uid === uid)
  const now = (all.find(([, m]) => m.removedAt === undefined) ?? all[0])?.[0]
  return now ?? Object.entries(members).find(([, m]) => Array.isArray(m.formerUids) && m.formerUids.includes(uid))?.[0]
}

/** The label of the member whose account is `uid`. */
export function labelForUid(
  members: Record<string, Named & { uid?: string; removedAt?: unknown; formerUids?: string[] }> | undefined,
  uid: string | undefined,
  me?: string,
): string | undefined {
  const id = memberIdOfUid(members, uid)
  return id && members ? memberLabels(members, me)[id] : undefined
}

/**
 * A 1:1's other person, for the account `uid`: the member who isn't them (someone still in it
 * before someone who left). undefined when `uid` isn't in it, or there's nobody else.
 */
export function directPeer(
  members: Record<string, Named & { uid?: string; removedAt?: unknown; formerUids?: string[] }> | undefined,
  uid: string | undefined,
): string | undefined {
  if (!members) return undefined
  const mine = memberIdOfUid(members, uid)
  if (!mine) return undefined
  const others = Object.keys(members).filter((id) => id !== mine && !(uid && members[id].uid === uid))
  return others.find((id) => members[id].removedAt === undefined) ?? others[0]
}

/**
 * What a group is called for the person looking at it: a 1:1 is the other person's name (Rahul
 * sees "Priya", Priya sees "Rahul"), whatever was typed when it was made; any other group keeps
 * its own name.
 */
export function groupNameFor(
  g: { type?: string; name: string; members?: Record<string, Named & { uid?: string; removedAt?: unknown; formerUids?: string[] }> },
  uid: string | undefined,
): string {
  if (g.type !== 'direct') return g.name
  const peer = directPeer(g.members, uid)
  return (peer && g.members?.[peer]?.name?.trim()) || g.name
}

/**
 * What a 1:1's invite calls it, for the friend who opens it: the person already in it with an
 * account (who shares the invite), not the friend's own name. Any other group: its name.
 */
export function inviteNameFor(g: {
  type?: string
  name: string
  createdBy?: string
  members?: Record<string, Named & { uid?: string; removedAt?: unknown }>
}): string {
  if (g.type !== 'direct') return g.name
  const joined = Object.values(g.members ?? {}).filter((m) => m.uid && m.removedAt === undefined)
  const host = joined.find((m) => m.uid === g.createdBy) ?? joined[0]
  return host?.name?.trim() || g.name
}

/**
 * A notification's group name for the person getting it: a 1:1 is the other person to each of
 * them (groupNameFor); `fallback` when the group isn't known.
 */
export function groupNameForRecipient(
  g: { type?: string; name?: string; members?: Record<string, Named & { uid?: string; removedAt?: unknown; formerUids?: string[] }> } | undefined,
  uid: string,
  fallback = 'Group',
): string {
  if (!g) return fallback
  return groupNameFor({ type: g.type, name: g.name ?? fallback, members: g.members }, uid)
}
