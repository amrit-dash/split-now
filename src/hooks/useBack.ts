import { useCallback, useEffect } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { type BackConfig, backPlan } from '@/lib/back'
import { type NavStack, recordNav } from '@/lib/nav-stack'

/*
 * The in-app history behind every back button (src/lib/nav-stack.ts): kept for this tab in
 * sessionStorage, so a reload keeps knowing where you came from.
 */
const KEY = 'splitnow-nav'
let stack: NavStack = (() => {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? '[]')
    return Array.isArray(raw) ? raw.map((p) => (typeof p === 'string' ? p : undefined)) : []
  } catch {
    return []
  }
})()

/** The router's number for the current history entry (0 on the first screen of a visit). */
const historyIdx = (): number | undefined => {
  const i = (window.history.state as { idx?: unknown } | null)?.idx
  return typeof i === 'number' ? i : undefined
}

/** Mount once inside the router: records each screen against its history entry. */
export function useTrackNav() {
  const loc = useLocation()
  const type = useNavigationType()
  useEffect(() => {
    const idx = historyIdx()
    if (idx === undefined) return
    stack = recordNav(stack, idx, loc.pathname + loc.search, type === 'PUSH' ? 'push' : type === 'REPLACE' ? 'replace' : 'pop')
    try {
      sessionStorage.setItem(KEY, JSON.stringify(stack))
    } catch {
      /* private mode: back still works for this page's life */
    }
  }, [loc.pathname, loc.search, type])
}

/**
 * A back action (src/lib/back.ts). A path is the `history` mode: to the last different screen you
 * were on in the app, else (a link opened cold, a shortcut) to that path, the screen's logical
 * parent, replacing this entry so the system back doesn't bounce you here again. `{ to, mode:
 * 'fixed' }` goes to `to` every time, for the few screens where history would land somewhere wrong.
 */
export function useBack(config: BackConfig = '/') {
  const nav = useNavigate()
  const loc = useLocation()
  const to = typeof config === 'string' ? config : config.to
  const mode = typeof config === 'string' ? 'history' : (config.mode ?? 'history')
  return useCallback(() => {
    const plan = backPlan({ to, mode }, { stack, idx: historyIdx(), current: loc.pathname + loc.search })
    if (plan.kind === 'history') nav(-plan.steps)
    else nav(plan.to, { replace: plan.replace })
  }, [nav, loc.pathname, loc.search, to, mode])
}
