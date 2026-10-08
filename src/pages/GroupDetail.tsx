import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Archive, BarChart3, Bell, ChevronRight, Download, Link2, LogOut, MessageSquareText, MoreHorizontal, Pencil, Repeat, Search, Trash2, UserMinus, X } from 'lucide-react'
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
import { errText } from '@/lib/errors'
import { usePageTitle } from '@/lib/brand'
import { formatDate } from '@/lib/locale'
import * as payments from '@/lib/payments'
import { Avatar } from '@/components/Avatar'
import { DebtGraph } from '@/components/DebtGraph'
import { GroupIcon } from '@/components/GroupIcon'
import { QrCode } from '@/components/QrCode'
import { Empty, LiveBadge, Loading, PageHeader, Segmented, formatRange } from '@/components/Misc'
import { CardSkeleton, ListSkeleton } from '@/components/Skeleton'
import { Collapsible } from '@/components/Collapsible'
import { hasTripWindow, isLiveTrip } from '@/lib/capture'
import { Sheet } from '@/components/Sheet'
import { Switch } from '@/components/Switch'
import { useConfirm } from '@/components/ConfirmSheet'
import { repo } from '@/data'
import { useToast } from '@/components/Toast'
import { ActivityFeed, RecentlyDeleted, TrustBadges, useUndoableDelete } from '@/components/Trust'

type Tab = 'expenses' | 'balances' | 'activity'

/** "Waived" → "Waived", else the stored method; C1 exports methodLabel() from src/lib/payments.ts. */
const methodLabel = (m: string): string => {
  const fn = (payments as unknown as { methodLabel?: (s: string) => string }).methodLabel
  return fn ? fn(m) : m
}

export default function GroupDetail() {
  const { groupId } = useParams()
  const { user } = useMe()
  const nav = useNavigate()
  const liveGroup = useGroup(groupId)
  const expenses = useExpenses(groupId)
  const settlements = useSettlements(groupId)
  const [tab, setTab] = useState<Tab>('expenses')
  const [invite, setInvite] = useState(false)
  const [menu, setMenu] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const toast = useToast()
  const confirm = useConfirm()
  usePageTitle(liveGroup ? liveGroup.name : liveGroup === null ? 'Group not found' : undefined)

  const d = useMemo(
    () => (liveGroup && expenses && settlements ? computeGroupData(liveGroup, expenses, settlements, user.uid) : null),
    [liveGroup, expenses, settlements, user.uid],
  )

  if (liveGroup === null) return <><PageHeader title="Group not found" back="/groups" /><Empty emoji="🔍" title="This group doesn’t exist or you’re not a member" /></>
  if (!d) return <><PageHeader title={liveGroup?.name ?? ' '} back="/groups" /><div className="space-y-4" role="status" aria-label="Loading"><CardSkeleton className="h-40" /><ListSkeleton rows={4} /></div></>

  const { me, net, debts, group } = d
  const cur = group.currency
  const myBal = me ? net[me] ?? 0 : 0
  const personal = group.type === 'personal'
  const total = d.expenses.reduce((s, e) => s + e.amount, 0)
  const name = (id: string) => (id === me ? 'You' : group.members[id]?.name ?? 'Someone')
  const inviteUrl = `${location.origin}/join/${group.inviteCode}`
  const creator = group.createdBy === user.uid
  const fail = (e: unknown) => toast(errText(e), 'err')

  const remind = async (debtor: string, amount: number) => {
    const r = await shareOrCopy({
      title: 'Split Now reminder',
      text: `Hey ${group.members[debtor]?.name.split(' ')[0]}! Friendly nudge: you owe ${formatMoney(amount, cur)} for “${group.name}”. Settle up in Split Now:`,
      url: `${location.origin}/groups/${group.id}`,
    })
    if (r === 'copied') toast('Reminder copied to clipboard')
  }

  const exportCsv = async () => {
    setMenu(false)
    try {
      const r = await deliverCsv(csvFilename(group.name, todayISO()), groupCsv(group, d.expenses, d.settlements))
      if (r === 'downloaded') toast('CSV downloaded')
    } catch (e) {
      toast(`Export failed: ${errText(e)}`, 'err')
    }
  }

  const setArchived = async (archived: boolean) => {
    setMenu(false)
    try {
      await repo.updateGroupSettings(group, { archived: archived || undefined })
      toast(archived ? `${group.name} archived` : `${group.name} restored`, 'ok', archived ? { action: { label: 'Undo', run: () => { repo.updateGroupSettings({ ...group, archived: true }, { archived: undefined }).catch(fail) } } } : undefined)
    } catch (e) { fail(e) }
  }

  /** Leaving or removing someone: only with a zero balance, so no money goes missing. */
  const removeMember = async (memberId: string) => {
    setMenu(false)
    const self = memberId === me
    const bal = net[memberId] ?? 0
    const who = self ? 'you' : group.members[memberId]?.name ?? 'this person'
    if (bal !== 0) {
      const amount = formatMoney(Math.abs(bal), cur)
      toast(self ? `Settle up first: you ${bal > 0 ? 'are owed' : 'owe'} ${amount}` : `Settle up first: ${who} ${bal > 0 ? 'is owed' : 'owes'} ${amount}`, 'err')
      return
    }
    if (self && creator) { toast('You created this group. Delete it from Edit group, or ask someone else to re-create it.', 'err'); return }
    const ok = await confirm(self
      ? { title: `Leave ${group.name}?`, message: 'You lose access to its expenses. Expenses you were part of stay in the group.', confirmLabel: 'Leave group', tone: 'danger' }
      : { title: `Remove ${who}?`, message: 'Their expenses stay. They can rejoin with the invite link.', confirmLabel: 'Remove', tone: 'danger' })
    if (!ok) return
    try {
      await repo.removeMember(group, memberId)
      if (self) { toast(`You left ${group.name}`); nav('/groups', { replace: true }) }
      else toast(`${who} removed`)
    } catch (e) { fail(e) }
  }

  const deleteGroup = async () => {
    setMenu(false)
    const ok = await confirm({ title: `Delete “${group.name}”?`, message: 'Every expense and payment in it goes too. This cannot be undone.', confirmLabel: 'Delete group', tone: 'danger' })
    if (!ok) return
    setDeleted(true)
    try {
      await repo.deleteGroup(group.id)
      toast('Group deleted')
      nav('/groups', { replace: true })
    } catch (e) { setDeleted(false); fail(e) }
  }

  const settled = myBal === 0

  return (
    <div>
      <PageHeader
        back="/groups"
        title={group.name}
        right={
          <button type="button" onClick={() => setMenu(true)} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-200/60 dark:hover:bg-ink-800" aria-label="More" aria-haspopup="dialog" data-testid="group-menu"><MoreHorizontal size={22} aria-hidden /></button>
        }
      />

      <div className="card mb-4 p-5">
        <div className="flex items-center gap-4">
          <GroupIcon emoji={group.emoji} size={56} />
          <div className="min-w-0 flex-1">
            {personal ? (
              <>
                <div className="text-muted text-sm">Total spent</div>
                <div className="text-2xl font-extrabold">{formatMoney(total, cur)}</div>
              </>
            ) : settled ? (
              <div className="text-muted text-lg font-bold">You’re all settled up</div>
            ) : (
              <>
                <div className={`text-sm font-medium ${myBal > 0 ? 'pos' : 'neg'}`}>{myBal > 0 ? 'You are owed' : 'You owe'}</div>
                <div className={`text-3xl font-extrabold ${myBal > 0 ? 'pos' : 'neg'}`}>{formatMoney(Math.abs(myBal), cur)}</div>
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
        {(hasTripWindow(group) || group.archived) && (
          <div className="text-muted mt-3 flex flex-wrap items-center gap-2 text-sm">
            {hasTripWindow(group) && <span>{formatRange(group.startDate, group.endDate)}</span>}
            {isLiveTrip(group, todayISO()) && <LiveBadge type={group.type} />}
            {group.archived && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold dark:bg-ink-800">Archived</span>}
          </div>
        )}
        {group.budget ? <BudgetBar spent={total} budget={group.budget} currency={cur} /> : null}
        {!personal && (
          // When nothing is owed, Invite is the useful action; Settle up stays one tap away as the secondary.
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link to={`/groups/${group.id}/settle`} className={settled ? 'btn-secondary' : 'btn-primary'} data-testid="group-settle">Settle up</Link>
            <button type="button" className={settled ? 'btn-primary' : 'btn-secondary'} onClick={() => setInvite(true)} data-testid="group-invite">Invite</button>
          </div>
        )}
      </div>

      {!personal && hasTripWindow(group) && <TripAutoCapture group={group} />}

      {!personal && (
        <div className="mb-4">
          <Segmented<Tab> value={tab} onChange={setTab} label="Section" testId="group-tabs" options={[{ value: 'expenses', label: 'Expenses' }, { value: 'balances', label: 'Balances' }, { value: 'activity', label: 'Activity' }]} />
        </div>
      )}

      {(tab === 'expenses' || personal) && <ActivityList group={group} expenses={d.expenses} settlements={d.settlements} me={me} currency={cur} name={name} personal={personal} />}

      {tab === 'activity' && !personal && <ActivityTab group={group} expenseIds={new Set(d.expenses.map((e) => e.id))} />}

      {tab === 'balances' && !personal && (
        <div className="space-y-4">
          {(d.pending.length > 0 || d.disputed.length > 0) && (
            <div className="card space-y-1 p-3 text-xs text-slate-600 dark:text-slate-300">
              {d.pending.length > 0 && <div>{d.pending.length} expense{d.pending.length > 1 ? 's' : ''} waiting for an OK {d.pending.length > 1 ? 'are' : 'is'} <b>not</b> counted yet.</div>}
              {d.disputed.length > 0 && <div>Includes {d.disputed.length} flagged expense{d.disputed.length > 1 ? 's' : ''} (still counted until the flagger resolves it).</div>}
            </div>
          )}
          <ul className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5" aria-label="Balances per person">
            {Object.entries(group.members).map(([id, m]) => {
              const v = net[id] ?? 0
              const canRemove = id !== me && creator && v === 0
              return (
                <li key={id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={m.name} color={m.color} size={36} />
                  <div className="min-w-0 flex-1 truncate font-medium">{id === me ? 'You' : m.name}</div>
                  <div className={`text-right text-sm font-semibold ${v > 0 ? 'pos' : v < 0 ? 'neg' : 'text-muted'}`}>
                    {v === 0 ? 'settled' : `${v > 0 ? 'gets back' : 'owes'} ${formatMoney(Math.abs(v), cur)}`}
                  </div>
                  {canRemove && (
                    <button type="button" onClick={() => removeMember(id)} className="text-muted -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:text-rose-600" aria-label={`Remove ${m.name} from the group`}><UserMinus size={18} aria-hidden /></button>
                  )}
                </li>
              )
            })}
          </ul>
          <div>
            <h2 className="text-muted mb-2 px-1 text-sm font-semibold">{group.simplify ? 'Suggested payments (simplified)' : 'Who owes whom'}</h2>
            {debts.length === 0 ? (
              <Empty emoji="🎉" title="Everyone is square" />
            ) : (
              <ul className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
                {debts.map((x, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-3">
                    <Avatar name={group.members[x.from]?.name ?? '?'} color={group.members[x.from]?.color ?? '#64748b'} size={32} />
                    <div className="min-w-0 flex-1 text-sm">
                      <b>{name(x.from)}</b> → <b>{name(x.to)}</b>
                      <div className="neg font-semibold">{formatMoney(x.amount, cur)}</div>
                    </div>
                    {x.to === me && <button type="button" onClick={() => remind(x.from, x.amount)} className="text-muted flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-ink-800" aria-label={`Remind ${name(x.from)}`}><Bell size={18} aria-hidden /></button>}
                    <Link to={`/groups/${group.id}/settle?from=${x.from}&to=${x.to}&amount=${x.amount}`} className="chip min-h-10">Settle</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <GraphSection d={d} />
        </div>
      )}

      <Sheet open={invite} onClose={() => setInvite(false)} title="Invite to group">
        <p className="text-muted text-sm">Anyone with this link can join <b>{group.name}</b> and claim their name in the member list.</p>
        <div className="mt-4 flex flex-col items-center rounded-2xl bg-slate-100 p-4 text-center dark:bg-ink-800">
          <QrCode value={inviteUrl} size={180} label={`QR code to join ${group.name}`} />
          <div className="text-muted mt-1.5 text-xs">Friends next to you can scan this with their phone camera</div>
          <div className="text-muted mt-4 text-xs font-semibold uppercase tracking-wider">Invite code</div>
          <div className="mt-1 font-mono text-3xl font-extrabold tracking-[0.3em]">{group.inviteCode}</div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary" onClick={async () => toast((await copy(inviteUrl)) ? 'Link copied' : 'Copy failed', 'ok')}>Copy link</button>
          <button type="button" className="btn-primary" onClick={() => shareOrCopy({ title: `Join ${group.name} on Split Now`, text: `Join “${group.name}” on Split Now to split expenses:`, url: inviteUrl })}>Share</button>
        </div>
      </Sheet>

      <Sheet open={menu} onClose={() => setMenu(false)} title={group.name} testId="group-menu-sheet">
        <ul className="-mx-2 divide-y divide-slate-100 dark:divide-white/5">
          <MenuRow icon={<Pencil size={20} />} label="Edit group" onClick={() => { setMenu(false); nav(`/groups/${group.id}/edit`) }} />
          {!personal && <MenuRow icon={<Link2 size={20} />} label="Invite" onClick={() => { setMenu(false); setInvite(true) }} />}
          <MenuRow icon={<BarChart3 size={20} />} label="Insights" onClick={() => { setMenu(false); nav(`/insights?group=${group.id}`) }} />
          <MenuRow icon={<Download size={20} />} label="Export CSV" onClick={exportCsv} testId="group-export" />
          <MenuRow icon={<Archive size={20} />} label={group.archived ? 'Unarchive' : 'Archive'} hint={group.archived ? 'Back into your balances and pickers' : 'Keeps it, but out of your balances and pickers'} onClick={() => setArchived(!group.archived)} testId="group-archive" />
          {!personal && !creator && me && <MenuRow icon={<LogOut size={20} />} label="Leave group" hint={myBal === 0 ? undefined : 'Settle up first'} onClick={() => removeMember(me)} tone="danger" testId="group-leave" />}
          {creator && <MenuRow icon={<Trash2 size={20} />} label="Delete group" hint="For everyone, with all its expenses" onClick={deleteGroup} tone="danger" testId="group-delete" disabled={deleted} />}
        </ul>
      </Sheet>
    </div>
  )
}

function MenuRow({ icon, label, hint, onClick, tone, testId, disabled }: { icon: React.ReactNode; label: string; hint?: string; onClick: () => void; tone?: 'danger'; testId?: string; disabled?: boolean }) {
  return (
    <li>
      <button type="button" onClick={onClick} disabled={disabled} data-testid={testId} className={`flex min-h-14 w-full items-center gap-3 px-2 py-2.5 text-left disabled:opacity-50 ${tone === 'danger' ? 'text-rose-700 dark:text-rose-400' : ''}`}>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${tone === 'danger' ? 'bg-rose-50 dark:bg-rose-500/10' : 'bg-slate-100 text-slate-700 dark:bg-ink-800 dark:text-slate-200'}`} aria-hidden>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{label}</span>
          {hint && <span className="text-muted block text-xs">{hint}</span>}
        </span>
        <ChevronRight size={18} className="text-slate-300 dark:text-slate-600" aria-hidden />
      </button>
    </li>
  )
}

function BudgetBar({ spent, budget, currency }: { spent: number; budget: number; currency: string }) {
  const pct = Math.min(100, (spent / budget) * 100)
  const over = spent > budget
  const status = over ? `${formatMoney(spent - budget, currency)} over` : `${formatMoney(budget - spent, currency)} left`
  return (
    <div className="mt-4">
      <div className="text-muted mb-1 flex justify-between text-xs font-medium">
        <span>Budget {formatMoney(budget, currency)}</span>
        <span className={over ? 'neg' : ''}>{status}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-ink-800" role="progressbar" aria-label="Budget used" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={Math.min(spent, budget)} aria-valuetext={`${formatMoney(spent, currency)} of ${formatMoney(budget, currency)}, ${status}`}>
        <div className={`h-full rounded-full ${over ? 'bg-rose-600' : pct > 80 ? 'bg-amber-600' : 'bg-gradient-to-r from-brand-500 to-duo-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** The debt graph lives under Balances now (it is the same data drawn differently). */
function GraphSection({ d }: { d: ReturnType<typeof computeGroupData> }) {
  const simplified = useMemo(() => simplifyDebts(d.net), [d.net])
  const [view, setView] = useState<'raw' | 'simple'>('simple')
  const saved = d.rawDebts.length - simplified.length
  if (d.rawDebts.length === 0) return null
  return (
    <Collapsible title="Show as a graph" summary={saved > 0 ? `Simplifying saves ${saved} payment${saved > 1 ? 's' : ''}` : 'Who pays whom, drawn out'} className="!mt-0" testId="group-graph">
      <Segmented value={view} onChange={setView} label="Graph view" options={[{ value: 'raw', label: `Original (${d.rawDebts.length})` }, { value: 'simple', label: `Simplified (${simplified.length})` }]} />
      <div className="mt-4"><DebtGraph group={d.group} debts={view === 'raw' ? d.rawDebts : simplified} /></div>
      <div className="mt-2 rounded-2xl bg-brand-50 p-3 text-center text-sm text-brand-900 dark:bg-brand-900/30 dark:text-brand-100">
        {saved > 0
          ? <>Simplifying removes <b>{saved}</b> payment{saved > 1 ? 's' : ''}. Everyone ends up with exactly the same balance.</>
          : <>These debts are already as simple as they get.</>}
        {!d.group.simplify && saved > 0 && <div className="mt-1 text-xs">Turn on <b>Simplify debts</b> in Edit group to use this.</div>}
      </div>
    </Collapsible>
  )
}

function ActivityTab({ group, expenseIds }: { group: Group; expenseIds: Set<string> }) {
  const feed = useActivity(group.id)
  const trash = useTrash(group)
  const [open, setOpen] = useState(false)
  const n = trash ? trash.expenses.length + trash.settlements.length : 0
  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setOpen(true)} className="card flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left text-sm">
        <Trash2 size={18} className="text-muted" aria-hidden />
        <span className="flex-1 font-medium">Recently deleted</span>
        <span className="text-muted">{n || 'empty'}</span>
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
    const k = formatDate(date, { month: 'long', year: 'numeric' })
    byMonth.set(k, [...(byMonth.get(k) ?? []), r])
  }
  const filters = (
    <div className="space-y-2">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          type="search"
          className="input !py-2.5 pl-10 pr-12"
          placeholder="Search expenses and notes"
          aria-label="Search expenses"
          value={filter.q}
          onChange={(e) => setFilter((p) => ({ ...p, q: e.target.value }))}
        />
        {filter.q && (
          <button type="button" onClick={() => setFilter((p) => ({ ...p, q: '' }))} className="text-muted absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full" aria-label="Clear search"><X size={16} aria-hidden /></button>
        )}
      </div>
      {(usedCategories.length > 1 || (!personal && me)) && (
        <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 py-1">
          {!personal && me && (
            <button type="button" onClick={() => setOnlyMe(!onlyMe)} className={`chip min-h-10 shrink-0 whitespace-nowrap ${onlyMe ? 'chip-on' : ''}`} aria-pressed={onlyMe}>Involving me</button>
          )}
          {usedCategories.length > 1 && usedCategories.map((c) => {
            const on = filter.categories.includes(c)
            return (
              <button type="button" key={c} onClick={() => toggleCat(c)} className={`chip min-h-10 shrink-0 whitespace-nowrap ${on ? 'chip-on' : ''}`} aria-pressed={on}>
                <span aria-hidden>{CATEGORIES[c].emoji}</span>{CATEGORIES[c].label}
              </button>
            )
          })}
        </div>
      )}
      {filtering && (
        <div className="text-muted flex items-center justify-between px-1 text-xs">
          <span>{rows.length} of {all} shown</span>
          <button type="button" onClick={clear} className="min-h-9 font-semibold text-brand-600 dark:text-brand-300">Clear filters</button>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-5">
      {filters}
      {rows.length === 0 && <Empty emoji="🔎" title="No matches">Try a different search or clear the filters.</Empty>}
      {[...byMonth].map(([month, list]) => (
        <section key={month} aria-label={month}>
          <h2 className="text-muted mb-2 px-1 text-xs font-bold uppercase tracking-wider">{month}</h2>
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
            {list.map((r) => {
              if (r.kind === 's') {
                return (
                  <div key={r.s.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-xl dark:bg-emerald-500/15" aria-hidden>💸</div>
                    <div className="min-w-0 flex-1 text-sm"><b>{name(r.s.from)}</b> paid <b>{name(r.s.to)}</b><div className="text-muted text-xs">{methodLabel(r.s.method)} · {formatDate(r.s.date)}</div></div>
                    <div className="pos font-semibold">{formatMoney(r.s.amount, currency)}</div>
                    <button type="button" onClick={() => undoable.settlement(groupId, r.s)} className="text-muted -mr-3 flex h-11 w-11 items-center justify-center rounded-full hover:text-rose-600" aria-label="Delete payment"><Trash2 size={16} aria-hidden /></button>
                  </div>
                )
              }
              const e = r.e
              const payers = Object.keys(e.paidBy)
              const delta = me ? (e.paidBy[me] ?? 0) - (e.splits[me] ?? 0) : 0
              return (
                <Link key={e.id} to={`/groups/${groupId}/expenses/${e.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50 dark:active:bg-ink-800">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl" style={{ background: `${CATEGORIES[e.category].color}22` }} aria-hidden>{CATEGORIES[e.category].emoji}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{e.description}</span>
                      {e.recurrence && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200" title={`Repeats ${FREQ_LABEL[e.recurrence.freq].toLowerCase()}`}>
                          <Repeat size={10} strokeWidth={3} aria-hidden />{FREQ_LABEL[e.recurrence.freq]}
                        </span>
                      )}
                      {e.recurringFrom && !e.recurrence && <Repeat size={12} className="text-muted shrink-0" role="img" aria-label="Repeating expense" />}
                      <TrustBadges e={e} group={group} />
                    </div>
                    <div className="text-muted truncate text-xs">
                      {personal ? formatDate(e.date) : <>{payers.length > 1 ? `${payers.length} people` : name(payers[0])} paid {formatMoney(e.amount, currency)} · {formatDate(e.date)}</>}
                    </div>
                  </div>
                  <div className="text-right">
                    {personal ? (
                      <div className="font-semibold">{formatMoney(e.amount, currency)}</div>
                    ) : delta === 0 ? (
                      <div className="text-muted text-xs">{me && e.splits[me] === undefined && !e.paidBy[me] ? 'not involved' : 'even'}</div>
                    ) : (
                      <>
                        <div className={`text-xs ${delta > 0 ? 'pos' : 'neg'}`}>{delta > 0 ? 'you lent' : 'you borrowed'}</div>
                        <div className={`font-semibold ${delta > 0 ? 'pos' : 'neg'}`}>{formatMoney(Math.abs(delta), currency)}</div>
                      </>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

/**
 * "Trip auto-capture" row: a switch that pauses capture for the trip (group.captureOff, for every
 * member; the webhook skips the trip) and the link to the SMS wizard scoped to this trip.
 */
function TripAutoCapture({ group }: { group: Group }) {
  const toast = useToast()
  const off = !!group.captureOff
  const set = (on: boolean) => {
    repo.updateGroupSettings(group, { captureOff: on ? undefined : true }).catch((e) => toast(errText(e), 'err'))
    toast(on ? `Auto-capture on for ${group.name}` : `Auto-capture paused for ${group.name}`)
  }
  return (
    <div className="card mb-4 flex items-center gap-3 px-4 py-3" data-testid="trip-auto-capture">
      <MessageSquareText size={22} className={`shrink-0 ${off ? 'text-muted' : 'text-brand-600 dark:text-brand-300'}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">Trip auto-capture{off ? ' · paused' : ''}</div>
        <Link to={`/settings/auto-capture?group=${group.id}`} className="text-muted flex min-h-6 items-center gap-0.5 text-xs">
          {off ? 'Debit SMS during this trip are skipped for everyone' : 'Debit SMS during the trip ask to be added here'} · <span className="font-semibold text-brand-600 dark:text-brand-300">Set up</span><ChevronRight size={14} aria-hidden />
        </Link>
      </div>
      <Switch checked={!off} onChange={set} label={`Auto-capture for ${group.name}`} testId="trip-capture-switch" />
    </div>
  )
}
