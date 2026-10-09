/**
 * Accent colour presets. The colour scales themselves live in src/index.css as overrides of
 * --color-brand-* / --color-duo-* keyed on <html data-accent="…"> and <html data-duo="off">;
 * this module only picks, persists and applies them. index.html repeats the apply step
 * inline before first paint (keep its id → theme-colour map in sync; a test checks it).
 *
 * Five presets. Emerald and Rose are not offered because they are the owed / owe colours
 * (money direction would stop reading), and Amber cannot carry white text at 4.5:1. A test in
 * accent.test.ts checks every preset's brand-600 and duo-600 against white.
 */
export type AccentId = 'violet' | 'ocean' | 'indigo' | 'saffron' | 'graphite'

export interface AccentPreset {
  id: AccentId
  label: string
  /** Swatch colours: brand-600 and duo-500 of the preset (hex copies of the CSS). */
  from: string
  to: string
  /** brand-700, used for <meta name="theme-color"> in light mode. */
  meta: string
}

export const ACCENTS: readonly AccentPreset[] = [
  { id: 'violet', label: 'Violet', from: '#7c3aed', to: '#e12afb', meta: '#6d28d9' },
  { id: 'ocean', label: 'Ocean', from: '#155dfc', to: '#0092b8', meta: '#1447e6' },
  { id: 'indigo', label: 'Indigo', from: '#4f39f6', to: '#0084d1', meta: '#432dd7' },
  { id: 'saffron', label: 'Saffron', from: '#bb4d00', to: '#f54900', meta: '#973c00' },
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
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

/** The stored accent, or the default when nothing (or a retired preset) is stored. */
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
  void applyIconTint()
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

// --- Desktop favicon tinting -----------------------------------------------------------
// The browser-tab icon is the one icon surface that can follow the accent at runtime: the
// shipped /favicon.svg is fetched once and its two gradient stops are swapped for the active
// accent's brand-600 / duo-600, then set as a data: URL on <link rel="icon">. Home-screen
// icons are minted at install time and stay as generated (scripts/generate-icons.mjs).

let iconSvg: Promise<string | null> | undefined
function loadIconSvg(): Promise<string | null> {
  iconSvg ??= fetch('/favicon.svg')
    .then((r) => (r.ok ? r.text() : null))
    .catch(() => null)
  return iconSvg
}

/**
 * The icon SVG with its first two `<stop stop-color>` values replaced by `from` and `to`
 * (document order), or null when the SVG does not have two stops to swap.
 */
export function tintIconSvg(svg: string, from: string, to: string): string | null {
  const colours = [from, to]
  let i = 0
  const out = svg.replace(/(<stop\b[^>]*?\bstop-color\s*=\s*)(["'])[^"']*\2/g, (m, pre: string, q: string) => (i < 2 ? `${pre}${q}${colours[i++]}${q}` : m))
  return i === 2 ? out : null
}

/** Re-tint the tab icon for the accent currently applied to <html>. Safe to call often. */
export async function applyIconTint(): Promise<void> {
  if (typeof document === 'undefined' || typeof fetch !== 'function' || typeof getComputedStyle !== 'function') return
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) return
  const cs = getComputedStyle(document.documentElement)
  const from = cs.getPropertyValue('--color-brand-600').trim(),
    to = cs.getPropertyValue('--color-duo-600').trim()
  if (!from || !to) return // stylesheet not loaded yet; the next applyAccent() will get it
  const tinted = tintIconSvg((await loadIconSvg()) ?? '', from, to)
  if (tinted) link.href = `data:image/svg+xml;utf8,${encodeURIComponent(tinted)}`
}
