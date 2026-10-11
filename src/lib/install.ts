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

/**
 * How this browser can install Split Now, or null when it can't (already installed, or a
 * browser with no install at all, like Firefox on a computer):
 *  'prompt'  the browser offered its own install dialog (Chrome / Edge / Samsung Internet on
 *            Android, Windows, macOS, Linux, ChromeOS): one tap
 *  'ios'     iPhone / iPad: Share → Add to Home Screen
 *  'mac'     Safari 17+ on a Mac: File → Add to Dock
 *  'menu'    a browser that can install but hasn't offered its dialog (yet): its own menu
 */
export type InstallMethod = 'prompt' | 'ios' | 'mac' | 'menu'

export function installMethod(o: { installed: boolean; canPrompt: boolean; ua: string; platform?: string; touchPoints?: number }): InstallMethod | null {
  if (o.installed) return null
  if (o.canPrompt) return 'prompt'
  const ua = o.ua
  // iPadOS reports itself as a Mac; touch gives it away.
  if (/iPad|iPhone|iPod/.test(ua) || (o.platform === 'MacIntel' && (o.touchPoints ?? 0) > 1)) return 'ios'
  const chromium = /Chrome\/|Chromium\/|Edg\/|EdgA\/|SamsungBrowser\/|OPR\//.test(ua)
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !chromium && !/Firefox\//.test(ua)) {
    const v = Number(ua.match(/Version\/(\d+)/)?.[1] ?? 0)
    return v >= 17 ? 'mac' : null
  }
  if (chromium) return 'menu'
  // Firefox installs on Android (menu → Install), not on a computer.
  if (/Android/.test(ua) && /Firefox\//.test(ua)) return 'menu'
  return null
}
