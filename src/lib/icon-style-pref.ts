/*
 * This person's own icon style (Settings → Preferences), kept on the device for the first paint
 * and following the account through appearance-sync.ts. 'app' (the default) follows the admin's.
 */

import { type IconStyleChoice, resolveIconStyleChoice } from './icon-style'
import { notePrefChange, withoutPrefEvents } from './pref-events'

export const ICON_STYLE_KEY = 'splitnow-icons'

let cached: IconStyleChoice | null = null
const listeners = new Set<() => void>()

function read(): IconStyleChoice {
  try {
    return resolveIconStyleChoice(localStorage.getItem(ICON_STYLE_KEY))
  } catch {
    return 'app'
  }
}

/** The same value until it changes (useSyncExternalStore needs that). */
export function getIconStylePref(): IconStyleChoice {
  if (cached === null) cached = read()
  return cached
}

function changed(next: IconStyleChoice) {
  cached = next
  for (const fn of listeners) fn()
}

/** The person picked a style: keep it, apply it everywhere, and let it follow the account. */
export function setIconStylePref(v: IconStyleChoice): void {
  try {
    if (v === 'app') localStorage.removeItem(ICON_STYLE_KEY)
    else localStorage.setItem(ICON_STYLE_KEY, v)
  } catch {
    /* private mode: still applies for this visit */
  }
  changed(v)
  notePrefChange()
}

export function subscribeIconStylePref(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Tests: forget the cached value. */
export function resetIconStylePref(): void {
  cached = null
}

if (typeof window !== 'undefined') {
  // Another tab changed it: follow, without reporting it as a new change (that tab did).
  window.addEventListener('storage', (e) => {
    if (e.key === ICON_STYLE_KEY || e.key === null) withoutPrefEvents(() => changed(read()))
  })
}
