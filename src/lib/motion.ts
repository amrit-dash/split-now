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
  /** How far a burst spreads. */
  size: FireworkSize
  /** How big each spark of the burst is. */
  sparkSize: FireworkSize
  /** The fine twinkling dust that drifts down after each burst. */
  glitter: boolean
  glitterSize: FireworkSize
  /** The drifting colour patches on the Home card, the + button and accent buttons. */
  flow: boolean
  speed: FlowSpeed
  /** The circles floating in the Home card. */
  circles: boolean
}

export const DEFAULT_MOTION: MotionPrefs = {
  on: true,
  fireworks: true,
  size: 'medium',
  sparkSize: 'medium',
  glitter: true,
  glitterSize: 'medium',
  flow: true,
  speed: 'normal',
  circles: true,
}
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
  const size = (k: 'size' | 'sparkSize' | 'glitterSize') => (SIZES.includes(o[k] as FireworkSize) ? (o[k] as FireworkSize) : DEFAULT_MOTION[k])
  return {
    on: bool('on'),
    fireworks: bool('fireworks'),
    size: size('size'),
    sparkSize: size('sparkSize'),
    glitter: bool('glitter'),
    glitterSize: size('glitterSize'),
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

/** Burst size multiplier: how far the sparks fly (and how many there are, so a big burst isn't sparse). */
export function fireworkScale(size: FireworkSize): number {
  return size === 'small' ? 0.7 : size === 'big' ? 1.35 : 1
}

/** Particle size multiplier, for the burst's sparks and, separately, the glitter. */
export function particleScale(size: FireworkSize): number {
  return size === 'small' ? 0.65 : size === 'big' ? 1.6 : 1
}

/**
 * The fireworks' particle timings, in ms. A burst's sparks fly out and fade; with glitter on,
 * most of them shed a grain of glitter as they fade, which twinkles and drifts down on its own
 * for a while longer. With glitter off nothing lingers after the burst.
 */
export const SPARK_LIFE: readonly [number, number] = [1000, 1400]
export const GLITTER_LIFE: readonly [number, number] = [1100, 1800]
/** Share of a spark's life after which it sheds its grain of glitter, and the chance that it does. */
export const GLITTER_AT = 0.55
export const GLITTER_CHANCE = 0.65

/** Seconds for one pass of the accent buttons' colour drift (CSS --flow-dur). */
export const FLOW_SECONDS: Readonly<Record<FlowSpeed, number>> = { slow: 32, normal: 16, fast: 5 }

/** Multiplier on the Home card's and + button's drift speed, matching the buttons' change. */
export function flowRate(speed: FlowSpeed): number {
  return FLOW_SECONDS.normal / FLOW_SECONDS[speed]
}

/** The Settings list's one-line summary for Animations. */
export function motionSummary(p: MotionPrefs, reduced: boolean): string {
  if (reduced) return 'Off: your device asks for less motion'
  if (!p.on) return 'Off'
  const parts: string[] = []
  if (p.fireworks) parts.push(p.glitter ? 'Fireworks with glitter' : 'Fireworks')
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
