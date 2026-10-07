import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BarChart3, Bell, Copy, HandCoins, Link2, Settings, Share2 } from 'lucide-react'
import { useMe } from '@/hooks/auth'
import { computeGroupData, useExpenses, useGroup, useSettlements } from '@/hooks/data'
import type { Expense, Settlement } from '@/types'
import { formatMoney } from '@/lib/money'
import { CATEGORIES } from '@/lib/categories'
import { simplifyDebts } from '@/lib/simplify'
import { copy, shareOrCopy } from '@/lib/share'
import { Avatar } from '@/components/Avatar'
import { DebtGraph } from '@/components/DebtGraph'
import { GroupIcon } from '@/components/GroupIcon'
import { Empty, Loading, PageHeader, Segmented } from '@/components/Misc'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'

type Tab = 'expenses' | 'balances' | 'graph'

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
      title: 'Split It reminder',
      text: `Hey ${group.members[debtor]?.name.split(' ')[0]}! Friendly nudge: you owe ${formatMoney(amount, cur)} for “${group.name}”. Settle up in Split It:`,
      url: `${location.origin}/groups/${group.id}`,
    })
    if (r === 'copied') toast('Reminder copied to clipboard')
  }

  return (
    <div>
      <PageHeader
        back="/groups"
        title={<span className="flex items-center gap-2">{group.name}</span>}
        right={
          <div className="flex gap-1">
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
        {group.budget ? <BudgetBar spent={total} budget={group.budget} currency={cur} /> : null}
        {!personal && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link to={`/groups/${group.id}/settle`} className="btn-primary"><HandCoins size={18} /> Settle up</Link>
            <button className="btn-secondary" onClick={() => setInvite(true)}><Link2 size={18} /> Invite</button>
          </div>
        )}
      </div>

      {!personal && (
        <div className="mb-4">
          <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'expenses', label: 'Expenses' }, { value: 'balances', label: 'Balances' }, { value: 'graph', label: 'Debt graph' }]} />
        </div>
      )}

      {(tab === 'expenses' || personal) && <ActivityList groupId={group.id} expenses={d.expenses} settlements={d.settlements} me={me} currency={cur} name={name} personal={personal} />}

      {tab === 'balances' && !personal && (
        <div className="space-y-4">
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
          <button className="btn-primary" onClick={() => shareOrCopy({ title: `Join ${group.name} on Split It`, text: `Join “${group.name}” on Split It to split expenses:`, url: inviteUrl })}><Share2 size={18} /> Share</button>
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

function ActivityList({ groupId, expenses, settlements, me, currency, name, personal }: {
  groupId: string; expenses: Expense[]; settlements: Settlement[]; me?: string; currency: string; name: (id: string) => string; personal: boolean
}) {
  type Row = { kind: 'e'; e: Expense } | { kind: 's'; s: Settlement }
  const rows: Row[] = [...expenses.map((e) => ({ kind: 'e' as const, e })), ...settlements.map((s) => ({ kind: 's' as const, s }))]
    .sort((a, b) => {
      const da = a.kind === 'e' ? a.e.date : a.s.date, db = b.kind === 'e' ? b.e.date : b.s.date
      const ca = a.kind === 'e' ? a.e.createdAt : a.s.createdAt, cb = b.kind === 'e' ? b.e.createdAt : b.s.createdAt
      return db.localeCompare(da) || cb - ca
    })
  if (rows.length === 0) return <Empty emoji="🧾" title="No expenses yet">Tap the + button to add the first one, or scan a receipt.</Empty>

  const byMonth = new Map<string, Row[]>()
  for (const r of rows) {
    const date = r.kind === 'e' ? r.e.date : r.s.date
    const k = new Date(date + 'T00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    byMonth.set(k, [...(byMonth.get(k) ?? []), r])
  }
  return (
    <div className="space-y-5">
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
                    <div className="truncate font-medium">{e.description}</div>
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
  return new Date(d + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
