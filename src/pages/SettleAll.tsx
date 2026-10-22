import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, Lightbulb } from 'lucide-react'
import { AddIcon, ChecksIcon, GroupsIcon, LockIcon, PayIcon } from '@/components/icons'
import { PatternLock } from '@/features/vault/PatternLock'
import { ChequeIcon } from '@/components/ChequeIcon'
import { useMe } from '@/hooks/auth'
import { useAllGroupData, useRecentActivity } from '@/hooks/data'
import type { ActivityEntry, Group } from '@/types'
import { formatMoney } from '@/lib/money'
import {
  groupCount,
  groupLine,
  pendingSettlements,
  personBalances,
  settlePersonHref,
  totalsByCurrency,
  type PersonBalance,
  type SettleRow,
} from '@/lib/settleAll'
import { collectsInHome, inHome, type HomeBalance } from '@/lib/collect'
import { convertMinor, type FxRate } from '@/lib/fx'
import { useTodayRates } from '@/hooks/useFx'
import { Avatar } from '@/components/Avatar'
import { PageHeader, Segmented } from '@/components/Misc'
import { CardSkeleton, ListSkeleton } from '@/components/Skeleton'
import { Celebrate } from '@/components/Celebrate'
import { PersonRemindActions, RemindActions } from '@/components/RemindActions'
import { usePageTitle } from '@/lib/brand'
import { type Hint, HintText } from '@/components/Hint'

const BALANCES_HINT: Hint = { full: 'Across all your groups and 1:1s', tier: 'extra' }

const EVENS_HINT: Hint = {
  full: 'You owe each other the same overall. Clear them to settle every group, no money needed.',
  short: 'Settles every group, no money needed.',
}

/*
 * Balances: everything you owe / are owed, across all groups and 1:1s, in two views.
 *  - By person (default): one net balance per person (and currency) across every group, with
 *    the groups it's made of. Someone in 2+ groups opens the cross-group settle screen
 *    (/settle/with/:key, SettleWithPerson), which clears every group with one real payment.
 *  - By group: each in-group payment on its own, straight into that group's settle screen.
 * Rows where someone owes you also carry Remind (share a Pay me link) and Nudge (a push; for a
 * person across several groups, one push with the total), as on a group's Balances tab.
 * (Replaces the old separate /friends screen, which now redirects here.)
 */

/** What the owed rows need to chase a debt: the groups (for Remind) and the merged activity (who was nudged today). */
interface Chase {
  groups: Record<string, Group>
  feed: ActivityEntry[] | null
}

type View = 'person' | 'group'

export default function SettleAll() {
  usePageTitle('Balances')
  const { profile } = useMe()
  const data = useAllGroupData()
  const home = profile.currency
  const rows = useMemo(() => (data ? pendingSettlements(data, home) : null), [data, home])
  // The groups someone owes you in: their feeds say who you nudged today (the same shared listeners as Home).
  const owedIds = useMemo(() => (rows ? [...new Set(rows.filter((r) => r.dir === 'owed').map((r) => r.groupId))] : null), [rows])
  const feed = useRecentActivity(owedIds)
  const chase: Chase = useMemo(() => ({ groups: Object.fromEntries((data ?? []).map((d) => [d.group.id, d.group])), feed }), [data, feed])
  const [params, setParams] = useSearchParams()
  const view: View = params.get('view') === 'group' ? 'group' : 'person'
  const setView = (v: View) => setParams(v === 'person' ? {} : { view: v }, { replace: true })
  // Collect in my currency: other currencies are folded into the home one at today's rate (≈).
  const collect = collectsInHome(profile)
  const rates = useTodayRates(home, collect && rows ? rows.map((r) => r.currency) : [])
  // A locked private group adds nothing here (hooks/data.ts); the line says so, and its lock takes the pattern.
  const locked = data?.filter((d) => d.locked && !d.group.archived).length ?? 0

  return (
    <div>
      <PageHeader title="Balances" subtitle={BALANCES_HINT} back />
      {locked > 0 && (
        <div className="card mb-4 flex min-h-12 items-center gap-3 py-2 pl-4 pr-2 text-sm" data-testid="settle-private-note">
          <span className="min-w-0 flex-1">{locked === 1 ? '1 private group isn’t included' : `${locked} private groups aren’t included`}</span>
          <PatternLock
            label="Private groups"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-200/70 dark:bg-ink-800"
            testId="settle-unlock"
          >
            <LockIcon size={18} aria-hidden />
          </PatternLock>
        </div>
      )}
      {!rows ? (
        <div className="space-y-6" aria-busy>
          <CardSkeleton className="h-24" />
          <ListSkeleton rows={4} />
        </div>
      ) : rows.length === 0 ? (
        <AllSettled />
      ) : (
        <div className="space-y-6" data-testid="settle-all">
          <Totals rows={rows} home={home} rates={collect ? rates : undefined} />
          <Segmented<View>
            value={view}
            onChange={setView}
            options={[
              { value: 'person', label: 'By person' },
              { value: 'group', label: 'By group' },
            ]}
            label="Show balances"
            testId="settle-view"
          />
          {view === 'person' ? <ByPerson rows={rows} chase={chase} home={home} rates={collect ? rates : undefined} /> : <ByGroup rows={rows} chase={chase} />}
        </div>
      )}
    </div>
  )
}

function Totals({ rows, home, rates }: { rows: SettleRow[]; home: string; rates?: Record<string, FxRate | null> }) {
  const totals = totalsByCurrency(rows, home)
  // In one ≈ home-currency figure per column when collecting in it and every rate is known.
  const folded = rates && totals.every((t) => t.currency === home || (rates[t.currency]?.rate ?? 0) > 0)
  if (folded && totals.some((t) => t.currency !== home)) {
    const sum = (k: 'owe' | 'owed') =>
      totals.reduce((a, t) => a + (t.currency === home ? t[k] : convertMinor(t[k], t.currency, home, (rates[t.currency] as FxRate).rate)), 0)
    const owe = sum('owe'),
      owed = sum('owed')
    return (
      <div className="card grid grid-cols-2 divide-x divide-slate-100 overflow-hidden dark:divide-white/5" data-testid="settle-totals">
        <TotalCol label="You owe" cls="neg" values={owe ? [`≈\u00a0${formatMoney(owe, home)}`] : []} />
        <TotalCol label="You are owed" cls="pos" values={owed ? [`≈\u00a0${formatMoney(owed, home)}`] : []} />
      </div>
    )
  }
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
        <div className="mt-1 text-2xl font-extrabold tabular-nums text-slate-300 dark:text-slate-600">
          <span aria-hidden>—</span>
          <span className="sr-only">Nothing</span>
        </div>
      ) : (
        values.map((v) => (
          <div
            key={v}
            className={`mt-1 font-extrabold tabular-nums tracking-tight [overflow-wrap:anywhere] ${values.length > 1 ? 'text-lg' : 'text-xl min-[360px]:text-2xl'} ${cls}`}
          >
            {v}
          </div>
        ))
      )}
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

const EmptyLine = ({ text }: { text: string }) => <div className="card px-4 py-4 text-muted text-sm">{text}</div>

/* ───────────────────────── By group ───────────────────────── */

function ByGroup({ rows, chase }: { rows: SettleRow[]; chase: Chase }) {
  const owe = rows.filter((r) => r.dir === 'owe')
  const owed = rows.filter((r) => r.dir === 'owed')
  return (
    <>
      <Section title="You owe">
        {owe.length === 0 ? (
          <EmptyLine text="You don’t owe anyone." />
        ) : (
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
            {owe.map((r) => (
              <GroupItem key={r.key} r={r} chase={chase} />
            ))}
          </div>
        )}
      </Section>
      <Section title="You are owed">
        {owed.length === 0 ? (
          <EmptyLine text="Nobody owes you right now." />
        ) : (
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
            {owed.map((r) => (
              <GroupItem key={r.key} r={r} chase={chase} />
            ))}
          </div>
        )}
      </Section>
    </>
  )
}

function GroupItem({ r, chase }: { r: SettleRow; chase: Chase }) {
  return (
    <ItemRow
      testId="settle-row"
      avatar={<Avatar name={r.name} photoURL={r.photoURL} color={r.color} size={40} />}
      name={r.label}
      sub={
        <span className="mt-1.5 flex min-w-0">
          <GroupLine r={r} />
        </span>
      }
      amount={formatMoney(r.amount, r.currency)}
      dir={r.dir}
      chase={<RowChase r={r} chase={chase} />}
      action={<RowAction r={r} />}
    />
  )
}

/** Remind and Nudge on a single-group row where they owe you (nothing when you owe them). */
function RowChase({ r, chase }: { r: SettleRow; chase: Chase }) {
  const group = chase.groups[r.groupId]
  if (r.dir !== 'owed' || !group) return null
  return <RemindActions group={group} debtor={r.memberId} amount={r.amount} me={r.me} feed={chase.feed} compact />
}

/**
 * One layout for every row: avatar · name, amount and group stacked on the left · the row's buttons
 * on the right, all on one vertically centred line. The amount always sits under the name, so it
 * lines up down the list whether the row has buttons or not (before, rows with Remind moved it,
 * and the amounts zig-zagged). Buttons are icons in one cluster: Remind and Nudge (where they owe
 * you), then the record or Pay action, so a row never breaks onto a second line on a 360 px phone.
 */
function ItemRow({
  avatar,
  name,
  sub,
  amount,
  dir,
  action,
  chase,
  testId,
}: {
  avatar: React.ReactNode
  name: string
  sub: React.ReactNode
  amount: string
  dir: 'owe' | 'owed' | 'even'
  action: React.ReactNode
  chase?: React.ReactNode
  testId?: string
}) {
  const tone = dir === 'owe' ? 'neg' : dir === 'owed' ? 'pos' : 'text-muted'
  return (
    // The line under the amount (the group chip) runs the card's width under the buttons, lined up
    // with the name, so a group's name isn't cut short beside three buttons on a small phone.
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3" data-testid={testId}>
      <div className="row-span-2 self-start pt-0.5">{avatar}</div>
      <div className="min-w-0">
        <div className="truncate font-semibold leading-tight">{name}</div>
        <div className={`mt-0.5 whitespace-nowrap font-bold leading-tight tabular-nums ${tone}`} data-testid="row-amount">
          {amount}
        </div>
      </div>
      <div className="-mr-1 flex shrink-0 items-center gap-0.5">
        {chase}
        {action}
      </div>
      <div className="text-muted col-span-2 col-start-2 min-w-0 text-xs">{sub}</div>
    </div>
  )
}

/**
 * Pay: a round icon button like the row's others, the only filled one (the accent), so it still
 * reads as the main action; its label says who, how much and where.
 */
const PAY = 'btn-primary !h-10 !min-h-10 !w-10 shrink-0 !rounded-full !p-0'

/**
 * The row's group as a small chip (owner, 22 Oct 2026: set apart from the amounts above it): "1:1"
 * for a 1:1 (the person is already the row), else its emoji and name, cut short when long.
 */
function GroupLine({ r }: { r: SettleRow }) {
  const g = groupLine(r)
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium leading-4 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
      {g.emoji && <span aria-hidden>{g.emoji}</span>}
      <span className="truncate">{g.text}</span>
    </span>
  )
}

/** "Pay" (primary) when you owe; a "record a payment" icon button when they owe you. Both open the group's settle screen. */
function RowAction({ r }: { r: SettleRow }) {
  const amount = formatMoney(r.amount, r.currency)
  if (r.dir === 'owe') {
    return (
      <Link to={r.href} data-testid="row-pay" aria-label={`Pay ${r.label} ${amount} in ${r.groupName}`} className={PAY}>
        <PayIcon size={20} aria-hidden />
      </Link>
    )
  }
  return (
    <Link
      to={r.href}
      data-testid="row-record"
      aria-label={`Record payment from ${r.label} in ${r.groupName}`}
      title="Record payment"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition active:scale-95 active:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-200 dark:active:bg-brand-900/70"
    >
      <ChequeIcon size={22} />
    </Link>
  )
}

/* ───────────────────────── By person ───────────────────────── */

function ByPerson({ rows, chase, home, rates }: { rows: SettleRow[]; chase: Chase; home: string; rates?: Record<string, FxRate | null> }) {
  const people = useMemo<(PersonBalance | HomeBalance)[]>(() => (rates ? inHome(personBalances(rows), home, rates) : personBalances(rows)), [rows, home, rates])
  const owe = people.filter((p) => p.net < 0)
  const owed = people.filter((p) => p.net > 0)
  const even = people.filter((p) => p.net === 0)

  const list = (ps: (PersonBalance | HomeBalance)[]) => (
    <div className="space-y-3">
      {ps.map((p) => (
        <PersonCard key={p.key} p={p} chase={chase} />
      ))}
    </div>
  )

  return (
    <>
      <Section title="You owe" testId="person-owe">
        {owe.length === 0 ? <EmptyLine text="You don’t owe anyone." /> : list(owe)}
      </Section>
      <Section title="You are owed" testId="person-owed">
        {owed.length === 0 ? <EmptyLine text="Nobody owes you right now." /> : list(owed)}
      </Section>
      {even.length > 0 && (
        <Section title="Evens out" testId="person-even">
          {list(even)}
          <HintText hint={EVENS_HINT} className="text-muted mt-2 px-1 text-xs" />
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
      <Link to={to} data-testid="person-settle-all" aria-label={`Pay ${p.label} ${amount} across ${n} groups`} className={PAY}>
        <PayIcon size={20} aria-hidden />
      </Link>
    )
  }
  return (
    <Link
      to={to}
      data-testid="person-settle-all"
      title={p.net > 0 ? 'Record payment' : 'Clear balances'}
      aria-label={p.net > 0 ? `Record payment from ${p.label} across ${n} groups` : `Clear balances with ${p.label} across ${n} groups`}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition active:scale-95 active:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-200 dark:active:bg-brand-900/70"
    >
      {p.net > 0 ? <ChequeIcon size={22} /> : <ChecksIcon size={20} aria-hidden />}
    </Link>
  )
}

function PersonCard({ p, chase }: { p: PersonBalance | HomeBalance; chase: Chase }) {
  const n = groupCount(p)
  const multi = n > 1
  const mixed = multi && p.parts.some((r) => r.dir === 'owe') && p.parts.some((r) => r.dir === 'owed')
  const dir = p.net < 0 ? 'owe' : p.net > 0 ? 'owed' : 'even'
  const avatar = <Avatar name={p.name} photoURL={p.photoURL} color={p.color} size={44} />
  // Folded into your currency (Collect in my currency): approximate, at today's rate.
  const approx = 'approx' in p && p.approx
  const amount = `${approx ? '≈ ' : ''}${formatMoney(Math.abs(p.net), p.currency)}`

  if (!multi) {
    const r = p.parts[0]
    return (
      <div className="card overflow-hidden" data-testid="person-card">
        <ItemRow
          avatar={avatar}
          name={p.label}
          sub={
            <>
              {/* in your currency: the group's own amount on a line of its own, then the group */}
              {approx && <span className="block truncate tabular-nums">{formatMoney(r.amount, r.currency)}</span>}
              <span className="mt-1.5 flex min-w-0">
                <GroupLine r={r} />
              </span>
            </>
          }
          amount={amount}
          dir={dir}
          chase={<RowChase r={r} chase={chase} />}
          action={<RowAction r={r} />}
        />
      </div>
    )
  }

  return (
    <div className="card overflow-hidden" data-testid="person-card">
      <ItemRow
        avatar={avatar}
        name={p.label}
        sub={<span className="mt-0.5 block">across {n} groups</span>}
        amount={p.net === 0 ? 'evens out' : amount}
        dir={dir}
        chase={p.net > 0 ? <PersonRemindActions p={p} feed={chase.feed} compact /> : undefined}
        action={<PersonAction p={p} n={n} />}
      />
      {/* One line per group: its chip, then what's owed there; the total above nets them. */}
      <div className="mx-4 space-y-1 border-t border-slate-100 pb-2 pt-2.5 text-sm dark:border-white/5" data-testid="person-groups">
        {p.parts.map((r) => (
          <Link
            key={r.key}
            to={r.href}
            className="-mx-2 flex min-h-10 items-center gap-2 rounded-xl px-2 transition hover:bg-slate-50 active:bg-slate-50 dark:hover:bg-ink-800 dark:active:bg-ink-800"
            aria-label={`${r.dir === 'owe' ? `You owe ${r.label}` : `${r.label} owes you`} ${formatMoney(r.amount, r.currency)} in ${r.groupName}`}
          >
            <span className="flex min-w-0 flex-1">
              <GroupLine r={r} />
            </span>
            <span className={`tabular-nums ${r.dir === 'owed' ? 'pos' : 'neg'}`}>
              {formatMoney(r.dir === 'owed' ? r.amount : -r.amount, r.currency, { sign: true })}
            </span>
            <ChevronRight size={16} className="shrink-0 text-slate-300 dark:text-slate-600" aria-hidden />
          </Link>
        ))}
      </div>
      {mixed && p.net !== 0 && (
        <HintText
          as="div"
          className="mx-4 mb-3 rounded-xl bg-brand-50 p-2.5 text-xs text-brand-900 dark:bg-brand-900/30 dark:text-brand-100"
          hint={{
            full: (
              <>
                <Lightbulb size={14} className="mb-0.5 mr-1 inline" aria-hidden />
                Debts across groups net out. Settle all of it with <b>one</b> payment of {amount}.
              </>
            ),
            short: (
              <>
                Settle all of it with <b>one</b> payment of {amount}.
              </>
            ),
          }}
        />
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
        <p className="mt-1 max-w-xs text-muted text-sm">You don’t owe anyone, and nobody owes you. Nice and square.</p>
      </div>
      <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
        <Link to="/add" className="flex items-center gap-3 px-4 py-3.5 font-semibold transition active:bg-slate-50 dark:active:bg-ink-800">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
            <AddIcon size={20} aria-hidden />
          </span>
          <span className="flex-1">Add an expense</span>
          <ChevronRight size={18} className="text-slate-300 dark:text-slate-600" aria-hidden />
        </Link>
        <Link to="/groups" className="flex items-center gap-3 px-4 py-3.5 font-semibold transition active:bg-slate-50 dark:active:bg-ink-800">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
            <GroupsIcon size={20} aria-hidden />
          </span>
          <span className="flex-1">Your groups</span>
          <ChevronRight size={18} className="text-slate-300 dark:text-slate-600" aria-hidden />
        </Link>
      </div>
    </div>
  )
}
