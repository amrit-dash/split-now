import { useEffect, useRef } from 'react'

/*
 * A slow, quiet firework for the Home balance card when you're all settled: one thin trail
 * rises from the bottom of the card towards the top right and opens into a soft, sprinkling
 * burst, then the card rests and it repeats (~every 7 s). Canvas + requestAnimationFrame;
 * the loop only runs while a show is in the air (a timer waits between shows), and it stops
 * entirely while the card is off-screen or the tab is hidden. Renders nothing under
 * prefers-reduced-motion.
 *
 * Place it inside the card's `relative isolate overflow-hidden` box, after <Aurora /> and
 * before the (relative) content, so it paints between the two.
 */

const PERIOD = 7000 // ms from one launch to the next
const RISE = 2100 // ms the trail takes to climb
const FIRST = 900 // ms before the first launch (and after resuming)

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const easeOut = (t: number) => 1 - (1 - t) ** 3
const cssVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

interface Spark { x: number; y: number; vx: number; vy: number; born: number; life: number; color: string; r: number }
interface Shell { x0: number; y0: number; cx: number; cy: number; x1: number; y1: number; start: number }

export function CardFirework() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { canvas.style.display = 'none'; return }

    let w = 0, h = 0
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

    let shell: Shell | null = null
    let sparks: Spark[] = []
    let flash = 0 // born time of the burst glow
    let raf = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = 0
    let onScreen = true
    let colors: string[] = []
    const sparksOrigin = { x: 0, y: 0 }

    const quadAt = (s: Shell, t: number) => {
      const u = 1 - t
      return { x: u * u * s.x0 + 2 * u * t * s.cx + t * t * s.x1, y: u * u * s.y0 + 2 * u * t * s.cy + t * t * s.y1 }
    }

    const burst = (s: Shell, now: number) => {
      const n = Math.round(rand(26, 34))
      const scale = Math.min(1.2, Math.max(0.8, w / 360))
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.15, 0.15)
        const v = rand(32, 74) * scale
        sparks.push({ x: s.x1, y: s.y1, vx: Math.cos(a) * v, vy: Math.sin(a) * v, born: now + rand(0, 120), life: rand(1700, 2600), color: colors[i % colors.length], r: rand(0.8, 1.4) })
      }
      flash = now
    }

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - (last || now)) / 1000)
      last = now
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'
      ctx.lineCap = 'round'

      if (shell) {
        const t = (now - shell.start) / RISE
        if (t >= 1) { burst(shell, now); shell = null }
        else if (t >= 0) {
          const p = easeOut(t)
          const head = quadAt(shell, p)
          const tail = quadAt(shell, easeOut(Math.max(0, t - 0.16)))
          const g = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y)
          g.addColorStop(0, 'rgba(255,255,255,0)')
          g.addColorStop(1, 'rgba(255,240,200,0.75)')
          ctx.globalAlpha = 1 - t * 0.35
          ctx.strokeStyle = g
          ctx.lineWidth = 1.1
          ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); ctx.stroke()
          ctx.fillStyle = '#fff8e1'
          ctx.beginPath(); ctx.arc(head.x, head.y, 1.4, 0, Math.PI * 2); ctx.fill()
        }
      }

      if (flash) {
        const k = (now - flash) / 700
        if (k < 1) {
          const rad = 14 + 30 * k
          const g = ctx.createRadialGradient(sparksOrigin.x, sparksOrigin.y, 0, sparksOrigin.x, sparksOrigin.y, rad)
          g.addColorStop(0, 'rgba(255,244,214,0.5)')
          g.addColorStop(1, 'rgba(255,244,214,0)')
          ctx.globalAlpha = (1 - k) * 0.5
          ctx.fillStyle = g
          ctx.beginPath(); ctx.arc(sparksOrigin.x, sparksOrigin.y, rad, 0, Math.PI * 2); ctx.fill()
        } else flash = 0
      }

      const drag = Math.exp(-1.5 * dt)
      for (const s of sparks) {
        const age = (now - s.born) / s.life
        if (age < 0) continue
        s.vx *= drag
        s.vy = s.vy * drag + 16 * dt // a gentle droop
        s.x += s.vx * dt
        s.y += s.vy * dt
        let a = (1 - age) ** 1.4
        if (age > 0.5) a *= 0.55 + 0.45 * Math.sin(now / 90 + s.r * 40) ** 2 // twinkle as it sprinkles out
        ctx.globalAlpha = Math.max(0, a * 0.85)
        ctx.fillStyle = s.color
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill()
        // a faint streak behind the faster sparks
        const sp = Math.hypot(s.vx, s.vy)
        if (sp > 14) {
          ctx.globalAlpha = Math.max(0, a * 0.3)
          ctx.strokeStyle = s.color
          ctx.lineWidth = s.r
          ctx.beginPath(); ctx.moveTo(s.x - s.vx * 0.12, s.y - s.vy * 0.12); ctx.lineTo(s.x, s.y); ctx.stroke()
        }
      }
      sparks = sparks.filter((s) => now - s.born < s.life)

      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      if (shell || sparks.length || flash) raf = requestAnimationFrame(tick)
      else { raf = 0; last = 0; ctx.clearRect(0, 0, w, h) }
    }

    const launch = () => {
      timer = setTimeout(launch, PERIOD)
      if (!w || !h) return
      colors = ['#ffffff', '#fde68a', '#fcd34d', cssVar('--color-brand-200', '#ddd6fe'), cssVar('--color-duo-200', '#f5d0fe'), '#ffffff']
      const x0 = w * rand(0.38, 0.56), y0 = h + 2
      const x1 = w * rand(0.76, 0.86), y1 = h * rand(0.2, 0.3)
      shell = { x0, y0, cx: x0 + (x1 - x0) * 0.15, cy: h * 0.45, x1, y1, start: performance.now() }
      sparksOrigin.x = x1; sparksOrigin.y = y1
      if (!raf) raf = requestAnimationFrame(tick)
    }

    const stop = () => {
      clearTimeout(timer); timer = undefined
      cancelAnimationFrame(raf); raf = 0; last = 0
      shell = null; sparks = []; flash = 0
      ctx.clearRect(0, 0, w, h)
    }
    const sync = () => {
      const run = onScreen && document.visibilityState !== 'hidden'
      if (run && !timer) timer = setTimeout(launch, FIRST)
      else if (!run && timer) stop()
    }

    const io = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync() })
      : null
    io?.observe(canvas)
    document.addEventListener('visibilitychange', sync)
    sync()

    return () => {
      stop()
      ro?.disconnect()
      io?.disconnect()
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])

  return <canvas ref={ref} aria-hidden data-testid="home-firework" className="pointer-events-none absolute inset-0 h-full w-full" />
}
