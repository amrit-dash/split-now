import { lazy, Suspense, useId } from 'react'
import { BotIcon } from '@/components/icons'
import type { Group } from '@/types'
import { type Hint, HintText, InfoTip } from './Hint'

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
  initialText,
  testId,
  className = '',
}: {
  groups: Group[]
  defaultGroupId?: string
  onLeave?: () => void
  /** a line already said (holding + to talk, when it needs a choice made here) */
  initialText?: string
  testId: string
  className?: string
}) {
  const id = useId()
  const hint: Hint = groups.length
    ? { full: 'Type or say it, then check the form', tier: 'help' }
    : { full: 'Say who it’s with and we set up the group for you to check', short: 'Say who it’s with', tier: 'help' }
  return (
    <section aria-labelledby={id} className={`rounded-3xl bg-slate-50 p-3.5 ring-1 ring-slate-900/5 dark:bg-ink-800 dark:ring-white/5 ${className}`}>
      <div className="mb-3 flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"
          aria-hidden
        >
          <BotIcon size={22} />
        </span>
        <span className="min-w-0">
          <span className="flex items-center">
            <h3 id={id} className="font-semibold">
              Quick add
            </h3>
            <InfoTip hint={hint} label="About Quick add" />
          </span>
          <HintText hint={hint} as="span" className="text-muted block text-xs leading-snug" />
        </span>
      </div>
      <Suspense fallback={<div className="h-[6.25rem] rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-ink-900 dark:ring-white/10" />}>
        <QuickAdd groups={groups} defaultGroupId={defaultGroupId} onLeave={onLeave} initialText={initialText} testId={testId} />
      </Suspense>
    </section>
  )
}
