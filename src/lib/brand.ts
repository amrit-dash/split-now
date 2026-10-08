import { useEffect } from 'react'

/** The product name used in user-facing strings. Change it here only. */
export const APP_NAME = 'Split Now'

/** "Groups · Split Now", or just the app name on Home. */
export function pageTitle(title?: string | null): string {
  const t = (title ?? '').trim()
  return t ? `${t} · ${APP_NAME}` : APP_NAME
}

/**
 * Sets document.title for the screen (screen readers announce it on route change, and the
 * browser tab/history read it). Call once per page: `usePageTitle('Groups')`, or with the
 * group's name once it has loaded; undefined while loading keeps the previous title.
 */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title === undefined || typeof document === 'undefined') return
    document.title = pageTitle(title)
  }, [title])
}
