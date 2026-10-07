/**
 * Accent colour presets. The colour scales themselves live in src/index.css as overrides of
 * --color-brand-* / --color-duo-* keyed on <html data-accent="…"> and <html data-duo="off">;
 * this module only picks, persists and applies them. index.html repeats the apply step
 * inline before first paint (keep its id → theme-colour map in sync; a test checks it).
 */
export type AccentId = 'violet' | 'ocean' | 'emerald' | 'sunset' | 'rose' | 'indigo' | 'saffron' | 'amber' | 'graphite'

export interface AccentPreset {
  id: AccentId
  label: string
  /** Swatch colours: brand-600 and duo-500 of the preset. */
  from: string
  to: string
  /** brand-700, used for <meta name="theme-color"> in light mode. */
  meta: string
}

export const ACCENTS: readonly AccentPreset[] = [
  { id: 'violet', label: 'Violet', from: '#7c3aed', to: '#e12afb', meta: '#6d28d9' },
  { id: 'ocean', label: 'Ocean', from: '#155dfc', to: '#00b8db', meta: '#1447e6' },
  { id: 'emerald', label: 'Emerald', from: '#007a55', to: '#009689', meta: '#006045' },
  { id: 'sunset', label: 'Sunset', from: '#ca3500', to: '#ff2056', meta: '#9f2d00' },
  { id: 'rose', label: 'Rose', from: '#ec003f', to: '#f6339a', meta: '#c70036' },
  { id: 'indigo', label: 'Indigo', from: '#4f39f6', to: '#00a6f4', meta: '#432dd7' },
  { id: 'saffron', label: 'Saffron', from: '#bb4d00', to: '#f54900', meta: '#973c00' },
  { id: 'amber', label: 'Amber', from: '#a65f00', to: '#f0b100', meta: '#894b00' },
  { id: 'graphite', label: 'Graphite', from: '#45556c', to: '#71717b', meta: '#314158' },
]

export const DEFAULT_ACCENT: AccentId = 'violet'
export const ACCENT_KEY = 'splitit-accent'
export const DUO_KEY = 'splitit-duo'
/** <meta name="theme-color"> in dark mode, matching theme.ts. */
export const DARK_THEME_COLOR = '#0b0a14'

export function accentPreset(id: string | null | undefined): AccentPreset {
  return ACCENTS.find((a) => a.id === id) ?? ACCENTS.find((a) => a.id === DEFAULT_ACCENT)!
}

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function write(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* ignore */ }
}

/** The stored accent, or the default when nothing (or something unknown) is stored. */
export function getAccent(): AccentId {
  return accentPreset(read(ACCENT_KEY)).id
}

/** Whether gradients use two tones (default on). */
export function getDuo(): boolean {
  return read(DUO_KEY) !== 'off'
}

/** Theme colour for the browser chrome: the accent's brand-700, or ink in dark mode. */
export function themeColor(id: AccentId = getAccent(), dark?: boolean): string {
  const isDark = dark ?? (typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))
  return isDark ? DARK_THEME_COLOR : accentPreset(id).meta
}

export function syncThemeColor(dark?: boolean) {
  if (typeof document === 'undefined') return
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor(getAccent(), dark))
}

/** Apply an accent and dual-tone setting to <html> without persisting. */
export function applyAccent(id: AccentId = getAccent(), duo: boolean = getDuo()) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-accent', accentPreset(id).id)
  if (duo) root.removeAttribute('data-duo')
  else root.setAttribute('data-duo', 'off')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor(id))
}

export function setAccent(id: AccentId) {
  const preset = accentPreset(id)
  write(ACCENT_KEY, preset.id)
  applyAccent(preset.id, getDuo())
}

export function setDuo(on: boolean) {
  write(DUO_KEY, on ? 'on' : 'off')
  applyAccent(getAccent(), on)
}
