import { lazy, Suspense, useId, useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Plus, ReceiptText, ScanLine, Sparkles, Users } from 'lucide-react'
import { useGroups } from '@/hooks/data'
import { useFlag } from '@/hooks/useAppConfig'
import { liveTripFor } from '@/lib/capture'
import { todayISO } from '@/lib/id'
import { lastGroup } from '@/lib/recents'
import { ChequeIcon } from './ChequeIcon'
import { Sheet } from './Sheet'

// Only needed once the sheet is open: kept out of the first-paint bundle (the service worker precaches it).
const QuickAdd = lazy(() => import('./QuickAdd').then((m) => ({ default: m.QuickAdd })))

/**
 * What the + button in the tab bar opens: the one place to start anything. Add expense is the
 * big first choice (it's what people do most); inside a group, every option opens for that group.
 * Below the tiles, Quick add: one typed or spoken line into the group you're in, else the trip
 * that's on today, else the group used last. Its field is not focused on open (the keyboard
 * would cover the tiles).
 */
export function CreateSheet({ open, onClose, groupId }: { open: boolean; onClose: () => void; groupId?: string }) {
  const nav = useNavigate()
  // Live tables off (config/app flags.liveTables): the tile goes too; /split and /t/* already redirect home.
  const liveTables = useFlag('liveTables')
  const quickAdd = useFlag('quickAdd')
  const allGroups = useGroups()
  // Shared, open groups only: the personal wallet has nobody to split with.
  const groups = useMemo(() => (allGroups ?? []).filter((g) => !g.archived && g.type !== 'personal'), [allGroups])
  const quickId = useId()
  const q = groupId ? `?group=${encodeURIComponent(groupId)}` : ''
  const go = (to: string) => {
    onClose()
    // Navigate once the sheet is gone from the screen: iOS keeps a picture of the page you leave
    // for its swipe-back, and coming back must show the page, not the sheet half way closed.
    requestAnimationFrame(() => requestAnimationFrame(() => nav(to)))
  }
  return (
    <Sheet open={open} onClose={onClose} title="Create">
      <button
        type="button"
        onClick={() => go(`/add${q}`)}
        data-testid="create-expense"
        className="flex w-full items-center gap-3 accent-live rounded-3xl bg-gradient-to-r from-fill to-fill-to p-4 text-left text-on-fill shadow-lg shadow-fill/25 transition active:scale-[0.98]"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-on-fill/15" aria-hidden>
          <Plus size={26} strokeWidth={2.6} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-bold">Add expense</span>
          <span className="block text-sm text-on-fill/90">What you paid, and how to split it</span>
        </span>
        <ChevronRight size={20} className="shrink-0 text-on-fill/80" aria-hidden />
      </button>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {liveTables && (
          <Tile
            icon={<ReceiptText size={22} />}
            title="Split by items"
            text="Everyone taps what they had"
            onClick={() => go(`/split${q}`)}
            testId="create-split"
          />
        )}
        <Tile icon={<ScanLine size={22} />} title="Scan" text="Read a bill or payment screenshot" onClick={() => go('/scan')} testId="create-scan" />
        <Tile icon={<Users size={22} />} title="New group" text="Trip, flat, dinner, anything" onClick={() => go('/groups/new')} testId="create-group" />
        <Tile
          icon={<ChequeIcon size={26} />}
          title="Settle up"
          text="Record a payment"
          onClick={() => go(groupId ? `/groups/${encodeURIComponent(groupId)}/settle` : '/settle')}
          testId="create-settle"
        />
      </div>
      {quickAdd && groups.length > 0 && (
        <section aria-labelledby={quickId} className="mt-5">
          <div className="text-muted flex items-center gap-3 text-xs uppercase tracking-wider" aria-hidden>
            <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
            or
            <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
          </div>
          {/* Its own card, styled like the tiles above, so it reads as one of the sheet's options. */}
          <div className="mt-3 rounded-3xl bg-slate-50 p-3.5 ring-1 ring-slate-900/5 dark:bg-ink-800 dark:ring-white/5">
            <div className="mb-3 flex items-center gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"
                aria-hidden
              >
                <Sparkles size={20} />
              </span>
              <span className="min-w-0">
                <h3 id={quickId} className="font-semibold">
                  Quick add
                </h3>
                <span className="text-muted block text-xs leading-snug">Type or say it, then check the form</span>
              </span>
            </div>
            <Suspense fallback={<div className="h-[6.25rem] rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-ink-900 dark:ring-white/10" />}>
              <QuickAdd
                groups={groups}
                defaultGroupId={(groupId && groups.some((g) => g.id === groupId) ? groupId : undefined) ?? liveTripFor(groups, todayISO()) ?? lastGroup()}
                onLeave={onClose}
                testId="create-quick-add"
              />
            </Suspense>
          </div>
        </section>
      )}
    </Sheet>
  )
}

function Tile({ icon, title, text, onClick, testId }: { icon: ReactNode; title: string; text: string; onClick: () => void; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex flex-col items-start gap-2 rounded-3xl bg-slate-50 p-3.5 text-left ring-1 ring-slate-900/5 transition active:scale-[0.98] dark:bg-ink-800 dark:ring-white/5"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300" aria-hidden>
        {icon}
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="text-muted block text-xs leading-snug">{text}</span>
      </span>
    </button>
  )
}
