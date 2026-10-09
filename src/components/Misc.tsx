import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { formatDate } from '@/lib/locale'
import type { GroupType } from '@/types'

export function PageHeader({ title, back, right, subtitle }: { title: ReactNode; back?: boolean | string; right?: ReactNode; subtitle?: ReactNode }) {
  const nav = useNavigate()
  return (
    <header className="sticky top-[var(--banner-h,0px)] z-30 -mx-4 mb-5 bg-slate-50/80 px-4 pb-3 pt-[calc(var(--safe-top)+1.25rem)] backdrop-blur-xl dark:bg-ink-950/80">
      <div className="flex min-h-11 items-center gap-2">
        {back && (
          <button
            type="button"
            onClick={() => (typeof back === 'string' ? nav(back) : history.length > 1 ? nav(-1) : nav('/'))}
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-200/60 dark:hover:bg-ink-800"
            aria-label="Back"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {/* No empty h1: a page whose heading is in the body (expense detail) passes title="". */}
          {title ? <h1 className="truncate text-2xl font-extrabold tracking-tight">{title}</h1> : null}
          {subtitle && <div className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</div>}
        </div>
        {right}
      </div>
    </header>
  )
}

export function Empty({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 text-5xl" aria-hidden>
        {emoji}
      </div>
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
  return (
    <div role="radiogroup" aria-label={label} data-testid={testId} className="flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 dark:bg-ink-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-w-0 flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition ${value === o.value ? 'bg-white text-slate-900 shadow-sm dark:bg-ink-700 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}
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
