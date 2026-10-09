import { useLayoutEffect, useRef, useState } from 'react'
import { MARQUEE_GAP, marqueePlan, type MarqueePlan } from '@/lib/marquee'
import { useReducedMotion } from './graph/motion'

/**
 * One line of text that scrolls sideways in a loop when it doesn't fit (the announcement banner,
 * the admin strip). It measures the text and its space with a ResizeObserver; src/lib/marquee.ts
 * decides whether and how fast it moves. The loop is the text twice with a gap, slid left by one
 * copy's width so the seam never shows. Screen readers get the text once (the copy is
 * aria-hidden). Hover, or focus anywhere in a `.marquee-host` around it, pauses it; with
 * reduced motion it never moves and the text wraps instead.
 */
export function Marquee({ text, className = '' }: { text: string; className?: string }) {
  const box = useRef<HTMLSpanElement>(null)
  const measure = useRef<HTMLSpanElement>(null)
  const reducedMotion = useReducedMotion()
  const [plan, setPlan] = useState<MarqueePlan>({ scroll: false, seconds: 0 })

  useLayoutEffect(() => {
    const b = box.current
    const m = measure.current
    if (!b || !m) return
    const update = () => {
      const next = marqueePlan({ textWidth: m.offsetWidth, boxWidth: b.clientWidth, reducedMotion })
      setPlan((p) => (p.scroll === next.scroll && p.seconds === next.seconds ? p : next))
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    // Watching the text too catches a new text and the web font arriving.
    const ro = new ResizeObserver(update)
    ro.observe(b)
    ro.observe(m)
    return () => ro.disconnect()
  }, [reducedMotion])

  return (
    <span
      ref={box}
      className={`marquee ${className}`}
      data-scroll={plan.scroll || undefined}
      data-wrap={reducedMotion || undefined}
      style={{ '--marquee-gap': `${MARQUEE_GAP}px`, '--marquee-dur': `${plan.seconds}s` } as React.CSSProperties}
    >
      <span className="marquee-track">
        <span className="marquee-item">
          <span ref={measure}>{text}</span>
        </span>
        {plan.scroll && (
          <span className="marquee-item" aria-hidden>
            {text}
          </span>
        )}
      </span>
    </span>
  )
}
