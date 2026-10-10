/**
 * Accent colour presets. The colour scales themselves live in src/index.css as overrides of
 * --color-brand-* / --color-duo-* keyed on <html data-accent="…"> and <html data-duo="off">;
 * this module only picks, persists and applies them. index.html repeats the apply step
 * inline before first paint (keep its id → theme-colour map in sync; a test checks it).
 *
 * Seven presets. Emerald and Rose are not offered because they are the owed / owe colours
 * (money direction would stop reading). Koi is a coral-orange on a deep indigo, a complementary
 * pair like Berry's pink and teal, its coral kept well apart from the rose of "you owe"; Gold takes
 * deep 500+ steps so white text still reads. Neon fills with a highlighter lime and aqua and puts dark ink on them
 * (the --color-fill / --color-on-fill tokens in index.css). A test in accent.test.ts checks every
 * preset's on-fill colour against its fill and fill-to, and its brand-600 against white.
 *
 * "Text on accent" (the ink): every preset comes in two fill sets, picked by <html data-ink>.
 * 'light' is white text and icons on deep fills (brand-600 / duo-600); 'dark' is near-black ink on
 * bright fills, light enough that the ink still reads at 4.5:1 (black on a deep violet is about
 * 3:1, so the fills have to change with the ink). Neon defaults to dark ink, every other preset to
 * white; an explicit choice is stored per accent.
 */
export type AccentId = 'violet' | 'ocean' | 'neon' | 'berry' | 'koi' | 'gold' | 'graphite'
/** Colour of text and icons on accent fills: 'light' = white on deep fills, 'dark' = ink on bright fills. */
export type Ink = 'light' | 'dark'

export interface AccentPreset {
  id: AccentId
  label: string
  /** The ink this preset starts with until the person picks one. */
  ink: Ink
  /**
   * Swatch colours per ink (hex copies of the CSS), [from, to]: for white ink the deep fill and
   * duo-500 as its partner; for dark ink the bright fill and fill-to, so the swatch shows the
   * fills the buttons will actually get.
   */
  swatch: Record<Ink, readonly [string, string]>
  /** brand-700, used for <meta name="theme-color"> in light mode. */
  meta: string
}

export const ACCENTS: readonly AccentPreset[] = [
  { id: 'violet', label: 'Violet', ink: 'light', swatch: { light: ['#7c3aed', '#e12afb'], dark: ['#a98ffc', '#eb7efd'] }, meta: '#6d28d9' },
  { id: 'ocean', label: 'Ocean', ink: 'light', swatch: { light: ['#155dfc', '#0092b8'], dark: ['#75acfd', '#20d3f4'] }, meta: '#1447e6' },
  { id: 'neon', label: 'Neon', ink: 'dark', swatch: { light: ['#4d7800', '#00a8a8'], dark: ['#c6ff00', '#3df4ef'] }, meta: '#426400' },
  { id: 'berry', label: 'Berry', ink: 'light', swatch: { light: ['#b32689', '#009698'], dark: ['#f568c5', '#2ad7d7'] }, meta: '#97176e' },
  { id: 'koi', label: 'Koi', ink: 'light', swatch: { light: ['#bc4b00', '#676cf4'], dark: ['#fe8f5b', '#a2acff'] }, meta: '#9d3d00' },
  { id: 'gold', label: 'Gold', ink: 'light', swatch: { light: ['#936500', '#de8800'], dark: ['#f8b81c', '#fda848'] }, meta: '#774f00' },
  { id: 'graphite', label: 'Graphite', ink: 'light', swatch: { light: ['#45556c', '#71717b'], dark: ['#a1b3cb', '#bcbcc7'] }, meta: '#314158' },
]

export const DEFAULT_ACCENT: AccentId = 'violet'
export const ACCENT_KEY = 'splitit-accent'
export const DUO_KEY = 'splitit-duo'
/**
 * The explicit "Text on accent" choices, per accent, as JSON ({"violet":"dark"}). An accent with no
 * entry follows its preset's default. Anything else stored there (bad JSON, an old plain value) is
 * ignored, so every accent falls back to its default.
 */
export const INK_KEY = 'splitit-ink'
/** <meta name="theme-color"> in dark mode, matching theme.ts. */
export const DARK_THEME_COLOR = '#0b0a14'

/**
 * Retired presets that have a close successor: the orange Saffron and the old Amber both become
 * Gold, the nearest warm look, Indigo (one blue too many) becomes Ocean, and Lime (which with
 * white text looked the same as Neon) becomes Neon. Other retired ids
 * (emerald, rose) fall back to the default.
 * index.html repeats this map for the first paint.
 */
export const RETIRED_ACCENTS: Readonly<Record<string, AccentId>> = { saffron: 'gold', amber: 'gold', indigo: 'ocean', lime: 'neon' }

export function accentPreset(id: string | null | undefined): AccentPreset {
  const wanted = (id && Object.hasOwn(RETIRED_ACCENTS, id) ? RETIRED_ACCENTS[id] : id) ?? DEFAULT_ACCENT
  return ACCENTS.find((a) => a.id === wanted) ?? ACCENTS.find((a) => a.id === DEFAULT_ACCENT)!
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

const isInk = (v: unknown): v is Ink => v === 'light' || v === 'dark'

/** The stored per-accent inks, keeping only valid entries. */
export function storedInks(): Partial<Record<AccentId, Ink>> {
  try {
    const raw: unknown = JSON.parse(read(INK_KEY) ?? '{}')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out: Partial<Record<AccentId, Ink>> = {}
    for (const a of ACCENTS) {
      const v = Object.hasOwn(raw, a.id) ? (raw as Record<string, unknown>)[a.id] : undefined
      if (isInk(v)) out[a.id] = v
    }
    return out
  } catch {
    return {}
  }
}

/** The ink to use with an accent: its stored choice, else the preset's own default. */
export function getInk(id: AccentId = getAccent()): Ink {
  const preset = accentPreset(id)
  return storedInks()[preset.id] ?? preset.ink
}

/** Every accent's ink (stored or default), for previews such as the picker's swatches. */
export function allInks(): Record<AccentId, Ink> {
  return Object.fromEntries(ACCENTS.map((a) => [a.id, getInk(a.id)])) as Record<AccentId, Ink>
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

/** Apply an accent, dual-tone and ink setting to <html> without persisting. */
export function applyAccent(id: AccentId = getAccent(), duo: boolean = getDuo(), ink: Ink = getInk(id)) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-accent', accentPreset(id).id)
  root.setAttribute('data-ink', ink)
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

/**
 * Store an explicit ink for one accent (the current one by default) and show that accent with it. Each accent keeps its own,
 * so White on Neon does not turn every other accent white, and Neon keeps its highlighter look
 * unless it is itself set to White.
 */
export function setInk(ink: Ink, id: AccentId = getAccent()) {
  const preset = accentPreset(id)
  write(INK_KEY, JSON.stringify({ ...storedInks(), [preset.id]: ink }))
  // Applied even when storage is blocked, so the switch still works for this visit.
  applyAccent(preset.id, getDuo(), ink)
}

// --- Icons that follow the accent -------------------------------------------------------
// The browser-tab icon follows the accent live: the shipped /favicon.svg is fetched once and its
// two gradient stops are swapped for the active accent's brand-600 / duo-600, then set as a data:
// URL on <link rel="icon">.
// Home-screen icons are minted when the app is installed, so the manifest and Apple icon links
// point at the accent's own pre-rendered set (public/icons/<accent>/, scripts/generate-icons.mjs;
// the manifests are written by the build, vite.config.ts). iOS reads the Apple icon only at "Add to
// Home Screen" and never updates it; Chrome on Android and desktop re-reads the manifest on launch
// and offers to update an installed icon that changed.

/** The manifest and Apple touch icon for an accent: the shipped root files for the default accent. */
export function installLinks(id: AccentId): { manifest: string; appleIcon: string } {
  const preset = accentPreset(id)
  if (preset.id === DEFAULT_ACCENT) return { manifest: '/manifest.webmanifest', appleIcon: '/apple-touch-icon.png' }
  return { manifest: `/icons/${preset.id}/manifest.webmanifest`, appleIcon: `/icons/${preset.id}/apple-touch-icon.png` }
}

function applyInstallLinks(id: AccentId) {
  const links = installLinks(id)
  const set = (rel: string, href: string) => {
    const el = document.querySelector?.<HTMLLinkElement>(`link[rel="${rel}"]`)
    if (el && el.getAttribute('href') !== href) el.setAttribute('href', href)
  }
  set('manifest', links.manifest)
  set('apple-touch-icon', links.appleIcon)
}

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

/**
 * Point the install links at the stored accent's icons and re-tint the tab icon for the accent
 * currently applied to <html>. Runs on launch (Layout, Login) and on every accent change; safe to
 * call often.
 */
export async function applyIconTint(): Promise<void> {
  if (typeof document === 'undefined') return
  applyInstallLinks(getAccent())
  if (typeof fetch !== 'function' || typeof getComputedStyle !== 'function') return
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) return
  const cs = getComputedStyle(document.documentElement)
  const from = cs.getPropertyValue('--color-brand-600').trim(),
    to = cs.getPropertyValue('--color-duo-600').trim()
  if (!from || !to) return // stylesheet not loaded yet; the next applyAccent() will get it
  const tinted = tintIconSvg((await loadIconSvg()) ?? '', from, to)
  if (tinted) link.href = `data:image/svg+xml;utf8,${encodeURIComponent(tinted)}`
}
