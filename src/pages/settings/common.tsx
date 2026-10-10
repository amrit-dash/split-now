import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight } from 'lucide-react'
import { usePageTitle } from '@/lib/brand'
import { PageHeader } from '@/components/Misc'

/**
 * One settings screen: sticky header with a back arrow to /settings, and the document title.
 * `pinned` sits inside the sticky header, so it stays in view while the rest scrolls under it.
 */
export function SettingsPage({
  title,
  subtitle,
  back = '/settings',
  right,
  pinned,
  children,
}: {
  title: string
  subtitle?: ReactNode
  back?: string
  right?: ReactNode
  pinned?: ReactNode
  children: ReactNode
}) {
  usePageTitle(title)
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} back={back} right={right}>
        {pinned}
      </PageHeader>
      {children}
    </div>
  )
}

/** A row in the settings list: icon, title, one-line summary, chevron. */
export function SettingsRow({ to, icon, title, summary, testId }: { to: string; icon: ReactNode; title: string; summary?: ReactNode; testId?: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3.5 transition active:bg-slate-50 dark:active:bg-ink-800" data-testid={testId}>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300"
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        {summary && <span className="text-muted block truncate text-xs">{summary}</span>}
      </span>
      <ChevronRight size={18} className="shrink-0 text-slate-400" aria-hidden />
    </Link>
  )
}

/**
 * Everything in Settings autosaves. `flash()` after a successful write shows a quiet "Saved"
 * for a moment next to the section title instead of a floating save bar.
 */
export function useSavedFlash(ms = 1600): [boolean, () => void] {
  const [on, setOn] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const flash = useCallback(() => {
    setOn(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOn(false), ms)
  }, [ms])
  return [on, flash]
}

export function SavedPill({ on }: { on: boolean }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 transition-opacity dark:text-emerald-400 ${on ? 'opacity-100' : 'opacity-0'}`}
      data-testid="saved-pill"
    >
      {on && (
        <>
          <Check size={13} aria-hidden /> Saved
        </>
      )}
    </span>
  )
}

/** A section heading with room for the Saved pill on the right. */
export function SectionTitle({ children, saved }: { children: ReactNode; saved?: boolean }) {
  return (
    <div className="mb-2 mt-5 flex items-baseline justify-between px-1 first:mt-0">
      <h2 className="font-bold">{children}</h2>
      {saved !== undefined && <SavedPill on={saved} />}
    </div>
  )
}
