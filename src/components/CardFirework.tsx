import { useEffect, useRef } from 'react'
import { useMotion } from '@/hooks/useMotion'
import { type FireworkLook, fireworkLook } from '@/lib/firework'
import {
  activeMotion,
  fireworkScale,
  type GlintKind,
  glintAlpha,
  glintCount,
  glintLife,
  glintRadius,
  glintShape,
  particleScale,
  SPARK_LIFE,
} from '@/lib/motion'

/*
 * Quiet fireworks for the Home balance card when you're all settled up.
 *
 * Every shell launches from a random point along the card's bottom edge with a real initial
 * velocity, leaning inwards, and climbs on a ballistic arc (constant gravity, so it slows
 * smoothly) to burst just short of its apex somewhere in the top half of the card. A thin
 * fading spark trail follows it. Bursts are soft, washed-out particles (additive blend at low
 * alpha, a faint halo instead of shadowBlur) under gravity + drag. Colours are picked per shell from the live theme, read
 * with getComputedStyle at launch so accents just work: on a deep fill light colours glow on top
 * (brand-200/300, duo-300, white, soft gold); on a bright fill (dark text: Neon, or "Text on
 * accent" set to Black) they would vanish, so the sparks are painted in the text's ink and the
 * accent's deep shades instead (fireworkLook in src/lib/firework.ts).
 *
 * Choreography: rounds of 2–3 near-simultaneous shells (the opening round has 3) for 10–12
 * rounds in total, dimming towards a calmer brightness; after that it settles into a single
 * shell at a time at a gentle pace, indefinitely.
 *
 * One rAF loop driven by its own show clock: it pauses (state kept) while the card is
 * off-screen or the tab is hidden, sleeps on a timer during quiet gaps, and everything is torn
 * down on unmount. Renders nothing under prefers-reduced-motion or when Settings → Animations
 * turns fireworks off. Firework size and Twinkle are read per burst, so a change shows on the next
 * one; Spark size, Glitter and Glitter size every frame.
 *
 * Glitter: when a burst spark burns out it leaves a brief flash of small dots in the blast area
 * (spawnGlints; the timing, count and sizes are glint* in src/lib/motion.ts), so as a burst fades
 * a few lights flash here and there, some bigger, some brighter, a few stretched, and are gone.
 * Twinkle (off by default) is separate: some sparks pulse as they fade, the brightest with a
 * small four-point star.
 *
 * Place it inside the card's `relative isolate overflow-hidden` box, after <Aurora /> and
 * before the (relative) content, so it paints between the two.
 */

const MAX_PARTICLES = 520
const FIRST = 700 // ms of show clock before the first launch
const STEADY_BRIGHT = 0.45

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1))
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const cssVar = (name: string, fallback: string) => {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
  } catch {
    return fallback
  }
}

interface Shell {
  x: number
  y: number
  vx: number
  vy: number
  g: number
  burstAt: number // show-clock ms
  hist: { x: number; y: number; t: number }[]
  colors: string[]
  look: FireworkLook
  bright: number
  size: number
  alive: boolean
}
interface Particle {
  x: number
  y: number
  px: number
  py: number
  vx: number
  vy: number
  born: number
  life: number
  color: string
  r: number
  drag: number
  grav: number
  alpha: number
  twinkle: number // 0 = none, else phase seed
  ember: boolean
  /** a glitter light's shape; none for a spark */
  glint: GlintKind | null
  /** the burst's centre (a burst spark's glitter is pulled towards it) */
  ox: number
  oy: number
  /** a burst spark's glitter colour when it isn't its own: white-hot on a deep fill */
  hot: string
  /** a glitter streak's half-length, in radii */
  len: number
  /** a curl's bend: which way, and how far (in radii) */
  bend: number
  blend: FireworkLook['blend']
  halo: number
  shrink: number
}
interface Flash {
  x: number
  y: number
  t: number
  a: number
  rgb: string
  blend: FireworkLook['blend']
}
interface Launch {
  at: number
  bright: number
}

export function CardFirework({ testId = 'home-firework' }: { testId?: string } = {}) {
  const { prefs, reduced } = useMotion()
  const on = activeMotion(prefs, reduced).fireworks
  const ref = useRef<HTMLCanvasElement>(null)
  // Size and glitter are read per burst, without restarting the show.
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  useEffect(() => {
    if (!on) return
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let w = 0,
      h = 0
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    size()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(size) : null
    ro?.observe(canvas)

    // ---- choreography -------------------------------------------------------------------
    const ROUNDS = randInt(10, 12)
    let round = 0
    let planEnd = FIRST // show-clock ms at which the planned schedule ends
    const queue: Launch[] = []
    const plan = () => {
      if (round < ROUNDS) {
        const n = round === 0 ? 3 : pick([2, 3, 3, 2, 3])
        const bright = STEADY_BRIGHT + (1 - STEADY_BRIGHT) * Math.exp(-round / 3.2)
        let t = planEnd + (round === 0 ? 0 : rand(1300, 2400))
        for (let i = 0; i < n; i++) {
          queue.push({ at: t, bright: bright * rand(0.9, 1.05) })
          t += rand(160, 520)
        }
        planEnd = t
        round++
      } else {
        // Wind-down: a single shell at a time at a gentle pace.
        const t = planEnd + rand(2600, 4600)
        queue.push({ at: t, bright: STEADY_BRIGHT * rand(0.85, 1) })
        planEnd = t
      }
    }

    // ---- simulation state ---------------------------------------------------------------
    let clock = 0 // show clock, ms; only advances while running
    let shells: Shell[] = []
    let parts: Particle[] = []
    let flashes: Flash[] = []
    let raf = 0
    let sleep: ReturnType<typeof setTimeout> | undefined
    let last = 0
    let running = false
    let onScreen = true

    // The look follows the fill under the card, read fresh per shell so an accent or ink change
    // shows on the next launch.
    const currentLook = () =>
      fireworkLook({
        onFill: cssVar('--color-on-fill', '#ffffff'),
        brand200: cssVar('--color-brand-200', '#ddd6fe'),
        brand300: cssVar('--color-brand-300', '#c4b5fd'),
        duo300: cssVar('--color-duo-300', '#f0abfc'),
        brand700: cssVar('--color-brand-700', '#6d28d9'),
        brand800: cssVar('--color-brand-800', '#5b21b6'),
        duo700: cssVar('--color-duo-700', '#a21caf'),
      })
    const palette = (look: FireworkLook) => {
      const main = pick(look.main)
      const others = look.accents.filter((c) => c !== main)
      const accent = pick(others) ?? main
      // On a bright fill a shell mixes three colours for a more festive burst.
      if (look.mixed) return [main, main, accent, pick(others.filter((c) => c !== accent)) ?? accent]
      return [main, main, main, accent]
    }

    const launch = (bright: number) => {
      if (!w || !h) return
      if (shells.filter((s) => s.alive).length >= 5) return
      const y0 = h + 3
      const x0 = w * rand(0.04, 0.96)
      // Lean inwards so the arc stays on the card; burst somewhere in the top half.
      let xb = x0 + w * rand(-0.16, 0.16) + (w * 0.5 - x0) * rand(0.15, 0.55)
      xb = clamp(xb, w * 0.12, w * 0.88)
      const yb = h * rand(0.1, 0.46)
      const H = y0 - yb
      const T = rand(1.05, 1.45) // s to apex
      const g = (2 * H) / (T * T)
      const vy = -g * T
      const vx = (xb - x0) / T
      const look = currentLook()
      shells.push({
        x: x0,
        y: y0,
        vx,
        vy,
        g,
        burstAt: clock + T * 1000 * rand(0.9, 0.96),
        hist: [],
        colors: palette(look),
        look,
        bright,
        size: rand(0.8, 1.15),
        alive: true,
      })
    }

    const burst = (s: Shell) => {
      const k = fireworkScale(prefsRef.current.size)
      const [lifeMin, lifeMax] = SPARK_LIFE
      const twinkles = prefsRef.current.twinkle
      const scale = clamp(Math.min(w, h * 1.9) / 330, 0.75, 1.25) * s.size * k
      // A bigger burst gets more sparks so it doesn't look sparse.
      let n = Math.round(rand(22, 30) * (0.6 + 0.4 * s.bright) * s.look.count * k)
      n = Math.min(n, MAX_PARTICLES - parts.length)
      const drag = rand(2.1, 2.6)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.12, 0.12)
        // Mostly a shell, a few slower ones filling the middle.
        const v = (Math.random() < 0.8 ? rand(85, 112) : rand(30, 80)) * scale
        parts.push({
          x: s.x,
          y: s.y,
          px: s.x,
          py: s.y,
          vx: Math.cos(a) * v + s.vx * 0.3,
          vy: Math.sin(a) * v + s.vy * 0.3,
          born: clock + rand(0, 60),
          life: rand(lifeMin, lifeMax),
          color: s.colors[i % s.colors.length],
          r: rand(0.8, 1.35) * s.look.dot,
          drag,
          grav: 34,
          alpha: s.bright * 0.75 * s.look.alpha,
          twinkle: twinkles && Math.random() < 0.45 ? rand(1, 1000) : 0,
          ember: false,
          glint: null,
          ox: s.x,
          oy: s.y,
          // Painted (bright fill) sparks keep their own ink; light added on a deep fill can flash white.
          hot: s.look.blend === 'lighter' ? `rgb(${s.look.flash})` : s.colors[i % s.colors.length],
          len: 0,
          bend: 0,
          blend: s.look.blend,
          halo: s.look.halo,
          shrink: s.look.shrink,
        })
      }
      flashes.push({ x: s.x, y: s.y, t: clock, a: s.bright, rgb: s.look.flash, blend: s.look.blend })
    }

    // The glitter a burnt-out burst spark leaves (see the header and glint* in src/lib/motion.ts).
    const spawnGlints = (p: Particle, into: Particle[]) => {
      const n = glintCount(Math.random(), Math.random())
      for (let i = 0; i < n && parts.length + into.length < MAX_PARTICLES; i++) {
        const pull = rand(0, 0.55)
        into.push({
          ...p,
          x: p.x + (p.ox - p.x) * pull + rand(-5, 5),
          y: p.y + (p.oy - p.y) * pull + rand(-5, 5),
          vx: p.vx * 0.2 + rand(-6, 6),
          vy: p.vy * 0.2 + rand(0, 12),
          born: clock + rand(0, 140),
          life: glintLife(Math.random()),
          r: (0.7 + 1.1 * Math.random() ** 2) * (p.shrink ? 1.2 : 1),
          drag: 4,
          grav: 20,
          // most at a good share of the burst's light, one in ten at full
          alpha: Math.random() < 0.1 ? 1 : rand(0.6, 1) * Math.min(1, p.alpha * 2.2),
          color: Math.random() < 0.55 ? p.hot : p.color,
          twinkle: Math.random() < 0.25 ? 1 : 0, // blinks once
          glint: glintShape(prefsRef.current.glitterShape, Math.random()),
          len: rand(1.25, 2),
          bend: (Math.random() < 0.5 ? -1 : 1) * rand(0.8, 1.6),
          shrink: 0,
        })
      }
    }

    const draw = (dt: number) => {
      ctx.clearRect(0, 0, w, h)
      ctx.lineCap = 'round'

      // Shells + trails
      for (const s of shells) {
        ctx.globalCompositeOperation = s.look.blend
        if (s.alive) {
          s.vy += s.g * dt
          s.x += s.vx * dt
          s.y += s.vy * dt
          s.hist.push({ x: s.x, y: s.y, t: clock })
          if (Math.random() < 0.45 && parts.length < MAX_PARTICLES) {
            parts.push({
              x: s.x,
              y: s.y,
              px: s.x,
              py: s.y,
              vx: rand(-8, 8) - s.vx * 0.05,
              vy: rand(-4, 10) - s.vy * 0.05,
              born: clock,
              life: rand(260, 520),
              color: s.look.ember,
              r: rand(0.45, 0.8) * s.look.spark,
              drag: 3,
              grav: 40,
              alpha: s.bright * 0.7,
              twinkle: 0,
              ember: true,
              glint: null,
              ox: 0,
              oy: 0,
              hot: s.look.ember,
              len: 0,
              bend: 0,
              blend: s.look.blend,
              halo: s.look.halo,
              shrink: 0,
            })
          }
          if (clock >= s.burstAt) {
            s.alive = false
            burst(s)
          }
        }
        const trailMs = s.look.trailMs
        s.hist = s.hist.filter((p) => clock - p.t < trailMs)
        const pts = s.hist
        for (let i = 1; i < pts.length; i++) {
          const k = 1 - (clock - pts[i].t) / trailMs
          ctx.globalAlpha = Math.max(0, k * k * 0.55 * s.bright)
          ctx.strokeStyle = s.look.trail
          ctx.lineWidth = (0.6 + k * 0.7) * s.look.spark
          ctx.beginPath()
          ctx.moveTo(pts[i - 1].x, pts[i - 1].y)
          ctx.lineTo(pts[i].x, pts[i].y)
          ctx.stroke()
        }
        if (s.alive) {
          ctx.fillStyle = s.look.head
          ctx.globalAlpha = 0.18 * s.bright * (s.look.halo / 0.13) // the glow scales with the look's halo (faint on bright fills)
          ctx.beginPath()
          ctx.arc(s.x, s.y, 3.2 * s.look.spark, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 0.85 * s.bright
          ctx.beginPath()
          ctx.arc(s.x, s.y, 1.2 * s.look.spark, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      shells = shells.filter((s) => s.alive || s.hist.length)

      // Burst flashes
      for (const f of flashes) {
        const k = (clock - f.t) / 600
        if (k >= 1) continue
        const rad = 12 + 26 * k
        const grd = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rad)
        ctx.globalCompositeOperation = f.blend
        grd.addColorStop(0, `rgba(${f.rgb},0.55)`)
        grd.addColorStop(1, `rgba(${f.rgb},0)`)
        ctx.globalAlpha = (1 - k) ** 2 * 0.4 * f.a
        ctx.fillStyle = grd
        ctx.beginPath()
        ctx.arc(f.x, f.y, rad, 0, Math.PI * 2)
        ctx.fill()
      }
      flashes = flashes.filter((f) => clock - f.t < 600)

      // Particles
      const { sparkSize, glitterSize, glitter } = prefsRef.current
      const sparkK = particleScale(sparkSize)
      for (const p of parts) {
        const age = (clock - p.born) / p.life
        if (age < 0) continue
        const d = Math.exp(-p.drag * dt)
        p.px = p.x
        p.py = p.y
        p.vx *= d
        p.vy = p.vy * d + p.grav * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        if (p.glint) {
          // A glitter dot: a sharp point (or short streak), no halo, so it reads against the soft sparks.
          const ga = glintAlpha(clock - p.born, p.life, p.twinkle === 1) * p.alpha
          if (ga <= 0.004) continue
          const gr = glintRadius(p.r, glitterSize)
          ctx.globalCompositeOperation = p.blend
          ctx.globalAlpha = Math.min(1, ga)
          if (p.glint === 'streak' || p.glint === 'curl') {
            // Along its drift (down when it has stopped); a curl bends to one side.
            const sp = Math.hypot(p.vx, p.vy)
            const ang = sp > 2 ? Math.atan2(p.vy, p.vx) : Math.PI / 2
            const dx = Math.cos(ang) * gr * p.len
            const dy = Math.sin(ang) * gr * p.len
            ctx.strokeStyle = p.color
            ctx.lineWidth = gr * (p.glint === 'curl' ? 1.1 : 1.4)
            ctx.beginPath()
            ctx.moveTo(p.x - dx, p.y - dy)
            if (p.glint === 'curl')
              ctx.quadraticCurveTo(p.x - Math.sin(ang) * gr * p.bend * 2, p.y + Math.cos(ang) * gr * p.bend * 2, p.x + dx * 1.3, p.y + dy * 1.3)
            else ctx.lineTo(p.x + dx, p.y + dy)
            ctx.stroke()
          } else if (p.glint === 'star') {
            // A four-point star: a bright centre and a plus of fine rays.
            const ray = gr * (2.2 + p.len)
            ctx.strokeStyle = p.color
            ctx.lineWidth = Math.max(0.5, gr * 0.6)
            ctx.beginPath()
            ctx.moveTo(p.x - ray, p.y)
            ctx.lineTo(p.x + ray, p.y)
            ctx.moveTo(p.x, p.y - ray)
            ctx.lineTo(p.x, p.y + ray)
            ctx.stroke()
            ctx.fillStyle = p.color
            ctx.beginPath()
            ctx.arc(p.x, p.y, gr * 0.8, 0, Math.PI * 2)
            ctx.fill()
          } else {
            ctx.fillStyle = p.color
            ctx.beginPath()
            ctx.arc(p.x, p.y, gr, 0, Math.PI * 2)
            ctx.fill()
          }
          continue
        }
        let a = (1 - age) ** (p.ember ? 1.2 : 1.6) * p.alpha
        if (a <= 0.004) continue
        let tw = 0
        if (p.twinkle && age > 0.3) {
          tw = 0.5 + 0.5 * Math.sin(clock / 70 + p.twinkle)
          a *= 0.45 + 0.75 * tw
        }
        // Painted sparks (bright fills) shrink as they fall, so they stay fine.
        const r = p.r * (p.ember ? 1 : sparkK) * (1 - p.shrink * age)
        ctx.globalCompositeOperation = p.blend
        ctx.fillStyle = p.color
        ctx.strokeStyle = p.color
        if (!p.ember) {
          // soft halo
          ctx.globalAlpha = a * p.halo
          ctx.beginPath()
          ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2)
          ctx.fill()
          // short streak while still moving fast
          const sp = Math.hypot(p.vx, p.vy)
          if (sp > 18) {
            ctx.globalAlpha = a * 0.35
            ctx.lineWidth = r * 0.9
            ctx.beginPath()
            ctx.moveTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05)
            ctx.lineTo(p.x, p.y)
            ctx.stroke()
          }
        }
        ctx.globalAlpha = Math.min(1, a * 0.75)
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fill()
        // tiny four-point glint on the twinklers when they peak
        if (tw > 0.72) {
          const k = (tw - 0.72) / 0.28
          const len = 2 + 2.6 * k
          ctx.globalAlpha = Math.min(1, a * k * 1.1)
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 0.7
          ctx.beginPath()
          ctx.moveTo(p.x - len, p.y)
          ctx.lineTo(p.x + len, p.y)
          ctx.moveTo(p.x, p.y - len)
          ctx.lineTo(p.x, p.y + len)
          ctx.stroke()
        }
      }
      // A burst spark that burns out (not one that falls off the card) leaves its glitter.
      const born: Particle[] = []
      parts = parts.filter((p) => {
        const alive = clock - p.born < p.life && p.y < h + 8
        if (!alive && glitter && !p.ember && !p.glint && p.y < h + 8) spawnGlints(p, born)
        return alive
      })
      if (born.length) parts.push(...born)

      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }

    const busy = () => shells.length > 0 || parts.length > 0 || flashes.length > 0

    const tick = (now: number) => {
      raf = 0
      if (!running) return
      const dt = Math.min(0.05, (now - (last || now)) / 1000)
      last = now
      clock += dt * 1000
      while (queue.length && queue[0].at <= clock) launch(queue.shift()!.bright)
      if (!queue.length) plan()
      draw(dt)
      if (busy()) {
        raf = requestAnimationFrame(tick)
        return
      }
      // Quiet gap: clear and sleep until the next launch instead of spinning frames.
      ctx.clearRect(0, 0, w, h)
      const wait = Math.max(0, queue[0].at - clock)
      last = 0
      sleep = setTimeout(() => {
        sleep = undefined
        if (!running) return
        clock = Math.max(clock, queue[0]?.at ?? clock)
        raf = requestAnimationFrame(tick)
      }, wait)
    }

    const start = () => {
      if (running) return
      running = true
      last = 0
      if (!queue.length) plan()
      raf = requestAnimationFrame(tick)
    }
    const pause = () => {
      running = false
      cancelAnimationFrame(raf)
      raf = 0
      clearTimeout(sleep)
      sleep = undefined
      last = 0
    }
    const sync = () => {
      if (onScreen && document.visibilityState !== 'hidden') start()
      else pause()
    }

    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([e]) => {
            onScreen = e.isIntersecting
            sync()
          })
        : null
    io?.observe(canvas)
    document.addEventListener('visibilitychange', sync)
    sync()

    return () => {
      pause()
      shells = []
      parts = []
      flashes = []
      ctx.clearRect(0, 0, w, h)
      ro?.disconnect()
      io?.disconnect()
      document.removeEventListener('visibilitychange', sync)
    }
  }, [on])

  if (!on) return null
  return <canvas ref={ref} aria-hidden data-testid={testId} className="pointer-events-none absolute inset-0 h-full w-full" />
}
