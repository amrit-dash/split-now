import type { SnapMeta, Unsub } from './repo'

/**
 * Shared, refcounted live queries. Every screen that needs "the expenses of group X" goes
 * through the same entry, keyed by a string, so one repo listener serves all of them and the
 * last value is replayed synchronously to a newcomer (no loading flash on a tab switch).
 *
 * A listener outlives its last subscriber for LINGER_MS, so Home → Groups → Home doesn't
 * tear down and re-create every stream (Firestore re-syncs each re-attached query). An entry
 * whose query failed (meta.error) is dropped as soon as nobody reads it, and restarted when
 * someone subscribes again, which is what a screen remount used to do.
 *
 * Pure (no React): hooks/data.ts wraps it in useSyncExternalStore.
 */

type Listener<T> = (value: T, meta?: SnapMeta) => void
type Start<T> = (cb: Listener<T>) => Unsub

interface Entry<T> {
  refs: number
  value?: T
  meta?: SnapMeta
  listeners: Set<Listener<T>>
  unsub: Unsub
  release?: ReturnType<typeof setTimeout>
}

export const LINGER_MS = 5 * 60_000

const entries = new Map<string, Entry<unknown>>()

function drop(key: string, e: Entry<unknown>) {
  if (e.release) clearTimeout(e.release)
  e.unsub()
  // Only this entry: a restart may already have replaced it under the same key.
  if (entries.get(key) === e) entries.delete(key)
}

function open<T>(key: string, start: Start<T>): Entry<T> {
  const e: Entry<T> = { refs: 0, listeners: new Set(), unsub: () => {} }
  entries.set(key, e as Entry<unknown>)
  e.unsub = start((v, m) => {
    e.value = v
    e.meta = m
    for (const l of e.listeners) l(v, m)
  })
  return e
}

/**
 * Subscribe to the live query behind `key`, starting it with `start` if nobody has yet.
 * `cb` is called synchronously with the current value (when there is one), then on every
 * change. Returns the unsubscribe.
 */
export function subscribeShared<T>(key: string, start: Start<T>, cb: Listener<T>): Unsub {
  let e = entries.get(key) as Entry<T> | undefined
  if (e?.meta?.error && e.refs === 0) { drop(key, e as Entry<unknown>); e = undefined }
  if (!e) e = open(key, start)
  const entry = e
  if (entry.release) { clearTimeout(entry.release); entry.release = undefined }
  entry.refs++
  entry.listeners.add(cb)
  if ('value' in entry) cb(entry.value as T, entry.meta)
  let done = false
  return () => {
    if (done) return
    done = true
    entry.listeners.delete(cb)
    entry.refs--
    if (entry.refs > 0 || entries.get(key) !== entry) return
    if (entry.meta?.error) drop(key, entry as Entry<unknown>)
    else entry.release = setTimeout(() => drop(key, entry as Entry<unknown>), LINGER_MS)
  }
}

/** The current value behind `key`, if its query has reported (whether or not anyone subscribes). */
export function peekShared<T>(key: string): T | undefined {
  return entries.get(key)?.value as T | undefined
}

export function peekSharedMeta(key: string): SnapMeta | undefined {
  return entries.get(key)?.meta
}

/** Stops every listener and forgets every value (sign-out, user switch). */
export function clearSharedStore() {
  for (const [key, e] of entries) drop(key, e)
  entries.clear()
}

/** For tests and diagnostics: how many queries are open. */
export const sharedStoreSize = () => entries.size
