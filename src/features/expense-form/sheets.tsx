import { useState, type ReactNode } from 'react'
import { Check, Plus, Search, UserPlus, Users, Wallet, type LucideIcon } from 'lucide-react'
import type { Category, Group, MemberId } from '@/types'
import { CATEGORIES } from '@/lib/categories'
import { isLiveTrip } from '@/lib/capture'
import { todayISO } from '@/lib/id'
import { Avatar } from '@/components/Avatar'
import { GroupIcon } from '@/components/GroupIcon'
import { LiveBadge } from '@/components/Misc'
import { Sheet } from '@/components/Sheet'
import { nameOf, youFirst } from './bits'

const ROW = 'flex min-h-12 w-full items-center gap-3 rounded-2xl p-2.5 text-left hover:bg-slate-50 dark:hover:bg-ink-800'

export function GroupPickerSheet({
  open,
  onClose,
  groups,
  current,
  onPick,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  groups: Group[]
  current: string
  onPick: (id: string) => void
  onCreate: (type?: 'direct' | 'personal') => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Choose group">
      <GroupList groups={groups} current={current} onPick={onPick} onCreate={onCreate} />
    </Sheet>
  )
}

/** Live trips first, then shared groups, 1:1 friends and the personal wallet; searchable when long. */
function GroupList({
  groups,
  current,
  onPick,
  onCreate,
}: {
  groups: Group[]
  current: string
  onPick: (id: string) => void
  onCreate: (type?: 'direct' | 'personal') => void
}) {
  const [q, setQ] = useState('')
  const today = todayISO()
  const t = q.trim().toLowerCase()
  const shown = t ? groups.filter((g) => g.name.toLowerCase().includes(t)) : groups
  const live = shown.filter((g) => g.type !== 'personal' && isLiveTrip(g, today))
  const rest = shown.filter((g) => !live.includes(g))
  const sections: Array<[string, Group[]]> = [
    ['Shared', rest.filter((g) => g.type !== 'direct' && g.type !== 'personal')],
    ['Friends', rest.filter((g) => g.type === 'direct')],
    ['Personal', rest.filter((g) => g.type === 'personal')],
  ].filter(([, list]) => list.length) as Array<[string, Group[]]>
  // Headings only help when there is more than one kind of thing in the list.
  const headed = sections.length + (live.length ? 1 : 0) > 1
  const creates: Array<{ type?: 'direct' | 'personal'; label: string; hint: string; icon: LucideIcon }> = [
    { label: 'New group', hint: 'Trip, flat, team…', icon: Users },
    { type: 'direct', label: 'New 1:1 friend', hint: 'Just you and one friend', icon: UserPlus },
    ...(groups.some((g) => g.type === 'personal')
      ? []
      : [{ type: 'personal' as const, label: 'Personal wallet', hint: 'Track your own spending', icon: Wallet }]),
  ]
  const row = (g: Group, isLive = false) => (
    <button
      key={g.id}
      type="button"
      onClick={() => onPick(g.id)}
      aria-pressed={g.id === current}
      className={`${ROW} ${g.id === current ? 'bg-brand-50 dark:bg-brand-900/30' : ''}`}
    >
      <GroupIcon emoji={g.emoji} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{g.name}</span>
        {isLive && <LiveBadge className="mt-0.5" />}
      </span>
      {g.id === current && <Check size={18} className="shrink-0 text-brand-600" aria-hidden />}
    </button>
  )
  return (
    <div data-testid="group-list">
      {groups.length > 6 && (
        <div className="relative mb-2">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className="input !py-2 !pl-9" placeholder="Search groups" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search groups" />
        </div>
      )}
      {shown.length === 0 && <p className="py-4 text-center text-sm text-muted">No group matches “{q.trim()}”</p>}
      {live.length > 0 && <div className="space-y-1">{live.map((g) => row(g, true))}</div>}
      {sections.map(([title, list]) => (
        <div key={title} className="mt-1">
          {headed && <div className="px-2.5 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>}
          <div className="space-y-1">{list.map((g) => row(g))}</div>
        </div>
      ))}
      {/* Create where the expense goes; GroupForm comes back here (next=add) with it picked. */}
      <div className="mt-3 border-t border-slate-100 pt-3 dark:border-white/5" data-testid="group-create">
        <div className="px-2.5 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Create new</div>
        <div className="space-y-1">
          {creates.map((c) => (
            <button key={c.label} type="button" onClick={() => onCreate(c.type)} className={ROW}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                <c.icon size={20} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{c.label}</span>
                <span className="block truncate text-xs text-muted">{c.hint}</span>
              </span>
              <Plus size={18} className="shrink-0 text-slate-400" aria-hidden />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function CurrencySheet({
  open,
  onClose,
  value,
  choices,
  groupName,
  groupCurrency,
  onPick,
}: {
  open: boolean
  onClose: () => void
  value: string
  choices: string[]
  groupName: string
  groupCurrency: string
  onPick: (c: string) => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Currency">
      <p className="mb-3 text-sm text-muted">
        {groupName} is in {groupCurrency}. Other currencies are converted at the ECB rate for the expense date, then locked.
      </p>
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Currency">
        {choices.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === value}
            onClick={() => {
              onPick(c)
              onClose()
            }}
            className={`min-h-11 rounded-2xl py-3 text-sm font-bold ${c === value ? 'accent-live bg-brand-600 text-white' : 'bg-slate-100 dark:bg-ink-800'}`}
          >
            {c}
          </button>
        ))}
      </div>
    </Sheet>
  )
}

export function CategorySheet({ open, onClose, value, onPick }: { open: boolean; onClose: () => void; value: Category; onPick: (c: Category) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Category">
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Category">
        {(Object.keys(CATEGORIES) as Category[]).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === value}
            onClick={() => {
              onPick(c)
              onClose()
            }}
            className={`flex min-h-11 flex-col items-center gap-1 rounded-2xl p-3 text-xs font-semibold ${c === value ? 'ring-2 ring-brand-500' : ''}`}
            style={{ background: CATEGORIES[c].color + '18' }}
          >
            <span className="text-2xl" aria-hidden>
              {CATEGORIES[c].emoji}
            </span>
            {CATEGORIES[c].label}
          </button>
        ))}
      </div>
    </Sheet>
  )
}

/** Who paid: one person, or "several people" which opens the amount rows on the card. */
export function PayerSheet({
  open,
  onClose,
  group,
  order,
  me,
  value,
  multiPay,
  onPick,
  onMultiPay,
}: {
  open: boolean
  onClose: () => void
  group: Group
  order: MemberId[]
  me: MemberId
  value: MemberId
  multiPay: boolean
  onPick: (id: MemberId) => void
  onMultiPay: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Who paid?" testId="payer-sheet">
      <div className="space-y-1" role="radiogroup" aria-label="Who paid">
        {youFirst(order, me).map((id) => {
          const on = !multiPay && id === value
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                onPick(id)
                onClose()
              }}
              className={ROW}
            >
              <Avatar name={group.members[id]?.name ?? '?'} color={group.members[id]?.color ?? '#999'} photoURL={group.members[id]?.photoURL} size={36} />
              <span className="flex-1 font-semibold">{nameOf(group, me, id)}</span>
              {on && <Check size={18} className="text-brand-600" aria-hidden />}
            </button>
          )
        })}
        <button
          type="button"
          role="radio"
          aria-checked={multiPay}
          onClick={() => {
            onMultiPay()
            onClose()
          }}
          className={`${ROW} mt-2 border-t border-slate-100 pt-3 dark:border-white/5`}
          data-testid="payer-multiple"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-ink-800">
            <Users size={18} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Several people paid</span>
            <span className="block text-xs text-muted">Enter what each person put in</span>
          </span>
          {multiPay && <Check size={18} className="text-brand-600" aria-hidden />}
        </button>
      </div>
    </Sheet>
  )
}

/** A card that is really one tappable summary row (the collapsed payer / split cards). */
export function SummaryCard({
  id,
  label,
  hint,
  title,
  detail,
  icon,
  plainIcon,
  onClick,
  testId,
  children,
}: {
  id?: string
  label: ReactNode
  hint?: ReactNode
  title: ReactNode
  detail?: ReactNode
  icon: ReactNode
  /** the icon is already a 40px tile (an avatar): no background behind it */
  plainIcon?: boolean
  onClick: () => void
  testId?: string
  children?: ReactNode
}) {
  return (
    <div id={id} className="card mt-3 p-4">
      <button
        type="button"
        onClick={onClick}
        className="-m-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-2xl p-2 text-left active:bg-slate-50 dark:active:bg-ink-800"
        aria-haspopup="dialog"
        data-testid={testId}
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center ${plainIcon ? '' : 'rounded-2xl bg-slate-100 text-slate-700 dark:bg-ink-800 dark:text-slate-200'}`}
          aria-hidden
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="label !mb-0 flex items-center gap-1.5">
            {label}
            {hint}
          </span>
          <span className="block truncate font-semibold">{title}</span>
          {detail && <span className="block truncate text-sm text-muted">{detail}</span>}
        </span>
        <span className="shrink-0 text-sm font-semibold text-brand-600 dark:text-brand-300">Change</span>
      </button>
      {children}
    </div>
  )
}
