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
/** Glitter has one size below small, so it can be clearly finer than the sparks it comes from. */
export type GlitterSize = 'tiny' | FireworkSize
export type FlowSpeed = 'slow' | 'normal' | 'fast'

export interface MotionPrefs {
  /** The master switch: off stills all three. */
  on: boolean
  fireworks: boolean
  /** How far a burst spreads. */
  size: FireworkSize
  /** How big each spark of the burst is. */
  sparkSize: FireworkSize
  /** The remnants a burst leaves: its sparks, once slowed, drifting down and flickering out. */
  glitter: boolean
  /** How big those remnants are (the same sparks, eased to this size as they slow). */
  glitterSize: GlitterSize
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
const GLITTER_SIZES: readonly GlitterSize[] = ['tiny', 'small', 'medium', 'big']
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
  const size = (k: 'size' | 'sparkSize') => (SIZES.includes(o[k] as FireworkSize) ? (o[k] as FireworkSize) : DEFAULT_MOTION[k])
  return {
    on: bool('on'),
    fireworks: bool('fireworks'),
    size: size('size'),
    sparkSize: size('sparkSize'),
    glitter: bool('glitter'),
    glitterSize: GLITTER_SIZES.includes(o.glitterSize as GlitterSize) ? (o.glitterSize as GlitterSize) : DEFAULT_MOTION.glitterSize,
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

/** Particle size multiplier, for the burst's sparks and, separately, the remnants they become (glitter adds Tiny). */
export function particleScale(size: GlitterSize): number {
  return size === 'tiny' ? 0.35 : size === 'small' ? 0.6 : size === 'big' ? 1.6 : 1
}

/**
 * How long a burst's sparks live, in ms. There is no separate glitter particle: the glitter is
 * the burst's own sparks after they have slowed, hanging for a moment with their soft glow before
 * they fade. With glitter on they live as long as they always did; off, they fade as the burst
 * finishes spreading, so nothing lingers.
 */
export function sparkLife(glitter: boolean): readonly [number, number] {
  return glitter ? [1300, 2200] : [550, 800]
}

/** ms after the burst when its sparks start turning into glitter, and when they have (the burst has finished spreading by then). */
export const REMNANT_FROM = 450
export const REMNANT_TO = 850

/**
 * How far a spark has become a remnant, 0..1 by the ms since its burst: 0 while it flies out,
 * easing to 1 as it slows. Timed from the burst rather than as a share of each spark's life, so
 * long-lived sparks don't keep their burst size (and look like big sparks) while they linger.
 */
export function remnantMix(ms: number): number {
  const t = Math.min(1, Math.max(0, (ms - REMNANT_FROM) / (REMNANT_TO - REMNANT_FROM)))
  return t * t * (3 - 2 * t)
}

/** A spark's size multiplier `ms` after its burst: the spark size while it flies, easing into the glitter size once it lingers. */
export function sparkRadius(sparkSize: FireworkSize, glitterSize: GlitterSize, ms: number): number {
  const a = particleScale(sparkSize)
  return a + (particleScale(glitterSize) - a) * remnantMix(ms)
}

/**
 * A burst spark's opacity (0..1, times its own) at `age`, the share of its life: it fades as it
 * flies out and slows, the original curve. The glitter is not extra light: it is these sparks
 * still hanging, each with its soft glow (sparkHalo), at random sizes and fading opacities.
 */
export function sparkOpacity(age: number): number {
  return Math.max(0, 1 - age) ** 1.6
}

/**
 * The soft glow round a spark (share of its full glow) `ms` after its burst. That translucent
 * glow, on sparks of random sizes as they hang after the burst, is what makes the glitter. With
 * glitter on it stays, as it always did; with it off the sparks lose it as the burst spreads
 * (gone by the time it has finished), so nothing soft hangs about and the burst ends crisply.
 */
export function sparkHalo(ms: number, glitter: boolean): number {
  if (glitter) return 1
  const t = Math.min(1, Math.max(0, (ms - 150) / 350))
  return 1 - t
}

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

// --- The Animations screen's preview (shown or hidden), a screen preference kept on this device.

export const PREVIEW_KEY = 'splitit-motion-preview'

/** Shown unless it was turned off; anything else stored counts as shown. */
export function parsePreviewShown(raw: string | null | undefined): boolean {
  return raw !== 'off'
}

export function getPreviewShown(): boolean {
  try {
    return parsePreviewShown(localStorage.getItem(PREVIEW_KEY))
  } catch {
    return true
  }
}

export function setPreviewShown(on: boolean) {
  try {
    localStorage.setItem(PREVIEW_KEY, on ? 'on' : 'off')
  } catch {
    /* ignore: it still toggles for this visit */
  }
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
