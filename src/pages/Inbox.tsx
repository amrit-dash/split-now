import { Link } from 'react-router-dom'
import { BookOpen, ChevronRight, X } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { useCaptures, useGroups } from '@/hooks/data'
import type { Capture } from '@/types'
import { SOURCE_LABEL, isSmsSource, rankGroupsForCapture } from '@/lib/capture'
import { formatMoney } from '@/lib/money'
import { Empty, LiveBadge, Loading, PageHeader } from '@/components/Misc'
import { useToast } from '@/components/Toast'
import { appLocale } from '@/lib/locale'

/** Captured payments waiting to be assigned to a group, plus recently handled ones. */
export default function Inbox() {
  const { user, profile } = useMe()
  const captures = useCaptures()
  const groups = useGroups()
  const toast = useToast()
  if (!captures || !groups) return <Loading />

  const pending = captures.filter((c) => c.status === 'pending')
  const handled = captures.filter((c) => c.status !== 'pending').slice(0, 10)
  const groupName = (id?: string) => groups.find((g) => g.id === id)?.name

  const dismiss = async (c: Capture) => {
    await repo.updateCapture(user.uid, c.id, { status: 'dismissed' })
    toast('Dismissed')
  }

  return (
    <div>
      <PageHeader title="Inbox" subtitle="Payments captured from your phone" back />
      {pending.length === 0 ? (
        <Empty emoji="📭" title="Nothing to sort">
          Payments captured from bank &amp; UPI SMS, Apple Pay Shortcuts or the share sheet show up here.
        </Empty>
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
          {pending.map((c) => {
            const best = rankGroupsForCapture(groups, c).best
            return (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <Link to={`/capture/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-xl dark:bg-ink-800">{isSmsSource(c.source) ? '📩' : '💳'}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{c.merchant}</div>
                    <div className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                      {new Date(c.date + 'T00:00:00').toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' })} ·{' '}
                      {isSmsSource(c.source)
                        ? <span className="rounded-full bg-sky-100 px-1.5 py-px text-[10px] font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" data-testid="source-badge">{SOURCE_LABEL[c.source]}</span>
                        : SOURCE_LABEL[c.source] ?? c.source}
                      {best && <LiveBadge type={groups.find((g) => g.id === best)?.type} className="!px-1.5" />}
                    </div>
                  </div>
                  <div className="text-right font-bold tabular-nums">{formatMoney(c.amount, c.currency ?? profile.currency)}</div>
                  <ChevronRight size={18} className="shrink-0 text-slate-300 dark:text-slate-600" />
                </Link>
                <button onClick={() => dismiss(c)} className="-mr-2 rounded-full p-2 text-slate-400 hover:text-rose-500" aria-label={`Dismiss ${c.merchant}`}><X size={18} /></button>
              </div>
            )
          })}
        </div>
      )}

      {handled.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-2.5 px-1 text-lg font-bold">Recently handled</h2>
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
            {handled.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.merchant} · {formatMoney(c.amount, c.currency ?? profile.currency)}</div>
                  <div className="text-xs text-slate-500">{c.status === 'assigned' ? `Added to ${groupName(c.groupId) ?? 'a group'}` : 'Not shared'}</div>
                </div>
                {c.status === 'dismissed' && (
                  <button className="font-semibold text-brand-600 dark:text-brand-300" onClick={() => repo.updateCapture(user.uid, c.id, { status: 'pending' })}>Undo</button>
                )}
                <button className="rounded-full p-2 text-slate-400 hover:text-rose-500" aria-label="Delete" onClick={() => repo.deleteCapture(user.uid, c.id)}><X size={16} /></button>
              </div>
            ))}
          </div>
        </section>
      )}

      <Link to="/settings/auto-capture" className="card mt-6 flex items-center gap-3 p-4">
        <BookOpen size={20} className="text-brand-600 dark:text-brand-300" />
        <div className="flex-1">
          <div className="font-semibold">Set up auto-capture</div>
          <div className="text-xs text-slate-500">Forward bank &amp; UPI debit SMS from iPhone or Android</div>
        </div>
        <ChevronRight size={18} className="text-slate-300 dark:text-slate-600" />
      </Link>
    </div>
  )
}
