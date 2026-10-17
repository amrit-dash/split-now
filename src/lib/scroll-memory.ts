import { screenOf } from './nav-stack'

/*
 * Where each screen was scrolled to, per history entry (react-router's location.key): the page
 * itself, and every sideways row marked with data-keep-scroll (Help's How it works row). Going
 * back or forward to an entry puts it where it was left; going somewhere new starts at the top.
 * Pure: the hook in src/hooks/useScrollMemory.ts reads and writes the DOM and sessionStorage.
 */

/** One entry's position: the page's vertical scroll, and each kept row's sideways scroll by its name. */
export type ScrollPos = { y: number; rows?: Record<string, number> }

/** The positions of the latest entries, oldest first in `keys`, so the store stays small. */
export type ScrollStore = { keys: string[]; at: Record<string, ScrollPos> }

export const EMPTY_SCROLL: ScrollStore = { keys: [], at: {} }

/** How many history entries keep a position (sessionStorage holds one tab's worth). */
export const SCROLL_KEEP = 60

/** What to do with the page after a navigation. */
export type ScrollPlan = { kind: 'top' } | { kind: 'keep' } | { kind: 'restore'; pos: ScrollPos }

/**
 * A push or replace to another screen starts at the top (the scroll left over from the last
 * screen would open it part way down). One that only changes the query on the same screen (a
 * tab, a filter, a wizard step) leaves the page as it is: that screen scrolls itself if it needs
 * to. Back and forward (pop) restore the entry's own position when there is one, and leave the
 * page alone when there isn't (the first screen of a visit).
 */
export function scrollPlan(kind: 'push' | 'replace' | 'pop', from: string | undefined, to: string, saved: ScrollPos | undefined): ScrollPlan {
  if (kind === 'pop') return saved ? { kind: 'restore', pos: saved } : { kind: 'keep' }
  if (from !== undefined && screenOf(from) === screenOf(to)) return { kind: 'keep' }
  return { kind: 'top' }
}

/** Remember `pos` for the entry `key`, newest last, dropping the oldest past `max`. */
export function rememberScroll(store: ScrollStore, key: string, pos: ScrollPos, max = SCROLL_KEEP): ScrollStore {
  const keys = [...store.keys.filter((k) => k !== key), key]
  const drop = keys.length > max ? keys.splice(0, keys.length - max) : []
  const at = { ...store.at, [key]: pos }
  for (const k of drop) delete at[k]
  return { keys, at }
}

/** A store read back from sessionStorage, or an empty one when it is missing or not ours. */
export function parseScrollStore(raw: string | null): ScrollStore {
  if (!raw) return EMPTY_SCROLL
  try {
    const v = JSON.parse(raw) as Partial<ScrollStore> | null
    if (!v || !Array.isArray(v.keys) || typeof v.at !== 'object' || v.at === null) return EMPTY_SCROLL
    const keys = v.keys.filter((k): k is string => typeof k === 'string' && typeof v.at?.[k]?.y === 'number')
    const at: Record<string, ScrollPos> = {}
    for (const k of keys) at[k] = (v.at as Record<string, ScrollPos>)[k]
    return { keys, at }
  } catch {
    return EMPTY_SCROLL
  }
}

/**
 * Whether the page is tall enough yet to scroll to `y` (a screen restored on back may still be
 * loading its content). Within a pixel counts, as browsers round.
 */
export function canReach(y: number, scrollHeight: number, viewportHeight: number): boolean {
  return y <= Math.max(0, scrollHeight - viewportHeight) + 1
}
