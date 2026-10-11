import { lazy, Suspense, useId } from 'react'
import { Sparkles } from 'lucide-react'
import type { Group } from '@/types'

// Only needed once it shows: kept out of the first-paint bundle (the service worker precaches it).
const QuickAdd = lazy(() => import('./QuickAdd').then((m) => ({ default: m.QuickAdd })))

/**
 * Quick add in its own card (the Create sheet, and Home before there are any groups). With no
 * groups the line sets up the first one, so the card says so.
 */
export function QuickAddCard({
  groups,
  defaultGroupId,
  onLeave,
  testId,
  className = '',
}: {
  groups: Group[]
  defaultGroupId?: string
  onLeave?: () => void
  testId: string
  className?: string
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={`rounded-3xl bg-slate-50 p-3.5 ring-1 ring-slate-900/5 dark:bg-ink-800 dark:ring-white/5 ${className}`}>
      <div className="mb-3 flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"
          aria-hidden
        >
          <Sparkles size={20} />
        </span>
        <span className="min-w-0">
          <h3 id={id} className="font-semibold">
            Quick add
          </h3>
          <span className="text-muted block text-xs leading-snug">
            {groups.length ? 'Type or say it, then check the form' : 'Say who it’s with, and we’ll set up the group for you to check'}
          </span>
        </span>
      </div>
      <Suspense fallback={<div className="h-[6.25rem] rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-ink-900 dark:ring-white/10" />}>
        <QuickAdd groups={groups} defaultGroupId={defaultGroupId} onLeave={onLeave} testId={testId} />
      </Suspense>
    </section>
  )
}
