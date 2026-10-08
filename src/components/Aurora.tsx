import { useEffect, useRef } from 'react'

/*
 * Animated brand surface. Soft radial "smoke" patches in a lighter and a darker shade of the theme
 * drift over the brand → duo gradient, swelling and fading so the shades bloom into each other
 * (radial gradients that fade to transparent, so no hard edges). On the card, soft white bubbles
 * float too. Every patch and bubble wanders on a random walk around its own centre, inside a
 * fixed radius: each hop picks a new random point and eases there, so the motion never repeats
 * and differs per person and per visit. Transform and opacity only (Web Animations); nothing
 * moves under prefers-reduced-motion. Put it inside a `relative isolate overflow-hidden` parent
 * and give the content `relative`.
 */

type Range = [number, number]
interface Walk {
  /** how far from its centre it may roam, in `unit` */
  r: number
  unit: '%' | 'px'
  scale: Range
  opacity?: Range
  /** seconds per hop */
  hop: Range
}

const rand = ([a, b]: Range) => a + Math.random() * (b - a)
const point = (w: Walk) => {
  const a = Math.random() * Math.PI * 2
  const d = w.r * Math.sqrt(Math.random()) // uniform over the disc, not bunched at the centre
  return { x: Math.cos(a) * d, y: Math.sin(a) * d, s: rand(w.scale), o: w.opacity ? rand(w.opacity) : undefined }
}
const frame = (w: Walk, p: ReturnType<typeof point>): Keyframe => ({
  transform: `translate(${p.x.toFixed(1)}${w.unit}, ${p.y.toFixed(1)}${w.unit}) scale(${p.s.toFixed(3)})`,
  ...(p.o !== undefined ? { opacity: p.o } : {}),
})

/** Start a random walk on `el`; returns a stop function. */
function wander(el: HTMLElement, w: Walk): () => void {
  let cur = point(w)
  let anim: Animation | undefined
  let stopped = false
  const f0 = frame(w, cur)
  el.style.transform = String(f0.transform)
  if (f0.opacity !== undefined) el.style.opacity = String(f0.opacity)
  const step = () => {
    if (stopped) return
    const next = point(w)
    const to = frame(w, next)
    anim = el.animate([frame(w, cur), to], { duration: rand(w.hop) * 1000, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' })
    anim.onfinish = () => {
      el.style.transform = String(to.transform)
      if (to.opacity !== undefined) el.style.opacity = String(to.opacity)
      cur = next
      step()
    }
  }
  // Start each one part-way into a hop so they don't all set off together.
  const t = setTimeout(step, Math.random() * 1500)
  return () => { stopped = true; clearTimeout(t); anim?.cancel() }
}

function useWander(walks: Walk[]) {
  const refs = useRef<Array<HTMLDivElement | null>>([])
  useEffect(() => {
    if (typeof Element === 'undefined' || !Element.prototype.animate) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const stops = refs.current.map((el, i) => (el && walks[i] ? wander(el, walks[i]) : () => {}))
    return () => stops.forEach((s) => s())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (i: number) => (el: HTMLDivElement | null) => { refs.current[i] = el }
}

// Card: smoke (light, dark, duo) then bubbles. Hops are slow so the blend reads as smoke.
const SMOKE = (r: number, opacity: Range): Walk => ({ r, unit: '%', scale: [0.85, 1.3], opacity, hop: [5, 9] })
const BUBBLE = (r: number): Walk => ({ r, unit: 'px', scale: [0.9, 1.12], hop: [4, 7] })
const CARD: Walk[] = [SMOKE(22, [0.55, 1]), SMOKE(20, [0.5, 0.95]), SMOKE(25, [0.4, 0.9]), SMOKE(18, [0.35, 0.8]), BUBBLE(26), BUBBLE(22), BUBBLE(18), BUBBLE(14)]
const FAB: Walk[] = [
  { r: 22, unit: '%', scale: [0.9, 1.25], opacity: [0.5, 1], hop: [2.6, 4.2] },
  { r: 22, unit: '%', scale: [0.9, 1.25], opacity: [0.45, 1], hop: [2.8, 4.6] },
  { r: 18, unit: '%', scale: [0.85, 1.2], opacity: [0.35, 0.9], hop: [2.4, 4] },
]

/** A patch that fades to transparent at its edge. */
const bloom = (color: string) => ({ background: `radial-gradient(closest-side, ${color}, transparent)` })
const mix = (v: string, pct: number) => `color-mix(in oklab, var(${v}) ${pct}%, transparent)`

export function Aurora({ size = 'card' }: { size?: 'card' | 'fab' }) {
  const ref = useWander(size === 'fab' ? FAB : CARD)
  if (size === 'fab') {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] bg-gradient-to-br from-brand-500 via-brand-600 to-duo-600">
        <div ref={ref(0)} className="absolute -left-1/2 -top-1/2 h-[140%] w-[140%]" style={bloom(mix('--color-brand-400', 85))} />
        <div ref={ref(1)} className="absolute -bottom-1/2 -right-1/2 h-[140%] w-[140%]" style={bloom(mix('--color-brand-800', 85))} />
        <div ref={ref(2)} className="absolute -left-[10%] top-[10%] h-full w-full" style={bloom(mix('--color-duo-500', 80))} />
      </div>
    )
  }
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-duo-600">
      {/* smoke: lighter and darker shades blooming into each other */}
      <div ref={ref(0)} className="absolute -left-[20%] -top-[35%] h-[110%] w-[75%] blur-xl" style={bloom(mix('--color-brand-300', 65))} />
      <div ref={ref(1)} className="absolute -right-[20%] -top-[30%] h-[120%] w-[80%] blur-xl" style={bloom(mix('--color-brand-900', 95))} />
      <div ref={ref(2)} className="absolute -bottom-[40%] left-[10%] h-[110%] w-[80%] blur-xl" style={bloom(mix('--color-duo-500', 70))} />
      <div ref={ref(3)} className="absolute -bottom-[30%] -right-[10%] h-[90%] w-[55%] blur-xl" style={bloom(mix('--color-brand-900', 70))} />
      {/* bubbles, each roaming around its own spot */}
      <div ref={ref(4)} className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
      <div ref={ref(5)} className="absolute -bottom-16 right-10 h-32 w-32 rounded-full bg-white/[0.08]" />
      <div ref={ref(6)} className="absolute -left-8 top-1/2 h-20 w-20 rounded-full bg-white/[0.06]" />
      <div ref={ref(7)} className="absolute left-[46%] top-[14%] h-8 w-8 rounded-full bg-white/[0.08]" />
    </div>
  )
}
