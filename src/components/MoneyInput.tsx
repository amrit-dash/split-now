import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { centsToInput, parseMoney } from '@/lib/money'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> & {
  /** minor units; undefined = empty */
  value: number | undefined
  currency: string
  /** called with minor units, undefined when the field is empty, NaN never (unparseable keeps the last good value) */
  onChange: (minor: number | undefined) => void
  /** allow a leading minus (adjustments) */
  allowNegative?: boolean
}

/**
 * A money field that keeps what the user typed ("12.", "1,20,000") as its own draft and only
 * reports parsed minor units upward, so re-rendering with the parsed value never rewrites the
 * text mid-keystroke. The draft re-syncs when the parent changes the value to something else
 * (a reset, a scan, switching currency).
 */
export function MoneyInput({ value, currency, onChange, allowNegative, className = '', ...rest }: Props) {
  const [draft, setDraft] = useState(() => (value === undefined ? '' : centsToInput(value, currency)))
  const last = useRef(value)
  useEffect(() => {
    if (value === last.current) return
    last.current = value
    const parsed = parseMoney(draft, currency)
    const same = value === undefined ? draft.trim() === '' : parsed === value
    if (!same) setDraft(value === undefined ? '' : centsToInput(value, currency))
  }, [value, currency, draft])
  return (
    <input
      {...rest}
      type="text"
      inputMode={allowNegative ? 'text' : 'decimal'}
      autoComplete="off"
      className={`input text-right tabular-nums ${className}`}
      value={draft}
      onChange={(e) => {
        const text = e.target.value
        setDraft(text)
        if (text.trim() === '') { last.current = undefined; onChange(undefined); return }
        const n = parseMoney(text, currency)
        if (!Number.isFinite(n)) return
        if (!allowNegative && n < 0) return
        last.current = n
        onChange(n)
      }}
      onBlur={(e) => {
        // Tidy "12." → "12.00" once the user leaves the field.
        const n = parseMoney(e.target.value, currency)
        if (Number.isFinite(n) && e.target.value.trim() !== '') setDraft(centsToInput(n, currency))
        rest.onBlur?.(e)
      }}
    />
  )
}
