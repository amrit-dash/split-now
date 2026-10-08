import type { Group } from '@/types'

/** Someone you share a group with (only your own groups: there's no global directory). */
export interface KnownPerson {
  name: string
  email?: string
  uid?: string
  n: number
}

/** Members of the given groups except you, merged by uid, else by name; in first-seen order, `n` = groups shared. */
function collect(groups: Group[], me: string): KnownPerson[] {
  const byKey = new Map<string, KnownPerson>()
  for (const g of groups) {
    for (const m of Object.values(g.members)) {
      if (m.uid === me || !m.name.trim()) continue
      const nameKey = `n:${m.name.trim().toLowerCase()}`
      const hit = (m.uid && byKey.get(`u:${m.uid}`)) || byKey.get(nameKey)
      if (hit) {
        hit.n++
        hit.email ??= m.email
        if (m.uid && !hit.uid) {
          hit.uid = m.uid
          byKey.set(`u:${m.uid}`, hit)
        }
      } else {
        const e: KnownPerson = { name: m.name.trim(), email: m.email, uid: m.uid, n: 1 }
        byKey.set(nameKey, e)
        if (m.uid) byKey.set(`u:${m.uid}`, e)
      }
    }
  }
  return [...new Set(byKey.values())]
}

const sharedGroups = (groups: Group[], skipId?: string) => groups.filter((g) => g.id !== skipId && g.type !== 'personal')

/** Everyone from all your groups and 1:1s, most frequent first. */
export function knownPeople(groups: Group[], me: string, skipId?: string): KnownPerson[] {
  return collect(sharedGroups(groups, skipId), me).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
}

/** People from your most recently active groups and 1:1s, most recent group first (quick-add pills). */
export function recentPeople(groups: Group[], me: string, skipId?: string, maxGroups = 4): KnownPerson[] {
  return collect([...sharedGroups(groups, skipId)].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, maxGroups), me)
}

/** Name or email matches, case-insensitive; name starts first, then word starts, then anywhere. */
export function searchPeople(people: KnownPerson[], query: string, max = 8): KnownPerson[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const rank = (p: KnownPerson) => {
    const n = p.name.toLowerCase()
    if (n.startsWith(q)) return 0
    if (n.split(/\s+/).some((w) => w.startsWith(q))) return 1
    if (n.includes(q)) return 2
    return p.email?.toLowerCase().includes(q) ? 3 : -1
  }
  return people
    .map((p) => [rank(p), p] as const)
    .filter(([r]) => r >= 0)
    .sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name))
    .slice(0, max)
    .map(([, p]) => p)
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim())

/** A display name for someone added by email only: "riya.sharma@x.com" → "Riya Sharma". */
export function nameFromEmail(email: string): string {
  const local = email.trim().split('@')[0]
  const words = local.split(/[._+-]+/).filter((w) => /[a-z]/i.test(w))
  return words.length ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') : local
}
