/*
 * Quick add: "remind Rahul". A line that asks to chase someone opens Balances with just that
 * person's card, where Remind (and Nudge) is one tap away. The share sheet needs a tap of its own,
 * so Quick add can't share straight from the line. Pure: the words and the matching are here,
 * Quick add (src/hooks/useQuickRun.tsx) and Balances (src/pages/SettleAll.tsx) only wire them.
 */

import { oneOff } from './quick-group'

const fold = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’`]/g, "'")

/** Everyone who owes you, not one person. */
export const REMIND_ALL = '*'

const ALL = /^(?:every(?:one|body)|all(?: of them)?|them all|people|the others)$/
const NOT_PEOPLE = /^(?:me|us|myself|ourselves|you)$/

// The verb and who comes after it. The tail ("to pay", "about the 500 for dinner", "for Goa") is dropped.
const ASKS: RegExp[] = [
  /^(?:(?:can you|could you|please|pls|hey)\s+)*(?:remind|chase|nudge|ping)\s+(.+)$/,
  /^(?:(?:can you|could you|please|pls)\s+)*send\s+(?:a\s+)?reminders?\s+to\s+(.+)$/,
  /^(?:(?:can you|could you|please|pls)\s+)*send\s+(.+?)\s+an?\s+reminders?\b.*$/,
  /^(?:(?:can you|could you|please|pls)\s+)*ask\s+(.+?)\s+to\s+(?:pay|settle|send)\b.*$/,
]
const TAIL = /\s+(?:to|about|for|that|who|which|of|re|regarding|on|in|again|now|today|please|pls|he|she|they)\b.*$/

/**
 * The people a line asks to remind, as said ("Rahul", "Priya S"), [REMIND_ALL] for everyone, or
 * null when the line isn't asking to remind anyone. "Remind me to pay rent" is not one: a
 * reminder to yourself isn't something Split Now does.
 */
export function remindAsk(text: string): string[] | null {
  const t = fold(text)
    .trim()
    .replace(/[.!?]+$/, '')
  for (const re of ASKS) {
    const m = t.match(re)
    if (!m) continue
    const who = m[1].replace(TAIL, '').trim()
    const names = who
      .split(/\s*,\s*|\s+(?:and|&)\s+/)
      .map((n) => n.replace(/^(?:to|the)\s+/, '').trim())
      .filter(Boolean)
    if (!names.length || names.some((n) => NOT_PEOPLE.test(n))) return null
    if (names.some((n) => ALL.test(n))) return [REMIND_ALL]
    // A name is a word or two; anything longer is a sentence about something else.
    if (names.some((n) => n.split(/\s+/).length > 2 || /\d/.test(n))) return null
    return names
  }
  return null
}

export interface RemindPerson {
  key: string
  name: string
  /** > 0: they owe you overall */
  net: number
}

export interface RemindMatch {
  /** the people to show: everyone named who owes you */
  keys: string[]
  /** said, and in your groups, but nobody by that name owes you */
  square: string[]
  /** said, and nobody in your groups has the name */
  unknown: string[]
}

/** Does `said` ("rahul", "rahul s", "raul") name this person? Full name, first name, or one letter off (speech). */
function names(said: string, full: string): boolean {
  const s = fold(said).split(/\s+/)
  const f = fold(full).split(/\s+/)
  if (s.join(' ') === f.join(' ')) return true
  const word = (a: string, b: string) => a === b || (a.length >= 4 && oneOff(a, b))
  if (!word(s[0], f[0])) return false
  // "Rahul S" / "Rahul Sharma": the second word must fit the surname too.
  return s.length === 1 || (!!f[1] && (f[1].startsWith(s[1]) || word(s[1], f[1])))
}

/**
 * Who on Balances the asked names are. `people` are the person rows (src/lib/settleAll.ts
 * personBalances), `everyone` the names of all members of your groups, so a name nobody owes you
 * for ("Priya", settled) tells apart from one nobody has ("Kabir").
 */
export function remindMatches(asked: string[], people: RemindPerson[], everyone: string[]): RemindMatch {
  if (asked.includes(REMIND_ALL)) return { keys: people.filter((p) => p.net > 0).map((p) => p.key), square: [], unknown: [] }
  const keys: string[] = []
  const square: string[] = []
  const unknown: string[] = []
  for (const a of asked) {
    const hit = people.filter((p) => names(a, p.name))
    const owing = hit.filter((p) => p.net > 0)
    for (const p of owing) if (!keys.includes(p.key)) keys.push(p.key)
    if (owing.length) continue
    if (hit.length || everyone.some((n) => names(a, n))) square.push(a)
    else unknown.push(a)
  }
  return { keys, square, unknown }
}

const cap = (s: string) => s.replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase())
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)

/** The line above the cards: what was found, and what wasn't. */
export function remindNote(m: RemindMatch): string[] {
  const out: string[] = []
  if (m.square.length) out.push(`${list(m.square.map(cap))} ${m.square.length === 1 ? 'doesn’t' : 'don’t'} owe you anything right now.`)
  if (m.unknown.length) out.push(`No one called ${list(m.unknown.map(cap))} is in your groups.`)
  return out
}
