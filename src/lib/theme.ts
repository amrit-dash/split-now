export type Theme = 'system' | 'light' | 'dark'
const KEY = 'splitit-theme'

export function getTheme(): Theme {
  try { return (localStorage.getItem(KEY) as Theme) || 'system' } catch { return 'system' }
}

export function applyTheme(t: Theme) {
  try { localStorage.setItem(KEY, t) } catch { /* ignore */ }
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0a14' : '#6d28d9')
}

if (typeof window !== 'undefined') {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => getTheme() === 'system' && applyTheme('system'))
}
