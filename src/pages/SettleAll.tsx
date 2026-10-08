import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Plus, Users } from 'lucide-react'
import { useMe } from '@/hooks/auth'
import { useAllGroupData } from '@/hooks/data'
import { formatMoney } from '@/lib/money'
import { pendingSettlements, personSummaries, totalsByCurrency, type SettleRow } from '@/lib/settleAll'
import { Avatar } from '@/components/Avatar'
import { Loading, PageHeader } from '@/components/Misc'
import { Celebrate } from '@/components/Celebrate'

/** Every payment still to make or receive, across all groups and 1:1s. Settling happens per group. */
export default function SettleAll() {
  const { profile } = useMe()
  const data = useAllGroupData()
  const home = profile.currency
  const rows = useMemo(() => (data ? pendingSettlements(data, home) : null), [data, home])

  // Content sits above the (empty-state) fireworks canvas, which is fixed at z-index 0.
  return (
    <div className="relative z-10">
      <PageHeader title="Settle up" subtitle="All groups and 1:1s" back />
      {!rows ? <Loading /> : rows.length === 0 ? <AllSettled /> : <Pending rows={rows} home={home} />}
    </div>
  )
}

function Pending({ rows, home }: { rows: SettleRow[]; home: string }) {
  const totals = totalsByCurrency(rows, home)
  const owe = rows.filter((r) => r.dir === 'owe')
  const owed = rows.filter((r) => r.dir === 'owed')
  const people = personSummaries(rows)
  return (
    <div className="space-y-6" data-testid="settle-all">
      <div className="card grid grid-cols-2 divide-x divide-slate-100 overflow-hidden dark:divide-white/5" data-testid="settle-totals">
        <TotalCol label="You owe" cls="neg" values={totals.filter((t) => t.owe).map((t) => formatMoney(t.owe, t.currency))} />
        <TotalCol label="You are owed" cls="pos" values={totals.filter((t) => t.owed).map((t) => formatMoney(t.owed, t.currency))} />
      </div>

      {people.length > 0 && (
        <section>
          <h2 className="mb-2.5 px-1 text-lg font-bold">Across groups</h2>
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
            {people.map((p) => (
              <Link key={p.key} to="/friends" className="flex items-center gap-3 px-4 py-3 transition active:bg-slate-50 dark:active:bg-ink-800">
                <Avatar name={p.name} color={p.color} size={36} />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="truncate">Net with <b>{p.name}</b></div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {p.net === 0 ? 'evens out' : p.net > 0 ? 'owes you' : 'you owe'} across {p.groups} groups
                  </div>
                </div>
                {p.net !== 0 && <div className={`font-bold tabular-nums ${p.net > 0 ? 'pos' : 'neg'}`}>{formatMoney(Math.abs(p.net), p.currency)}</div>}
                <ChevronRight size={18} className="shrink-0 text-slate-300 dark:text-slate-600" aria-hidden />
              </Link>
            ))}
          </div>
          <p className="mt-2 px-1 text-xs text-slate-500 dark:text-slate-400">Payments are still recorded per group. Friends can net them into one.</p>
        </section>
      )}

      <RowSection title="You owe" rows={owe} empty="You don’t owe anyone." />
      <RowSection title="You are owed" rows={owed} empty="Nobody owes you right now." />
    </div>
  )
}

function TotalCol({ label, cls, values }: { label: string; cls: string; values: string[] }) {
  return (
    <div className="min-w-0 p-4">
      <div className={`text-xs font-semibold uppercase tracking-wide ${cls}`}>{label}</div>
      {values.length === 0 ? (
        <div className="mt-1 text-2xl font-extrabold tabular-nums text-slate-300 dark:text-slate-600">—</div>
      ) : values.map((v, i) => (
        <div key={i} className={`mt-1 font-extrabold tabular-nums tracking-tight [overflow-wrap:anywhere] ${values.length > 1 ? 'text-lg' : 'text-2xl'} ${cls}`}>{v}</div>
      ))}
    </div>
  )
}

function RowSection({ title, rows, empty }: { title: string; rows: SettleRow[]; empty: string }) {
  return (
    <section>
      <h2 className="mb-2.5 px-1 text-lg font-bold">{title}</h2>
      {rows.length === 0 ? (
        <div className="card px-4 py-4 text-sm text-slate-500 dark:text-slate-400">{empty}</div>
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
          {rows.map((r) => <SettleItem key={r.key} r={r} />)}
        </div>
      )}
    </section>
  )
}

function SettleItem({ r }: { r: SettleRow }) {
  const amount = formatMoney(r.amount, r.currency)
  return (
    <div className="flex items-center gap-3 px-4 py-3" data-testid="settle-row">
      <Avatar name={r.name} color={r.color} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-semibold">{r.name}</span>
          <span className={`shrink-0 font-bold tabular-nums ${r.dir === 'owe' ? 'neg' : 'pos'}`}>{amount}</span>
        </div>
        <div className="truncate text-xs text-slate-500 dark:text-slate-400">{r.groupEmoji} {r.groupName}</div>
      </div>
      <Link
        to={r.href}
        className={`chip shrink-0 !min-h-11 !px-3.5 font-semibold ${r.dir === 'owe' ? 'chip-on' : ''}`}
        aria-label={r.dir === 'owe' ? `Pay ${r.name} ${amount} in ${r.groupName}` : `Record ${amount} from ${r.name} in ${r.groupName}`}
      >
        {r.dir === 'owe' ? 'Pay' : 'Record'}
      </Link>
    </div>
  )
}

function AllSettled() {
  return (
    <div data-testid="settle-empty">
      <div className="flex flex-col items-center px-6 pb-8 pt-10 text-center">
        <Celebrate />
        <h2 className="mt-5 text-2xl font-extrabold tracking-tight">All settled up</h2>
        <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">You don’t owe anyone, and nobody owes you. Nice and square.</p>
      </div>
      <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
        <Link to="/add" className="flex items-center gap-3 px-4 py-3.5 font-semibold transition active:bg-slate-50 dark:active:bg-ink-800">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300"><Plus size={20} aria-hidden /></span>
          <span className="flex-1">Add an expense</span>
          <ChevronRight size={18} className="text-slate-300 dark:text-slate-600" aria-hidden />
        </Link>
        <Link to="/groups" className="flex items-center gap-3 px-4 py-3.5 font-semibold transition active:bg-slate-50 dark:active:bg-ink-800">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300"><Users size={20} aria-hidden /></span>
          <span className="flex-1">Your groups</span>
          <ChevronRight size={18} className="text-slate-300 dark:text-slate-600" aria-hidden />
        </Link>
      </div>
    </div>
  )
}
