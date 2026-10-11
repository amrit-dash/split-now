import { syncThemeColor } from './accent'
import { notePrefChange } from './pref-events'

export type Theme = 'system' | 'light' | 'dark'
const KEY = 'splitit-theme'

export function getTheme(): Theme {
  try {
    return (localStorage.getItem(KEY) as Theme) || 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(t: Theme) {
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* ignore */
  }
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  syncThemeColor(dark)
}

/** The person picked a theme: apply it, keep it, and let it follow the account (appearance-sync.ts). */
export function setTheme(t: Theme) {
  applyTheme(t)
  notePrefChange()
}

if (typeof window !== 'undefined') {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => getTheme() === 'system' && applyTheme('system'))
}
