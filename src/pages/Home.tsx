import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { HandCoins, Inbox, Plus } from 'lucide-react'
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
import { CardFirework } from '@/components/CardFirework'
import { appLocale } from '@/lib/locale'
import { HELLO, dayPart, greeting, topCounterparties, type DayPart } from '@/lib/greeting'
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
  const compact = useNarrow(380)
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
  // Nothing owed either way, in any group: no "settle up" CTA, a quiet firework instead.
  const allSettled = data.some((d) => d.me && d.group.type !== 'personal') && [...totals.values()].every((t) => !t.owed && !t.owe)

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
      <header className="mb-6 flex items-center justify-between gap-3" data-testid="home-greeting">
        <Greeting salutation={hello.salutation} name={hello.name} part={part} />
        <div className="flex shrink-0 items-center gap-2 min-[380px]:gap-3">
          <Link to="/inbox" aria-label={inbox ? `Inbox, ${inbox} new` : 'Inbox'} data-testid="home-inbox"
            className="relative flex h-12 items-center gap-1 rounded-full px-1.5 text-slate-600 transition active:scale-95 dark:text-slate-300">
            {inbox > 0 && (
              <span className="animate-pop flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
                {inbox > 99 ? '99+' : inbox}
              </span>
            )}
            <Inbox className="h-6 w-6 min-[380px]:h-[27px] min-[380px]:w-[27px]" strokeWidth={2} />
          </Link>
          <Link to="/profile" aria-label="Profile" className="rounded-full p-0.5 ring-2 ring-brand-500/40 transition active:scale-95">
            <Avatar name={profile.displayName} photoURL={profile.photoURL} color="accent" size={compact ? 48 : 58} />
          </Link>
        </div>
      </header>



      <div className="relative isolate overflow-hidden rounded-[2rem] bg-brand-600 p-6 text-white shadow-xl shadow-brand-600/30">
        <Aurora />
        {allSettled && <CardFirework />}
        <div className="relative">
          {/* Settle up: inset from the card's corner, level with the first lines, with a coin toss. */}
          {!allSettled && (
            <Link to="/settle" aria-label="Balances and settle up" title="Settle up" data-testid="home-settle"
              className="absolute -top-1 right-0 flex h-14 w-14 items-center justify-center rounded-full text-white transition duration-150 hover:bg-white/10 active:scale-90 active:bg-white/20">
              <CoinToss />
            </Link>
          )}
          <div className="pr-16 text-sm font-medium text-white/80">{allSettled ? 'Overall' : `Overall, ${net >= 0 ? 'you are owed' : 'you owe'}`}</div>
          <div className="mt-1 pr-14 text-4xl font-extrabold tabular-nums tracking-tight" data-testid="home-net">{allSettled ? 'All settled up' : `${ax}${formatMoney(Math.abs(net), cur)}`}</div>
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
          <Empty emoji="👥" title="No groups yet">
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

/**
 * The icon after "Hi": one icon for the time of day (HELLO), playing its motion (a wave, a bob, a
 * tilt) a few times and then resting; tapping it plays it again. Static under reduced motion.
 */
function HelloIcon({ part }: { part: DayPart }) {
  const cur = HELLO[part][0]
  const [run, setRun] = useState(0)
  const motion = cur.motion === 'wave' ? 'animate-wave origin-[70%_70%]' : cur.motion === 'tilt' ? 'animate-tilt' : 'animate-float'
  return (
    <span aria-hidden className="inline-flex h-[1.2em] w-[1.2em] items-center justify-center" onClick={() => setRun((n) => n + 1)}>
      <span key={run} className={`inline-block ${motion}`}>{cur.emoji}</span>
    </span>
  )
}

/** True while the viewport is narrower than `px` (small phones get a tighter header). */
function useNarrow(px: number) {
  const q = `(max-width: ${px - 0.02}px)`
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches)
  useEffect(() => {
    const m = window.matchMedia?.(q)
    if (!m) return
    const on = () => setNarrow(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [q])
  return narrow
}

/**
 * "Good morning" over "Hi, Amrit 👋" on one line when it fits; when it doesn't (small phones,
 * long names) it switches to "Hi 👋" over the name, rather than letting the line break wherever
 * it falls. The size scales a little with the viewport; very long names truncate.
 */
function Greeting({ salutation, name, part }: { salutation: string; name: string; part: DayPart }) {
  const box = useRef<HTMLDivElement>(null)
  const probe = useRef<HTMLSpanElement>(null)
  const [stacked, setStacked] = useState(false)
  useLayoutEffect(() => {
    const el = box.current, p = probe.current
    if (!el || !p) return
    const check = () => setStacked(p.offsetWidth > el.clientWidth)
    check()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [name])
  const size = 'text-[clamp(1.5rem,7.2vw,1.85rem)] font-extrabold leading-[1.15] tracking-tight'
  return (
    <div ref={box} className="relative min-w-0 flex-1">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{salutation}</p>
      {/* invisible one-line copy, measured to decide the layout */}
      <span ref={probe} aria-hidden className={`pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap ${size}`}>Hi, {name} 👋</span>
      <h1 className={`mt-0.5 ${size}`}>
        {stacked ? (
          <>
            <span className="flex items-center gap-2">Hi <HelloIcon part={part} /></span>
            <span className="block truncate">{name}</span>
          </>
        ) : (
          <span className="flex min-w-0 items-center gap-2"><span className="truncate">Hi, {name}</span><HelloIcon part={part} /></span>
        )}
      </h1>
    </div>
  )
}

/**
 * The settle icon: a hand that flicks a coin up; it spins and drops back into the palm. Tosses
 * a few times (first shortly after the page opens, then every few seconds) and then rests.
 * Still under reduced motion.
 */
function CoinToss() {
  const [toss, setToss] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const times = [1200, 7000, 14000]
    const ts = times.map((t, i) => setTimeout(() => setToss(i + 1), t))
    return () => ts.forEach(clearTimeout)
  }, [])
  return (
    <span aria-hidden className="relative block h-8 w-8">
      <span key={`h${toss}`} className={`absolute inset-0 ${toss ? 'animate-hand-flick' : ''}`}>
        <HandCoins size={32} strokeWidth={2} />
      </span>
      {toss > 0 && (
        <span key={`c${toss}`} className="animate-coin-toss absolute right-[3px] top-[1px] block h-[9px] w-[9px] rounded-full border-[1.8px] border-amber-200 bg-amber-300/90 shadow-[0_0_6px_rgb(253_230_138/0.8)]" />
      )}
    </span>
  )
}
