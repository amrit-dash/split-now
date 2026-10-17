import { useEffect, useRef, useState } from 'react'
import { LONG_PRESS_MS, stepOf, type Step } from '@/lib/vault-api'

/**
 * One press on a pattern pad, as a tap or a long press: pointer down/up, or Space/Enter held. Both
 * pads use it (PatternPad shows the count, BlindPad shows nothing). `long` turns true once a held
 * press has lasted long enough, for the pad that shows it. `onDown` runs as a press starts (the
 * lock button stops its pause there, so a long hold never ends the pattern early).
 */
export function usePress(onStep: (s: Step) => void, disabled?: boolean, onDown?: () => void) {
  const down = useRef<number | null>(null)
  const [holding, setHolding] = useState(false)
  const [long, setLong] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const start = () => {
    if (disabled || down.current !== null) return
    down.current = performance.now()
    onDown?.()
    setHolding(true)
    setLong(false)
    timer.current = setTimeout(() => setLong(true), LONG_PRESS_MS)
  }
  const end = () => {
    if (down.current === null) return
    const ms = performance.now() - down.current
    down.current = null
    clearTimeout(timer.current)
    setHolding(false)
    setLong(false)
    onStep(stepOf(ms))
  }
  const cancel = () => {
    down.current = null
    clearTimeout(timer.current)
    setHolding(false)
    setLong(false)
  }
  const handlers = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      start()
    },
    onPointerUp: end,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault()
        start()
      }
    },
    onKeyUp: (e: React.KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        end()
      }
    },
  }
  return { holding, long, handlers }
}
