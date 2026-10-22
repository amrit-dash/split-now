import { type CSSProperties, type PointerEvent, useRef, useState } from 'react'
import { swipeAxis, swipeOpacity, swipeOutcome } from '@/lib/swipe-dismiss'

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Swipe a floating notification sideways to dismiss it (the decisions are src/lib/swipe-dismiss.ts).
 * Spread `bind` on the card: it follows the finger, then leaves the screen or springs back. A
 * vertical drag is left to the page (touch-action: pan-y), a drag never also counts as a tap on
 * a button inside the card, and the card's ✕ stays the way for keyboards and screen readers.
 */
export function useSwipeDismiss(onDismiss: () => void) {
  const [dx, setDx] = useState(0)
  const [leaving, setLeaving] = useState<'left' | 'right' | null>(null)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number; t: number; id: number; axis: 'x' | 'y' | null; width: number } | null>(null)

  const end = (e: PointerEvent<HTMLElement>) => {
    const s = start.current
    start.current = null
    setDragging(false)
    if (s?.axis !== 'x') return setDx(0)
    // The release ends a drag, not a tap: the click that follows doesn't reach the buttons.
    const el = e.currentTarget
    const swallow = (ev: Event) => {
      ev.stopPropagation()
      ev.preventDefault()
    }
    el.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => el.removeEventListener('click', swallow, { capture: true }), 0)
    const moved = e.clientX - s.x
    const out = swipeOutcome({ dx: moved, dt: e.timeStamp - s.t, width: s.width })
    if (out === 'back') return setDx(0)
    if (reducedMotion()) return onDismiss()
    setLeaving(out)
    setTimeout(onDismiss, 180)
  }

  const bind = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId, axis: null, width: e.currentTarget.offsetWidth }
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const s = start.current
      if (!s || s.id !== e.pointerId) return
      const mx = e.clientX - s.x
      if (!s.axis) {
        s.axis = swipeAxis(mx, e.clientY - s.y)
        if (s.axis === 'x') {
          e.currentTarget.setPointerCapture?.(e.pointerId)
          setDragging(true)
        }
      }
      if (s.axis === 'x') setDx(mx)
    },
    onPointerUp: end,
    onPointerCancel: () => {
      start.current = null
      setDragging(false)
      setDx(0)
    },
    style: {
      transform: leaving ? `translateX(${leaving === 'left' ? '-' : ''}110%)` : dx ? `translateX(${dx}px)` : undefined,
      opacity: leaving ? 0 : dx ? swipeOpacity(dx, start.current?.width ?? 320) : undefined,
      transition: dragging ? 'none' : 'transform 180ms ease-out, opacity 180ms ease-out',
      touchAction: 'pan-y',
      // With a mouse, a drag that ends short selects some of the words, and the next drag that starts
      // on them drags the text instead (the browser cancels the swipe); a card you swipe isn't text to copy.
      userSelect: 'none',
      WebkitUserSelect: 'none',
    } satisfies CSSProperties,
  }
  return { bind, leaving: !!leaving }
}
