import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PartyPopper } from 'lucide-react'

/*
 * "All settled up" celebration: a party-popper icon that pops and throws a little confetti,
 * plus a short fireworks show. Rockets rise from the bottom of the screen and burst near the
 * top right. The fireworks canvas is fixed full-screen at z-index 0 (portalled to <body>), so
 * the page's content must sit above it (`relative z-10`): rockets pass *behind* the cards,
 * which reads as depth. Plays once on mount (~2.8 s), again on each tap of the icon; the
 * canvas loop stops when the show ends and on unmount. Under prefers-reduced-motion it's just
 * a static icon.
 */

const reducedQuery = '(prefers-reduced-motion: reduce)'
function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(reducedQuery).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(reducedQuery)
    if (!mq) return
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

const cssVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
const isDark = () => document.documentElement.classList.contains('dark')

function palette() {
  const dark = isDark()
  return {
    dark,
    colors: dark
      ? [cssVar('--color-brand-300', '#c4b5fd'), cssVar('--color-duo-400', '#e879f9'), cssVar('--color-brand-400', '#a78bfa')]
      : [cssVar('--color-brand-500', '#8b5cf6'), cssVar('--color-duo-500', '#d946ef'), cssVar('--color-brand-600', '#7c3aed')],
    gold: dark ? '#fcd34d' : '#f59e0b',
  }
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const easeOut = (t: number) => 1 - (1 - t) ** 3

interface Rocket { x0: number; y0: number; x1: number; y1: number; start: number; dur: number; color: string; burst: boolean }
interface Spark { x: number; y: number; px: number; py: number; vx: number; vy: number; born: number; life: number; color: string; w: number }
interface Flash { x: number; y: number; born: number; color: string }

/** The fireworks loop on `canvas`; returns { play, stop }. All times in ms of performance.now(). */
function fireworks(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  let raf = 0
  let rockets: Rocket[] = []
  let sparks: Spark[] = []
  let flashes: Flash[] = []
  let last = 0
  let pal = palette()
  let w = 0, h = 0

  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    w = window.innerWidth
    h = window.innerHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  const burst = (r: Rocket, now: number) => {
    const n = Math.round(rand(38, 50))
    const speed = rand(150, 210) * Math.min(1, Math.max(0.75, w / 420))
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.08, 0.08)
      const v = speed * rand(0.55, 1)
      const gold = Math.random() < 0.28
      sparks.push({ x: r.x1, y: r.y1, px: r.x1, py: r.y1, vx: Math.cos(a) * v, vy: Math.sin(a) * v, born: now, life: rand(900, 1300), color: gold ? pal.gold : r.color, w: gold ? 1.6 : 2.2 })
    }
    flashes.push({ x: r.x1, y: r.y1, born: now, color: r.color })
  }

  const tick = (now: number) => {
    if (!ctx) return
    const dt = Math.min(0.05, (now - (last || now)) / 1000)
    last = now
    ctx.clearRect(0, 0, w, h)
    ctx.globalCompositeOperation = pal.dark ? 'lighter' : 'source-over'
    ctx.lineCap = 'round'

    // Rockets: an eased climb with a fading tail.
    for (const r of rockets) {
      const t = (now - r.start) / r.dur
      if (t < 0) continue
      if (t >= 1) { if (!r.burst) { r.burst = true; burst(r, now) } continue }
      const p = easeOut(t)
      const tp = easeOut(Math.max(0, t - 0.12))
      const x = r.x0 + (r.x1 - r.x0) * p, y = r.y0 + (r.y1 - r.y0) * p
      const tx = r.x0 + (r.x1 - r.x0) * tp, ty = r.y0 + (r.y1 - r.y0) * tp
      const g = ctx.createLinearGradient(tx, ty, x, y)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, r.color)
      ctx.globalAlpha = 0.9
      ctx.strokeStyle = g
      ctx.lineWidth = 2.4
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke()
      ctx.fillStyle = pal.gold
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill()
    }
    rockets = rockets.filter((r) => !r.burst)

    // Burst flash: a quick soft glow where the shell opens.
    for (const f of flashes) {
      const k = (now - f.born) / 260
      if (k >= 1) continue
      const rad = 18 + 34 * k
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rad)
      g.addColorStop(0, f.color)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.globalAlpha = (1 - k) * 0.55
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(f.x, f.y, rad, 0, Math.PI * 2); ctx.fill()
    }
    flashes = flashes.filter((f) => now - f.born < 260)

    // Sparks: drag + gravity, drawn as short streaks that fade (and twinkle near the end).
    const drag = Math.exp(-2.4 * dt)
    for (const s of sparks) {
      const age = (now - s.born) / s.life
      s.px = s.x; s.py = s.y
      s.vx *= drag; s.vy = s.vy * drag + 110 * dt
      s.x += s.vx * dt; s.y += s.vy * dt
      let a = 1 - age ** 1.6
      if (age > 0.6 && Math.random() < 0.25) a *= 0.3
      ctx.globalAlpha = Math.max(0, a)
      ctx.strokeStyle = s.color
      ctx.lineWidth = s.w
      ctx.beginPath(); ctx.moveTo(s.px - (s.x - s.px) * 1.5, s.py - (s.y - s.py) * 1.5); ctx.lineTo(s.x, s.y); ctx.stroke()
    }
    sparks = sparks.filter((s) => now - s.born < s.life)

    ctx.globalAlpha = 1
    if (rockets.length || sparks.length || flashes.length) raf = requestAnimationFrame(tick)
    else { raf = 0; last = 0; ctx.clearRect(0, 0, w, h) }
  }

  const onResize = () => size()
  window.addEventListener('resize', onResize)
  size()

  return {
    play() {
      pal = palette()
      const now = performance.now()
      const delays = [0, 300, 560, 860]
      delays.forEach((d, i) => {
        rockets.push({
          x0: w * rand(0.25, 0.9), y0: h + 8,
          x1: w * rand(0.55, 0.9), y1: h * rand(0.08, 0.3),
          start: now + d, dur: rand(720, 880), color: pal.colors[i % pal.colors.length], burst: false,
        })
      })
      if (!raf) raf = requestAnimationFrame(tick)
    },
    stop() {
      cancelAnimationFrame(raf)
      raf = 0
      rockets = []; sparks = []; flashes = []
      window.removeEventListener('resize', onResize)
      ctx?.clearRect(0, 0, w, h)
    },
  }
}

const CONFETTI = Array.from({ length: 12 }, (_, i) => i)

export function Celebrate({ size = 88 }: { size?: number }) {
  const reduced = useReducedMotion()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const iconRef = useRef<HTMLSpanElement>(null)
  const bitsRef = useRef<HTMLSpanElement>(null)
  const show = useRef<ReturnType<typeof fireworks> | null>(null)
  const anims = useRef<Animation[]>([])

  const popIcon = useCallback(() => {
    anims.current.forEach((a) => a.cancel())
    anims.current = []
    const icon = iconRef.current
    if (icon?.animate) {
      anims.current.push(icon.animate([
        { transform: 'rotate(-24deg) scale(0.6)', offset: 0 },
        { transform: 'rotate(14deg) scale(1.14)', offset: 0.45 },
        { transform: 'rotate(-6deg) scale(0.97)', offset: 0.7 },
        { transform: 'rotate(0deg) scale(1)', offset: 1 },
      ], { duration: 760, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)' }))
    }
    const { colors, gold } = palette()
    const bits = bitsRef.current?.children
    if (!bits) return
    for (let i = 0; i < bits.length; i++) {
      const el = bits[i] as HTMLElement
      el.style.background = i % 3 === 2 ? gold : colors[i % 2]
      // The popper's mouth points up-right: throw the bits into that quarter.
      const a = (-90 + rand(-25, 95)) * (Math.PI / 180)
      const d = size * rand(0.45, 0.85)
      const x = Math.cos(a) * d, y = Math.sin(a) * d
      const spin = rand(-360, 360)
      anims.current.push(el.animate([
        { transform: 'translate(0, 0) rotate(0deg) scale(0.4)', opacity: 0 },
        { transform: `translate(${x * 0.7}px, ${y * 0.7}px) rotate(${spin * 0.6}deg) scale(1)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${x}px, ${y + size * 0.35}px) rotate(${spin}deg) scale(0.9)`, opacity: 0 },
      ], { duration: rand(900, 1200), delay: 120 + rand(0, 90), easing: 'cubic-bezier(0.15, 0.7, 0.3, 1)', fill: 'backwards' }))
    }
  }, [size])

  const play = useCallback(() => {
    if (reduced) return
    popIcon()
    show.current?.play()
  }, [reduced, popIcon])

  useEffect(() => {
    if (reduced || !canvasRef.current) return
    const fw = fireworks(canvasRef.current)
    show.current = fw
    const t = setTimeout(() => { popIcon(); fw.play() }, 150) // after the page has painted
    return () => {
      clearTimeout(t)
      fw.stop()
      show.current = null
      anims.current.forEach((a) => a.cancel())
      anims.current = []
    }
  }, [reduced, popIcon])

  const badge = (
    <span
      className="relative flex items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-duo-100 text-brand-600 ring-1 ring-brand-500/15 dark:from-brand-900/60 dark:to-duo-900/40 dark:text-brand-200 dark:ring-white/10"
      style={{ width: size, height: size }}
    >
      <span ref={iconRef} className="flex" style={{ transformOrigin: '35% 70%' }}>
        <PartyPopper size={size * 0.5} strokeWidth={1.8} aria-hidden />
      </span>
      {!reduced && (
        <span ref={bitsRef} aria-hidden className="pointer-events-none absolute" style={{ left: '58%', top: '34%' }}>
          {CONFETTI.map((i) => (
            <span key={i} className="absolute block opacity-0" style={{ width: i % 2 ? 6 : 4, height: i % 2 ? 3 : 6, borderRadius: i % 4 === 0 ? 9 : 1 }} />
          ))}
        </span>
      )}
    </span>
  )

  if (reduced) return <div data-testid="celebrate" aria-hidden>{badge}</div>
  return (
    <>
      <button type="button" onClick={play} aria-label="Celebrate again" data-testid="celebrate" className="rounded-full transition active:scale-95">
        {badge}
      </button>
      {createPortal(
        <canvas ref={canvasRef} aria-hidden data-testid="fireworks" className="pointer-events-none fixed inset-0 z-0 h-full w-full" />,
        document.body,
      )}
    </>
  )
}
