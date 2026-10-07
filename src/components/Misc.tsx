import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function PageHeader({ title, back, right, subtitle }: { title: ReactNode; back?: boolean | string; right?: ReactNode; subtitle?: ReactNode }) {
  const nav = useNavigate()
  return (
    <header className="sticky top-0 z-30 -mx-4 mb-4 bg-slate-50/80 px-4 pb-3 pt-3 backdrop-blur-xl safe-top dark:bg-ink-950/80">
      <div className="flex min-h-11 items-center gap-2">
        {back && (
          <button
            onClick={() => (typeof back === 'string' ? nav(back) : history.length > 1 ? nav(-1) : nav('/'))}
            className="-ml-2 rounded-full p-2 hover:bg-slate-200/60 dark:hover:bg-ink-800"
            aria-label="Back"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{title}</h1>
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
      <div className="mb-3 text-5xl">{emoji}</div>
      <div className="text-lg font-bold">{title}</div>
      {children && <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{children}</div>}
    </div>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return <div className={`h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent ${className}`} />
}

export function Loading() {
  return <div className="flex justify-center py-20"><Spinner /></div>
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: ReactNode }>; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 dark:bg-ink-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition ${value === o.value ? 'bg-white text-slate-900 shadow-sm dark:bg-ink-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
