import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import './insights-motion.css'

/**
 * Motion helpers for the Insights charts: plain SVG + CSS transitions + rAF, no animation library.
 * Rules: animate transform / opacity / stroke-dashoffset; anything per-frame in JS writes the DOM
 * directly (CountUp) or touches a small SVG (useTween); under prefers-reduced-motion everything
 * renders in its final state.
 */

const REDUCED = '(prefers-reduced-motion: reduce)'
const mql = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(REDUCED) : null)

export function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const m = mql()
      m?.addEventListener('change', cb)
      return () => m?.removeEventListener('change', cb)
    },
    () => mql()?.matches ?? false,
    () => false,
  )
}

/** True once the element has scrolled (a third) into view; stays true. Always true under reduced motion. */
export function useInView<T extends Element>(): [(el: T | null) => void, boolean] {
  const reduced = useReducedMotion()
  const [seen, setSeen] = useState(false)
  const [el, setEl] = useState<T | null>(null)
  useEffect(() => {
    if (seen || !el) return
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold: 0.3, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [el, seen])
  return [useCallback((n: T | null) => setEl(n), []), seen || reduced]
}

/** Width of an element, kept current with a ResizeObserver. */
export function useWidth<T extends Element>(): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    if (!el) return
    setW(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [useCallback((n: T | null) => setEl(n), []), w]
}

export const easeOut = (p: number) => 1 - (1 - p) ** 3
export const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2)
/** CSS twin of easeOut, for transitions. */
export const EASE = 'cubic-bezier(0.22, 0.8, 0.3, 1)'

/** Resample a series to n points (linear, over normalised x) so old and new can be interpolated. */
export function resample(a: number[], n: number): number[] {
  if (a.length === n) return a
  if (!a.length) return new Array(n).fill(0)
  if (a.length === 1) return new Array(n).fill(a[0])
  return Array.from({ length: n }, (_, i) => {
    const x = n === 1 ? 0 : (i / (n - 1)) * (a.length - 1)
    const j = Math.min(a.length - 2, Math.floor(x))
    return a[j] + (a[j + 1] - a[j]) * (x - j)
  })
}

/**
 * Tween a numeric array towards `target` whenever it changes (by value), starting from whatever is
 * on screen, resampled if the length changed. Returns the frame to draw. Instant under reduced motion.
 */
export function useTween(target: number[], duration = 650): number[] {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(target)
  const live = useRef(target)
  const key = target.join(',')
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the target's values (key), not its identity, so a re-render with an equal new array does not restart the tween.
  useEffect(() => {
    const from = resample(live.current, target.length)
    if (reduced || from.every((v, i) => v === target[i])) {
      live.current = target
      setShown(target)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration),
        e = easeInOut(p)
      const v = target.map((x, i) => from[i] + (x - from[i]) * e)
      live.current = v
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [key, reduced, duration])
  return resample(shown, target.length)
}

/**
 * A number that counts from what it showed last (0 the first time it becomes active) to `value`.
 * Writes textContent directly per frame, so a counting number never re-renders React. Screen
 * readers get the final value.
 */
export function CountUp({
  value,
  format,
  active = true,
  duration = 800,
  className,
}: {
  value: number
  format: (v: number) => string
  active?: boolean
  duration?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef<number | null>(null)
  const fmt = useRef(format)
  fmt.current = format
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (!active) {
      if (shown.current === null) el.textContent = fmt.current(0)
      return
    }
    const from = shown.current ?? 0
    if (reduced || from === value) {
      shown.current = value
      el.textContent = fmt.current(value)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      const v = p === 1 ? value : from + (value - from) * easeOut(p)
      shown.current = v
      el.textContent = fmt.current(Math.round(v))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    el.textContent = fmt.current(Math.round(from))
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, active, reduced, duration])
  // Keep the final text in sync if only the formatter changed (currency / approx prefix).
  useEffect(() => {
    if (ref.current && shown.current === value) ref.current.textContent = format(value)
  })
  return (
    <span className={className}>
      <span ref={ref} aria-hidden className="tabular-nums" />
      <span className="sr-only">{format(value)}</span>
    </span>
  )
}

/** Monotone cubic (Fritsch–Carlson) through points: smooth, never overshoots below the baseline. */
export function monotonePath(pts: Array<[number, number]>): string {
  const n = pts.length
  if (!n) return ''
  const f = (v: number) => Math.round(v * 100) / 100
  if (n === 1) return `M${f(pts[0][0])},${f(pts[0][1])}`
  const dx: number[] = [],
    m: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0])
    m.push(dx[i] ? (pts[i + 1][1] - pts[i][1]) / dx[i] : 0)
  }
  const t = pts.map((_, i) => (i === 0 ? m[0] : i === n - 1 ? m[n - 2] : m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2))
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0
      t[i + 1] = 0
      continue
    }
    const a = t[i] / m[i],
      b = t[i + 1] / m[i],
      s = a * a + b * b
    if (s > 9) {
      const k = 3 / Math.sqrt(s)
      t[i] = k * a * m[i]
      t[i + 1] = k * b * m[i]
    }
  }
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i],
      [x1, y1] = pts[i + 1],
      h = dx[i] / 3
    d += `C${f(x0 + h)},${f(y0 + t[i] * h)},${f(x1 - h)},${f(y1 - t[i + 1] * h)},${f(x1)},${f(y1)}`
  }
  return d
}

/** 0-based round ticks covering max, about `count` intervals. */
export function niceTicks(max: number, count = 3): number[] {
  if (!(max > 0)) return [0, 1]
  const raw = max / count
  const p = 10 ** Math.floor(Math.log10(raw))
  const r = raw / p
  const step = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * p
  const top = Math.ceil(max / step - 1e-9) * step
  const out: number[] = []
  for (let v = 0; v <= top + step / 2; v += step) out.push(v)
  return out
}

/** Sanitised useId for SVG url(#…) references. */
export const svgId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '')

/** Hide a tapped-open chart readout when the person taps anywhere outside the chart. */
export function useOutsideTap(el: Element | null, open: boolean, close: () => void) {
  const cb = useRef(close)
  cb.current = close
  useEffect(() => {
    if (!open || !el) return
    const h = (e: PointerEvent) => {
      if (!el.contains(e.target as Node)) cb.current()
    }
    document.addEventListener('pointerdown', h, true)
    return () => document.removeEventListener('pointerdown', h, true)
  }, [el, open])
}
