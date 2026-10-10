/**
 * Animation settings (Settings → Animations): the Home card's fireworks, the colour flow on the
 * card and on accent buttons, and the circles floating in the card. Kept on this device like the
 * theme and accent, and applied live: CSS reads <html data-flow="off"> and --flow-dur, the canvas
 * and Aurora loops read the prefs through useMotion (src/hooks/useMotion.ts).
 *
 * The device's own "reduce motion" setting always wins over these: nothing here can turn motion
 * back on for someone who asked their phone for less of it.
 */

export type FireworkSize = 'small' | 'medium' | 'big'
export type FlowSpeed = 'slow' | 'normal' | 'fast'

export interface MotionPrefs {
  /** The master switch: off stills all three. */
  on: boolean
  fireworks: boolean
  size: FireworkSize
  /** The sparks that drift down after each burst. */
  glitter: boolean
  /** The drifting colour patches on the Home card, the + button and accent buttons. */
  flow: boolean
  speed: FlowSpeed
  /** The circles floating in the Home card. */
  circles: boolean
}

export const DEFAULT_MOTION: MotionPrefs = { on: true, fireworks: true, size: 'medium', glitter: true, flow: true, speed: 'normal', circles: true }
export const MOTION_KEY = 'splitit-motion'

const SIZES: readonly FireworkSize[] = ['small', 'medium', 'big']
const SPEEDS: readonly FlowSpeed[] = ['slow', 'normal', 'fast']

/** Stored JSON to prefs: unknown or bad values fall back to the default one by one, so an old or hand-edited entry never breaks the app. */
export function parseMotion(raw: string | null | undefined): MotionPrefs {
  let v: unknown
  try {
    v = JSON.parse(raw ?? '{}')
  } catch {
    return { ...DEFAULT_MOTION }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ...DEFAULT_MOTION }
  const o = v as Record<string, unknown>
  const bool = (k: keyof MotionPrefs) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : (DEFAULT_MOTION[k] as boolean))
  return {
    on: bool('on'),
    fireworks: bool('fireworks'),
    size: SIZES.includes(o.size as FireworkSize) ? (o.size as FireworkSize) : DEFAULT_MOTION.size,
    glitter: bool('glitter'),
    flow: bool('flow'),
    speed: SPEEDS.includes(o.speed as FlowSpeed) ? (o.speed as FlowSpeed) : DEFAULT_MOTION.speed,
    circles: bool('circles'),
  }
}

export function isDefaultMotion(p: MotionPrefs): boolean {
  return (Object.keys(DEFAULT_MOTION) as (keyof MotionPrefs)[]).every((k) => p[k] === DEFAULT_MOTION[k])
}

/** What actually moves, after the master switch and the device's reduce-motion setting. */
export function activeMotion(p: MotionPrefs, reduced: boolean): { fireworks: boolean; flow: boolean; circles: boolean } {
  const on = p.on && !reduced
  return { fireworks: on && p.fireworks, flow: on && p.flow, circles: on && p.circles }
}

/** Burst size multiplier: spread, spark size and spark count all follow it. */
export function fireworkScale(size: FireworkSize): number {
  return size === 'small' ? 0.7 : size === 'big' ? 1.35 : 1
}

/**
 * How long a burst's sparks live, in ms. With glitter they linger and drift down for a couple of
 * seconds; without it they fade at the end of the burst, before they have fallen far.
 */
export function sparkLife(glitter: boolean): [number, number] {
  return glitter ? [1300, 2200] : [600, 900]
}

/** Seconds for one pass of the accent buttons' colour drift (CSS --flow-dur). */
export const FLOW_SECONDS: Readonly<Record<FlowSpeed, number>> = { slow: 28, normal: 16, fast: 9 }

/** Multiplier on the Home card's and + button's drift speed, matching the buttons' change. */
export function flowRate(speed: FlowSpeed): number {
  return FLOW_SECONDS.normal / FLOW_SECONDS[speed]
}

/** The Settings list's one-line summary for Animations. */
export function motionSummary(p: MotionPrefs, reduced: boolean): string {
  if (reduced) return 'Off: your device asks for less motion'
  if (!p.on) return 'Off'
  const parts: string[] = []
  if (p.fireworks) parts.push(`${p.size[0].toUpperCase()}${p.size.slice(1)} fireworks`)
  if (p.flow) parts.push(p.speed === 'normal' ? 'Colour flow' : `${p.speed[0].toUpperCase()}${p.speed.slice(1)} colour flow`)
  if (p.circles) parts.push('Circles')
  return parts.length ? parts.join(' · ') : 'All still'
}

// --- Storage and live updates --------------------------------------------------------------

let cached: MotionPrefs | null = null
const listeners = new Set<() => void>()

function read(): string | null {
  try {
    return localStorage.getItem(MOTION_KEY)
  } catch {
    return null
  }
}

/** The stored prefs; the same object until they change (useSyncExternalStore needs that). */
export function getMotion(): MotionPrefs {
  if (!cached) cached = parseMotion(read())
  return cached
}

/** Put the CSS-driven parts on <html>: the accent buttons' drift and its speed. */
export function applyMotion(p: MotionPrefs = getMotion()) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (p.on && p.flow) root.removeAttribute('data-flow')
  else root.setAttribute('data-flow', 'off')
  root.style.setProperty('--flow-dur', `${FLOW_SECONDS[p.speed]}s`)
}

function changed(next: MotionPrefs) {
  cached = next
  applyMotion(next)
  for (const fn of listeners) fn()
}

/** Save a change and apply it everywhere at once. Applied even when storage is blocked, for this visit. */
export function setMotion(patch: Partial<MotionPrefs>) {
  const next = { ...getMotion(), ...patch }
  try {
    localStorage.setItem(MOTION_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  changed(next)
}

export function resetMotion() {
  try {
    localStorage.removeItem(MOTION_KEY)
  } catch {
    /* ignore */
  }
  changed({ ...DEFAULT_MOTION })
}

export function subscribeMotion(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

if (typeof window !== 'undefined') {
  // Another tab changed them.
  window.addEventListener('storage', (e) => {
    if (e.key === MOTION_KEY || e.key === null) changed(parseMotion(read()))
  })
}
