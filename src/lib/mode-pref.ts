/*
 * Simple or Advanced (Settings → Preferences, Profile's header), kept on the device for the first
 * paint and following the account through appearance-sync.ts. 'auto' (the default) is decided
 * by src/lib/mode.ts autoMode until the person picks.
 */

import { type ModeChoice, resolveModeChoice } from './mode'
import { notePrefChange, withoutPrefEvents } from './pref-events'

export const MODE_KEY = 'splitnow-mode'

let cached: ModeChoice | null = null
const listeners = new Set<() => void>()

function read(): ModeChoice {
  try {
    return resolveModeChoice(localStorage.getItem(MODE_KEY))
  } catch {
    return 'auto'
  }
}

/** The same value until it changes (useSyncExternalStore needs that). */
export function getModePref(): ModeChoice {
  if (cached === null) cached = read()
  return cached
}

function changed(next: ModeChoice) {
  cached = next
  for (const fn of listeners) fn()
}

/** The person picked a mode: keep it, apply it everywhere, and let it follow the account. */
export function setModePref(v: ModeChoice): void {
  try {
    if (v === 'auto') localStorage.removeItem(MODE_KEY)
    else localStorage.setItem(MODE_KEY, v)
  } catch {
    /* private mode: still applies for this visit */
  }
  changed(v)
  notePrefChange()
}

export function subscribeModePref(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Tests: forget the cached value. */
export function resetModePref(): void {
  cached = null
}

if (typeof window !== 'undefined') {
  // Another tab changed it: follow, without reporting it as a new change (that tab did).
  window.addEventListener('storage', (e) => {
    if (e.key === MODE_KEY || e.key === null) withoutPrefEvents(() => changed(read()))
  })
}
