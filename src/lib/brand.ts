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

/**
 * Where people can support the project (Profile → Support the developer, the README, and
 * .github/FUNDING.yml for the repository's Sponsor button). Keep the three in step.
 */
export const SUPPORT_LINKS = {
  coffee: 'https://buymeacoffee.com/amritdash',
  sponsors: 'https://github.com/sponsors/amrit-dash',
  repo: 'https://github.com/amrit-dash/split-now',
} as const
