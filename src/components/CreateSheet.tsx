import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Plus, ReceiptText, ScanLine, Users } from 'lucide-react'
import { useGroups } from '@/hooks/data'
import { useFlag } from '@/hooks/useAppConfig'
import { liveTripFor } from '@/lib/capture'
import { todayISO } from '@/lib/id'
import { lastGroup } from '@/lib/recents'
import { ChequeIcon } from './ChequeIcon'
import { type Hint, HintText, useShows } from './Hint'
import { QuickAddCard } from './QuickAddCard'
import { Sheet } from './Sheet'

// Tile subtitles: nice to read the first time, gone in the Minimal look (the titles say it).
const ADD_HINT: Hint = { full: 'What you paid, and how to split it', tier: 'help' }
// "Live table" is a name people learn here, so its line stays in every look (Split by items is the form's own split type).
const SPLIT_HINT: Hint = { full: 'Friends scan a QR and tap what they had', short: 'Everyone taps what they had', tier: 'key' }
const SCAN_HINT: Hint = { full: 'Read a bill or payment screenshot', short: 'Bills and payment screenshots', tier: 'help' }
const GROUP_HINT: Hint = { full: 'Trip, flat, dinner, anything', tier: 'help' }
const SETTLE_HINT: Hint = { full: 'Record a payment', tier: 'help' }

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
  // The Minimal look keeps the sheet to its tiles: Quick add sits behind a small link instead.
  const showQuickAdd = useShows(2)
  const [quickOpen, setQuickOpen] = useState(false)
  const allGroups = useGroups()
  // Shared, open groups only: the personal wallet has nobody to split with.
  const groups = useMemo(() => (allGroups ?? []).filter((g) => !g.archived && g.type !== 'personal'), [allGroups])
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
          <HintText hint={ADD_HINT} as="span" className="block text-sm text-on-fill/90" />
        </span>
        <ChevronRight size={20} className="shrink-0 text-on-fill/80" aria-hidden />
      </button>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {liveTables && <Tile icon={<ReceiptText size={22} />} title="Live table" text={SPLIT_HINT} onClick={() => go(`/split${q}`)} testId="create-split" />}
        <Tile icon={<ScanLine size={22} />} title="Scan" text={SCAN_HINT} onClick={() => go('/scan')} testId="create-scan" />
        <Tile icon={<Users size={22} />} title="New group" text={GROUP_HINT} onClick={() => go('/groups/new')} testId="create-group" />
        <Tile
          icon={<ChequeIcon size={26} />}
          title="Settle up"
          text={SETTLE_HINT}
          onClick={() => go(groupId ? `/groups/${encodeURIComponent(groupId)}/settle` : '/settle')}
          testId="create-settle"
        />
      </div>
      {quickAdd && !showQuickAdd && !quickOpen && (
        <button
          type="button"
          onClick={() => setQuickOpen(true)}
          className="mx-auto mt-3 flex min-h-11 items-center px-3 text-sm font-semibold text-brand-600 dark:text-brand-300"
          data-testid="create-quick-add-open"
        >
          Quick add
        </button>
      )}
      {quickAdd && (showQuickAdd || quickOpen) && (
        <>
          <div className="text-muted mt-5 flex items-center gap-3 text-xs uppercase tracking-wider" aria-hidden>
            <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
            or
            <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
          </div>
          {/* Its own card, styled like the tiles above, so it reads as one of the sheet's options. With no groups yet the line sets one up. */}
          <QuickAddCard
            className="mt-3"
            groups={groups}
            defaultGroupId={(groupId && groups.some((g) => g.id === groupId) ? groupId : undefined) ?? liveTripFor(groups, todayISO()) ?? lastGroup()}
            onLeave={onClose}
            testId="create-quick-add"
          />
        </>
      )}
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
