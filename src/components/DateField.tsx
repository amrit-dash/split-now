import { useRef } from 'react'
import { CalendarDays, X } from 'lucide-react'
import { formatDate } from '@/lib/locale'

/**
 * Date input that behaves on iPhone: the native <input type="date"> on iOS shows no placeholder,
 * keeps an intrinsic min-width that overflows narrow grids, and its "Reset" button may not fire
 * `change`. Here the native input is a transparent overlay (so tapping still opens the system
 * picker), the visible box shows the formatted date or a hint, and a clear button resets it.
 */
export function DateField({
  value,
  onChange,
  placeholder = 'Select date',
  min,
  max,
  id,
  'aria-label': ariaLabel,
  clearable = false,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  min?: string
  max?: string
  id?: string
  'aria-label'?: string
  clearable?: boolean
  className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  // iOS can change the value without a `change` event (Reset); read it back on every signal.
  const sync = () => {
    const v = ref.current?.value ?? ''
    if (v !== value) onChange(v)
  }
  // On desktop a click on an invisible date input only focuses a segment (Chrome opens the
  // calendar only from its own icon); open the picker explicitly. Touch screens open it natively.
  const openPicker = () => {
    if (!window.matchMedia?.('(pointer: fine)').matches) return
    try {
      ref.current?.showPicker?.()
    } catch {
      /* not allowed here (e.g. inside a cross-origin frame) */
    }
  }
  // "10 Oct" (year only when it isn't this year) so it fits half-width columns on small phones.
  const label = value ? formatDate(value, value.slice(0, 4) !== String(new Date().getFullYear()) ? 'dayYear' : 'day') : placeholder
  return (
    <div className={`input relative flex min-w-0 items-center gap-1.5 !pl-3.5 !pr-2 focus-within:ring-2 focus-within:ring-brand-500 ${className}`}>
      {/* The icon makes room for the date once one is picked (half-width columns on small phones). */}
      <CalendarDays size={16} className={`shrink-0 text-slate-400 ${value && clearable ? 'hidden' : ''}`} aria-hidden />
      <span className={`min-w-0 flex-1 truncate ${value ? '' : 'text-muted'}`} aria-hidden>
        {label}
      </span>
      <input
        ref={ref}
        id={id}
        type="date"
        aria-label={ariaLabel ?? placeholder}
        value={value}
        min={min}
        max={max}
        onChange={sync}
        onInput={sync}
        onBlur={sync}
        onClick={openPicker}
        className="absolute inset-0 h-full w-full min-w-0 cursor-pointer appearance-none opacity-0"
      />
      {clearable && value && (
        <button
          type="button"
          onClick={() => {
            onChange('')
            if (ref.current) ref.current.value = ''
          }}
          className="relative z-10 -my-2 -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:text-slate-800 dark:hover:text-slate-200"
          aria-label={`Clear ${ariaLabel ?? placeholder}`}
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}
