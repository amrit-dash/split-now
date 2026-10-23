import { useMemo, type ReactNode } from 'react'
import { usePickableGroups } from '@/hooks/useVault'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { ReceiptIcon, ScanIcon, GroupsIcon } from '@/components/icons'

import { useFlag } from '@/hooks/useAppConfig'
import { liveTripFor } from '@/lib/capture'
import { todayISO } from '@/lib/id'
import { lastGroup } from '@/lib/recents'
import { type Hint, HintText } from './Hint'
import { QuickAddCard } from './QuickAddCard'
import { Sheet } from './Sheet'

// Tile subtitles: nice to read the first time, gone in the Minimal look (the titles say it).
// All 'help': the tiles show a line under every one or under none.
// Kept in Simple too, short (owner, 23 Oct 2026: the tiles read bare without a line under them).
const ADD_HINT: Hint = { full: 'What you paid, and how to split it', short: 'What you paid, split your way', tier: 'key' }
const SCAN_HINT: Hint = { full: 'A bill or payment screenshot', short: 'A bill or payment', tier: 'key' }
const GROUP_HINT: Hint = { full: 'Trip, flat, dinner, anything', short: 'Trip, flat, dinner', tier: 'key' }

/**
 * What the + button in the tab bar opens with a tap (inside a group a tap adds an expense straight
 * away, src/lib/plus-target.ts, and holding + talks to Quick add; without voice a hold opens this). Quick add comes first: one typed or spoken
 * line into the group you're in, else the trip that's on today, else the group used last. Its
 * field is not focused on open (the keyboard would cover the sheet). Then Add expense, the big
 * choice, and New group and Scan. Live table is in the tab bar; Settle up is on every group and
 * on Home's balance card.
 */
export function CreateSheet({
  open,
  onClose,
  groupId,
  initialText,
}: {
  open: boolean
  onClose: () => void
  groupId?: string
  /** a line said by holding + that needs a choice made in Quick add (which group): it opens filled in */
  initialText?: string
}) {
  const nav = useNavigate()
  const quickAdd = useFlag('quickAdd')
  const allGroups = usePickableGroups()
  // Shared, open groups only: the personal wallet has nobody to split with.
  const groups = useMemo(() => (allGroups ?? []).filter((g) => !g.archived && g.type !== 'personal'), [allGroups])
  const q = groupId ? `?group=${encodeURIComponent(groupId)}` : ''
  const defaultGroupId = (groupId && groups.some((g) => g.id === groupId) ? groupId : undefined) ?? liveTripFor(groups, todayISO()) ?? lastGroup()
  const go = (to: string) => {
    onClose()
    // Navigate once the sheet is gone from the screen: iOS keeps a picture of the page you leave
    // for its swipe-back, and coming back must show the page, not the sheet half way closed.
    requestAnimationFrame(() => requestAnimationFrame(() => nav(to)))
  }
  return (
    <Sheet open={open} onClose={onClose} title="Create">
      {/* Quick add first: one typed or spoken line does most of what the tiles below do. */}
      {/* Every look shows it: the Minimal look trims hints, not the main way in (it used to hide behind a link there). */}
      {quickAdd && (
        <>
          {/* With no groups yet the line sets one up. */}
          <QuickAddCard
            // A new line said by holding + starts a fresh composer with it.
            key={initialText ?? ''}
            groups={groups}
            defaultGroupId={defaultGroupId}
            onLeave={onClose}
            initialText={initialText}
            testId="create-quick-add"
          />
          <div className="text-muted my-4 flex items-center gap-3 text-xs uppercase tracking-wider" aria-hidden>
            <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
            or
            <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
          </div>
        </>
      )}
      <button
        type="button"
        onClick={() => go(`/add${q}`)}
        data-testid="create-expense"
        className="flex w-full items-center gap-3 accent-live rounded-3xl bg-gradient-to-r from-fill to-fill-to p-4 text-left text-on-fill shadow-lg shadow-fill/25 transition active:scale-[0.98]"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-on-fill/15" aria-hidden>
          <ReceiptIcon size={26} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-bold">Add expense</span>
          <HintText hint={ADD_HINT} as="span" className="block text-sm text-on-fill/90" />
        </span>
        <ChevronRight size={20} className="shrink-0 text-on-fill/80" aria-hidden />
      </button>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Tile icon={<GroupsIcon size={22} />} title="New group" text={GROUP_HINT} onClick={() => go('/groups/new')} testId="create-group" />
        <Tile icon={<ScanIcon size={22} />} title="Scan" text={SCAN_HINT} onClick={() => go('/scan')} testId="create-scan" />
      </div>
    </Sheet>
  )
}

function Tile({ icon, title, text, onClick, testId }: { icon: ReactNode; title: string; text: Hint; onClick: () => void; testId: string }) {
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
        <HintText hint={text} as="span" className="text-muted block text-xs leading-snug" />
      </span>
    </button>
  )
}
