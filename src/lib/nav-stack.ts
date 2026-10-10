/*
 * Back means "the screen I came from". The router (react-router) numbers each history entry it
 * creates (history.state.idx: 0 for the first screen of the visit, then 1, 2, …), and replaces
 * keep the number. We remember which path sits at each number, so a back button can step back to
 * the last *different* screen: past a form that replaced itself with the screen it saved into
 * (Group → Add expense → saved → Group again), and out to a sensible parent only when there is
 * nothing to go back to (a link opened cold, a home-screen shortcut).
 */

/** The path at each history index of this visit; holes are entries we never saw (before a reload). */
export type NavStack = (string | undefined)[]

/**
 * Record that `path` is showing at history index `idx`. A push (going somewhere new) forgets the
 * old forward history, as the browser does; a replace or a back / forward (pop) keeps it.
 */
export function recordNav(stack: NavStack, idx: number, path: string, kind: 'push' | 'replace' | 'pop'): NavStack {
  const next = kind === 'push' ? stack.slice(0, idx) : stack.slice()
  next[idx] = path
  return next
}

/** A path without its query or hash, which is what "the same screen" compares. */
const screen = (path: string) => path.split(/[?#]/)[0].replace(/\/+$/, '') || '/'

/**
 * How many steps back the last different screen is from history index `idx` (showing `current`),
 * or null when there is none in this visit, and the caller should go to its fallback instead.
 * An entry we never saw counts as different (it is a real screen the person came from).
 */
export function backSteps(stack: NavStack, idx: number | undefined, current: string): number | null {
  if (idx === undefined || idx <= 0) return null
  const here = screen(current)
  for (let i = idx - 1; i >= 0; i--) {
    const p = stack[i]
    if (p === undefined || screen(p) !== here) return idx - i
  }
  return null
}
