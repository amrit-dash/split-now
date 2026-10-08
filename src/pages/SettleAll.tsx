import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCheck, ChevronRight, NotebookPen, Plus, Users } from 'lucide-react'
import { useMe } from '@/hooks/auth'
import { useAllGroupData } from '@/hooks/data'
import { formatMoney } from '@/lib/money'
import { groupCount, pendingSettlements, personBalances, settlePersonHref, totalsByCurrency, type PersonBalance, type SettleRow } from '@/lib/settleAll'
import { Avatar } from '@/components/Avatar'
import { Loading, PageHeader, Segmented } from '@/components/Misc'
import { Celebrate } from '@/components/Celebrate'

/*
 * Balances: everything you owe / are owed, across all groups and 1:1s, in two views.
 *  - By person (default): one net balance per person (and currency) across every group, with
 *    the groups it's made of. Someone in 2+ groups opens the cross-group settle screen
 *    (/settle/with/:key, SettleWithPerson), which clears every group with one real payment.
 *  - By group: each in-group payment on its own, straight into that group's settle screen.
 * (Replaces the old separate /friends screen, which now redirects here.)
 */

type View = 'person' | 'group'

export default function SettleAll() {
  const { profile } = useMe()
  const data = useAllGroupData()
  const home = profile.currency
  const rows = useMemo(() => (data ? pendingSettlements(data, home) : null), [data, home])
  const [params, setParams] = useSearchParams()
  const view: View = params.get('view') === 'group' ? 'group' : 'person'
  const setView = (v: View) => setParams(v === 'person' ? {} : { view: v }, { replace: true })

  return (
    <div>
      <PageHeader title="Balances" subtitle="Across all your groups and 1:1s" back />
      {!rows ? <Loading /> : rows.length === 0 ? <AllSettled /> : (
        <div className="space-y-6" data-testid="settle-all">
          <Totals rows={rows} home={home} />
          <Segmented<View>
            value={view}
            onChange={setView}
            options={[{ value: 'person', label: 'By person' }, { value: 'group', label: 'By group' }]}
          />
          {view === 'person' ? <ByPerson rows={rows} /> : <ByGroup rows={rows} />}
        </div>
      )}
    </div>
  )
}

function Totals({ rows, home }: { rows: SettleRow[]; home: string }) {
  const totals = totalsByCurrency(rows, home)
  return (
    <div className="card grid grid-cols-2 divide-x divide-slate-100 overflow-hidden dark:divide-white/5" data-testid="settle-totals">
      <TotalCol label="You owe" cls="neg" values={totals.filter((t) => t.owe).map((t) => formatMoney(t.owe, t.currency))} />
      <TotalCol label="You are owed" cls="pos" values={totals.filter((t) => t.owed).map((t) => formatMoney(t.owed, t.currency))} />
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

function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section data-testid={testId}>
      <h2 className="mb-2.5 px-1 text-lg font-bold">{title}</h2>
      {children}
    </section>
  )
}

const EmptyLine = ({ text }: { text: string }) => <div className="card px-4 py-4 text-sm text-slate-500 dark:text-slate-400">{text}</div>

/* ───────────────────────── By group ───────────────────────── */

function ByGroup({ rows }: { rows: SettleRow[] }) {
  const owe = rows.filter((r) => r.dir === 'owe')
  const owed = rows.filter((r) => r.dir === 'owed')
  return (
    <>
      <Section title="You owe">
        {owe.length === 0 ? <EmptyLine text="You don’t owe anyone." /> : (
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
            {owe.map((r) => <GroupItem key={r.key} r={r} />)}
          </div>
        )}
      </Section>
      <Section title="You are owed">
        {owed.length === 0 ? <EmptyLine text="Nobody owes you right now." /> : (
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
            {owed.map((r) => <GroupItem key={r.key} r={r} />)}
          </div>
        )}
      </Section>
    </>
  )
}

function GroupItem({ r }: { r: SettleRow }) {
  return (
    <ItemRow
      testId="settle-row"
      avatar={<Avatar name={r.name} photoURL={r.photoURL} color={r.color} size={40} />}
      name={r.name}
      sub={`${r.groupEmoji} ${r.groupName}`}
      amount={formatMoney(r.amount, r.currency)}
      dir={r.dir}
      action={<RowAction r={r} />}
    />
  )
}

/** Avatar · name/subtitle · amount · action, all on one vertically centred line. */
function ItemRow({ avatar, name, sub, amount, dir, action, testId }: {
  avatar: React.ReactNode; name: string; sub: React.ReactNode; amount: string; dir: 'owe' | 'owed' | 'even'; action: React.ReactNode; testId?: string
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3" data-testid={testId}>
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{name}</div>
        <div className="truncate text-xs text-slate-500 dark:text-slate-400">{sub}</div>
      </div>
      <span className={`shrink-0 font-bold tabular-nums ${dir === 'owe' ? 'neg' : dir === 'owed' ? 'pos' : 'text-slate-400'}`} data-testid="row-amount">{amount}</span>
      {action}
    </div>
  )
}

/** "Pay" (primary) when you owe; a "record a payment" icon button when they owe you. Both open the group's settle screen. */
function RowAction({ r }: { r: SettleRow }) {
  const amount = formatMoney(r.amount, r.currency)
  if (r.dir === 'owe') {
    return (
      <Link to={r.href} data-testid="row-pay" aria-label={`Pay ${r.name} ${amount} in ${r.groupName}`}
        className="btn-primary !min-h-10 shrink-0 !rounded-full !px-4 !py-0 text-sm">
        Pay
      </Link>
    )
  }
  return (
    <Link to={r.href} data-testid="row-record" aria-label={`Record payment from ${r.name} in ${r.groupName}`} title="Record payment"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition active:scale-95 active:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-200 dark:active:bg-brand-900/70">
      <NotebookPen size={20} aria-hidden />
    </Link>
  )
}

/* ───────────────────────── By person ───────────────────────── */

function ByPerson({ rows }: { rows: SettleRow[] }) {
  const people = useMemo(() => personBalances(rows), [rows])
  const owe = people.filter((p) => p.net < 0)
  const owed = people.filter((p) => p.net > 0)
  const even = people.filter((p) => p.net === 0)

  const list = (ps: PersonBalance[]) => (
    <div className="space-y-3">
      {ps.map((p) => <PersonCard key={p.key} p={p} />)}
    </div>
  )

  return (
    <>
      <Section title="You owe" testId="person-owe">{owe.length === 0 ? <EmptyLine text="You don’t owe anyone." /> : list(owe)}</Section>
      <Section title="You are owed" testId="person-owed">{owed.length === 0 ? <EmptyLine text="Nobody owes you right now." /> : list(owed)}</Section>
      {even.length > 0 && (
        <Section title="Evens out" testId="person-even">
          {list(even)}
          <p className="mt-2 px-1 text-xs text-slate-500 dark:text-slate-400">You owe each other the same overall. Clear them to settle every group with no money changing hands.</p>
        </Section>
      )}
    </>
  )
}

/**
 * Settle everything with someone across their groups: the same controls as a single-group row
 * ("Pay" when you owe overall, the record icon when they owe you), opening the cross-group
 * settle screen instead of one group's.
 */
function PersonAction({ p, n }: { p: PersonBalance; n: number }) {
  const to = settlePersonHref(p)
  const amount = formatMoney(Math.abs(p.net), p.currency)
  if (p.net < 0) {
    return (
      <Link to={to} data-testid="person-settle-all" aria-label={`Pay ${p.name} ${amount} across ${n} groups`}
        className="btn-primary !min-h-10 shrink-0 !rounded-full !px-4 !py-0 text-sm">
        Pay
      </Link>
    )
  }
  return (
    <Link to={to} data-testid="person-settle-all" title={p.net > 0 ? 'Record payment' : 'Clear balances'}
      aria-label={p.net > 0 ? `Record payment from ${p.name} across ${n} groups` : `Clear balances with ${p.name} across ${n} groups`}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition active:scale-95 active:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-200 dark:active:bg-brand-900/70">
      {p.net > 0 ? <NotebookPen size={20} aria-hidden /> : <CheckCheck size={20} aria-hidden />}
    </Link>
  )
}

function PersonCard({ p }: { p: PersonBalance }) {
  const n = groupCount(p)
  const multi = n > 1
  const mixed = multi && p.parts.some((r) => r.dir === 'owe') && p.parts.some((r) => r.dir === 'owed')
  const dir = p.net < 0 ? 'owe' : p.net > 0 ? 'owed' : 'even'
  const avatar = <Avatar name={p.name} photoURL={p.photoURL} color={p.color} size={44} />
  const amount = formatMoney(Math.abs(p.net), p.currency)

  if (!multi) {
    const r = p.parts[0]
    return (
      <div className="card overflow-hidden" data-testid="person-card">
        <ItemRow avatar={avatar} name={p.name} sub={`${r.groupEmoji} ${r.groupName}`} amount={amount} dir={dir} action={<RowAction r={r} />} />
      </div>
    )
  }

  return (
    <div className="card overflow-hidden" data-testid="person-card">
      <ItemRow
        avatar={avatar}
        name={p.name}
        sub={`across ${n} groups`}
        amount={p.net === 0 ? 'evens out' : amount}
        dir={dir}
        action={<PersonAction p={p} n={n} />}
      />
      <div className="mx-4 space-y-0.5 border-t border-slate-100 py-2 text-sm dark:border-white/5">
        {p.parts.map((r) => (
          <Link key={r.key} to={r.href} className="-mx-2 flex min-h-10 items-center gap-2 rounded-xl px-2 transition hover:bg-slate-50 active:bg-slate-50 dark:hover:bg-ink-800 dark:active:bg-ink-800"
            aria-label={`${r.dir === 'owe' ? `You owe ${r.name}` : `${r.name} owes you`} ${formatMoney(r.amount, r.currency)} in ${r.groupName}`}>
            <span className="min-w-0 flex-1 truncate">{r.groupEmoji} {r.groupName}</span>
            <span className={`tabular-nums ${r.dir === 'owed' ? 'pos' : 'neg'}`}>{formatMoney(r.dir === 'owed' ? r.amount : -r.amount, r.currency, { sign: true })}</span>
            <ChevronRight size={16} className="shrink-0 text-slate-300 dark:text-slate-600" aria-hidden />
          </Link>
        ))}
      </div>
      {mixed && p.net !== 0 && (
        <div className="mx-4 mb-3 rounded-xl bg-brand-50 p-2.5 text-xs text-brand-900 dark:bg-brand-900/30 dark:text-brand-100">
          💡 You owe each other in different groups. Settle all of it with <b>one</b> payment of {amount}.
        </div>
      )}
    </div>
  )
}

/* ───────────────────────── Empty ───────────────────────── */

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
