import { useLayoutEffect, useRef, useState } from 'react'

/** The rendered width of an element, kept up to date with a ResizeObserver (replaces a responsive-container dependency). */
export function useWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => { const w = el.getBoundingClientRect().width; if (w > 0) setWidth(w) }
    read()
    if (typeof ResizeObserver !== 'function') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}
