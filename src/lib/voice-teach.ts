/*
 * Teaching hold + to talk: a speech bubble that rises from + (src/components/PlusButton.tsx).
 * Once after the update: "Press and hold + to talk". Then, until the account has tried it
 * (users/{uid}.voiceTried, set the first time someone holds + for voice, on any device), a "Did
 * you know?" bubble every 3rd to 5th visit, with different words each time. Never once tried.
 * A visit is one start of the app. The counters are per device (localStorage); whether it was
 * tried is per account. Pure, so the schedule is tested.
 */

export interface TeachState {
  /** the first bubble ("Press and hold + to talk") was shown on this device */
  intro: boolean
  /** app starts counted on this device */
  visits: number
  /** the visit the next "Did you know?" bubble shows on (0 = not scheduled yet) */
  nextAt: number
  /** how many tips have been shown, so the next uses different words */
  tip: number
}

export const TEACH_START: TeachState = { intro: false, visits: 0, nextAt: 0, tip: 0 }

export const INTRO = { title: 'New', text: 'Press and hold + to talk' }

/** The "Did you know?" bubbles, in turn: each ends by asking to try it now. */
export const TIPS = [
  'You can say an expense instead of typing it. Try it now: press and hold +.',
  'Hold + and say “Dinner 1200 with Rahul, I paid”. Try it now: press and hold +.',
  'Talking is quicker than typing: “Cab 350, split with Priya”. Try it now: press and hold +.',
  'Hold +, say what you paid and who was there, then let go. Try it now: press and hold +.',
  'Your phone does the listening, free. Try it now: press and hold +.',
] as const

/** 3, 4 or 5 visits until the next tip, from a number in 0..1. */
export const gapFrom = (r: number): number => 3 + Math.min(2, Math.max(0, Math.floor(r * 3)))

export type TeachBubble = { kind: 'intro'; title: string; text: string } | { kind: 'tip'; title: string; text: string }

/** Which bubble to show on this visit, if any. */
export function teachNow(o: { state: TeachState; tried: boolean; voice: boolean }): TeachBubble | null {
  if (!o.voice || o.tried) return null
  if (!o.state.intro) return { kind: 'intro', ...INTRO }
  if (o.state.nextAt > 0 && o.state.visits >= o.state.nextAt) return { kind: 'tip', title: 'Did you know?', text: TIPS[o.state.tip % TIPS.length] }
  return null
}

/** One more start of the app. */
export const teachVisit = (s: TeachState): TeachState => ({ ...s, visits: s.visits + 1 })

/** A bubble was shown (or closed): the next tip is 3 to 5 visits away. */
export function teachShown(s: TeachState, kind: TeachBubble['kind'], r: number): TeachState {
  const next = { ...s, nextAt: s.visits + gapFrom(r) }
  return kind === 'intro' ? { ...next, intro: true } : { ...next, tip: s.tip + 1 }
}

/** A stored state, or the start when it is missing or not one. */
export function resolveTeach(raw: unknown): TeachState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const n = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0)
  return { intro: r.intro === true, visits: n(r.visits), nextAt: n(r.nextAt), tip: n(r.tip) }
}
