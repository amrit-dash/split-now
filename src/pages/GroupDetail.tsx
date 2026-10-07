import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BarChart3, Bell, ChevronRight, Copy, Download, HandCoins, Link2, MessageSquareText, Repeat, Search, Settings, Share2, Trash2, X } from 'lucide-react'
import { useMe } from '@/hooks/auth'
import { computeGroupData, useActivity, useExpenses, useGroup, useSettlements, useTrash } from '@/hooks/data'
import type { Category, Expense, Group, Settlement } from '@/types'
import { formatMoney } from '@/lib/money'
import { CATEGORIES } from '@/lib/categories'
import { simplifyDebts } from '@/lib/simplify'
import { copy, shareOrCopy } from '@/lib/share'
import { csvFilename, deliverCsv, groupCsv } from '@/lib/export'
import { EMPTY_FILTER, expenseMatches, isFiltering, settlementMatches, type ActivityFilter } from '@/lib/filter'
import { FREQ_LABEL } from '@/lib/recurrence'
import { todayISO } from '@/lib/id'
import { Avatar } from '@/components/Avatar'
import { DebtGraph } from '@/components/DebtGraph'
import { GroupIcon } from '@/components/GroupIcon'
import { Empty, LiveBadge, Loading, PageHeader, Segmented, formatRange } from '@/components/Misc'
import { hasTripWindow, isLiveTrip } from '@/lib/capture'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { ActivityFeed, RecentlyDeleted, TrustBadges, useUndoableDelete } from '@/components/Trust'
import { appLocale } from '@/lib/locale'

type Tab = 'expenses' | 'balances' | 'graph' | 'activity'

export default function GroupDetail() {
  const { groupId } = useParams()
  const { user } = useMe()
  const liveGroup = useGroup(groupId)
  const expenses = useExpenses(groupId)
  const settlements = useSettlements(groupId)
  const [tab, setTab] = useState<Tab>('expenses')
  const [invite, setInvite] = useState(false)
  const toast = useToast()

  const d = useMemo(
    () => (liveGroup && expenses && settlements ? computeGroupData(liveGroup, expenses, settlements, user.uid) : null),
    [liveGroup, expenses, settlements, user.uid],
  )

  if (liveGroup === null) return <><PageHeader title="Group not found" back="/groups" /><Empty emoji="🔍" title="This group doesn’t exist or you’re not a member" /></>
  if (!d) return <Loading />

  const { me, net, debts, group } = d
  const cur = group.currency
  const myBal = me ? net[me] ?? 0 : 0
  const personal = group.type === 'personal'
  const total = d.expenses.reduce((s, e) => s + e.amount, 0)
  const name = (id: string) => (id === me ? 'You' : group.members[id]?.name ?? 'Someone')
  const inviteUrl = `${location.origin}/join/${group.inviteCode}`

  const remind = async (debtor: string, amount: number) => {
    const r = await shareOrCopy({
      title: 'Split Now reminder',
      text: `Hey ${group.members[debtor]?.name.split(' ')[0]}! Friendly nudge: you owe ${formatMoney(amount, cur)} for “${group.name}”. Settle up in Split Now:`,
      url: `${location.origin}/groups/${group.id}`,
    })
    if (r === 'copied') toast('Reminder copied to clipboard')
  }

  const exportCsv = async () => {
    try {
      const r = await deliverCsv(csvFilename(group.name, todayISO()), groupCsv(group, d.expenses, d.settlements))
      if (r === 'downloaded') toast('CSV downloaded')
    } catch (e) {
      toast('Export failed: ' + (e as Error).message, 'err')
    }
  }

  return (
    <div>
      <PageHeader
        back="/groups"
        title={<span className="flex items-center gap-2">{group.name}</span>}
        right={
          <div className="flex gap-1">
            <button onClick={exportCsv} className="rounded-full p-2.5 hover:bg-slate-200/60 dark:hover:bg-ink-800" aria-label="Export CSV" title="Export CSV"><Download size={20} /></button>
            <Link to={`/insights?group=${group.id}`} className="rounded-full p-2.5 hover:bg-slate-200/60 dark:hover:bg-ink-800" aria-label="Insights"><BarChart3 size={20} /></Link>
            <Link to={`/groups/${group.id}/edit`} className="rounded-full p-2.5 hover:bg-slate-200/60 dark:hover:bg-ink-800" aria-label="Settings"><Settings size={20} /></Link>
          </div>
        }
      />

      <div className="card mb-4 p-5">
        <div className="flex items-center gap-4">
          <GroupIcon emoji={group.emoji} size={56} />
          <div className="min-w-0 flex-1">
            {personal ? (
              <>
                <div className="text-sm text-slate-500">Total spent</div>
                <div className="text-2xl font-extrabold tabular-nums">{formatMoney(total, cur)}</div>
              </>
            ) : myBal === 0 ? (
              <div className="text-lg font-bold text-slate-500">You’re all settled up ✨</div>
            ) : (
              <>
                <div className={`text-sm font-medium ${myBal > 0 ? 'pos' : 'neg'}`}>{myBal > 0 ? 'You are owed' : 'You owe'}</div>
                <div className={`text-3xl font-extrabold tabular-nums ${myBal > 0 ? 'pos' : 'neg'}`}>{formatMoney(Math.abs(myBal), cur)}</div>
              </>
            )}
          </div>
        </div>
        {!personal && me && (
          <div className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
            {debts.filter((x) => x.from === me || x.to === me).slice(0, 3).map((x, i) => (
              <div key={i}>{x.from === me ? <>You owe <b>{name(x.to)}</b> <span className="neg font-semibold">{formatMoney(x.amount, cur)}</span></> : <><b>{name(x.from)}</b> owes you <span className="pos font-semibold">{formatMoney(x.amount, cur)}</span></>}</div>
            ))}
          </div>
        )}
        {hasTripWindow(group) && (
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <span>🗓️ {formatRange(group.startDate, group.endDate)}</span>
            {isLiveTrip(group, todayISO()) && <LiveBadge />}
          </div>
        )}
        {group.budget ? <BudgetBar spent={total} budget={group.budget} currency={cur} /> : null}
        {!personal && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link to={`/groups/${group.id}/settle`} className="btn-primary"><HandCoins size={18} /> Settle up</Link>
            <button className="btn-secondary" onClick={() => setInvite(true)}><Link2 size={18} /> Invite</button>
          </div>
        )}
      </div>

      {!personal && hasTripWindow(group) && (
        <Link to={`/settings/auto-capture?group=${group.id}`} className="card mb-4 flex items-center gap-3 p-4" data-testid="trip-auto-capture">
          <MessageSquareText size={22} className="shrink-0 text-brand-600 dark:text-brand-300" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Trip auto-capture</div>
            <div className="text-xs text-slate-500">Debit SMS from {formatRange(group.startDate, group.endDate)} ask “add to {group.name}?”. Set up for this trip →</div>
          </div>
          <ChevronRight size={18} className="shrink-0 text-slate-300 dark:text-slate-600" />
        </Link>
      )}

      {!personal && (
        <div className="mb-4">
          <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'expenses', label: 'Expenses' }, { value: 'balances', label: 'Balances' }, { value: 'graph', label: 'Graph' }, { value: 'activity', label: 'Activity' }]} />
        </div>
      )}

      {(tab === 'expenses' || personal) && <ActivityList group={group} expenses={d.expenses} settlements={d.settlements} me={me} currency={cur} name={name} personal={personal} />}

      {tab === 'activity' && !personal && <ActivityTab group={group} expenseIds={new Set(d.expenses.map((e) => e.id))} />}

      {tab === 'balances' && !personal && (
        <div className="space-y-4">
          {(d.pending.length > 0 || d.disputed.length > 0) && (
            <div className="card space-y-1 p-3 text-xs text-slate-600 dark:text-slate-300">
              {d.pending.length > 0 && <div>⏳ {d.pending.length} expense{d.pending.length > 1 ? 's' : ''} waiting for approval {d.pending.length > 1 ? 'are' : 'is'} <b>not</b> counted yet.</div>}
              {d.disputed.length > 0 && <div>🚩 Includes {d.disputed.length} disputed expense{d.disputed.length > 1 ? 's' : ''} (still counted until resolved or edited).</div>}
            </div>
          )}
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
            {Object.entries(group.members).map(([id, m]) => {
              const v = net[id] ?? 0
              return (
                <div key={id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={m.name} color={m.color} size={36} />
                  <div className="flex-1 font-medium">{id === me ? 'You' : m.name}</div>
                  <div className={`text-right text-sm font-semibold tabular-nums ${v > 0 ? 'pos' : v < 0 ? 'neg' : 'text-slate-400'}`}>
                    {v === 0 ? 'settled' : `${v > 0 ? 'gets back' : 'owes'} ${formatMoney(Math.abs(v), cur)}`}
                  </div>
                </div>
              )
            })}
          </div>
          <div>
            <div className="mb-2 px-1 text-sm font-semibold text-slate-500">{group.simplify ? 'Suggested payments (simplified)' : 'Who owes whom'}</div>
            {debts.length === 0 ? (
              <Empty emoji="🎉" title="Everyone is square" />
            ) : (
              <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
                {debts.map((x, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <Avatar name={group.members[x.from]?.name ?? '?'} color={group.members[x.from]?.color ?? '#999'} size={32} />
                    <div className="min-w-0 flex-1 text-sm">
                      <b>{name(x.from)}</b> → <b>{name(x.to)}</b>
                      <div className="font-semibold tabular-nums neg">{formatMoney(x.amount, cur)}</div>
                    </div>
                    {x.to === me && <button onClick={() => remind(x.from, x.amount)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-ink-800" aria-label="Send reminder"><Bell size={18} /></button>}
                    <Link to={`/groups/${group.id}/settle?from=${x.from}&to=${x.to}&amount=${x.amount}`} className="chip">Settle</Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'graph' && !personal && <GraphTab d={d} />}

      <Sheet open={invite} onClose={() => setInvite(false)} title="Invite to group">
        <p className="text-sm text-slate-500">Anyone with this link can join <b>{group.name}</b> and claim their name in the member list.</p>
        <div className="mt-4 rounded-2xl bg-slate-100 p-4 text-center dark:bg-ink-800">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Invite code</div>
          <div className="mt-1 font-mono text-3xl font-extrabold tracking-[0.3em]">{group.inviteCode}</div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className="btn-secondary" onClick={async () => toast((await copy(inviteUrl)) ? 'Link copied' : 'Copy failed', 'ok')}><Copy size={18} /> Copy link</button>
          <button className="btn-primary" onClick={() => shareOrCopy({ title: `Join ${group.name} on Split Now`, text: `Join “${group.name}” on Split Now to split expenses:`, url: inviteUrl })}><Share2 size={18} /> Share</button>
        </div>
      </Sheet>
    </div>
  )
}

function BudgetBar({ spent, budget, currency }: { spent: number; budget: number; currency: string }) {
  const pct = Math.min(100, (spent / budget) * 100)
  const over = spent > budget
  return (
    <div className="mt-4">
      <div className="mb-1 flex justify-between text-xs font-medium text-slate-500">
        <span>Budget {formatMoney(budget, currency)}</span>
        <span className={over ? 'neg' : ''}>{over ? `${formatMoney(spent - budget, currency)} over` : `${formatMoney(budget - spent, currency)} left`}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-ink-800">
        <div className={`h-full rounded-full ${over ? 'bg-rose-500' : pct > 80 ? 'bg-amber-500' : 'bg-gradient-to-r from-brand-500 to-fuchsia-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function GraphTab({ d }: { d: ReturnType<typeof computeGroupData> }) {
  const simplified = useMemo(() => simplifyDebts(d.net), [d.net])
  const [view, setView] = useState<'raw' | 'simple'>('simple')
  const saved = d.rawDebts.length - simplified.length
  return (
    <div className="card p-4">
      <Segmented value={view} onChange={setView} options={[{ value: 'raw', label: `Original (${d.rawDebts.length})` }, { value: 'simple', label: `Simplified (${simplified.length})` }]} />
      <div className="mt-4"><DebtGraph group={d.group} debts={view === 'raw' ? d.rawDebts : simplified} /></div>
      <div className="mt-2 rounded-2xl bg-brand-50 p-3 text-center text-sm text-brand-900 dark:bg-brand-900/30 dark:text-brand-100">
        {saved > 0
          ? <>Simplifying removes <b>{saved}</b> payment{saved > 1 ? 's' : ''}. Everyone ends up with exactly the same balance.</>
          : <>These debts are already as simple as they get.</>}
        {!d.group.simplify && saved > 0 && <div className="mt-1 text-xs">Turn on <b>Simplify debts</b> in group settings to use this.</div>}
      </div>
    </div>
  )
}

function ActivityTab({ group, expenseIds }: { group: Group; expenseIds: Set<string> }) {
  const feed = useActivity(group.id)
  const trash = useTrash(group)
  const [open, setOpen] = useState(false)
  const n = trash ? trash.expenses.length + trash.settlements.length : 0
  return (
    <div className="space-y-3">
      <button onClick={() => setOpen(true)} className="card flex w-full items-center gap-3 px-4 py-3 text-left text-sm">
        <Trash2 size={18} className="text-slate-400" />
        <span className="flex-1 font-medium">Recently deleted</span>
        <span className="text-slate-500">{n || 'empty'}</span>
      </button>
      {feed === null ? <Loading /> : feed.length === 0 ? (
        <Empty emoji="📜" title="No activity yet">Adds, edits, deletions and flags show up here.</Empty>
      ) : (
        <ActivityFeed entries={feed} linkable={(a) => expenseIds.has(a.targetId) || !!trash?.expenses.some((e) => e.id === a.targetId)} />
      )}
      <RecentlyDeleted group={group} open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

function ActivityList({ group, expenses, settlements, me, currency, name, personal }: {
  group: Group; expenses: Expense[]; settlements: Settlement[]; me?: string; currency: string; name: (id: string) => string; personal: boolean
}) {
  const groupId = group.id
  const undoable = useUndoableDelete()
  const [filter, setFilter] = useState<ActivityFilter>(EMPTY_FILTER)
  const [onlyMe, setOnlyMe] = useState(false)
  const f: ActivityFilter = { ...filter, involving: onlyMe ? me : undefined }
  const filtering = isFiltering(f)
  const usedCategories = useMemo(() => {
    const seen = new Set(expenses.map((e) => e.category))
    return (Object.keys(CATEGORIES) as Category[]).filter((c) => seen.has(c))
  }, [expenses])
  const toggleCat = (c: Category) =>
    setFilter((p) => ({ ...p, categories: p.categories.includes(c) ? p.categories.filter((x) => x !== c) : [...p.categories, c] }))
  const clear = () => { setFilter(EMPTY_FILTER); setOnlyMe(false) }

  type Row = { kind: 'e'; e: Expense } | { kind: 's'; s: Settlement }
  const all = expenses.length + settlements.length
  const rows: Row[] = [
    ...expenses.filter((e) => expenseMatches(e, f)).map((e) => ({ kind: 'e' as const, e })),
    ...settlements.filter((s) => settlementMatches(s, f, name)).map((s) => ({ kind: 's' as const, s })),
  ]
    .sort((a, b) => {
      const da = a.kind === 'e' ? a.e.date : a.s.date, db = b.kind === 'e' ? b.e.date : b.s.date
      const ca = a.kind === 'e' ? a.e.createdAt : a.s.createdAt, cb = b.kind === 'e' ? b.e.createdAt : b.s.createdAt
      return db.localeCompare(da) || cb - ca
    })
  if (all === 0) return <Empty emoji="🧾" title="No expenses yet">Tap the + button to add the first one, or scan a receipt.</Empty>

  const byMonth = new Map<string, Row[]>()
  for (const r of rows) {
    const date = r.kind === 'e' ? r.e.date : r.s.date
    const k = new Date(date + 'T00:00').toLocaleDateString(appLocale(), { month: 'long', year: 'numeric' })
    byMonth.set(k, [...(byMonth.get(k) ?? []), r])
  }
  const filters = (
    <div className="space-y-2">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          className="input !py-2.5 pl-10 pr-10"
          placeholder="Search expenses and notes"
          aria-label="Search expenses"
          value={filter.q}
          onChange={(e) => setFilter((p) => ({ ...p, q: e.target.value }))}
        />
        {filter.q && (
          <button onClick={() => setFilter((p) => ({ ...p, q: '' }))} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400" aria-label="Clear search"><X size={16} /></button>
        )}
      </div>
      {(usedCategories.length > 1 || (!personal && me)) && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {!personal && me && (
            <button onClick={() => setOnlyMe(!onlyMe)} className={`chip shrink-0 whitespace-nowrap ${onlyMe ? 'chip-on' : ''}`} aria-pressed={onlyMe}>Involving me</button>
          )}
          {usedCategories.length > 1 && usedCategories.map((c) => {
            const on = filter.categories.includes(c)
            return (
              <button key={c} onClick={() => toggleCat(c)} className={`chip shrink-0 whitespace-nowrap ${on ? 'chip-on' : ''}`} aria-pressed={on}>
                <span aria-hidden>{CATEGORIES[c].emoji}</span>{CATEGORIES[c].label}
              </button>
            )
          })}
        </div>
      )}
      {filtering && (
        <div className="flex items-center justify-between px-1 text-xs text-slate-500">
          <span>{rows.length} of {all} shown</span>
          <button onClick={clear} className="font-semibold text-brand-600 dark:text-brand-300">Clear filters</button>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-5">
      {filters}
      {rows.length === 0 && <Empty emoji="🔎" title="No matches">Try a different search or clear the filters.</Empty>}
      {[...byMonth].map(([month, list]) => (
        <div key={month}>
          <div className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">{month}</div>
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
            {list.map((r) => {
              if (r.kind === 's') {
                return (
                  <div key={r.s.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-xl dark:bg-emerald-500/15">💸</div>
                    <div className="min-w-0 flex-1 text-sm"><b>{name(r.s.from)}</b> paid <b>{name(r.s.to)}</b><div className="text-xs text-slate-500">{r.s.method} · {fmtDay(r.s.date)}</div></div>
                    <div className="font-semibold tabular-nums pos">{formatMoney(r.s.amount, currency)}</div>
                    <button onClick={() => undoable.settlement(groupId, r.s)} className="-mr-2 rounded-full p-2 text-slate-300 hover:text-rose-500 dark:text-slate-600" aria-label="Delete payment"><Trash2 size={16} /></button>
                  </div>
                )
              }
              const e = r.e
              const payers = Object.keys(e.paidBy)
              const delta = me ? (e.paidBy[me] ?? 0) - (e.splits[me] ?? 0) : 0
              return (
                <Link key={e.id} to={`/groups/${groupId}/expenses/${e.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50 dark:active:bg-ink-800">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl" style={{ background: CATEGORIES[e.category].color + '22' }}>{CATEGORIES[e.category].emoji}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{e.description}</span>
                      {e.recurrence && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200" title={`Repeats ${FREQ_LABEL[e.recurrence.freq].toLowerCase()}`}>
                          <Repeat size={10} strokeWidth={3} />{FREQ_LABEL[e.recurrence.freq]}
                        </span>
                      )}
                      {e.recurringFrom && !e.recurrence && <Repeat size={12} className="shrink-0 text-slate-400" aria-label="Repeating expense" />}
                      <TrustBadges e={e} group={group} />
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {personal ? fmtDay(e.date) : <>{payers.length > 1 ? `${payers.length} people` : name(payers[0])} paid {formatMoney(e.amount, currency)} · {fmtDay(e.date)}</>}
                    </div>
                  </div>
                  <div className="text-right">
                    {personal ? (
                      <div className="font-semibold tabular-nums">{formatMoney(e.amount, currency)}</div>
                    ) : delta === 0 ? (
                      <div className="text-xs text-slate-400">{me && e.splits[me] === undefined && !e.paidBy[me] ? 'not involved' : 'even'}</div>
                    ) : (
                      <>
                        <div className={`text-[11px] ${delta > 0 ? 'pos' : 'neg'}`}>{delta > 0 ? 'you lent' : 'you borrowed'}</div>
                        <div className={`font-semibold tabular-nums ${delta > 0 ? 'pos' : 'neg'}`}>{formatMoney(Math.abs(delta), currency)}</div>
                      </>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function fmtDay(d: string) {
  return new Date(d + 'T00:00').toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' })
}
