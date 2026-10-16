import { type MouseEvent, type PointerEvent, useEffect, useRef, useState } from 'react'
import { isTap, LONG_PRESS_MS, movedTooFar, type PressStart } from '@/lib/long-press'

/**
 * Tap and press-and-hold on one control (src/lib/long-press.ts): spread the result on a button
 * that has the `press-hold` class (src/index.css), which shows the press: it sinks while down, a
 * ring closes in during the hold, and it pops when the hold takes (`data-press`).
 * `onTap` runs on an ordinary click (Enter and Space included); `onHold` after a hold, a right
 * click or the context-menu key, so a mouse and a keyboard reach it as well as a finger.
 */
export function useLongPress({ onTap, onHold }: { onTap: () => void; onHold: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<PressStart | null>(null)
  const held = useRef(false)
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
  const hold = () => {
    stop()
    held.current = true
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
  return {
    'data-press': press,
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return
      held.current = false
      start.current = { x: e.clientX, y: e.clientY }
      setPress('down')
      timer.current = setTimeout(hold, LONG_PRESS_MS)
    },
    onPointerMove: (e: PointerEvent) => {
      if (start.current && movedTooFar(start.current, { x: e.clientX, y: e.clientY })) stop()
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onPointerLeave: stop,
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault()
      // Android sends its own context menu during a hold: the timer may not have fired yet.
      if (!held.current) hold()
    },
    onClick: () => {
      const tap = isTap(held.current)
      held.current = false
      if (tap) onTap()
    },
  }
}
