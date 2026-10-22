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
