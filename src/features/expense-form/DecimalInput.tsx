import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { parseDecimal } from '@/lib/expense-draft'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> & {
  value: number | undefined
  /** undefined when the field is empty; never NaN (unparseable text keeps the last good value) */
  onChange: (v: number | undefined) => void
  /** decimal places allowed; 0 gives a whole-number keypad */
  decimals?: number
}

/** MoneyInput's sibling for plain numbers (percent, shares): keeps the typed text, reports a number. */
export function DecimalInput({ value, onChange, decimals = 2, className = '', ...rest }: Props) {
  const fmt = (v: number | undefined) => (v === undefined ? '' : String(v))
  const [draft, setDraft] = useState(() => fmt(value))
  const last = useRef(value)
  useEffect(() => {
    if (value === last.current) return
    last.current = value
    const same = value === undefined ? draft.trim() === '' : parseDecimal(draft, decimals) === value
    if (!same) setDraft(fmt(value))
  }, [value, draft, decimals])
  return (
    <input
      {...rest}
      type="text"
      inputMode={decimals ? 'decimal' : 'numeric'}
      autoComplete="off"
      className={`input text-right tabular-nums ${className}`}
      value={draft}
      onChange={(e) => {
        const text = e.target.value
        setDraft(text)
        if (text.trim() === '') { last.current = undefined; onChange(undefined); return }
        const n = parseDecimal(text, decimals)
        if (!Number.isFinite(n)) return
        last.current = n
        onChange(n)
      }}
    />
  )
}
