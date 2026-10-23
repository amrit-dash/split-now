/**
 * Animation settings (Settings → Animations): the Home card's fireworks, the colour flow on the
 * card and on accent buttons, and the circles floating in the card. Follows the account (appearance-sync.ts) like the
 * theme and accent, and applied live: CSS reads <html data-flow="off"> and --flow-dur, the canvas
 * and Aurora loops read the prefs through useMotion (src/hooks/useMotion.ts).
 *
 * The device's own "reduce motion" setting always wins over these: nothing here can turn motion
 * back on for someone who asked their phone for less of it.
 */

import { notePrefChange, withoutPrefEvents } from './pref-events'

export type FireworkSize = 'small' | 'medium' | 'big'
/** Glitter has one size below small, so its dots can be clearly finer than the sparks. */
export type GlitterSize = 'tiny' | FireworkSize
export type FlowSpeed = 'slow' | 'normal' | 'fast'
/** What the glitter's lights look like: a mix of all of them, or one kind. */
export type GlitterShape = 'mix' | 'dots' | 'streaks' | 'stars' | 'curls'

export interface MotionPrefs {
  /** The master switch: off stills all three. */
  on: boolean
  fireworks: boolean
  /** How far a burst spreads. */
  size: FireworkSize
  /** How big each spark of the burst is. */
  sparkSize: FireworkSize
  /**
   * The glitter: as a burst's sparks fade out, a brief flash of small dots in and around where it
   * burst, some bigger, some brighter, a few stretched, gone in a moment (glint* below).
   */
  glitter: boolean
  /** How big the glitter's dots are. */
  glitterSize: GlitterSize
  /** The glitter's shape (glintShape). */
  glitterShape: GlitterShape
  /** Some of a burst's sparks pulse brighter and dimmer as they fade, the brightest with a small four-point star. */
  twinkle: boolean
  /** The drifting colour patches on the Home card, the + button and accent buttons. */
  flow: boolean
  speed: FlowSpeed
  /** The circles floating in the Home card. */
  circles: boolean
  /** The badge rings' slow turn round a photo or a 1:1's tile (PRO, DEV and PRO DEV alike; src/components/ProBadge.tsx). */
  ring: boolean
  /** The light passing over the badge pills' letters. Off, ring and pill stay still. */
  shine: boolean
}

export const DEFAULT_MOTION: MotionPrefs = {
  on: true,
  fireworks: true,
  size: 'medium',
  sparkSize: 'medium',
  glitter: true,
  glitterSize: 'medium',
  glitterShape: 'mix',
  twinkle: false,
  flow: true,
  speed: 'normal',
  circles: true,
  ring: true,
  shine: true,
}
export const MOTION_KEY = 'splitit-motion'

const SIZES: readonly FireworkSize[] = ['small', 'medium', 'big']
const GLITTER_SIZES: readonly GlitterSize[] = ['tiny', 'small', 'medium', 'big']
const SPEEDS: readonly FlowSpeed[] = ['slow', 'normal', 'fast']
export const GLITTER_SHAPES: readonly GlitterShape[] = ['mix', 'dots', 'streaks', 'stars', 'curls']

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
    glitterShape: GLITTER_SHAPES.includes(o.glitterShape as GlitterShape) ? (o.glitterShape as GlitterShape) : DEFAULT_MOTION.glitterShape,
    twinkle: bool('twinkle'),
    flow: bool('flow'),
    speed: SPEEDS.includes(o.speed as FlowSpeed) ? (o.speed as FlowSpeed) : DEFAULT_MOTION.speed,
    circles: bool('circles'),
    // Before the ring and the shine had their own switches one `pro` switch held both: it seeds them.
    ring: typeof o.ring === 'boolean' ? o.ring : typeof o.pro === 'boolean' ? o.pro : DEFAULT_MOTION.ring,
    shine: typeof o.shine === 'boolean' ? o.shine : typeof o.pro === 'boolean' ? o.pro : DEFAULT_MOTION.shine,
  }
}

export function isDefaultMotion(p: MotionPrefs): boolean {
  return (Object.keys(DEFAULT_MOTION) as (keyof MotionPrefs)[]).every((k) => p[k] === DEFAULT_MOTION[k])
}

/** What actually moves, after the master switch and the device's reduce-motion setting. */
export function activeMotion(p: MotionPrefs, reduced: boolean): { fireworks: boolean; flow: boolean; circles: boolean; ring: boolean; shine: boolean } {
  const on = p.on && !reduced
  return { fireworks: on && p.fireworks, flow: on && p.flow, circles: on && p.circles, ring: on && p.ring, shine: on && p.shine }
}

/** Burst size multiplier: how far the sparks fly (and how many there are, so a big burst isn't sparse). */
export function fireworkScale(size: FireworkSize): number {
  return size === 'small' ? 0.7 : size === 'big' ? 1.35 : 1
}

/** Size multiplier for the burst's sparks (Spark size). */
export function particleScale(size: FireworkSize): number {
  return size === 'small' ? 0.6 : size === 'big' ? 1.6 : 1
}

/** How long a burst's sparks live, in ms: as they always have. */
export const SPARK_LIFE: readonly [number, number] = [1300, 2200]

/*
 * The glitter (crackle, in fireworks terms). When a burst spark burns out, it leaves a brief flash
 * of small dots: where it was and partway back towards the burst's centre, so the dots fill the
 * blast area rather than ring it. Each lives 80–300 ms after a short random delay, rises fast and
 * falls away, at random sizes and brightness; some blink once, a few are short streaks. The sparks
 * die at different moments, so the dots light up here and there just as the burst fades.
 * Technique after Caleb Miller's Firework Simulator crackle (CodePen XgpNwb).
 */

/** Glitter dot size by the setting (dots under ~0.35 px vanish under antialiasing, so Tiny stays above that). */
export const GLINT_SCALE: Readonly<Record<GlitterSize, number>> = { tiny: 0.5, small: 0.75, medium: 1, big: 1.5 }

/** A glitter dot's radius in px from its base size and the setting. */
export function glintRadius(base: number, size: GlitterSize): number {
  return Math.max(0.35, base * GLINT_SCALE[size])
}

/** How many dots a burnt-out spark leaves, from two random draws: usually one, sometimes none or two. */
export function glintCount(a: number, b: number): number {
  return (a < 0.75 ? 1 : 0) + (b < 0.15 ? 1 : 0)
}

/** One glitter light's shape: a point, a short straight streak, a four-point star, or a short bent streak. */
export type GlintKind = 'dot' | 'streak' | 'star' | 'curl'

/**
 * The shape of one light, from the setting and a random draw. Mix is mostly points with some of
 * each other shape, so it reads as glitter rather than as a pattern; the others are all one kind.
 */
export function glintShape(shape: GlitterShape, r: number): GlintKind {
  if (shape === 'dots') return 'dot'
  if (shape === 'streaks') return 'streak'
  if (shape === 'stars') return 'star'
  if (shape === 'curls') return 'curl'
  return r < 0.55 ? 'dot' : r < 0.73 ? 'streak' : r < 0.88 ? 'star' : 'curl'
}

/** A dot's life in ms from a random draw, skewed short: 80–300. */
export function glintLife(a: number): number {
  return 80 + 220 * a ** 1.5
}

/**
 * A dot's brightness (share of its peak) `ms` into its `life`: up over the first fifth, then
 * falling away. A blinking dot is dark one 45 ms step in three, once along the way.
 */
export function glintAlpha(ms: number, life: number, blinks: boolean): number {
  if (ms < 0 || ms >= life) return 0
  if (blinks && Math.floor(ms / 45) % 3 === 1) return 0
  const u = ms / life
  return u < 0.2 ? u / 0.2 : (1 - (u - 0.2) / 0.8) ** 2
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
  notePrefChange()
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
    // That tab reports its own change to the account; this one only follows.
    if (e.key === MOTION_KEY || e.key === null) withoutPrefEvents(() => changed(parseMotion(read())))
  })
}
