/**
 * Home screen greeting: a time-of-day salutation in the user's local time, their first name,
 * and a short subline that changes once a day (deterministic, so it doesn't flicker on every
 * render) and mentions real state when there is some.
 */
import type { Cents, Debt, Member, MemberId } from '@/types'

export type DayPart = 'earlyMorning' | 'morning' | 'afternoon' | 'evening' | 'lateNight'

/** 5–7 early morning, 8–11 morning, 12–16 afternoon, 17–21 evening, 22–4 late night. */
export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 8) return 'earlyMorning'
  if (hour >= 8 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'lateNight'
}

export const SALUTATIONS: Record<DayPart, { text: string; emoji: string }> = {
  earlyMorning: { text: 'Rise and shine', emoji: '🌅' },
  morning: { text: 'Good morning', emoji: '☀️' },
  afternoon: { text: 'Good afternoon', emoji: '🌤️' },
  evening: { text: 'Good evening', emoji: '🌆' },
  lateNight: { text: 'Up late', emoji: '🌙' },
}

/** First word of the display name ("Amrit Singh" → "Amrit"; an email → its local part). */
export function firstName(displayName: string | undefined): string {
  const s = (displayName ?? '').trim()
  if (!s) return 'there'
  const base = s.includes('@') && !s.includes(' ') ? s.split('@')[0] : s
  return base.split(/\s+/)[0] || 'there'
}

/** Days since 1970-01-01 for the local calendar date of `d` (changes at local midnight). */
export function localDayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
}

/** What the subline can talk about. Amounts are pre-formatted so this stays locale-free. */
export interface GreetingState {
  /** shared groups whose trip window contains today */
  liveTrips?: Array<{ name: string; emoji: string }>
  /** captured payments waiting in the inbox */
  inbox?: number
  /** expenses waiting for the user's approval */
  needsOk?: number
  /** the person who owes the user the most (home currency) */
  owedBy?: { name: string; amount: string }
  /** the person the user owes the most (home currency) */
  owes?: { name: string; amount: string }
  /** has shared groups with activity and every balance is zero */
  settled?: boolean
}

export const GENERIC_LINES = [
  'Splitting bills, not friendships 🤝',
  'Every split, sorted 🧮',
  'Add it now, thank yourself later 🧾',
  'Chai’s on whoever’s owed the most ☕',
  'Fair shares make good friends 💜',
  'Snap a bill, split it in seconds 📸',
  'Small sums add up. Keep them honest 🪙',
]

/** Lines about the user's real state, most useful first. */
export function stateLines(s: GreetingState): string[] {
  const out: string[] = []
  const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`
  if (s.inbox) out.push(`${plural(s.inbox, 'payment')} to sort in your inbox 📥`)
  if (s.needsOk) out.push(`${plural(s.needsOk, 'expense')} waiting for your OK 👀`)
  for (const t of s.liveTrips ?? []) out.push(`${t.name} is live today ${t.emoji || '🧳'}`)
  if (s.owedBy) out.push(`${s.owedBy.name} owes you ${s.owedBy.amount} 💸`)
  if (s.owes) out.push(`You owe ${s.owes.name} ${s.owes.amount}. Settle up when you can 🙏`)
  if (s.settled) out.push('You’re all settled up ✨')
  return out
}

/** Pick one subline for the day: from the state lines when there are any, else a generic one. */
export function pickSubline(s: GreetingState, date: Date): string {
  const day = localDayNumber(date)
  const lines = stateLines(s)
  const pool = lines.length ? lines : GENERIC_LINES
  return pool[((day % pool.length) + pool.length) % pool.length]
}

export interface Greeting {
  salutation: string
  emoji: string
  name: string
  subline: string
}

export function greeting(displayName: string | undefined, s: GreetingState, now = new Date()): Greeting {
  const { text, emoji } = SALUTATIONS[dayPart(now.getHours())]
  return { salutation: text, emoji, name: firstName(displayName), subline: pickSubline(s, now) }
}

/** Minimal group shape needed to find who owes whom across groups. */
export interface DebtGroup {
  currency: string
  type?: string
  me?: MemberId
  members: Record<MemberId, Pick<Member, 'name' | 'uid'>>
  debts: Debt[]
}

/**
 * Largest per-person balances with the user in one currency, summed across groups (a person is
 * matched by uid when they have an account, else by name within the group).
 */
export function topCounterparties(groups: DebtGroup[], currency: string): { owedBy?: { name: string; amount: Cents }; owes?: { name: string; amount: Cents } } {
  const bal = new Map<string, { name: string; amount: Cents }>()
  for (const g of groups) {
    if (!g.me || g.currency !== currency || g.type === 'personal') continue
    for (const d of g.debts) {
      const other: MemberId | undefined = d.to === g.me ? d.from : d.from === g.me ? d.to : undefined
      if (!other || other === g.me) continue
      const m = g.members[other]
      if (!m) continue
      const key = m.uid ?? `${m.name}`
      const cur = bal.get(key) ?? { name: m.name, amount: 0 }
      cur.amount += d.to === g.me ? d.amount : -d.amount
      bal.set(key, cur)
    }
  }
  let owedBy: { name: string; amount: Cents } | undefined
  let owes: { name: string; amount: Cents } | undefined
  for (const v of bal.values()) {
    if (v.amount > 0 && (!owedBy || v.amount > owedBy.amount)) owedBy = { name: firstName(v.name), amount: v.amount }
    if (v.amount < 0 && (!owes || -v.amount > owes.amount)) owes = { name: firstName(v.name), amount: -v.amount }
  }
  return { owedBy, owes }
}
