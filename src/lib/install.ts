/*
 * When to offer "Install Split Now". Chrome's own heuristics (and ours) favour asking after some
 * engagement rather than on the first screen: the second visit, or once the first expense exists.
 * Dismissing is permanent; the Settings → Data row stays available for later.
 */

export const VISITS_KEY = 'splitit-visits'
export const DISMISS_KEY = 'splitit-install-dismissed'
const SESSION_KEY = 'splitit-visit-counted'

export interface InstallGate {
  /** distinct app sessions so far, including this one */
  visits: number
  /** the user has at least one expense in some group */
  hasExpense: boolean
  /** the banner was dismissed for good */
  dismissed: boolean
}

/** Show the banner on the second visit or after the first expense, never after a dismiss. */
export function shouldOfferInstall(g: InstallGate): boolean {
  if (g.dismissed) return false
  return g.visits >= 2 || g.hasExpense
}

type Store = Pick<Storage, 'getItem' | 'setItem'>

/**
 * Count this session once (sessionStorage remembers that it was counted) and return the total.
 * Storage can be missing or throw (private mode); then every visit counts as the first.
 */
export function countVisit(local: Store | undefined, session: Store | undefined): number {
  try {
    const n = Number(local?.getItem(VISITS_KEY) ?? 0) || 0
    if (session?.getItem(SESSION_KEY)) return Math.max(n, 1)
    session?.setItem(SESSION_KEY, '1')
    local?.setItem(VISITS_KEY, String(n + 1))
    return n + 1
  } catch {
    return 1
  }
}

export function isInstallDismissed(local: Store | undefined): boolean {
  try {
    return !!local?.getItem(DISMISS_KEY)
  } catch {
    return false
  }
}

export function dismissInstall(local: Store | undefined) {
  try {
    local?.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    /* private mode */
  }
}
