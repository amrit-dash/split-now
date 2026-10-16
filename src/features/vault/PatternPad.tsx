import { useEffect, useRef, useState } from 'react'
import { Delete } from 'lucide-react'
import { LONG_PRESS_MS, PATTERN_MAX, stepOf, type Step } from '@/lib/vault-api'

/**
 * A private group's pattern: taps and long presses on one big pad, in order. The dots only count
 * the steps (they never show which were long), so someone looking over a shoulder learns nothing
 * from the screen. While held, the ring fills to say "this one is long". Space or Enter work the
 * same as a press; the two small buttons add a step for screen readers and switch access.
 */
export function PatternPad({ steps, onChange, disabled }: { steps: Step[]; onChange: (s: Step[]) => void; disabled?: boolean }) {
  const down = useRef<number | null>(null)
  const [holding, setHolding] = useState(false)
  const [long, setLong] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const stepsRef = useRef(steps)
  stepsRef.current = steps
  useEffect(() => () => clearTimeout(timer.current), [])

  const add = (s: Step) => {
    if (disabled || stepsRef.current.length >= PATTERN_MAX) return
    onChange([...stepsRef.current, s])
  }
  const start = () => {
    if (disabled || down.current !== null) return
    down.current = performance.now()
    setHolding(true)
    setLong(false)
    timer.current = setTimeout(() => {
      setLong(true)
      navigator.vibrate?.(15)
    }, LONG_PRESS_MS)
  }
  const end = () => {
    if (down.current === null) return
    const ms = performance.now() - down.current
    down.current = null
    clearTimeout(timer.current)
    setHolding(false)
    setLong(false)
    add(stepOf(ms))
  }
  const cancel = () => {
    down.current = null
    clearTimeout(timer.current)
    setHolding(false)
    setLong(false)
  }

  return (
    <div className="flex flex-col items-center">
      <div className="flex min-h-6 flex-wrap justify-center gap-2" aria-live="polite" aria-label={`${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`} data-testid="pattern-count">
        {steps.length === 0 ? (
          <span className="text-muted text-sm">Tap and long-press below</span>
        ) : (
          steps.map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the dots are only a count.
            <span key={i} className="h-3 w-3 rounded-full bg-brand-600 dark:bg-brand-300" aria-hidden />
          ))
        )}
      </div>
      <button
        type="button"
        disabled={disabled}
        aria-label="Pattern pad: tap, or press and hold for a long press"
        data-testid="pattern-pad"
        className={`relative mt-6 flex h-48 w-48 touch-none select-none items-center justify-center rounded-full border-4 transition-colors ${
          holding ? (long ? 'border-brand-600 bg-brand-100 dark:bg-brand-900/50' : 'border-brand-300 bg-brand-50 dark:bg-brand-900/30') : 'border-slate-200 bg-white dark:border-white/10 dark:bg-ink-800'
        } disabled:opacity-50`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          start()
        }}
        onPointerUp={end}
        onPointerCancel={cancel}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
            e.preventDefault()
            start()
          }
        }}
        onKeyUp={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            end()
          }
        }}
      >
        <span className="text-muted text-sm font-semibold">{holding ? (long ? 'Long press' : 'Hold for long') : 'Press here'}</span>
      </button>
      <div className="mt-4 flex items-center gap-2">
        <button type="button" className="chip min-h-11" disabled={disabled} onClick={() => add('T')} data-testid="pattern-add-tap">
          Add tap
        </button>
        <button type="button" className="chip min-h-11" disabled={disabled} onClick={() => add('L')} data-testid="pattern-add-long">
          Add long press
        </button>
        <button
          type="button"
          className="chip min-h-11 min-w-11"
          disabled={disabled || steps.length === 0}
          onClick={() => onChange(steps.slice(0, -1))}
          aria-label="Remove the last step"
          data-testid="pattern-undo"
        >
          <Delete size={16} aria-hidden />
        </button>
      </div>
    </div>
  )
}
