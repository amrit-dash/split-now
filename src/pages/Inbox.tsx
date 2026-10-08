import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Check, ChevronDown, ChevronRight, EyeOff, FolderInput, RotateCcw, Trash2 } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { useAllGroupData, useCaptures } from '@/hooks/data'
import { useInbox } from '@/hooks/useInbox'
import type { Capture, Group } from '@/types'
import { SOURCE_LABEL, isSmsSource, rankGroupsForCapture } from '@/lib/capture'
import { guessCategory, CATEGORIES } from '@/lib/categories'
import { markInboxSeen } from '@/lib/inbox'
import { appLocale } from '@/lib/locale'
import { formatMoney } from '@/lib/money'
import { Loading, PageHeader, Segmented } from '@/components/Misc'
import { ActivityFeed } from '@/components/Trust'
import { useToast } from '@/components/Toast'

type Tab = 'sort' | 'updates'

const fmtDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' })

/**
 * Inbox: "To sort" (captured payments and expenses waiting for your OK) and "Updates" (what
 * other people did in your groups). Opening Updates marks them read on this device.
 */
export default function Inbox() {
  const data = useAllGroupData()
  const box = useInbox(data)
  const all = useCaptures()
  const [tab, setTab] = useState<Tab | null>(null)
  const current: Tab = tab ?? (box.toSort === 0 && box.unread > 0 ? 'updates' : 'sort')
  // The moment the user looks at Updates, everything up to now is read (the dots stay for this visit).
  const [seenBefore] = useState(box.seenAt)
  useEffect(() => { if (current === 'updates') markInboxSeen() }, [current, box.updates.length])

  if (!data || box.loading || !all) return <Loading />
  const groups = data.map((d) => d.group)
  const groupsById = Object.fromEntries(groups.map((g) => [g.id, g]))

  return (
    <div>
      <PageHeader title="Inbox" back />
      <Segmented<Tab> value={current} onChange={setTab} options={[
        { value: 'sort', label: <TabLabel text="To sort" n={box.toSort} /> },
        { value: 'updates', label: <TabLabel text="Updates" n={box.unread} /> },
      ]} />
      <div className="mt-4">
        {current === 'sort'
          ? <ToSort box={box} groups={groups} handled={all.filter((c) => c.status !== 'pending').slice(0, 15)} />
          : box.updates.length === 0
            ? <Quiet emoji="🔔" title="No updates yet">When friends add expenses, settle up or add you to a group, it shows here.</Quiet>
            : <ActivityFeed entries={box.updates} groups={groupsById} isNew={(a) => a.createdAt > seenBefore} />}
      </div>
    </div>
  )
}

function TabLabel({ text, n }: { text: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {text}
      {n > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{n > 99 ? '99+' : n}</span>}
    </span>
  )
}

function ToSort({ box, groups, handled }: { box: ReturnType<typeof useInbox>; groups: Group[]; handled: Capture[] }) {
  const { user } = useMe()
  const toast = useToast()
  const nothing = box.captures.length === 0 && box.approvals.length === 0

  const notShared = (c: Capture) => {
    repo.updateCapture(user.uid, c.id, { status: 'dismissed' }).catch((e) => toast((e as Error).message, 'err'))
    toast(`“${c.merchant}” marked not shared`, 'ok', { action: { label: 'Undo', run: () => { void repo.updateCapture(user.uid, c.id, { status: 'pending' }) } } })
  }

  return (
    <>
      {nothing && (
        <>
          <Quiet emoji="✨" title="All sorted">Captured payments and expenses waiting for your OK show up here.</Quiet>
          <Link to="/settings/auto-capture" className="card mt-3 flex items-center gap-3 p-4" data-testid="inbox-setup">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300"><BookOpen size={20} /></span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">Set up auto-capture</div>
              <div className="text-xs text-slate-500">Bank &amp; UPI payments from your phone land here automatically</div>
            </div>
            <ChevronRight size={18} className="shrink-0 text-slate-300 dark:text-slate-600" />
          </Link>
        </>
      )}

      {box.approvals.length > 0 && (
        <Section title="Needs your OK" hint="Not counted in balances until you approve">
          {box.approvals.map(({ e, d }) => (
            <div key={e.id} className="card flex items-center gap-3 p-3">
              <Link to={`/groups/${d.group.id}/expenses/${e.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-xl dark:bg-sky-500/10">{CATEGORIES[e.category]?.emoji ?? '🧾'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{e.description}</span>
                  <span className="block truncate text-xs text-slate-500">{d.group.emoji} {d.group.name} · your share {formatMoney(d.me ? e.splits[d.me] ?? 0 : 0, d.group.currency)}</span>
                </span>
              </Link>
              <button className="btn-primary !min-h-0 shrink-0 !px-3 !py-2 text-sm" onClick={() => repo.approveExpense(d.group, e).then(() => toast('Approved')).catch((err) => toast((err as Error).message, 'err'))}>
                <Check size={16} aria-hidden /> Approve
              </button>
            </div>
          ))}
        </Section>
      )}

      {box.captures.length > 0 && (
        <Section title="Captured payments" hint={`${box.captures.length} to sort`}>
          {box.captures.map((c) => <CaptureCard key={c.id} c={c} groups={groups} onNotShared={() => notShared(c)} />)}
        </Section>
      )}

      {handled.length > 0 && <Handled list={handled} groups={groups} />}
    </>
  )
}

function CaptureCard({ c, groups, onNotShared }: { c: Capture; groups: Group[]; onNotShared: () => void }) {
  const { profile } = useMe()
  const best = rankGroupsForCapture(groups, c).best
  const bestGroup = best ? groups.find((g) => g.id === best) : undefined
  const cat = guessCategory(c.merchant)
  const source = SOURCE_LABEL[c.source] ?? c.source
  return (
    <div className="card overflow-hidden" data-testid="inbox-capture">
      <Link to={`/capture/${c.id}`} className="flex items-center gap-3 p-3 pb-2.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-xl dark:bg-ink-800">{cat ? CATEGORIES[cat].emoji : isSmsSource(c.source) ? '📩' : '💳'}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{c.merchant}</span>
          <span className="block truncate text-xs text-slate-500">{fmtDay(c.date)} · {source}{c.card ? ` · ${c.card}` : ''}</span>
        </span>
        <span className="shrink-0 text-right font-bold tabular-nums">{formatMoney(c.amount, c.currency ?? profile.currency)}</span>
      </Link>
      <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2 dark:border-white/5">
        {bestGroup ? (
          <Link to={`/add?group=${encodeURIComponent(bestGroup.id)}&capture=${encodeURIComponent(c.id)}`} data-testid="inbox-add"
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">
            <span className="shrink-0">{bestGroup.emoji}</span><span className="truncate">Add to {bestGroup.name}</span>
          </Link>
        ) : (
          <Link to={`/capture/${c.id}`} className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">
            <FolderInput size={16} className="shrink-0" aria-hidden /><span className="truncate">Choose a group</span>
          </Link>
        )}
        <button onClick={onNotShared} title="Not shared" className="flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-ink-800" aria-label={`Mark ${c.merchant} as not shared`}>
          <EyeOff size={16} aria-hidden /><span className="hidden min-[360px]:inline">Not shared</span>
        </button>
      </div>
    </div>
  )
}

function Handled({ list, groups }: { list: Capture[]; groups: Group[] }) {
  const { user, profile } = useMe()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const name = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups])
  return (
    <section className="mt-6">
      <button className="flex w-full items-center justify-between px-1 py-1 text-sm font-semibold text-slate-500" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="inbox-handled">
        Recently handled · {list.length}
        <ChevronDown size={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="card mt-2 divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
          {list.map((c) => {
            const g = c.groupId ? name[c.groupId] : undefined
            const body = (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.merchant}</span>
                <span className="block truncate text-xs text-slate-500">
                  {formatMoney(c.amount, c.currency ?? profile.currency)} · {c.status === 'assigned' ? `Added to ${g ? `${g.emoji} ${g.name}` : 'a group'}` : 'Not shared'}
                </span>
              </span>
            )
            return (
              <div key={c.id} className="flex items-center gap-2 px-3 py-2.5">
                {c.status === 'assigned' && c.groupId && c.expenseId
                  ? <Link to={`/groups/${c.groupId}/expenses/${c.expenseId}`} className="flex min-w-0 flex-1 items-center">{body}</Link>
                  : body}
                {c.status === 'dismissed' && (
                  <button className="rounded-full p-2 text-brand-600 dark:text-brand-300" aria-label={`Move ${c.merchant} back to sort`} title="Back to sort"
                    onClick={() => repo.updateCapture(user.uid, c.id, { status: 'pending' }).catch((e) => toast((e as Error).message, 'err'))}><RotateCcw size={16} /></button>
                )}
                <button className="rounded-full p-2 text-slate-400 hover:text-rose-500" aria-label={`Delete ${c.merchant}`} title="Delete"
                  onClick={() => repo.deleteCapture(user.uid, c.id).catch((e) => toast((e as Error).message, 'err'))}><Trash2 size={16} /></button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="font-bold">{title}</h2>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function Quiet({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-8 text-center">
      <div className="mb-2 text-4xl">{emoji}</div>
      <div className="font-bold">{title}</div>
      <p className="mt-1 text-sm text-slate-500">{children}</p>
    </div>
  )
}
