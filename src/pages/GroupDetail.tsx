import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Archive,
  BarChart3,
  CheckCheck,
  ChevronRight,
  Download,
  Flag,
  Link2,
  LogOut,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Repeat,
  Search,
  Trash2,
  UserMinus,
  Users,
  X,
} from 'lucide-react'
import { useMe } from '@/hooks/auth'
import { computeGroupData, useActivity, useCaptureTokens, useClaimedPayLinks, useExpenses, useGroup, useSettlements, useTrash } from '@/hooks/data'
import { useCapturePrefs } from '@/hooks/useCapturePrefs'
import { useFlag } from '@/hooks/useAppConfig'
import type { Category, Expense, Group, Settlement } from '@/types'
import { claimsInGroup } from '@/lib/paylinks'
import { ClaimReview } from '@/components/ClaimReview'
import { formatMoney } from '@/lib/money'
import { groupSettleTarget } from '@/lib/settleAll'
import { archiveRow } from '@/lib/archive'
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
import { saveCapturePrefs, tripCaptureNotice } from '@/lib/capture-settings'
import { setTripPaused } from '@/lib/capture-filters'
import * as payments from '@/lib/payments'
import { turnLine, whoseTurn } from '@/lib/fairness'
import { budgetStatus } from '../../shared/budget'
import { Avatar } from '@/components/Avatar'
import { ChequeIcon } from '@/components/ChequeIcon'
import { DebtGraph } from '@/components/DebtGraph'
import { GroupIcon } from '@/components/GroupIcon'
import { QrCode } from '@/components/QrCode'
import { Empty, LiveBadge, Loading, PageHeader, Segmented, formatRange } from '@/components/Misc'
import { Celebrate } from '@/components/Celebrate'
import { CardSkeleton, ListSkeleton } from '@/components/Skeleton'
import { Collapsible } from '@/components/Collapsible'
import { hasTripWindow, isLiveTrip, tripCaptureRelevant } from '@/lib/capture'
import { Sheet } from '@/components/Sheet'
import { useConfirm } from '@/components/ConfirmSheet'
import { repo } from '@/data'
import { useToast } from '@/components/Toast'
import { ActivityFeed, RecentlyDeleted, TrustBadges, useUndoableDelete } from '@/components/Trust'
import { PaymentPill, ProofButton, usePaymentAnswers } from '@/components/PaymentOk'
import { paymentState } from '@/lib/trust'
import { RemindActions } from '@/components/RemindActions'
import { SwipeRow } from '@/components/SwipeRow'
import { useRemoveMember } from '@/hooks/useRemoveMember'
import { activeMembers, isRemoved, listedMemberIds, memberRemoval, membersIn, repeatingByMember } from '@/lib/members'

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
  // The feed is the same shared listener the Activity tab and Home use; here it says who was nudged today.
  const feed = useActivity(groupId)
  const whoseTurnOn = useFlag('whoseTurn')
  usePageTitle(liveGroup ? liveGroup.name : liveGroup === null ? 'Group not found' : undefined)

  const d = useMemo(
    () => (liveGroup && expenses && settlements ? computeGroupData(liveGroup, expenses, settlements, user.uid) : null),
    [liveGroup, expenses, settlements, user.uid],
  )
  const removeMember = useRemoveMember(d)

  if (liveGroup === null)
    return (
      <>
        <PageHeader title="Group not found" back="/groups" />
        <Empty emoji="🔍" title="This group doesn’t exist or you’re not a member" />
      </>
    )
  if (!d)
    return (
      <>
        <PageHeader title={liveGroup?.name ?? ' '} back="/groups" />
        <div className="space-y-4" role="status" aria-label="Loading">
          <CardSkeleton className="h-40" />
          <ListSkeleton rows={4} />
        </div>
      </>
    )

  const { me, net, debts, group } = d
  const cur = group.currency
  const myBal = me ? (net[me] ?? 0) : 0
  const personal = group.type === 'personal'
  const total = d.expenses.reduce((s, e) => s + e.amount, 0)
  const name = (id: string) => (id === me ? 'You' : (group.members[id]?.name ?? 'Someone'))
  const inviteUrl = `${location.origin}/join/${group.inviteCode}`
  const creator = group.createdBy === user.uid
  const fail = (e: unknown) => toast(errText(e), 'err')
  // A private hint for the next bill (src/lib/fairness.ts): never pushed, never a score.
  const turn = whoseTurnOn && !personal && !group.archived ? whoseTurn({ group, expenses: d.expenses }) : null

  const exportCsv = async () => {
    setMenu(false)
    try {
      const r = await deliverCsv(csvFilename(group.name, todayISO()), groupCsv(group, d.expenses, d.settlements))
      if (r === 'downloaded') toast('CSV downloaded')
    } catch (e) {
      toast(`Export failed: ${errText(e)}`, 'err')
    }
  }

  // Archiving is personal (only for you) and needs you to be square first (archiveRow).
  const setArchived = async (archived: boolean) => {
    setMenu(false)
    try {
      await repo.setArchived(group, archived)
      toast(
        archived ? `${group.name} archived for you` : `${group.name} restored`,
        'ok',
        archived
          ? {
              action: {
                label: 'Undo',
                run: () => {
                  repo.setArchived(group, false).catch(fail)
                },
              },
            }
          : undefined,
      )
    } catch (e) {
      fail(e)
    }
  }

  const deleteGroup = async () => {
    setMenu(false)
    const ok = await confirm({
      title: `Delete “${group.name}”?`,
      message: 'Every expense and payment in it goes too. This cannot be undone.',
      confirmLabel: 'Delete group',
      tone: 'danger',
    })
    if (!ok) return
    setDeleted(true)
    try {
      await repo.deleteGroup(group.id)
      toast('Group deleted')
      nav('/groups', { replace: true })
    } catch (e) {
      setDeleted(false)
      fail(e)
    }
  }

  const settled = myBal === 0
  const pendingIds = membersIn(d.pending)
  const archive = archiveRow({
    archived: !!group.archived,
    personal,
    myBalance: myBal,
    waitingOnYou: me ? d.pending.filter((e) => membersIn([e]).has(me)).length + d.waiting.filter((s) => s.from === me || s.to === me).length : 0,
  })
  const repeating = repeatingByMember(d.expenses)
  const people = Object.entries(activeMembers(group.members))

  return (
    <div>
      <PageHeader
        back="/groups"
        title={group.name}
        right={
          <button
            type="button"
            onClick={() => setMenu(true)}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-200/60 dark:hover:bg-ink-800"
            aria-label="More"
            aria-haspopup="dialog"
            data-testid="group-menu"
          >
            <MoreHorizontal size={22} aria-hidden />
          </button>
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
            {debts
              .filter((x) => x.from === me || x.to === me)
              .slice(0, 3)
              .map((x) => (
                <div key={`${x.from}-${x.to}`}>
                  {x.from === me ? (
                    <>
                      You owe <b>{name(x.to)}</b> <span className="neg font-semibold">{formatMoney(x.amount, cur)}</span>
                    </>
                  ) : (
                    <>
                      <b>{name(x.from)}</b> owes you <span className="pos font-semibold">{formatMoney(x.amount, cur)}</span>
                    </>
                  )}
                </div>
              ))}
          </div>
        )}
        {(hasTripWindow(group) || group.archived || turn) && (
          <div className="text-muted mt-3 flex flex-wrap items-center gap-2 text-sm">
            {hasTripWindow(group) && <span>{formatRange(group.startDate, group.endDate)}</span>}
            {isLiveTrip(group, todayISO()) && <LiveBadge type={group.type} />}
            {group.archived && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold dark:bg-ink-800">Archived</span>}
            {turn && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"
                title="Who has fronted the least lately, only you can see this"
                data-testid="whose-turn"
              >
                <span aria-hidden>🍽️</span> {turnLine(turn, me)}
              </span>
            )}
          </div>
        )}
        {!personal && (
          <Link
            to={`/groups/${group.id}/members`}
            className="-mx-1 mt-3 flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-ink-800"
            data-testid="group-people"
          >
            <span className="flex -space-x-2" aria-hidden>
              {/* First in front, like AvatarStack, so every face shows the same sliver. */}
              {people.slice(0, 5).map(([id, m], i) => (
                <span key={id} className="relative rounded-full ring-2 ring-white dark:ring-ink-900" style={{ zIndex: 5 - i }}>
                  <Avatar name={m.name} color={m.color} photoURL={m.photoURL} size={26} />
                </span>
              ))}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {people.length} {people.length === 1 ? 'person' : 'people'}
            </span>
            <span className="text-muted text-xs">Members</span>
            <ChevronRight size={16} className="text-slate-300 dark:text-slate-600" aria-hidden />
          </Link>
        )}
        {group.budget ? <BudgetBar spent={total} budget={group.budget} currency={cur} /> : null}
        {!personal && (
          // When nothing is owed, Invite is the useful action; Settle up stays one tap away as the secondary.
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              className={settled ? 'btn-secondary' : 'btn-primary'}
              data-testid="group-settle"
              onClick={() => {
                // One payment of yours opens it; several open the list of them here (groupSettleTarget).
                const t = groupSettleTarget(group.id, debts, me)
                if ('href' in t) return nav(t.href)
                setTab('balances')
                requestAnimationFrame(() => document.getElementById('group-payments')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
              }}
            >
              <ChequeIcon size={22} /> Settle up
            </button>
            <button type="button" className={settled ? 'btn-primary' : 'btn-secondary'} onClick={() => setInvite(true)} data-testid="group-invite">
              <Link2 size={18} aria-hidden /> Invite
            </button>
          </div>
        )}
      </div>

      {tripCaptureRelevant(group, todayISO()) && <TripCaptureLine group={group} />}

      {!personal && <PendingClaims groupId={group.id} />}

      {!personal && (
        <div className="mb-4">
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            label="Section"
            testId="group-tabs"
            options={[
              { value: 'expenses', label: 'Expenses' },
              { value: 'balances', label: 'Balances' },
              { value: 'activity', label: 'Activity' },
            ]}
          />
        </div>
      )}

      {(tab === 'expenses' || personal) && (
        <ActivityList
          group={group}
          expenses={d.expenses}
          settlements={[...d.settlements, ...d.waiting]}
          me={me}
          currency={cur}
          name={name}
          personal={personal}
        />
      )}

      {tab === 'activity' && !personal && <ActivityTab group={group} expenseIds={new Set(d.expenses.map((e) => e.id))} />}

      {tab === 'balances' && !personal && (
        <div className="space-y-4">
          {(d.pending.length > 0 || d.disputed.length > 0) && (
            <div className="card space-y-1 p-3 text-xs text-slate-600 dark:text-slate-300">
              {d.pending.length > 0 && (
                <div>
                  {d.pending.length} expense{d.pending.length > 1 ? 's' : ''} waiting for an OK {d.pending.length > 1 ? 'are' : 'is'} <b>not</b> counted yet.
                </div>
              )}
              {d.disputed.length > 0 && (
                <div>
                  Includes {d.disputed.length} flagged expense{d.disputed.length > 1 ? 's' : ''} (still counted until the flagger resolves it).
                </div>
              )}
            </div>
          )}
          <ul className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5" aria-label="Balances per person">
            {listedMemberIds(group.members, net).map((id) => {
              const m = group.members[id]
              const v = net[id] ?? 0
              // Swipe left to remove a settled member (the same rule as the Members screen); never yourself here.
              const canRemove =
                id !== me &&
                memberRemoval({ memberId: id, member: m, me, myUid: user.uid, createdBy: group.createdBy, balance: v, inPending: pendingIds, repeating })
                  .kind === 'remove'
              return (
                <SwipeRow
                  key={id}
                  contentClassName="flex items-center gap-3 px-4 py-3"
                  testId="balance-row"
                  menuTitle={id === me ? 'You' : m.name}
                  actions={
                    canRemove
                      ? [
                          {
                            label: 'Remove',
                            ariaLabel: `Remove ${m.name} from the group`,
                            icon: <UserMinus size={20} strokeWidth={2.25} />,
                            onClick: () => void removeMember(id),
                            testId: 'balance-remove',
                          },
                        ]
                      : []
                  }
                >
                  <Avatar name={m.name} color={m.color} photoURL={m.photoURL} size={36} />
                  <div className="min-w-0 flex-1 truncate font-medium">
                    {id === me ? 'You' : m.name} {isRemoved(m) && <span className="text-muted text-xs">(left)</span>}
                  </div>
                  <div className={`text-right text-sm font-semibold ${v > 0 ? 'pos' : v < 0 ? 'neg' : 'text-muted'}`}>
                    {v === 0 ? 'settled' : `${v > 0 ? 'gets back' : 'owes'} ${formatMoney(Math.abs(v), cur)}`}
                  </div>
                </SwipeRow>
              )
            })}
          </ul>
          <div id="group-payments" className="scroll-mt-20">
            {/* With nothing to pay, the celebration below titles itself. */}
            {debts.length > 0 && (
              <h2 className="text-muted mb-2 px-1 text-sm font-semibold">{group.simplify ? 'Suggested payments (simplified)' : 'Who owes whom'}</h2>
            )}
            {debts.length === 0 ? (
              <GroupSettled group={group} />
            ) : (
              <ul className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
                {debts.map((x) => (
                  <li key={`${x.from}-${x.to}`} className="flex items-center gap-3 px-4 py-3">
                    <Avatar
                      name={group.members[x.from]?.name ?? '?'}
                      color={group.members[x.from]?.color ?? '#64748b'}
                      photoURL={group.members[x.from]?.photoURL}
                      size={32}
                    />
                    <div className="min-w-0 flex-1 text-sm">
                      <b>{name(x.from)}</b> → <b>{name(x.to)}</b>
                      <div className="neg font-semibold">{formatMoney(x.amount, cur)}</div>
                    </div>
                    {x.to === me && <RemindActions group={group} debtor={x.from} amount={x.amount} me={me} feed={feed} className="-mr-1" />}
                    {/* An icon button like Balances' record button; filled when it's your own payment to make. */}
                    <Link
                      to={`/groups/${group.id}/settle?from=${x.from}&to=${x.to}&amount=${x.amount}`}
                      aria-label={`Settle up: ${name(x.from)} pays ${name(x.to)} ${formatMoney(x.amount, cur)}`}
                      title="Settle up"
                      data-testid="debt-settle"
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95 ${x.from === me ? 'bg-fill text-on-fill shadow-sm' : 'bg-brand-50 text-brand-600 active:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-200 dark:active:bg-brand-900/70'}`}
                    >
                      <ChequeIcon size={24} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <GraphSection d={d} />
        </div>
      )}

      <Sheet open={invite} onClose={() => setInvite(false)} title="Invite to group">
        <p className="text-muted text-sm">
          Anyone with this link can join <b>{group.name}</b> and claim their name in the member list.
        </p>
        <div className="mt-4 flex flex-col items-center rounded-2xl bg-slate-100 p-4 text-center dark:bg-ink-800">
          <QrCode value={inviteUrl} size={180} label={`QR code to join ${group.name}`} />
          <div className="text-muted mt-1.5 text-xs">Friends next to you can scan this with their phone camera</div>
          <div className="text-muted mt-4 text-xs font-semibold uppercase tracking-wider">Invite code</div>
          <div className="mt-1 font-mono text-3xl font-extrabold tracking-[0.3em]">{group.inviteCode}</div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary" onClick={async () => toast((await copy(inviteUrl)) ? 'Link copied' : 'Copy failed', 'ok')}>
            Copy link
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() =>
              shareOrCopy({ title: `Join ${group.name} on Split Now`, text: `Join “${group.name}” on Split Now to split expenses:`, url: inviteUrl })
            }
          >
            Share
          </button>
        </div>
      </Sheet>

      <Sheet open={menu} onClose={() => setMenu(false)} title={group.name} testId="group-menu-sheet">
        <ul className="-mx-2 divide-y divide-slate-100 dark:divide-white/5">
          <MenuRow
            icon={<Pencil size={20} />}
            label="Edit group"
            onClick={() => {
              setMenu(false)
              nav(`/groups/${group.id}/edit`)
            }}
          />
          {!personal && (
            <MenuRow
              icon={<Users size={20} />}
              label="Members"
              hint="Add people, or remove someone who is settled up"
              onClick={() => {
                setMenu(false)
                nav(`/groups/${group.id}/members`)
              }}
              testId="group-members"
            />
          )}
          {!personal && (
            <MenuRow
              icon={<Link2 size={20} />}
              label="Invite"
              onClick={() => {
                setMenu(false)
                setInvite(true)
              }}
            />
          )}
          <MenuRow
            icon={<BarChart3 size={20} />}
            label="Insights"
            onClick={() => {
              setMenu(false)
              nav(`/insights?group=${group.id}`)
            }}
          />
          <MenuRow icon={<Download size={20} />} label="Export CSV" onClick={exportCsv} testId="group-export" />
          <MenuRow
            icon={<Archive size={20} />}
            label={archive.label}
            hint={archive.hint}
            disabled={archive.disabled}
            onClick={() => setArchived(!group.archived)}
            testId="group-archive"
          />
          {!personal && !creator && me && (
            <MenuRow
              icon={<LogOut size={20} />}
              label="Leave group"
              hint={myBal === 0 ? undefined : 'Settle up first'}
              onClick={() => {
                setMenu(false)
                void removeMember(me)
              }}
              tone="danger"
              testId="group-leave"
            />
          )}
          {creator && (
            <MenuRow
              icon={<Trash2 size={20} />}
              label="Delete group"
              hint="For everyone, with all its expenses"
              onClick={deleteGroup}
              tone="danger"
              testId="group-delete"
              disabled={deleted}
            />
          )}
        </ul>
      </Sheet>
    </div>
  )
}

function MenuRow({
  icon,
  label,
  hint,
  onClick,
  tone,
  testId,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  onClick: () => void
  tone?: 'danger'
  testId?: string
  disabled?: boolean
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        data-testid={testId}
        className={`flex min-h-14 w-full items-center gap-3 px-2 py-2.5 text-left disabled:opacity-50 ${tone === 'danger' ? 'text-rose-700 dark:text-rose-400' : ''}`}
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${tone === 'danger' ? 'bg-rose-50 dark:bg-rose-500/10' : 'bg-slate-100 text-slate-700 dark:bg-ink-800 dark:text-slate-200'}`}
          aria-hidden
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{label}</span>
          {hint && <span className="text-muted block text-xs">{hint}</span>}
        </span>
        <ChevronRight size={18} className="text-slate-300 dark:text-slate-600" aria-hidden />
      </button>
    </li>
  )
}

/** The budget bar; its 80% / 100% marks are the same thresholds the server's push alerts use (shared/budget.ts). */
function BudgetBar({ spent, budget, currency }: { spent: number; budget: number; currency: string }) {
  const s = budgetStatus(spent, budget, (v) => formatMoney(v, currency))
  const width = Math.min(100, s.pct)
  return (
    <div className="mt-4" data-testid="budget-bar">
      <div className="text-muted mb-1 flex items-center justify-between gap-2 text-xs font-medium">
        <span>Budget {formatMoney(budget, currency)}</span>
        <span className="flex items-center gap-1.5">
          {s.threshold && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold ${s.tone === 'over' ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200'}`}
            >
              {s.short}
            </span>
          )}
          <span className={s.tone === 'over' ? 'neg' : ''}>{s.label}</span>
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-ink-800"
        role="progressbar"
        aria-label="Budget used"
        aria-valuemin={0}
        aria-valuemax={budget}
        aria-valuenow={Math.min(spent, budget)}
        aria-valuetext={`${formatMoney(spent, currency)} of ${formatMoney(budget, currency)}, ${s.label}${s.threshold ? `, ${s.short}` : ''}`}
      >
        <div
          className={`h-full rounded-full ${s.tone === 'over' ? 'bg-rose-600' : s.tone === 'near' ? 'bg-amber-600' : 'bg-gradient-to-r from-brand-500 to-duo-500'}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}

/**
 * Nobody in the group owes anyone: the same party-popper celebration as the Balances screen, for
 * this group. Settle up lands here too when there's nothing to settle (groupSettleTarget); a
 * payment made outside the app can still be recorded.
 */
function GroupSettled({ group }: { group: Group }) {
  return (
    <div className="card flex flex-col items-center px-6 pb-6 pt-8 text-center" data-testid="group-settled">
      <Celebrate />
      <h3 className="mt-4 text-xl font-extrabold tracking-tight">Everyone’s square in {group.name}</h3>
      <p className="text-muted mt-1 max-w-xs text-sm">Nobody owes anyone here.</p>
      <Link
        to={`/groups/${group.id}/settle`}
        className="mt-3 inline-flex min-h-11 items-center px-2 text-sm font-semibold text-brand-600 dark:text-brand-300"
        data-testid="group-settled-record"
      >
        Record a payment
      </Link>
    </div>
  )
}

/**
 * The debt graph lives under Balances now (it is the same data drawn differently). It opens on
 * the view the group uses, so with Simplify debts off it shows the payments as they are, the same
 * as the list above it; Simplified stays one tap away as a comparison. It follows the setting if
 * someone changes it while the graph is open.
 */
function GraphSection({ d }: { d: ReturnType<typeof computeGroupData> }) {
  const simplified = useMemo(() => simplifyDebts(d.net), [d.net])
  const groupView = d.group.simplify ? 'simple' : 'raw'
  const [view, setView] = useState<'raw' | 'simple'>(groupView)
  useEffect(() => setView(groupView), [groupView])
  const saved = d.rawDebts.length - simplified.length
  if (d.rawDebts.length === 0) return null
  return (
    <Collapsible
      title="Show as a graph"
      summary={saved > 0 ? `Simplifying saves ${saved} payment${saved > 1 ? 's' : ''}` : 'Who pays whom, drawn out'}
      className="!mt-0"
      testId="group-graph"
    >
      <Segmented
        value={view}
        onChange={setView}
        label="Graph view"
        options={[
          { value: 'raw', label: `Original (${d.rawDebts.length})` },
          { value: 'simple', label: `Simplified (${simplified.length})` },
        ]}
      />
      <div className="mt-4">
        <DebtGraph group={d.group} debts={view === 'raw' ? d.rawDebts : simplified} />
      </div>
      <div className="mt-2 rounded-2xl bg-brand-50 p-3 text-center text-sm text-brand-900 dark:bg-brand-900/30 dark:text-brand-100">
        {saved > 0 ? (
          <>
            Simplifying removes <b>{saved}</b> payment{saved > 1 ? 's' : ''}. Everyone ends up with exactly the same balance.
          </>
        ) : (
          <>These debts are already as simple as they get.</>
        )}
        {!d.group.simplify && saved > 0 && (
          <div className="mt-1 text-xs">
            Turn on <b>Simplify debts</b> in Edit group to use this.
          </div>
        )}
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
      {feed === null ? (
        <Loading />
      ) : feed.length === 0 ? (
        <Empty emoji="📜" title="No activity yet">
          Adds, edits, deletions and flags show up here.
        </Empty>
      ) : (
        <ActivityFeed entries={feed} linkable={(a) => expenseIds.has(a.targetId) || !!trash?.expenses.some((e) => e.id === a.targetId)} />
      )}
      <RecentlyDeleted group={group} open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

function ActivityList({
  group,
  expenses,
  settlements,
  me,
  currency,
  name,
  personal,
}: {
  group: Group
  expenses: Expense[]
  settlements: Settlement[]
  me?: string
  currency: string
  name: (id: string) => string
  personal: boolean
}) {
  const groupId = group.id
  const undoable = useUndoableDelete()
  const answers = usePaymentAnswers()
  const { user } = useMe()
  const navTo = useNavigate()
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
  const clear = () => {
    setFilter(EMPTY_FILTER)
    setOnlyMe(false)
  }

  type Row = { kind: 'e'; e: Expense } | { kind: 's'; s: Settlement }
  const all = expenses.length + settlements.length
  const rows: Row[] = [
    ...expenses.filter((e) => expenseMatches(e, f)).map((e) => ({ kind: 'e' as const, e })),
    ...settlements.filter((s) => settlementMatches(s, f, name)).map((s) => ({ kind: 's' as const, s })),
  ].sort((a, b) => {
    const da = a.kind === 'e' ? a.e.date : a.s.date,
      db = b.kind === 'e' ? b.e.date : b.s.date
    const ca = a.kind === 'e' ? a.e.createdAt : a.s.createdAt,
      cb = b.kind === 'e' ? b.e.createdAt : b.s.createdAt
    return db.localeCompare(da) || cb - ca
  })
  if (all === 0)
    return (
      <Empty emoji="🧾" title="No expenses yet">
        Tap the + button to add the first one, or scan a receipt.
      </Empty>
    )

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
          <button
            type="button"
            onClick={() => setFilter((p) => ({ ...p, q: '' }))}
            className="text-muted absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full"
            aria-label="Clear search"
          >
            <X size={16} aria-hidden />
          </button>
        )}
      </div>
      {(usedCategories.length > 1 || (!personal && me)) && (
        <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 py-1">
          {!personal && me && (
            <button
              type="button"
              onClick={() => setOnlyMe(!onlyMe)}
              className={`chip min-h-10 shrink-0 whitespace-nowrap ${onlyMe ? 'chip-on' : ''}`}
              aria-pressed={onlyMe}
            >
              Involving me
            </button>
          )}
          {usedCategories.length > 1 &&
            usedCategories.map((c) => {
              const on = filter.categories.includes(c)
              return (
                <button
                  type="button"
                  key={c}
                  onClick={() => toggleCat(c)}
                  className={`chip min-h-10 shrink-0 whitespace-nowrap ${on ? 'chip-on' : ''}`}
                  aria-pressed={on}
                >
                  <span aria-hidden>{CATEGORIES[c].emoji}</span>
                  {CATEGORIES[c].label}
                </button>
              )
            })}
        </div>
      )}
      {filtering && (
        <div className="text-muted flex items-center justify-between px-1 text-xs">
          <span>
            {rows.length} of {all} shown
          </span>
          <button type="button" onClick={clear} className="min-h-9 font-semibold text-brand-600 dark:text-brand-300">
            Clear filters
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-5">
      {filters}
      {rows.length === 0 && (
        <Empty emoji="🔎" title="No matches">
          Try a different search or clear the filters.
        </Empty>
      )}
      {[...byMonth].map(([month, list]) => (
        <section key={month} aria-label={month}>
          <h2 className="text-muted mb-2 px-1 text-xs font-bold uppercase tracking-wider">{month}</h2>
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
            {list.map((r) => {
              if (r.kind === 's') {
                const ps = paymentState(r.s, group, user.uid)
                // The recipient's answers come first on a payment that needs their OK.
                const answerActions = !ps.canDecide
                  ? []
                  : [
                      ...(ps.pill === 'needs-ok' || ps.pill === 'flagged'
                        ? [
                            {
                              label: 'Confirm',
                              ariaLabel: 'Confirm you got this payment',
                              icon: <CheckCheck size={20} strokeWidth={2.25} />,
                              tone: 'accent' as const,
                              onClick: () => answers.confirm(r.s),
                              testId: 'payment-confirm',
                            },
                          ]
                        : []),
                      ...(ps.pill !== 'flagged'
                        ? [
                            {
                              label: 'Not received',
                              ariaLabel: 'Say this payment hasn’t arrived',
                              icon: <Flag size={20} strokeWidth={2.25} />,
                              tone: 'neutral' as const,
                              onClick: () => answers.notReceived(r.s),
                              testId: 'payment-not-received',
                            },
                          ]
                        : []),
                    ]
                return (
                  <SwipeRow
                    key={r.s.id}
                    as="div"
                    contentClassName="flex items-center gap-3 px-4 py-3"
                    testId="payment-row"
                    menuTitle={`${name(r.s.from)} paid ${name(r.s.to)}`}
                    actions={[
                      ...answerActions,
                      {
                        label: 'Delete',
                        ariaLabel: 'Delete payment',
                        icon: <Trash2 size={20} strokeWidth={2.25} />,
                        onClick: () => undoable.settlement(groupId, r.s),
                        testId: 'payment-delete',
                      },
                    ]}
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-xl dark:bg-emerald-500/15" aria-hidden>
                      💸
                    </div>
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span>
                          <b>{name(r.s.from)}</b> paid <b>{name(r.s.to)}</b>
                        </span>
                        <PaymentPill state={ps} />
                      </div>
                      <div className="text-muted text-xs">
                        {methodLabel(r.s.method)} · {formatDate(r.s.date)}
                        {r.s.paid && <> · paid {formatMoney(r.s.paid.amount, r.s.paid.currency)}</>}
                        {r.s.proofPath && (
                          <>
                            {' · '}
                            <ProofButton s={r.s} />
                          </>
                        )}
                        {r.s.payLink && (
                          <>
                            {' · '}
                            <Link
                              to={`/r/${r.s.payLink}`}
                              className="inline-flex min-h-6 items-center font-semibold text-brand-600 underline dark:text-brand-300"
                            >
                              Pay me link
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                    <div className={`font-semibold ${ps.pill === 'needs-ok' || ps.pill === 'flagged' ? 'text-muted line-through decoration-1' : 'pos'}`}>
                      {formatMoney(r.s.amount, currency)}
                    </div>
                  </SwipeRow>
                )
              }
              const e = r.e
              const payers = Object.keys(e.paidBy)
              const delta = me ? (e.paidBy[me] ?? 0) - (e.splits[me] ?? 0) : 0
              return (
                <SwipeRow
                  key={e.id}
                  as="div"
                  testId="expense-row"
                  menuTitle={e.description}
                  actions={[
                    {
                      label: 'Edit',
                      ariaLabel: `Edit ${e.description}`,
                      icon: <Pencil size={20} strokeWidth={2.25} />,
                      tone: 'neutral',
                      onClick: () => navTo(`/groups/${groupId}/expenses/${e.id}/edit`),
                      testId: 'expense-edit',
                    },
                    {
                      label: 'Delete',
                      ariaLabel: `Delete ${e.description}`,
                      icon: <Trash2 size={20} strokeWidth={2.25} />,
                      onClick: () => undoable.expense(groupId, e),
                      testId: 'expense-delete',
                    },
                  ]}
                >
                  <Link to={`/groups/${groupId}/expenses/${e.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50 dark:active:bg-ink-800">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl"
                      style={{ background: `${CATEGORIES[e.category].color}22` }}
                      aria-hidden
                    >
                      {CATEGORIES[e.category].emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{e.description}</span>
                        {e.recurrence && (
                          <span
                            className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
                            title={`Repeats ${FREQ_LABEL[e.recurrence.freq].toLowerCase()}`}
                          >
                            <Repeat size={10} strokeWidth={3} aria-hidden />
                            {FREQ_LABEL[e.recurrence.freq]}
                          </span>
                        )}
                        {e.recurringFrom && !e.recurrence && <Repeat size={12} className="text-muted shrink-0" role="img" aria-label="Repeating expense" />}
                        <TrustBadges e={e} group={group} />
                      </div>
                      <div className="text-muted truncate text-xs">
                        {personal ? (
                          formatDate(e.date)
                        ) : (
                          <>
                            {payers.length > 1 ? `${payers.length} people` : name(payers[0])} paid {formatMoney(e.amount, currency)} · {formatDate(e.date)}
                          </>
                        )}
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
                </SwipeRow>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

/**
 * A thin card of its own under the group's header card about this person's own trip auto-capture (capture is set up
 * per phone, so pausing is their choice and leaves no group activity): "on for you · Pause",
 * "Paused for you · Resume" (Undo toast), or, with no key covering the trip, a link to the SMS
 * wizard scoped to it. tripCaptureNotice decides which, and when there is nothing to say.
 */
function TripCaptureLine({ group }: { group: Group }) {
  const { user } = useMe()
  const toast = useToast()
  const prefs = useCapturePrefs()
  const tokens = useCaptureTokens()
  const enabled = useFlag('autoCapture')
  if (!prefs || !tokens) return null
  const notice = tripCaptureNotice(group, todayISO(), { tokens, pausedTrips: prefs.pausedTrips, capturePaused: prefs.capturePaused, enabled })
  if (!notice) return null

  const save = (pausedTrips: string[]) => saveCapturePrefs(user.uid, repo.mode, { pausedTrips }).catch((e) => toast(errText(e), 'err'))
  const toggle = () => {
    const before = prefs.pausedTrips
    const pause = notice === 'on'
    void save(setTripPaused(before, group.id, pause))
    toast(pause ? `Auto-capture paused for you in ${group.name}` : `Auto-capture on for you in ${group.name}`, 'ok', {
      action: { label: 'Undo', run: () => void save(before) },
    })
  }
  // The actions keep a 44px touch target, but -my-3 stops it from adding height: the card stays
  // one line of text tall.
  const link = '-my-3 flex min-h-11 shrink-0 items-center font-semibold text-brand-600 dark:text-brand-300'
  return (
    <div className="card text-muted mb-4 flex items-center gap-2 px-5 py-3 text-sm leading-5" data-testid="trip-auto-capture" data-state={notice}>
      <MessageSquareText size={16} className={`shrink-0 ${notice === 'on' ? 'text-brand-600 dark:text-brand-300' : ''}`} aria-hidden />
      {notice === 'setup' ? (
        <>
          <span className="min-w-0 flex-1">Add payments from your phone automatically during this trip</span>
          <Link to={`/settings/auto-capture?group=${group.id}`} className={link} data-testid="trip-capture-setup">
            Set up
          </Link>
        </>
      ) : notice === 'off' ? (
        <>
          <span className="min-w-0 flex-1">Auto-capture is paused for you</span>
          <Link to="/settings/automation" className={link}>
            Settings
          </Link>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1">{notice === 'on' ? 'Trip auto-capture is on for you' : 'Paused for you'}</span>
          <button
            type="button"
            className={`${link} -mr-1 px-1`}
            onClick={toggle}
            aria-label={notice === 'on' ? `Pause auto-capture for you in ${group.name}` : `Resume auto-capture for you in ${group.name}`}
            data-testid="trip-capture-toggle"
          >
            {notice === 'on' ? 'Pause' : 'Resume'}
          </button>
        </>
      )}
    </div>
  )
}

/**
 * Live table guests who said they paid on a link the user confirms (status 'claimed'), in this
 * group: one card each, "Gran says they've paid ₹250 · Confirm", with the screenshot. The same
 * live list as the Inbox (the user's own claimed links), filtered to the group.
 */
function PendingClaims({ groupId }: { groupId: string }) {
  const claims = useClaimedPayLinks()
  const mine = useMemo(() => claimsInGroup(claims, groupId), [claims, groupId])
  if (!mine.length) return null
  return (
    <div className="mb-4 space-y-2">
      {mine.map((l) => (
        <div key={l.code} className="card p-4" data-testid="group-claim">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Says they’ve paid · Confirm
          </div>
          <ClaimReview link={l} compact />
        </div>
      ))}
    </div>
  )
}
