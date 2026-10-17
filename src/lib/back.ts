import { backSteps, type NavStack, screenOf } from './nav-stack'

/*
 * What a back button does. Most screens go back where you came from in the app (`history`), and
 * use their path only when there is nothing in this visit to go back to: a link opened cold, a
 * home-screen shortcut, a PWA cold start. A few go to one place every time (`fixed`), because
 * stepping back through history would land somewhere wrong; each of those says why at its call site.
 */

/** A screen's back config. A plain path is the `history` mode with that path as its fallback. */
export type BackConfig = string | { to: string; mode?: 'history' | 'fixed' }

/** What a back press does: step back through history, or go to a path. */
export type BackPlan = { kind: 'history'; steps: number } | { kind: 'path'; to: string; replace: boolean }

/** Where the person is: the screens of this visit by history index, this entry's index and its path. */
export type BackContext = { stack: NavStack; idx: number | undefined; current: string }

export function backPlan(config: BackConfig, at: BackContext): BackPlan {
  const { to, mode = 'history' } = typeof config === 'string' ? { to: config } : config
  if (mode === 'fixed') {
    // When that place is the entry right behind this one, stepping back is the same screen and
    // keeps the system back in step with the button (no extra entry to bounce between).
    const prev = at.idx !== undefined && at.idx > 0 ? at.stack[at.idx - 1] : undefined
    if (prev !== undefined && screenOf(prev) === screenOf(to) && screenOf(at.current) !== screenOf(to)) return { kind: 'history', steps: 1 }
    return { kind: 'path', to, replace: true }
  }
  const steps = backSteps(at.stack, at.idx, at.current)
  // Nothing behind this screen in the app: its parent, in place of this entry, so the system
  // back from there doesn't bring you here again and never leaves the app from a deep link.
  return steps ? { kind: 'history', steps } : { kind: 'path', to, replace: true }
}
