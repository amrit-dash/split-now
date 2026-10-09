import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const m = window.matchMedia(QUERY)
  m.addEventListener?.('change', cb)
  return () => m.removeEventListener?.('change', cb)
}

/** True when the person asked the OS for less motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches,
    () => false,
  )
}

/**
 * Counts from the previous value (0 on first show) up to `target` with an ease-out, one React
 * update per animation frame. Jumps straight to the value with reduced motion.
 */
export function useCountUp(target: number, { duration = 700, delay = 0, off = false } = {}): number {
  const [v, setV] = useState(off ? target : 0)
  const from = useRef(off ? target : 0)
  useEffect(() => {
    if (off) {
      from.current = target
      setV(target)
      return
    }
    let raf = 0
    let t0 = 0
    const start = from.current
    const tick = (t: number) => {
      if (!t0) t0 = t + delay
      const k = Math.min(1, Math.max(0, (t - t0) / duration))
      const e = 1 - (1 - k) ** 3
      const cur = start + (target - start) * e
      from.current = cur
      setV(k >= 1 ? target : cur)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, delay, off])
  return v
}

/** Pauses looping animations while the element is scrolled out of view. */
export function useInView<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, inView]
}
