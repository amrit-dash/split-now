import { useEffect, useRef } from 'react'
import { useMotion } from '@/hooks/useMotion'
import { activeMotion, flowRate } from '@/lib/motion'

/*
 * Animated brand surface. Soft radial "smoke" patches in a lighter and a darker shade of the theme
 * drift over the brand → duo gradient, swelling and fading so the shades bloom into each other
 * (radial gradients that fade to transparent, so no hard edges). On the card, soft white bubbles
 * float too.
 *
 * Motion is a little 2D steering, not a loop: every shape glides in a random direction along a
 * smoothly curving path. Its turning comes from slow, irregular waves (never jitter), and as it
 * nears the edge of its own small area around its home spot it is turned back gradually, so it
 * curves round instead of bouncing or snapping direction. Nothing repeats, and every person and
 * visit gets different paths. Size and opacity breathe on their own slow, irregular cycles.
 * One requestAnimationFrame loop, transform/opacity only; nothing moves under
 * prefers-reduced-motion, and the loop stops while the surface is scrolled off-screen or the tab
 * is hidden (it picks up where it left off), so nothing animates unseen. Settings → Animations can
 * still the colour flow (the smoke) and the circles (the bubbles) separately, and speed the flow up
 * or slow it down; a stilled shape stays where it was. Put it inside a `relative isolate overflow-hidden` parent and give the
 * content `relative`.
 */

type Range = [number, number]
interface Body {
  /** Which Animations setting moves it: the colour flow or the floating circles. */
  kind: 'flow' | 'circle'
  /** half-size of the box it may roam, as a fraction of the surface's width / height */
  bx: number
  by: number
  /** px per second */
  speed: Range
  scale: Range
  opacity?: Range
  /** seconds per breath (size/opacity) */
  breathe: Range
}

const rand = ([a, b]: Range) => a + Math.random() * (b - a)
/** Wandering turn rate (rad/s), from two slow sine waves per shape so paths curve without jitter. */
const WANDER = 0.55
/** How hard a shape is turned back toward home once past this share of its area. */
const SOFT_EDGE = 0.55
const HOME_PULL = 2.4

interface State {
  x: number
  y: number
  a: number
  v: number
  w1: number
  w2: number
  p1: number
  p2: number
  t1: number
  t2: number
  q1: number
  q2: number
}

function start(b: Body): State {
  return {
    x: (Math.random() * 2 - 1) * 0.6,
    y: (Math.random() * 2 - 1) * 0.6, // in box units (-1..1)
    a: Math.random() * Math.PI * 2,
    v: rand(b.speed),
    w1: (Math.PI * 2) / rand(b.breathe),
    w2: (Math.PI * 2) / rand([b.breathe[0] * 1.6, b.breathe[1] * 2.2]),
    p1: Math.random() * Math.PI * 2,
    p2: Math.random() * Math.PI * 2,
    t1: (Math.PI * 2) / rand([9, 15]),
    t2: (Math.PI * 2) / rand([5, 8]),
    q1: Math.random() * Math.PI * 2,
    q2: Math.random() * Math.PI * 2,
  }
}

/*
 * Where each surface's shapes were when it unmounted, so Home's card picks up its drift exactly
 * where it left off when you come back (no jump to new random spots). Keyed by the bodies array;
 * only surfaces mounted once at a time use it (the card), never the three + button layers that
 * share FAB and run side by side.
 */
const resume = new Map<Body[], { st: Array<State | null>; elapsed: number }>()

interface Live {
  flow: boolean
  circles: boolean
  rate: number
}

function useBodies(bodies: Body[], persist = false) {
  const box = useRef<HTMLDivElement>(null)
  const refs = useRef<Array<HTMLDivElement | null>>([])
  const { prefs, reduced } = useMotion()
  const on = activeMotion(prefs, reduced)
  // Read every frame, so a speed change applies without restarting the drift.
  const live = useRef<Live>({ flow: on.flow, circles: on.circles, rate: flowRate(prefs.speed) })
  live.current = { flow: on.flow, circles: on.circles, rate: flowRate(prefs.speed) }
  // The loop runs only while something on this surface moves.
  const active = bodies.some((b) => (b.kind === 'flow' ? on.flow : on.circles))
  // biome-ignore lint/correctness/useExhaustiveDependencies: the motion loop starts once per mount (and when Animations stops or starts everything on it); bodies is a module constant (CARD or FAB), and the card resumes where it was.
  useEffect(() => {
    if (typeof window === 'undefined' || !box.current || !active) return
    const host = box.current
    const els = refs.current
    const kept = persist ? resume.get(bodies) : undefined
    const st = kept && kept.st.length === els.length ? kept.st : els.map((el, i) => (el && bodies[i] ? start(bodies[i]) : null))
    let W = host.clientWidth,
      H = host.clientHeight
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            W = host.clientWidth
            H = host.clientHeight
          })
        : null
    ro?.observe(host)
    let raf = 0
    let last = performance.now()
    // Resume the clock too, so size and opacity breathing continue rather than jump.
    let t0 = last - (kept ? kept.elapsed * 1000 : 0)
    // Run only while on screen and the tab is visible; the clock skips the paused time.
    let seen = true
    let pausedAt = 0
    const sync = () => {
      const run = seen && !document.hidden
      if (run && !raf) {
        const now = performance.now()
        if (pausedAt) t0 += now - pausedAt
        pausedAt = 0
        last = now
        raf = requestAnimationFrame(tick)
      } else if (!run && raf) {
        cancelAnimationFrame(raf)
        raf = 0
        pausedAt = performance.now()
      }
    }
    const io =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(([e]) => {
            seen = e.isIntersecting
            sync()
          })
        : null
    io?.observe(host)
    document.addEventListener('visibilitychange', sync)
    const tick = (now: number, still = false) => {
      const dt = still ? 0 : Math.min(0.05, (now - last) / 1000)
      last = now
      const t = (now - t0) / 1000
      const lv = live.current
      for (let i = 0; i < els.length; i++) {
        const el = els[i],
          s = st[i],
          b = bodies[i]
        if (!el || !s) continue
        // Stilled by Animations: stays where it is (still paints once when resuming).
        if (!still && !(b.kind === 'flow' ? lv.flow : lv.circles)) continue
        const step = b.kind === 'flow' ? dt * lv.rate : dt
        const hx = Math.max(1, b.bx * W),
          hy = Math.max(1, b.by * H) // box half-size in px
        // Wander: a smooth, irregular turn rate.
        let turn = WANDER * (0.65 * Math.sin(s.t1 * t + s.q1) + 0.35 * Math.sin(s.t2 * t + s.q2))
        // Near the edge of its area (an ellipse), ease the heading back toward home.
        const r = Math.hypot(s.x, s.y)
        if (r > SOFT_EDGE) {
          const home = Math.atan2(-s.y * hy, -s.x * hx)
          const diff = Math.atan2(Math.sin(home - s.a), Math.cos(home - s.a))
          turn += diff * HOME_PULL * Math.min(1, (r - SOFT_EDGE) / (1 - SOFT_EDGE))
        }
        s.a += turn * step
        let x = s.x * hx + Math.cos(s.a) * s.v * step
        let y = s.y * hy + Math.sin(s.a) * s.v * step
        // Hard limit only as a safety net (the steering keeps it well inside).
        const rr = Math.hypot(x / hx, y / hy)
        if (rr > 1) {
          x /= rr
          y /= rr
        }
        s.x = x / hx
        s.y = y / hy
        const k = 0.5 + 0.5 * (0.6 * Math.sin(s.w1 * t + s.p1) + 0.4 * Math.sin(s.w2 * t + s.p2)) // 0..1, irregular
        const sc = b.scale[0] + (b.scale[1] - b.scale[0]) * k
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${sc.toFixed(3)})`
        if (b.opacity) {
          const ko = 0.5 + 0.25 * Math.sin(s.w2 * t + s.p1) + 0.25 * Math.sin(s.w1 * 1.3 * t + s.p2) // fades on its own rhythm
          el.style.opacity = (b.opacity[0] + (b.opacity[1] - b.opacity[0]) * ko).toFixed(3)
        }
      }
      if (!still) raf = requestAnimationFrame(tick)
    }
    // Paint the resumed positions before the first frame, so nothing flashes at the centre.
    if (kept) tick(performance.now(), true)
    sync()
    return () => {
      if (persist) resume.set(bodies, { st, elapsed: ((pausedAt || performance.now()) - t0) / 1000 })
      cancelAnimationFrame(raf)
      ro?.disconnect()
      io?.disconnect()
      document.removeEventListener('visibilitychange', sync)
    }
  }, [active])
  return {
    box,
    ref: (i: number) => (el: HTMLDivElement | null) => {
      refs.current[i] = el
    },
  }
}

// Card: smoke (light, dark, duo, dark) then bubbles. Smoke drifts slowly so the blend reads as smoke.
const SMOKE = (opacity: Range): Body => ({ kind: 'flow', bx: 0.14, by: 0.2, speed: [5, 8], scale: [0.88, 1.22], opacity, breathe: [9, 15] })
const BUBBLE = (bx: number, by: number): Body => ({ kind: 'circle', bx, by, speed: [4, 7], scale: [0.95, 1.06], breathe: [8, 13] })
// Bubble areas are small so they drift around their spot and only ever brush each other.
const CARD: Body[] = [
  SMOKE([0.55, 1]),
  SMOKE([0.5, 0.95]),
  SMOKE([0.4, 0.9]),
  SMOKE([0.35, 0.8]),
  BUBBLE(0.05, 0.09),
  BUBBLE(0.05, 0.08),
  BUBBLE(0.05, 0.09),
  BUBBLE(0.035, 0.07),
]
const FAB: Body[] = [
  { kind: 'flow', bx: 0.3, by: 0.3, speed: [7, 11], scale: [0.9, 1.25], opacity: [0.5, 1], breathe: [3, 5] },
  { kind: 'flow', bx: 0.3, by: 0.3, speed: [7, 11], scale: [0.9, 1.25], opacity: [0.45, 1], breathe: [3.2, 5.5] },
  { kind: 'flow', bx: 0.25, by: 0.25, speed: [6, 10], scale: [0.85, 1.2], opacity: [0.35, 0.9], breathe: [2.8, 4.6] },
]

/** A patch that fades to transparent at its edge. */
const bloom = (color: string) => ({ background: `radial-gradient(closest-side, ${color}, transparent)` })
const mix = (v: string, pct: number) => `color-mix(in oklab, var(${v}) ${pct}%, transparent)`

/** `persist` (default on for the card) resumes the drift where Home's card left it; previews turn it off. */
export function Aurora({ size = 'card', persist = size === 'card' }: { size?: 'card' | 'fab'; persist?: boolean }) {
  const { box, ref } = useBodies(size === 'fab' ? FAB : CARD, persist)
  if (size === 'fab') {
    return (
      <div
        ref={box}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] bg-gradient-to-br from-fill-500 via-fill to-fill-to"
      >
        <div ref={ref(0)} className="absolute -left-1/2 -top-1/2 h-[140%] w-[140%]" style={bloom(mix('--color-fill-400', 85))} />
        <div ref={ref(1)} className="absolute -bottom-1/2 -right-1/2 h-[140%] w-[140%]" style={bloom(mix('--color-fill-800', 85))} />
        <div ref={ref(2)} className="absolute -left-[10%] top-[10%] h-full w-full" style={bloom(mix('--color-fill-to-500', 80))} />
      </div>
    )
  }
  return (
    <div ref={box} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden bg-gradient-to-br from-fill-700 via-fill to-fill-to">
      {/* smoke: lighter and darker shades blooming into each other */}
      <div ref={ref(0)} className="absolute -left-[20%] -top-[35%] h-[110%] w-[75%] blur-xl" style={bloom(mix('--color-fill-300', 65))} />
      <div ref={ref(1)} className="absolute -right-[20%] -top-[30%] h-[120%] w-[80%] blur-xl" style={bloom(mix('--color-fill-900', 95))} />
      <div ref={ref(2)} className="absolute -bottom-[40%] left-[10%] h-[110%] w-[80%] blur-xl" style={bloom(mix('--color-fill-to-500', 70))} />
      <div ref={ref(3)} className="absolute -bottom-[30%] -right-[10%] h-[90%] w-[55%] blur-xl" style={bloom(mix('--color-fill-900', 70))} />
      {/* bubbles, each roaming (and bouncing) inside a box around its own spot */}
      <div ref={ref(4)} className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
      <div ref={ref(5)} className="absolute -bottom-16 right-10 h-32 w-32 rounded-full bg-white/[0.08]" />
      <div ref={ref(6)} className="absolute -left-8 top-1/2 h-20 w-20 rounded-full bg-white/[0.06]" />
      <div ref={ref(7)} className="absolute left-[50%] top-[10%] h-8 w-8 rounded-full bg-white/[0.08]" />
    </div>
  )
}
