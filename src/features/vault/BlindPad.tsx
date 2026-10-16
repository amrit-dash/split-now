import { useEffect, useRef } from 'react'
import { buzzFor, PATTERN_MAX, PATTERN_PAUSE_MS, type Step } from '@/lib/vault-api'
import { usePress } from './usePress'

/**
 * The unlock pad: nothing on screen changes while a pattern goes in (no dots, no ring), so a
 * look over a shoulder or a screen recording shows only someone tapping. Each press buzzes
 * instead (longer for a long press, where the phone can). The pattern is sent after
 * PATTERN_PAUSE_MS without a press. The small buttons are for screen readers and switch access,
 * and give no sign either.
 */
export function BlindPad({ onPattern, disabled }: { onPattern: (pattern: string) => void; disabled?: boolean }) {
  const steps = useRef<Step[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const send = useRef(onPattern)
  send.current = onPattern
  useEffect(() => () => clearTimeout(timer.current), [])
  // A pattern half-entered when the sheet starts checking is dropped, not added to.
  useEffect(() => {
    if (!disabled) return
    clearTimeout(timer.current)
    steps.current = []
  }, [disabled])

  const add = (s: Step) => {
    if (disabled) return
    navigator.vibrate?.(buzzFor(s))
    if (steps.current.length < PATTERN_MAX) steps.current.push(s)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const p = steps.current.join('')
      steps.current = []
      if (p) send.current(p)
    }, PATTERN_PAUSE_MS)
  }
  const clear = () => {
    clearTimeout(timer.current)
    steps.current = []
  }
  const { handlers } = usePress(add, disabled)

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        disabled={disabled}
        aria-label="Pattern pad: tap, or press and hold for a long press. It’s checked after a short pause."
        aria-describedby="blind-pad-hint"
        data-testid="pattern-pad"
        className="flex h-56 w-56 touch-none select-none items-center justify-center rounded-full border-4 border-slate-200 bg-white disabled:opacity-50 dark:border-white/10 dark:bg-ink-800"
        {...handlers}
      >
        <span className="text-muted text-sm font-semibold">{disabled ? 'Checking…' : 'Press here'}</span>
      </button>
      <p id="blind-pad-hint" className="text-muted mt-3 text-center text-xs">
        Nothing shows while you enter it. Pause when you’re done.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" className="chip min-h-11" disabled={disabled} onClick={() => add('T')} data-testid="pattern-add-tap">
          Tap
        </button>
        <button type="button" className="chip min-h-11" disabled={disabled} onClick={() => add('L')} data-testid="pattern-add-long">
          Long press
        </button>
        <button type="button" className="chip min-h-11" disabled={disabled} onClick={clear} data-testid="pattern-clear">
          Start again
        </button>
      </div>
    </div>
  )
}
