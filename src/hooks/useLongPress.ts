import { type MouseEvent, type PointerEvent, useEffect, useRef, useState } from 'react'
import { isTap, LONG_PRESS_MS, movedTooFar, type PressStart } from '@/lib/long-press'

/**
 * Tap and press-and-hold on one control (src/lib/long-press.ts): spread the result on a button
 * that has the `press-hold` class (src/index.css), which shows the press: it sinks while down, a
 * ring closes in during the hold, and it pops when the hold takes (`data-press`).
 * `onTap` runs on an ordinary click (Enter and Space included); `onHold` after a hold, a right
 * click or the context-menu key, so a mouse and a keyboard reach it as well as a finger.
 *
 * `onHoldEnd` (hold to talk on +): the finger that held is lifted (or the browser took the touch
 * away). The pointer is captured while it is down, so drifting off the button doesn't end the hold.
 * A hold that came without a finger (right click, the context-menu key) ends with the next click
 * or Enter instead. `holdable: false` makes a hold do nothing new (the tap still works).
 */
export function useLongPress({
  onTap,
  onHold,
  onHoldEnd,
  onDown,
  holdable = true,
}: {
  onTap: () => void
  onHold: () => void
  onHoldEnd?: () => void
  /** every press, as it starts (to wake sound up: phones only allow it from a gesture) */
  onDown?: () => void
  holdable?: boolean
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<PressStart | null>(null)
  const held = useRef(false)
  /** the current hold is a finger's (it ends when lifted), not a right click's or a key's */
  const byFinger = useRef(false)
  const [press, setPress] = useState<'idle' | 'down' | 'held'>('idle')
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stop = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    start.current = null
    setPress((p) => (p === 'down' ? 'idle' : p))
  }
  // A hold still timing when the control goes away must not fire on a screen that's gone.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (settle.current) clearTimeout(settle.current)
    },
    [],
  )
  const hold = (finger: boolean) => {
    stop()
    held.current = true
    byFinger.current = finger
    setPress('held')
    if (settle.current) clearTimeout(settle.current)
    settle.current = setTimeout(() => setPress('idle'), 420)
    // A short buzz where the phone has one: the hold took.
    try {
      navigator.vibrate?.(10)
    } catch {
      /* not offered */
    }
    onHold()
  }
  const lift = () => {
    const wasHolding = held.current && byFinger.current && start.current === null && timer.current === null
    stop()
    // byFinger stays set, so the click that follows the lift is swallowed as a hold's (onClick).
    if (wasHolding && onHoldEnd) onHoldEnd()
  }
  return {
    'data-press': press,
    onPointerDown: (e: PointerEvent) => {
      // Any new press starts afresh (a right click too, so its context menu counts as a new hold).
      onDown?.()
      // A hold by right click or key, still going: this press ends it (its click is swallowed below).
      if (held.current && !byFinger.current && onHoldEnd) return
      held.current = false
      byFinger.current = false
      if (e.button !== 0 || !holdable) return
      if (onHoldEnd) (e.currentTarget as Element).setPointerCapture?.(e.pointerId)
      start.current = { x: e.clientX, y: e.clientY }
      setPress('down')
      timer.current = setTimeout(() => hold(true), LONG_PRESS_MS)
    },
    onPointerMove: (e: PointerEvent) => {
      if (start.current && movedTooFar(start.current, { x: e.clientX, y: e.clientY })) stop()
    },
    onPointerUp: lift,
    onPointerCancel: lift,
    onPointerLeave: () => {
      // Captured while held: leaving means the finger is gone (lift handles it); before the hold, it's not a hold.
      if (!held.current) stop()
    },
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault()
      if (!holdable) return
      // Android sends its own context menu during a hold: the timer may not have fired yet.
      if (timer.current) return hold(true)
      if (!held.current) hold(false)
    },
    onClick: () => {
      // The click that ends a hold made without a finger (the context-menu key, then Enter).
      if (held.current && !byFinger.current && onHoldEnd) {
        held.current = false
        onHoldEnd()
        return
      }
      const tap = isTap(held.current)
      held.current = false
      byFinger.current = false
      if (tap) onTap()
    },
  }
}
