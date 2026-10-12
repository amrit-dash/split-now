/*
 * This person's own detail level (Settings → Preferences), kept on the device for the first paint
 * and following the account through appearance-sync.ts. 'app' (the default) follows the admin's.
 */

import { type LookChoice, resolveLookChoice } from './look'
import { notePrefChange, withoutPrefEvents } from './pref-events'

export const LOOK_KEY = 'splitnow-look'

let cached: LookChoice | null = null
const listeners = new Set<() => void>()

function read(): LookChoice {
  try {
    return resolveLookChoice(localStorage.getItem(LOOK_KEY))
  } catch {
    return 'app'
  }
}

/** The same value until it changes (useSyncExternalStore needs that). */
export function getLookPref(): LookChoice {
  if (cached === null) cached = read()
  return cached
}

function changed(next: LookChoice) {
  cached = next
  for (const fn of listeners) fn()
}

/** The person picked a detail level: keep it, apply it everywhere, and let it follow the account. */
export function setLookPref(v: LookChoice): void {
  try {
    if (v === 'app') localStorage.removeItem(LOOK_KEY)
    else localStorage.setItem(LOOK_KEY, v)
  } catch {
    /* private mode: still applies for this visit */
  }
  changed(v)
  notePrefChange()
}

export function subscribeLookPref(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Tests: forget the cached value. */
export function resetLookPref(): void {
  cached = null
}

if (typeof window !== 'undefined') {
  // Another tab changed it: follow, without reporting it as a new change (that tab did).
  window.addEventListener('storage', (e) => {
    if (e.key === LOOK_KEY || e.key === null) withoutPrefEvents(() => changed(read()))
  })
}
