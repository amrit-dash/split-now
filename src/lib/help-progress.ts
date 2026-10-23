/*
 * How much of Help someone has finished (owner, 22 Oct 2026). A section is done when its steps
 * have played to the last one, or its text was scrolled to the end; done ids are kept on the
 * account (users/{uid}/settings/help) so every device shows the same ring. The ring counts the
 * sections this person's mode shows, so Simple's shorter guide reaches 100% on its own: that
 * earns Pro either way (not advertised). Ids of sections that no longer exist are kept but not
 * counted, and a section added later lowers the percentage for people who haven't read it; Pro,
 * once earned, stays. Pure.
 */

export interface HelpProgress {
  done: string[]
}

export const EMPTY_HELP_PROGRESS: HelpProgress = { done: [] }

/** The rules cap the stored list; there are fewer sections than this. */
export const MAX_DONE = 200

export function parseHelpProgress(raw: unknown): HelpProgress {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const done = Array.isArray(r.done) ? [...new Set(r.done.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 80))] : []
  return { done: done.slice(-MAX_DONE) }
}

/** The list with this section added (the same list when it's already there, so callers can skip the write). */
export function withDone(p: HelpProgress, id: string): HelpProgress {
  return p.done.includes(id) ? p : { done: [...p.done, id].slice(-MAX_DONE) }
}

/** Done, out of the sections this person's guide shows, and the whole percentage (rounded down, so 100 means all). */
export function helpProgress(p: HelpProgress, shown: readonly string[]): { done: number; total: number; pct: number } {
  const have = new Set(p.done)
  const done = shown.filter((id) => have.has(id)).length
  const total = shown.length
  return { done, total, pct: total ? Math.floor((done * 100) / total) : 0 }
}

export const earnsPro = (pct: number): boolean => pct >= 100

/** A section with steps is done when the last step has been shown; one without, when its end was seen. */
export function sectionFinished(s: { steps: number; step: number; scrolledToEnd: boolean }): boolean {
  return s.steps > 0 ? s.step >= s.steps - 1 : s.scrolledToEnd
}

/**
 * The banner at 100% (owner, 22 Oct 2026): 'claim' offers the Pro badge to someone who finished
 * the guide and hasn't got it; 'claimed' thanks them for the rest of this visit after claiming;
 * someone already Pro gets only the ring's tick, never a second banner.
 */
export function celebration(pct: number, earned: boolean, claimedNow: boolean): 'claim' | 'claimed' | null {
  if (claimedNow) return 'claimed'
  return earnsPro(pct) && !earned ? 'claim' : null
}

/*
 * Against speed-running the guide for Pro (owner, 22 Oct 2026; Help → Earn Pro says so): a section also
 * needs the person to have stayed on it a while, a random 5 to 7.5 s drawn per visit (so there's
 * no exact number to game), counting only time the page is on screen. Finishing the steps or
 * scrolling to the end before then ticks it once the time is up; leaving earlier doesn't.
 */
export const DWELL_MIN_MS = 5000
export const DWELL_MAX_MS = 7500

/** This visit's time to stay, from a random number in [0, 1). */
export const dwellFor = (rand: () => number): number => DWELL_MIN_MS + Math.floor(Math.min(0.999999, Math.max(0, rand())) * (DWELL_MAX_MS - DWELL_MIN_MS))

/** The section counts once it was finished (its steps played and its end seen, src/pages/Help.tsx) and the person stayed long enough on it. */
export const countsAsRead = (finished: boolean, stayedMs: number, needMs: number): boolean => finished && stayedMs >= needMs
