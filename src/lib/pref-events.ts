/*
 * "The person changed an appearance setting on this device." The setters in theme.ts, accent.ts
 * and motion.ts call notePrefChange(); appearance-sync.ts listens and uploads. Its own module, with
 * no imports, so those setters don't import the sync (which imports them).
 */

const listeners = new Set<() => void>()
let quiet = 0

export function notePrefChange(): void {
  if (quiet) return
  for (const fn of listeners) fn()
}

export function onPrefChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Run `fn` without reporting its changes: applying what came from the account isn't a new change. */
export function withoutPrefEvents(fn: () => void): void {
  quiet++
  try {
    fn()
  } finally {
    quiet--
  }
}
