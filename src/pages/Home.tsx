import { Link } from 'react-router-dom'
import { ArrowRightLeft, ChevronRight, Plus, ScanLine, Users } from 'lucide-react'
import { useMe } from '@/hooks/auth'
import { useAllGroupData, usePendingCaptures, useRecentActivity } from '@/hooks/data'
import { repo } from '@/data'
import { awaitingMyApproval } from '@/lib/trust'
import { ActivityFeed } from '@/components/Trust'
import { useToast } from '@/components/Toast'
import { formatMoney } from '@/lib/money'
import { convertMinor } from '@/lib/fx'
import { useTodayRates } from '@/hooks/useFx'
import { CATEGORIES } from '@/lib/categories'
import { GroupRow } from '@/components/GroupRow'
import { Empty, Loading } from '@/components/Misc'
import { Avatar } from '@/components/Avatar'
import { appLocale } from '@/lib/locale'
import { HELLO, dayPart, greeting, topCounterparties } from '@/lib/greeting'
import { isLiveTrip } from '@/lib/capture'
import { todayISO } from '@/lib/id'

export default function Home() {
  const { profile, user } = useMe()
  const data = useAllGroupData()
  const inbox = usePendingCaptures()?.length ?? 0
  const home = profile.currency
  const rates = useTodayRates(home, data ? data.map((d) => d.group.currency) : [])
  const toast = useToast()
  const feed = useRecentActivity(data ? data.filter((d) => d.group.type !== 'personal').map((d) => d.group.id) : null, 6)
  if (!data) return <Loading />
  const groupsById = Object.fromEntries(data.map((d) => [d.group.id, d.group]))
  const needsOk = data.flatMap((d) => d.pending.filter((e) => awaitingMyApproval(e, d.group, user.uid)).map((e) => ({ e, d })))

  // Exact totals per group currency.
  const totals = new Map<string, { owed: number; owe: number }>()
  for (const d of data) {
    if (!d.me) continue
    const v = d.net[d.me] ?? 0
    const t = totals.get(d.group.currency) ?? { owed: 0, owe: 0 }
    if (v > 0) t.owed += v
    else t.owe += -v
    totals.set(d.group.currency, t)
  }
  // Home-currency view: other currencies are added in at today's ECB rate, so the
  // headline is only approximate ("≈") when anything was converted.
  const convertible = [...totals.keys()].filter((c) => c !== home && rates?.[c])
  const cur = totals.has(home) || totals.size === 0 || convertible.length > 0 ? home : [...totals.keys()][0]
  const main = { ...(totals.get(cur) ?? { owed: 0, owe: 0 }) }
  if (cur === home) {
    for (const c of convertible) {
      const t = totals.get(c)!
      const r = rates![c]!.rate
      main.owed += convertMinor(t.owed, c, home, r)
      main.owe += convertMinor(t.owe, c, home, r)
    }
  }
  const approx = cur === home && convertible.some((c) => totals.get(c)!.owed || totals.get(c)!.owe)
  const net = main.owed - main.owe
  const others = [...totals.entries()].filter(([c]) => c !== cur)
  const ax = approx ? '≈ ' : ''

  const recent = data
    .flatMap((d) => d.expenses.map((e) => ({ e, d })))
    .sort((a, b) => b.e.date.localeCompare(a.e.date) || b.e.createdAt - a.e.createdAt)
    .slice(0, 6)
  const shared = data.filter((d) => d.group.type !== 'personal')
  const today = todayISO()
  const people = topCounterparties(shared.map((d) => ({ ...d.group, me: d.me, debts: d.debts })), cur)
  const hello = greeting(profile.displayName, {
    inbox,
    needsOk: needsOk.length,
    liveTrips: shared.filter((d) => isLiveTrip(d.group, today)).map((d) => ({ name: d.group.name, emoji: d.group.emoji })),
    owedBy: people.owedBy && { name: people.owedBy.name, amount: formatMoney(people.owedBy.amount, cur) },
    owes: people.owes && { name: people.owes.name, amount: formatMoney(people.owes.amount, cur) },
    settled: shared.some((d) => d.expenses.length > 0) && shared.every((d) => !d.me || !d.net[d.me]),
  })

  const part = dayPart(new Date().getHours())

  return (
    <div className="pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <header className="mb-6 flex items-center justify-between gap-4" data-testid="home-greeting">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{hello.salutation}</p>
          <h1 className="mt-0.5 flex items-center gap-2 text-[1.75rem] font-extrabold leading-tight tracking-tight">
            <span className="truncate">Hi, {hello.name}!</span>
            <span aria-hidden className={`inline-block shrink-0 ${HELLO[part].motion === 'wave' ? 'animate-wave origin-[70%_70%]' : 'animate-float'}`}>{HELLO[part].emoji}</span>
          </h1>
        </div>
        <Link to="/profile" aria-label="Profile" className="shrink-0 rounded-full p-0.5 ring-2 ring-brand-500/40 transition active:scale-95">
          <Avatar name={profile.displayName} photoURL={profile.photoURL} color="accent" size={46} />
        </Link>
      </header>

      {inbox > 0 && (
        <Link to="/inbox" className="card mb-4 flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-100 text-xl dark:bg-brand-900/40">📥</div>
          <div className="flex-1">
            <div className="font-semibold">{inbox} captured payment{inbox === 1 ? '' : 's'} to sort</div>
            <div className="text-xs text-slate-500">Add to a group, or mark as not shared</div>
          </div>
          <ChevronRight size={18} className="text-slate-300 dark:text-slate-600" />
        </Link>
      )}

      {needsOk.length > 0 && (
        <div className="card mb-4 p-4">
          <div className="mb-2 flex items-center gap-2 font-semibold">👀 Needs your OK <span className="rounded-full bg-sky-100 px-2 text-xs text-sky-800 dark:bg-sky-500/15 dark:text-sky-300">{needsOk.length}</span></div>
          <p className="mb-2 text-xs text-slate-500">Not counted in balances until you approve.</p>
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {needsOk.slice(0, 5).map(({ e, d }) => (
              <li key={e.id} className="flex items-center gap-3 py-2">
                <Link to={`/groups/${d.group.id}/expenses/${e.id}`} className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{e.description}</div>
                  <div className="truncate text-xs text-slate-500">{d.group.emoji} {d.group.name} · your share {formatMoney(d.me ? e.splits[d.me] ?? 0 : 0, d.group.currency)}</div>
                </Link>
                <button className="chip shrink-0" onClick={() => repo.approveExpense(d.group, e).then(() => toast('Approved 👍')).catch((err) => toast((err as Error).message, 'err'))}>Approve</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-600 via-brand-vivid to-duo-600 p-6 text-white shadow-xl shadow-brand-600/30">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-16 right-10 h-32 w-32 rounded-full bg-white/10" />
        <div className="relative">
          <div className="text-sm font-medium text-white/80">Overall, {net >= 0 ? 'you are owed' : 'you owe'}</div>
          <div className="mt-1 text-4xl font-extrabold tabular-nums tracking-tight" data-testid="home-net">{ax}{formatMoney(Math.abs(net), cur)}</div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/15 p-3 backdrop-blur">
              <div className="text-xs text-white/75">You are owed</div>
              <div className="text-lg font-bold tabular-nums">{ax}{formatMoney(main.owed, cur)}</div>
            </div>
            <div className="rounded-2xl bg-white/15 p-3 backdrop-blur">
              <div className="text-xs text-white/75">You owe</div>
              <div className="text-lg font-bold tabular-nums">{ax}{formatMoney(main.owe, cur)}</div>
            </div>
          </div>
          {others.length > 0 && (
            <div className="mt-3 text-xs text-white/75">
              {approx ? `Includes other currencies at today’s ECB rate. Exact: ${formatMoney(totals.get(home) ? totals.get(home)!.owed - totals.get(home)!.owe : 0, home, { sign: true })} · ` : 'Also: '}
              {others.map(([c, t]) => `${formatMoney(t.owed - t.owe, c, { sign: true })}${cur === home && !rates?.[c] && c !== home ? ' (no rate)' : ''}`).join(' · ')}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-2">
        <QuickAction to="/add" icon={<Plus />} label="Expense" />
        <QuickAction to="/scan" icon={<ScanLine />} label="Scan" />
        <QuickAction to="/friends" icon={<ArrowRightLeft />} label="Settle up" />
        <QuickAction to="/groups/new" icon={<Users />} label="New group" />
      </div>

      <Section title="Groups" link={{ to: '/groups', label: 'See all' }}>
        {shared.length === 0 ? (
          <Empty emoji="👯" title="No groups yet">Create a group for a trip, your home, or anything you share.</Empty>
        ) : (
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
            {shared.slice(0, 5).map((d) => <GroupRow key={d.group.id} d={d} />)}
          </div>
        )}
      </Section>

      {feed && feed.length > 0 ? (
        <Section title="Recent activity">
          <ActivityFeed entries={feed} groups={groupsById} />
        </Section>
      ) : recent.length > 0 && (
        <Section title="Recent activity">
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
            {recent.map(({ e, d }) => {
              const mine = d.me ? (e.splits[d.me] ?? 0) - 0 : 0
              const paid = d.me ? e.paidBy[d.me] ?? 0 : 0
              const delta = paid - mine
              return (
                <Link key={e.id} to={`/groups/${d.group.id}/expenses/${e.id}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-xl dark:bg-ink-800">{CATEGORIES[e.category].emoji}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{e.description}</div>
                    <div className="truncate text-xs text-slate-500">{d.group.emoji} {d.group.name} · {new Date(e.date).toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' })}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums">{formatMoney(e.amount, d.group.currency)}</div>
                    {delta !== 0 && d.group.type !== 'personal' && <div className={`text-xs tabular-nums ${delta > 0 ? 'pos' : 'neg'}`}>{formatMoney(delta, d.group.currency, { sign: true })}</div>}
                  </div>
                </Link>
              )
            })}
          </div>
        </Section>
      )}
    </div>
  )
}

function QuickAction({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="card flex flex-col items-center gap-1.5 py-3.5 text-xs font-semibold transition active:scale-95">
      <span className="text-brand-600 dark:text-brand-300">{icon}</span>
      {label}
    </Link>
  )
}

export function Section({ title, link, children }: { title: string; link?: { to: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="mb-2.5 flex items-center justify-between px-1">
        <h2 className="text-lg font-bold">{title}</h2>
        {link && <Link to={link.to} className="text-sm font-semibold text-brand-600 dark:text-brand-300">{link.label}</Link>}
      </div>
      {children}
    </section>
  )
}
