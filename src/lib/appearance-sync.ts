/*
 * Appearance settings follow the account (users/{uid}/settings/appearance): theme, accent, dual
 * tone, text on accent and the animations. Set the accent on the web, install the app on a phone,
 * sign in, and it looks the same. The device still keeps its own copy (localStorage) so the first
 * paint never waits for the network, and everything works signed out or offline.
 *
 * What stays on the device: push permission and its token, auto-capture's on-device setup, the
 * install banner, and screen conveniences (the Animations preview, recent picks). Notification
 * types, capture filters and AI choices were already on the account (settings/notifications).
 *
 * Newest wins, by the time of the change: each device remembers when it last changed (or took)
 * these settings. On sign-in, a newer copy on the account replaces this device's; a newer change
 * here is uploaded. A device that never changed anything takes the account's copy, and the first
 * device to sign in after this shipped uploads its own look if it isn't the default.
 */

import { ACCENTS, type AccentId, DEFAULT_ACCENT, getAccent, getDuo, type Ink, setAccent, setDuo, setInk, storedInks } from './accent'
import { DEFAULT_MOTION, getMotion, isDefaultMotion, type MotionPrefs, parseMotion, setMotion } from './motion'
import { onPrefChange, withoutPrefEvents } from './pref-events'
import { getTheme, setTheme, type Theme } from './theme'

export interface Appearance {
  theme: Theme
  accent: AccentId
  duo: boolean
  inks: Partial<Record<AccentId, Ink>>
  motion: MotionPrefs
  /** epoch ms of the change this copy carries */
  updatedAt: number
}

const THEMES: readonly Theme[] = ['system', 'light', 'dark']
const isAccent = (v: unknown): v is AccentId => ACCENTS.some((a) => a.id === v)

/** The stored document → Appearance; null when there is none (or it has no time, so it can't be compared). */
export function parseAppearance(raw: unknown): Appearance | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.updatedAt !== 'number' || !Number.isFinite(r.updatedAt)) return null
  const inks: Partial<Record<AccentId, Ink>> = {}
  if (r.inks && typeof r.inks === 'object' && !Array.isArray(r.inks))
    for (const [k, v] of Object.entries(r.inks as Record<string, unknown>)) if (isAccent(k) && (v === 'light' || v === 'dark')) inks[k] = v
  return {
    theme: THEMES.includes(r.theme as Theme) ? (r.theme as Theme) : 'system',
    accent: isAccent(r.accent) ? r.accent : DEFAULT_ACCENT,
    duo: r.duo !== false,
    inks,
    // parseMotion takes JSON; the document holds the object.
    motion: parseMotion(JSON.stringify(r.motion && typeof r.motion === 'object' ? r.motion : {})),
    updatedAt: r.updatedAt,
  }
}

/** What goes into the document (the same shape; the rules whitelist it). */
export function toAppearanceDoc(a: Appearance): Record<string, unknown> {
  return { theme: a.theme, accent: a.accent, duo: a.duo, inks: { ...a.inks }, motion: { ...a.motion }, updatedAt: a.updatedAt }
}

export const isDefaultAppearance = (a: Omit<Appearance, 'updatedAt'>): boolean =>
  a.theme === 'system' && a.accent === DEFAULT_ACCENT && a.duo && Object.keys(a.inks).length === 0 && isDefaultMotion(a.motion)

/**
 * What to do when the account's copy arrives: take it (`pull`), send ours (`push`), or nothing.
 * `localAt` is when this device last changed or took its settings (0: never).
 */
export function decideSync(localAt: number, remote: Appearance | null, localIsDefault: boolean): 'pull' | 'push' | 'none' {
  if (!remote) return localAt > 0 || !localIsDefault ? 'push' : 'none'
  if (remote.updatedAt > localAt) return 'pull'
  if (remote.updatedAt < localAt) return 'push'
  return 'none'
}

// ---- This device ----------------------------------------------------------------------------

const AT_KEY = 'splitnow-appearance-at'

function readAt(): number {
  try {
    const n = Number(localStorage.getItem(AT_KEY))
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}
function writeAt(at: number) {
  try {
    localStorage.setItem(AT_KEY, String(at))
  } catch {
    /* private mode: syncs again next launch */
  }
}

export function localAppearance(at = readAt()): Appearance {
  return { theme: getTheme(), accent: getAccent(), duo: getDuo(), inks: storedInks(), motion: getMotion(), updatedAt: at }
}

/** Put the account's copy on this device, live, without it counting as a new change. */
export function applyAppearance(a: Appearance): void {
  withoutPrefEvents(() => {
    setTheme(a.theme)
    setDuo(a.duo)
    for (const [id, ink] of Object.entries(a.inks)) setInk(ink as Ink, id as AccentId)
    setAccent(a.accent)
    setMotion({ ...DEFAULT_MOTION, ...a.motion })
  })
  writeAt(a.updatedAt)
}

/**
 * Sync for one signed-in account while it lasts. `watch` and `save` are the repo's; the caller
 * (a hook) passes them so this file stays free of the data layer. Uploads are debounced: dragging
 * through the accents sends one write.
 */
export function startAppearanceSync(
  watch: (cb: (raw: unknown) => void) => () => void,
  save: (doc: Record<string, unknown>) => Promise<void>,
  delay = 800,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let ready = false
  const push = () => {
    const a = localAppearance()
    void save(toAppearanceDoc(a)).catch(() => {
      /* offline or refused: the next change tries again */
    })
  }
  const offChange = onPrefChange(() => {
    writeAt(Date.now())
    if (!ready) return // the first answer from the account decides; it will push this if newer
    clearTimeout(timer)
    timer = setTimeout(push, delay)
  })
  const offWatch = watch((raw) => {
    const remote = parseAppearance(raw)
    const local = localAppearance()
    const what = decideSync(local.updatedAt, remote, isDefaultAppearance(local))
    if (what === 'pull' && remote) applyAppearance(remote)
    else if (what === 'push') {
      if (!local.updatedAt) writeAt(Date.now())
      push()
    }
    ready = true
  })
  return () => {
    clearTimeout(timer)
    offChange()
    offWatch()
  }
}
