import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { appLocale } from '@/lib/locale'

export interface SelectOption<T extends string = string> {
  value: T
  label: ReactNode
  /** Plain-text label for type-ahead and the trigger's accessible name (defaults to label if it's a string). */
  text?: string
  icon?: ReactNode
  hint?: ReactNode
  disabled?: boolean
}

interface Props<T extends string> {
  value: T
  onChange: (v: T) => void
  options: SelectOption<T>[]
  'aria-label'?: string
  id?: string
  disabled?: boolean
  size?: 'md' | 'sm'
  className?: string
  placeholder?: ReactNode
  /** Custom trigger content (e.g. an avatar card). Receives the selected option. */
  renderTrigger?: (selected: SelectOption<T> | undefined, open: boolean) => ReactNode
  /** Class for the trigger button when renderTrigger is used. */
  triggerClassName?: string
}

const GAP = 6
const MAX_H = 288

/**
 * App-styled replacement for <select>: a button that opens a floating listbox.
 * Keyboard: ↑/↓, Home/End, Enter/Space, Esc, type-ahead. Flips upward near the bottom edge.
 */
export function Select<T extends string>({
  value,
  onChange,
  options,
  id,
  disabled,
  size = 'md',
  className = '',
  placeholder,
  renderTrigger,
  triggerClassName,
  ...rest
}: Props<T>) {
  const autoId = useId()
  const listId = `${id ?? autoId}-list`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxH: number } | null>(null)
  const typed = useRef({ text: '', at: 0 })

  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = options[selectedIndex]
  const textOf = (o: SelectOption<T>) => o.text ?? (typeof o.label === 'string' ? o.label : String(o.value))

  const place = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = Math.min(Math.max(r.width, 200), vw - 16)
    const left = Math.min(Math.max(8, r.left), vw - width - 8)
    const below = vh - r.bottom - GAP - 8
    const above = r.top - GAP - 8
    if (below >= Math.min(MAX_H, 180) || below >= above) setPos({ left, top: r.bottom + GAP, width, maxH: Math.min(MAX_H, below) })
    else setPos({ left, bottom: vh - r.top + GAP, width, maxH: Math.min(MAX_H, above) })
  }, [])

  const openList = () => {
    if (disabled) return
    setActive(selectedIndex >= 0 ? selectedIndex : options.findIndex((o) => !o.disabled))
    place()
    setOpen(true)
  }
  const close = (focus = true) => {
    setOpen(false)
    if (focus) triggerRef.current?.focus()
  }
  const choose = (i: number) => {
    const o = options[i]
    if (!o || o.disabled) return
    if (o.value !== value) onChange(o.value)
    close()
  }

  useLayoutEffect(() => {
    if (!open) return
    const onMove = () => place()
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!listRef.current?.contains(t) && !triggerRef.current?.contains(t)) close(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const step = (from: number, dir: 1 | -1) => {
    for (let i = 1; i <= options.length; i++) {
      const n = (from + dir * i + options.length) % options.length
      if (!options[n].disabled) return n
    }
    return from
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openList()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive((a) => step(a, 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive((a) => step(a, -1))
        break
      case 'Home':
        e.preventDefault()
        setActive(step(-1, 1))
        break
      case 'End':
        e.preventDefault()
        setActive(step(options.length, -1))
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        choose(active)
        break
      case 'Escape':
        e.preventDefault()
        close()
        break
      case 'Tab':
        close(false)
        break
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
          const now = Date.now()
          typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now }
          const i = options.findIndex((o) => !o.disabled && textOf(o).toLowerCase().startsWith(typed.current.text))
          if (i >= 0) setActive(i)
        }
    }
  }

  const sizeCls = size === 'sm' ? '!py-2 text-sm' : ''

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={rest['aria-label']}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className={
          renderTrigger
            ? `w-full text-left disabled:opacity-60 ${triggerClassName ?? ''}`
            : `input flex items-center gap-2 !pr-3.5 text-left disabled:opacity-60 ${sizeCls} ${open ? 'ring-2 ring-brand-500' : ''} ${className}`
        }
      >
        {renderTrigger ? (
          renderTrigger(selected, open)
        ) : (
          <>
            {selected?.icon && <span className="shrink-0">{selected.icon}</span>}
            <span className={`min-w-0 flex-1 truncate ${selected ? '' : 'text-slate-400'}`}>{selected ? selected.label : (placeholder ?? 'Select…')}</span>
            <ChevronDown size={size === 'sm' ? 16 : 18} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
          </>
        )}
      </button>
      {open &&
        pos &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={rest['aria-label']}
            tabIndex={-1}
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxH }}
            className="animate-pop fixed z-[80] overflow-y-auto overscroll-contain rounded-2xl bg-white p-1.5 shadow-2xl shadow-black/20 ring-1 ring-slate-900/10 dark:bg-ink-800 dark:shadow-black/50 dark:ring-white/10"
          >
            {options.map((o, i) => {
              const isSel = o.value === value
              return (
                <li
                  key={o.value}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSel}
                  aria-disabled={o.disabled || undefined}
                  onPointerEnter={() => !o.disabled && setActive(i)}
                  onClick={() => choose(i)}
                  className={`flex cursor-pointer select-none items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    o.disabled ? 'cursor-default opacity-40' : i === active ? 'bg-slate-100 dark:bg-ink-700' : ''
                  } ${isSel ? 'font-semibold text-brand-700 dark:text-brand-200' : 'text-slate-700 dark:text-slate-200'}`}
                >
                  {o.icon && <span className="shrink-0">{o.icon}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.hint && <span className="block truncate text-xs font-normal text-slate-500 dark:text-slate-400">{o.hint}</span>}
                  </span>
                  {isSel && <Check size={16} className="shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />}
                </li>
              )
            })}
          </ul>,
          document.body,
        )}
    </>
  )
}

/** Currency options with the ISO code, local symbol and name, e.g. "INR · ₹ · Indian Rupee", in the app locale unless told otherwise. */
export function currencyOptions(codes: string[], locale: string = appLocale()): SelectOption[] {
  let names: Intl.DisplayNames | undefined
  try {
    names = new Intl.DisplayNames([locale], { type: 'currency' })
  } catch {
    /* old browsers */
  }
  return [...new Set(codes)].map((c) => {
    let symbol = ''
    try {
      symbol =
        new Intl.NumberFormat(locale, { style: 'currency', currency: c, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((p) => p.type === 'currency')
          ?.value ?? ''
    } catch {
      /* unknown code */
    }
    const name = names?.of(c)
    return {
      value: c,
      text: c,
      label: (
        <span className="flex items-baseline gap-2">
          <span className="font-semibold">{c}</span>
          {symbol && symbol !== c && <span className="text-slate-400">{symbol}</span>}
        </span>
      ),
      hint: name && name !== c ? name : undefined,
    }
  })
}
