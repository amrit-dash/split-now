import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { canReach, parseScrollStore, rememberScroll, type ScrollPos, scrollPlan } from '@/lib/scroll-memory'

/*
 * Scroll positions per history entry (src/lib/scroll-memory.ts). The router keeps one window
 * across screens, so without this a new screen opened at the scroll the last one was left at (a
 * Help section opened from low on the guide started at its steps, under the picture), and back
 * opened the old screen wherever the browser clamped it. Kept for this tab in sessionStorage, so
 * a reload still restores; a row that scrolls sideways keeps its place too when it is marked with
 * data-keep-scroll="<name>".
 */
const KEY = 'splitnow-scroll'
/** Give up restoring after this long if the screen never gets tall enough (it changed meanwhile). */
const RESTORE_MS = 2000

let store = (() => {
  try {
    return parseScrollStore(sessionStorage.getItem(KEY))
  } catch {
    return parseScrollStore(null)
  }
})()

let persistTimer: ReturnType<typeof setTimeout> | undefined
function persist() {
  clearTimeout(persistTimer)
  persistTimer = undefined
  try {
    sessionStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    /* private mode or full: positions last for this page's life */
  }
}

const rowsOnPage = () => document.querySelectorAll<HTMLElement>('[data-keep-scroll]')

function readPos(): ScrollPos {
  const rows: Record<string, number> = {}
  for (const el of rowsOnPage()) {
    const name = el.dataset.keepScroll
    if (name) rows[name] = Math.round(el.scrollLeft)
  }
  return Object.keys(rows).length ? { y: Math.round(window.scrollY), rows } : { y: Math.round(window.scrollY) }
}

function save(key: string, pos: ScrollPos, path: string) {
  store = rememberScroll(store, key, { ...pos, path })
  if (!persistTimer) persistTimer = setTimeout(persist, 300)
}

const jump = (y: number) => window.scrollTo({ top: y, left: 0, behavior: 'instant' })

/**
 * Put the page and its kept rows back where `pos` says, as soon as they are there: a screen that
 * loads its content lazily gets a few frames to grow. Returns a cancel; the person scrolling or
 * tapping first also stops it, so it never fights them. `done` runs when it ends by itself or by
 * them, not when the returned cancel is called (a new screen is already showing then).
 */
function restore(pos: ScrollPos, done: () => void): () => void {
  const start = performance.now()
  const rows = new Map(Object.entries(pos.rows ?? {}))
  let raf = 0
  let stopped = false
  const end = (finished: boolean) => {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(raf)
    for (const t of ['touchstart', 'wheel', 'keydown'] as const) window.removeEventListener(t, interrupt)
    if (finished) done()
  }
  const interrupt = () => end(true)
  for (const t of ['touchstart', 'wheel', 'keydown'] as const) window.addEventListener(t, interrupt, { passive: true })
  const tick = () => {
    for (const [name, left] of rows) {
      const el = document.querySelector<HTMLElement>(`[data-keep-scroll="${CSS.escape(name)}"]`)
      if (el && el.scrollWidth - el.clientWidth >= left - 1) {
        el.scrollLeft = left
        rows.delete(name)
      }
    }
    const reach = canReach(pos.y, document.documentElement.scrollHeight, window.innerHeight)
    if (reach) jump(pos.y)
    if ((reach && !rows.size) || performance.now() - start > RESTORE_MS) {
      if (!reach) jump(pos.y)
      return end(true)
    }
    raf = requestAnimationFrame(tick)
  }
  tick()
  return () => end(false)
}

/** Mount once inside the router: new screens start at the top, back and forward restore. */
export function useScrollMemory() {
  const loc = useLocation()
  const type = useNavigationType()
  const here = useRef<{ key: string; path: string } | null>(null)
  const restoring = useRef<(() => void) | null>(null)

  // The browser's own restoration runs before a lazy screen has rendered, so it lands short.
  useLayoutEffect(() => {
    try {
      window.history.scrollRestoration = 'manual'
    } catch {
      /* not supported: the browser's restoration stays on */
    }
  }, [])

  // Every scroll (the page's, or a row's: scroll events don't bubble, so listen while capturing)
  // records the current entry's position, once a frame.
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (here.current && !restoring.current) save(here.current.key, readPos(), here.current.path)
      })
    }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    window.addEventListener('pagehide', persist)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('pagehide', persist)
    }
  }, [])

  // Before paint, so a new screen never flashes at the old scroll.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per history entry (its key), by design
  useLayoutEffect(() => {
    restoring.current?.()
    restoring.current = null
    const path = loc.pathname + loc.search
    const kind = type === 'PUSH' ? 'push' : type === 'REPLACE' ? 'replace' : 'pop'
    const plan = scrollPlan(kind, here.current?.path, path, store.at[loc.key])
    here.current = { key: loc.key, path }
    if (plan.kind === 'top') {
      jump(0)
      save(loc.key, { y: 0 }, path)
    } else if (plan.kind === 'keep') save(loc.key, readPos(), path)
    else {
      // Scrolls while it restores are its own (and the screen's content arriving), not the person's.
      let finished = false
      const cancel = restore(plan.pos, () => {
        finished = true
        restoring.current = null
        save(loc.key, readPos(), path)
      })
      restoring.current = finished ? null : cancel
    }
  }, [loc.key])
}
