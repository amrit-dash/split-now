import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { StyledIcon } from './Icon'
import type { PhIcon } from './icons'
import { useBack } from '@/hooks/useBack'
import type { BackConfig } from '@/lib/back'
import { type Hint, HintText, InfoTip } from '@/components/Hint'
import { formatDate } from '@/lib/locale'
import type { GroupType } from '@/types'

/** `children` sit under the title row inside the sticky header, so they stay in view too (the admin tabs). */
export function PageHeader({
  title,
  back,
  right,
  subtitle,
  children,
}: {
  title: ReactNode
  /**
   * Shows the back button. A path (or true, for Home) goes back where you came from in the app and
   * uses the path only for a screen opened cold; `{ to, mode: 'fixed' }` always goes to `to` (src/lib/back.ts).
   */
  back?: boolean | BackConfig
  right?: ReactNode
  /** A status line (plain text, always shown) or an explanation that follows the detail level (a Hint). */
  subtitle?: ReactNode | Hint
  children?: ReactNode
}) {
  // Back is where you came from in the app; the `back` path is only for a screen opened cold.
  const goBack = useBack(back === true || back === false || back === undefined ? '/' : back)
  const scrolled = useScrolled()
  return (
    // 92% so what scrolls under it doesn't show through as clutter; a hairline under it once the page has scrolled.
    <header
      className={`sticky top-[var(--banner-h,0px)] z-30 -mx-4 mb-5 border-b bg-slate-50/92 px-4 pb-3 pt-[calc(var(--safe-top)+1.25rem)] backdrop-blur-xl transition-colors dark:bg-ink-950/92 ${scrolled ? 'border-slate-900/[0.07] dark:border-white/[0.07]' : 'border-transparent'}`}
      data-scrolled={scrolled || undefined}
    >
      <div className="flex min-h-11 items-center gap-2">
        {back && (
          <button
            type="button"
            onClick={goBack}
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-200/60 dark:hover:bg-ink-800"
            aria-label="Back"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {/* No empty h1: a page whose heading is in the body (expense detail) passes title="". */}
          {title ? (
            <div className="flex min-w-0 items-center">
              <h1 className="truncate text-2xl font-extrabold tracking-tight">{title}</h1>
              <InfoTip hint={subtitle} label={typeof title === 'string' ? `About ${title}` : undefined} />
            </div>
          ) : null}
          <HintText hint={subtitle} as="div" className="text-sm text-slate-500 dark:text-slate-400" />
        </div>
        {right}
      </div>
      {children}
    </header>
  )
}

/** Whether the page has scrolled at all: pinned headers show their hairline only then. */
export function useScrolled(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const check = () => setOn(window.scrollY > 0)
    check()
    window.addEventListener('scroll', check, { passive: true })
    return () => window.removeEventListener('scroll', check)
  }, [])
  return on
}

/** An empty or not-found screen: a large picture (an icon from ./icons), a title and an optional line. */
export function Empty({ icon, title, children }: { icon: PhIcon; title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <StyledIcon icon={icon} size={52} kind="feature" className="mb-3 text-brand-500 dark:text-brand-300" />
      <h2 className="text-lg font-bold">{title}</h2>
      {children && <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{children}</div>}
    </div>
  )
}

export function Spinner({ className = '', label = 'Loading' }: { className?: string; label?: string }) {
  return <div role="status" aria-label={label} className={`h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent ${className}`} />
}

export function Loading() {
  return (
    <div className="flex justify-center py-20">
      <Spinner />
    </div>
  )
}

/**
 * A segmented control (one choice out of a few). Rendered as a radio group so the selected
 * option is announced, not just coloured. `label` names the group for assistive tech.
 * One highlight slides to the picked option (transform and width, 200ms); it is placed without
 * motion on the first render, and reduced motion moves it at once (index.css). Until it has been
 * measured the picked option draws its own highlight, so nothing flashes. Four or more options
 * size to their labels (a long label like "Expenses" keeps its room); fewer share the width.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  testId,
}: {
  value: T
  options: Array<{ value: T; label: ReactNode }>
  onChange: (v: T) => void
  label?: string
  testId?: string
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ x: number; w: number } | null>(null)
  // No slide for the first placement: only a change of choice moves it.
  const [moving, setMoving] = useState(false)
  const keys = options.map((o) => o.value).join('|')
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the choice or the options change
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => {
      const on = el.querySelector<HTMLElement>('[aria-checked="true"]')
      setBox(on ? { x: on.offsetLeft, w: on.offsetWidth } : null)
    }
    measure()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [value, keys])
  useEffect(() => {
    if (!box || moving) return
    const id = requestAnimationFrame(() => setMoving(true))
    return () => cancelAnimationFrame(id)
  }, [box, moving])
  const many = options.length >= 4
  return (
    <div
      ref={wrap}
      role="radiogroup"
      aria-label={label}
      data-testid={testId}
      className="relative flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 dark:bg-ink-800"
    >
      {box && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1 left-0 rounded-xl bg-white shadow-sm dark:bg-ink-700"
          style={{
            width: box.w,
            transform: `translateX(${box.x}px)`,
            transition: moving ? 'transform 200ms cubic-bezier(0.23, 1, 0.32, 1), width 200ms cubic-bezier(0.23, 1, 0.32, 1)' : 'none',
          }}
          data-testid={testId ? `${testId}-highlight` : undefined}
        />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`relative min-h-10 min-w-0 whitespace-nowrap rounded-xl ${many ? 'flex-auto px-2' : 'flex-1 px-3'} py-2 text-sm font-semibold transition-colors ${value === o.value ? `text-slate-900 dark:text-white ${box ? '' : 'bg-white shadow-sm dark:bg-ink-700'}` : 'text-slate-600 dark:text-slate-400'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** "Live trip" (trips) or "On now" (other groups) pill for groups whose date window contains today. */
export function LiveBadge({ type = 'trip', className = '' }: { type?: GroupType; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 ${className}`}
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> {type === 'trip' ? 'Live trip' : 'On now'}
    </span>
  )
}

/** "1 Oct – 10 Oct" style range for trip dates. */
export function formatRange(start?: string, end?: string): string {
  const f = (d: string) => formatDate(d, 'day')
  if (start && end) return `${f(start)} – ${f(end)}`
  if (start) return `from ${f(start)}`
  if (end) return `until ${f(end)}`
  return ''
}
