import { Link } from 'react-router-dom'
import { Inbox, Plus } from 'lucide-react'
import { useMe } from '@/hooks/auth'
import { useAllGroupData } from '@/hooks/data'
import { useInbox } from '@/hooks/useInbox'
import { ActivityFeed } from '@/components/Trust'
import { formatMoney } from '@/lib/money'
import { convertMinor } from '@/lib/fx'
import { useTodayRates } from '@/hooks/useFx'
import { CATEGORIES } from '@/lib/categories'
import { GroupRow } from '@/components/GroupRow'
import { Empty, Loading } from '@/components/Misc'
import { Avatar } from '@/components/Avatar'
import { Aurora } from '@/components/Aurora'
import { appLocale } from '@/lib/locale'
import { HELLO, dayPart, greeting, topCounterparties } from '@/lib/greeting'
import { isLiveTrip } from '@/lib/capture'
import { todayISO } from '@/lib/id'

export default function Home() {
  const { profile } = useMe()
  const data = useAllGroupData()
  const home = profile.currency
  const rates = useTodayRates(home, data ? data.map((d) => d.group.currency) : [])
  const box = useInbox(data)
  const inbox = box.count
  const feed = box.feed?.slice(0, 6)
  if (!data) return <Loading />
  const groupsById = Object.fromEntries(data.map((d) => [d.group.id, d.group]))

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
    inbox: box.captures.length,
    needsOk: box.approvals.length,
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
          <h1 className="mt-0.5 text-[1.75rem] font-extrabold leading-tight tracking-tight [overflow-wrap:anywhere]">
            Hi, {hello.name}!{'\u00a0'}<span aria-hidden className={`inline-block ${HELLO[part].motion === 'wave' ? 'animate-wave origin-[70%_70%]' : 'animate-float'}`}>{HELLO[part].emoji}</span>
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <Link to="/inbox" aria-label={inbox ? `Inbox, ${inbox} new` : 'Inbox'} data-testid="home-inbox"
            className="relative flex h-11 items-center gap-1 rounded-full px-1.5 text-slate-600 transition active:scale-95 dark:text-slate-300">
            <Inbox size={24} strokeWidth={2} />
            {inbox > 0 && (
              <span className="animate-pop flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
                {inbox > 99 ? '99+' : inbox}
              </span>
            )}
          </Link>
          <Link to="/profile" aria-label="Profile" className="rounded-full p-0.5 ring-2 ring-brand-500/40 transition active:scale-95">
            <Avatar name={profile.displayName} photoURL={profile.photoURL} color="accent" size={46} />
          </Link>
        </div>
      </header>



      <div className="relative isolate overflow-hidden rounded-[2rem] bg-brand-600 p-6 text-white shadow-xl shadow-brand-600/30">
        <Aurora />
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


      <Section title="Groups" link={{ to: '/groups', label: 'See all' }}>
        {shared.length === 0 ? (
          <Empty emoji="👯" title="No groups yet">
            Create a group for a trip, your home, or anything you share.
            <div className="mt-3"><Link to="/groups/new" className="btn-primary"><Plus size={18} aria-hidden /> Create group</Link></div>
          </Empty>
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
