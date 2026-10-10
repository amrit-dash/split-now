import { useCallback, useEffect } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { backSteps, type NavStack, recordNav } from '@/lib/nav-stack'

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
 * A back action: to the last different screen you were on in the app, else (a link opened cold,
 * a shortcut) to `fallback`, the screen's logical parent, replacing this entry so the system back
 * doesn't bounce you here again.
 */
export function useBack(fallback = '/') {
  const nav = useNavigate()
  const loc = useLocation()
  return useCallback(() => {
    const steps = backSteps(stack, historyIdx(), loc.pathname + loc.search)
    if (steps) nav(-steps)
    else nav(fallback, { replace: true })
  }, [nav, loc.pathname, loc.search, fallback])
}
