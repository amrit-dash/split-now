import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, FileUp, Inbox, Plus, Ticket } from 'lucide-react'
import { useMe } from '@/hooks/auth'
import { useAllGroupData, type GroupData } from '@/hooks/data'
import { useInbox } from '@/hooks/useInbox'
import { ActivityFeed } from '@/components/Trust'
import { formatMoney } from '@/lib/money'
import { convertMinor } from '@/lib/fx'
import { useTodayRates } from '@/hooks/useFx'
import { CATEGORIES } from '@/lib/categories'
import { GroupRow } from '@/components/GroupRow'
import { Avatar } from '@/components/Avatar'
import { Aurora } from '@/components/Aurora'
import { ChequeIcon } from '@/components/ChequeIcon'
import { CardSkeleton, ListSkeleton, Skeleton } from '@/components/Skeleton'
import { formatDate } from '@/lib/locale'
import { dayPart, greeting, helloFor, topCounterparties, type DayPart } from '@/lib/greeting'
import { isLiveTrip, liveTripFor } from '@/lib/capture'
import { lastGroup } from '@/lib/recents'
import { QuickAdd } from '@/components/QuickAdd'
import { todayISO } from '@/lib/id'
import { usePageTitle } from '@/lib/brand'

// Only shown once everything is settled: kept out of the first-paint bundle.
const CardFirework = lazy(() => import('@/components/CardFirework').then((m) => ({ default: m.CardFirework })))

export default function Home() {
  usePageTitle(null)
  const { profile } = useMe()
  const data = useAllGroupData()
  const home = profile.currency
  const rates = useTodayRates(home, data ? data.map((d) => d.group.currency) : [])
  const box = useInbox(data)
  const feed = box.feed?.slice(0, 6)
  const compact = useNarrow(380)
  if (!data) return <HomeSkeleton />
  const groupsById = Object.fromEntries(data.map((d) => [d.group.id, d.group]))
  const active = data.filter((d) => !d.group.archived)

  // Exact totals per group currency (archived groups sit out).
  const totals = new Map<string, { owed: number; owe: number }>()
  for (const d of active) {
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
  const allSettled = active.some((d) => d.me && d.group.type !== 'personal') && [...totals.values()].every((t) => !t.owed && !t.owe)

  const recent = active
    .flatMap((d) => d.expenses.map((e) => ({ e, d })))
    .sort((a, b) => b.e.date.localeCompare(a.e.date) || b.e.createdAt - a.e.createdAt)
    .slice(0, 6)
  const shared = active.filter((d) => d.group.type !== 'personal')
  const firstRun = data.length === 0
  const today = todayISO()
  const people = topCounterparties(
    shared.map((d) => ({ ...d.group, me: d.me, debts: d.debts })),
    cur,
  )
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
          <Link
            to="/inbox"
            aria-label={box.toSort ? `Inbox, ${box.toSort} to sort` : box.unread ? `Inbox, ${box.unread} new updates` : 'Inbox'}
            data-testid="home-inbox"
            className="relative flex h-12 items-center gap-1 rounded-full px-1.5 text-slate-600 transition active:scale-95 dark:text-slate-300"
          >
            {box.toSort > 0 ? (
              <span
                className="animate-pop flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[0.6875rem] font-bold text-white"
                aria-hidden
              >
                {box.toSort > 99 ? '99+' : box.toSort}
              </span>
            ) : box.unread > 0 ? (
              <span className="absolute right-1 top-2 h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-slate-50 dark:ring-ink-950" aria-hidden />
            ) : null}
            <Inbox className="h-6 w-6 min-[380px]:h-[27px] min-[380px]:w-[27px]" strokeWidth={2} aria-hidden />
          </Link>
          <Link to="/profile" aria-label="Profile" className="rounded-full p-0.5 ring-2 ring-brand-500/40 transition active:scale-95">
            <Avatar name={profile.displayName} photoURL={profile.photoURL} color="accent" size={compact ? 48 : 58} />
          </Link>
        </div>
      </header>

      {firstRun ? (
        <FirstRun />
      ) : (
        <div className="relative isolate overflow-hidden rounded-[2rem] bg-brand-600 p-6 text-white shadow-xl shadow-brand-600/30">
          <Aurora />
          {allSettled && (
            <Suspense fallback={null}>
              <CardFirework />
            </Suspense>
          )}
          <div className="relative">
            {/* Settle up: inset from the card's corner, level with the first lines, with a cheque being signed. */}
            {!allSettled && (
              <Link
                to="/settle"
                aria-label="Balances and settle up"
                title="Settle up"
                data-testid="home-settle"
                className="absolute -right-2.5 -top-3 flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full text-white transition duration-150 hover:bg-white/10 active:scale-90 active:bg-white/20"
              >
                <ChequeIcon size={50} play="loop" currency={home} />
              </Link>
            )}
            <div className="pr-16 text-sm font-medium text-white/90">{allSettled ? 'Overall' : `Overall, ${net >= 0 ? 'you are owed' : 'you owe'}`}</div>
            <div className="mt-1 pr-14 text-4xl font-extrabold tracking-tight" data-testid="home-net">
              {allSettled ? 'All settled up' : `${ax}${formatMoney(Math.abs(net), cur)}`}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Link
                to="/settle"
                className="rounded-2xl bg-white/15 p-3 text-left backdrop-blur transition active:bg-white/25"
                aria-label={`You are owed ${ax}${formatMoney(main.owed, cur)}. See who owes you`}
              >
                <div className="text-xs text-white/90">You are owed</div>
                <div className="text-lg font-bold">
                  {ax}
                  {formatMoney(main.owed, cur)}
                </div>
              </Link>
              <Link
                to="/settle"
                className="rounded-2xl bg-white/15 p-3 text-left backdrop-blur transition active:bg-white/25"
                aria-label={`You owe ${ax}${formatMoney(main.owe, cur)}. See who you owe`}
              >
                <div className="text-xs text-white/90">You owe</div>
                <div className="text-lg font-bold">
                  {ax}
                  {formatMoney(main.owe, cur)}
                </div>
              </Link>
            </div>
            {others.length > 0 && (
              <div className="mt-3 text-xs text-white/90">
                {approx
                  ? `Includes other currencies at today’s ECB rate. Exact: ${formatMoney(totals.get(home) ? totals.get(home)!.owed - totals.get(home)!.owe : 0, home, { sign: true })} · `
                  : 'Also: '}
                {others
                  .map(([c, t]) => `${formatMoney(t.owed - t.owe, c, { sign: true })}${cur === home && !rates?.[c] && c !== home ? ' (no rate)' : ''}`)
                  .join(' · ')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* One line, typed or spoken, into the trip that's on today (else the group used last): opens the form prefilled. */}
      {!firstRun && shared.length > 0 && (
        <QuickAdd
          groups={shared.map((d) => d.group)}
          defaultGroupId={
            liveTripFor(
              shared.map((d) => d.group),
              today,
            ) ?? lastGroup()
          }
          testId="home-quick-add"
        />
      )}

      {!firstRun && (
        <Section title="Groups" link={{ to: '/groups', label: 'See all' }}>
          {shared.length === 0 ? (
            <EmptyGroups />
          ) : (
            <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
              {shared.slice(0, 5).map((d) => (
                <GroupRow key={d.group.id} d={d} />
              ))}
            </div>
          )}
        </Section>
      )}

      {feed && feed.length > 0 ? (
        <Section title="Recent activity">
          <ActivityFeed entries={feed} groups={groupsById} />
        </Section>
      ) : (
        recent.length > 0 && (
          <Section title="Recent expenses">
            <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
              {recent.map(({ e, d }) => (
                <RecentExpense key={e.id} e={e} d={d} />
              ))}
            </div>
          </Section>
        )
      )}
    </div>
  )
}

function RecentExpense({ e, d }: { e: GroupData['expenses'][number]; d: GroupData }) {
  const mine = d.me ? (e.splits[d.me] ?? 0) : 0
  const paid = d.me ? (e.paidBy[d.me] ?? 0) : 0
  const delta = paid - mine
  return (
    <Link to={`/groups/${d.group.id}/expenses/${e.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50 dark:active:bg-ink-800">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-xl dark:bg-ink-800" aria-hidden>
        {CATEGORIES[e.category].emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{e.description}</div>
        <div className="text-muted truncate text-xs">
          <span aria-hidden>{d.group.emoji} </span>
          {d.group.name} · {formatDate(e.date)}
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold">{formatMoney(e.amount, d.group.currency)}</div>
        {delta !== 0 && d.group.type !== 'personal' && (
          <div className={`text-xs ${delta > 0 ? 'pos' : 'neg'}`}>
            {delta > 0 ? 'you lent' : 'you borrowed'} {formatMoney(Math.abs(delta), d.group.currency)}
          </div>
        )}
      </div>
    </Link>
  )
}

/**
 * First run (no groups at all): instead of a balance card that says ₹0, the three ways to
 * start. Shared with the Groups tab so both screens say the same thing.
 */
export function FirstRun() {
  return (
    <div className="card p-5" data-testid="first-run">
      <h2 className="text-lg font-bold">Start with a group</h2>
      <p className="text-muted mt-1 text-sm">A trip, your flat, a dinner: add what people pay and Split Now keeps the balances.</p>
      <div className="mt-4 divide-y divide-slate-100 dark:divide-white/5">
        <StartRow to="/groups/new" icon={<Plus size={20} />} title="Create a group" text="Trips, flats, dinners, anything" testId="first-run-create" />
        <StartRow
          to="/groups/import"
          icon={<FileUp size={20} />}
          title="Import from Splitwise"
          text="Bring a group over with its balances"
          testId="first-run-import"
        />
        <JoinRow />
      </div>
    </div>
  )
}

/** The Groups tab's and Home's empty state for "no shared groups yet" (a personal wallet may exist). */
export function EmptyGroups() {
  return (
    <div className="card p-5">
      <h3 className="font-bold">No shared groups yet</h3>
      <p className="text-muted mt-1 text-sm">Create one for a trip, your home, or anything you share.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to="/groups/new" className="btn-primary" data-testid="empty-create-group">
          Create a group
        </Link>
        <Link to="/groups/import" className="btn-secondary">
          Import from Splitwise
        </Link>
      </div>
    </div>
  )
}

function StartRow({ to, icon, title, text, testId }: { to: string; icon: React.ReactNode; title: string; text: string; testId?: string }) {
  return (
    <Link to={to} className="flex min-h-16 items-center gap-3 py-3 transition active:bg-slate-50 dark:active:bg-ink-800" data-testid={testId}>
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="text-muted block text-xs">{text}</span>
      </span>
      <ChevronRight size={18} className="text-slate-300 dark:text-slate-600" aria-hidden />
    </Link>
  )
}

/** "Join with a code": the row expands into a small form so a friend's invite code works from here. */
function JoinRow() {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const c = code.replace(/[^A-Za-z0-9]/g, '')
    if (c) nav(`/join/${c}`)
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="join-code-form"
        className="flex min-h-16 w-full items-center gap-3 py-3 text-left transition active:bg-slate-50 dark:active:bg-ink-800"
      >
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"
          aria-hidden
        >
          <Ticket size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Join with an invite code</span>
          <span className="text-muted block text-xs">Someone already made the group? Enter their code</span>
        </span>
        <ChevronRight size={18} className={`text-slate-300 transition-transform dark:text-slate-600 ${open ? 'rotate-90' : ''}`} aria-hidden />
      </button>
      {open && (
        <form id="join-code-form" onSubmit={submit} className="flex gap-2 pb-3">
          <label htmlFor="join-code" className="sr-only">
            Invite code
          </label>
          <input
            id="join-code"
            className="input font-mono uppercase tracking-widest"
            placeholder="Code"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="submit" className="btn-primary shrink-0" disabled={!code.trim()}>
            Join
          </button>
        </form>
      )}
    </div>
  )
}

function HomeSkeleton() {
  return (
    <div className="pt-[calc(env(safe-area-inset-top)+1.5rem)]" role="status" aria-label="Loading">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-12 w-12 rounded-full" />
      </div>
      <CardSkeleton className="h-44 rounded-[2rem]" />
      <div className="mt-7">
        <Skeleton className="mb-3 h-5 w-24" />
        <ListSkeleton rows={3} />
      </div>
    </div>
  )
}

export function Section({ title, link, children }: { title: string; link?: { to: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="mb-2.5 flex items-center justify-between px-1">
        <h2 className="text-lg font-bold">{title}</h2>
        {link && (
          <Link to={link.to} className="text-sm font-semibold text-brand-600 dark:text-brand-300">
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

/**
 * The icon after "Hi": one icon for the time of day, picked per visit from HELLO, playing its own
 * motion (wave, bob, tilt, bounce, pulse, swing) a few times and then resting; tapping it plays it again. Static under reduced motion.
 */
function HelloIcon({ part }: { part: DayPart }) {
  const [cur] = useState(() => helloFor(part))
  const [run, setRun] = useState(0)
  const motion = {
    wave: 'animate-wave origin-[70%_70%]',
    tilt: 'animate-tilt',
    float: 'animate-float',
    bounce: 'animate-hello-bounce origin-bottom',
    pulse: 'animate-hello-pulse',
    swing: 'animate-hello-swing origin-top',
  }[cur.motion]
  return (
    <span aria-hidden className="inline-flex h-[1.2em] w-[1.2em] items-center justify-center" onClick={() => setRun((n) => n + 1)}>
      <span key={run} className={`inline-block ${motion}`}>
        {cur.emoji}
      </span>
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: name is the trigger; a new name changes the probe's width, so measure again.
  useLayoutEffect(() => {
    const el = box.current,
      p = probe.current
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
      <p className="text-muted text-sm font-medium">{salutation}</p>
      {/* invisible one-line copy, measured to decide the layout */}
      <span ref={probe} aria-hidden className={`pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap ${size}`}>
        Hi, {name} 👋
      </span>
      <h1 className={`mt-0.5 ${size}`}>
        {stacked ? (
          <>
            <span className="flex items-center gap-2">
              Hi <HelloIcon part={part} />
            </span>
            <span className="block truncate">{name}</span>
          </>
        ) : (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">Hi, {name}</span>
            <HelloIcon part={part} />
          </span>
        )}
      </h1>
    </div>
  )
}
