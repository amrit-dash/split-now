import { useEffect, useRef } from 'react'
import { codeDigits } from '@/lib/account'

/**
 * The 6-digit email code: one real input (so paste, autofill from the email and screen readers
 * all work) drawn as six boxes. `onComplete` fires once the sixth digit is in.
 */
export function CodeInput({
  id,
  value,
  onChange,
  onComplete,
  disabled,
  dark,
  autoFocus,
  testId,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  onComplete?: (v: string) => void
  disabled?: boolean
  /** on the dark sign-in surface */
  dark?: boolean
  autoFocus?: boolean
  testId?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])
  const box = dark ? 'bg-white/10 ring-white/15 text-white' : 'bg-slate-100 ring-slate-200 text-slate-900 dark:bg-ink-800 dark:ring-ink-700 dark:text-white'
  const active = dark ? 'ring-2 ring-duo-300' : 'ring-2 ring-brand-500'
  return (
    <div className="relative mx-auto w-full max-w-xs">
      <input
        ref={ref}
        id={id}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        enterKeyHint="done"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const v = codeDigits(e.target.value)
          onChange(v)
          if (v.length === 6) onComplete?.(v)
        }}
        data-testid={testId}
      />
      <div className="pointer-events-none flex justify-between gap-2" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: the six boxes are positions, not items
            key={i}
            className={`flex h-14 min-w-0 max-w-12 flex-1 items-center justify-center rounded-2xl font-mono text-2xl font-bold ring-1 transition ${box} ${
              !disabled && i === Math.min(value.length, 5) ? active : ''
            } ${i === 2 ? 'mr-2' : ''}`}
          >
            {value[i] ?? ''}
          </span>
        ))}
      </div>
    </div>
  )
}
