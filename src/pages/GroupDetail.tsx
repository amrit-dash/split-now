import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  BarChart3,
  CheckCheck,
  ChevronRight,
  Download,
  Flag,
  HandCoins,
  KeySquare,
  Lock,
  LockOpen,
  Link2,
  LogOut,
  MessageSquareText,
  MessagesSquare,
  Pencil,
  Repeat,
  Search,
  ArrowDownUp,
  Settings2,
  Trash2,
  UserMinus,
  Users,
  X,
} from 'lucide-react'
import { useMe } from '@/hooks/auth'
import {
  computeGroupData,
  memberOrder,
  useActivity,
  useCaptureTokens,
  useChat,
  useClaimedPayLinks,
  useExpenses,
  useGroup,
  useOpenItems,
  useSettlements,
  useTrash,
} from '@/hooks/data'
import { useCapturePrefs } from '@/hooks/useCapturePrefs'
import { useFlag } from '@/hooks/useAppConfig'
import { usePrivateGroups } from '@/hooks/usePrivateGroups'
import { useVaultWaiting } from '@/hooks/useVaultWaiting'
import { waitingNote } from '@/lib/vault-setup'
import type { Category, Debt, Expense, Group, Settlement } from '@/types'
import { claimsInGroup } from '@/lib/paylinks'
import { ClaimReview } from '@/components/ClaimReview'
import { formatMoney } from '@/lib/money'
import { groupSettleTarget } from '@/lib/settleAll'
import { archiveRow } from '@/lib/archive'
import { CATEGORIES } from '@/lib/categories'
import { expenseEmoji } from '@/lib/icons'
import { IconFace } from '@/components/IconFace'
import { simplifyDebts } from '@/lib/simplify'
import { copy, shareOrCopy } from '@/lib/share'
import { csvFilename, deliverCsv, groupCsv } from '@/lib/export'
import {
  addedLater,
  DEFAULT_SORT,
  EMPTY_FILTER,
  expenseMatches,
  isFiltering,
  isSortKey,
  sectionRows,
  settlementMatches,
  sheetFilterCount,
  sortRows,
  type ActivityFilter,
  type SortKey,
} from '@/lib/filter'
import { ListOptionsSheet } from '@/features/group-list/ListOptionsSheet'
import { localISODate } from '@/lib/id'
import { FREQ_LABEL } from '@/lib/recurrence'
import { todayISO } from '@/lib/id'
import { errText } from '@/lib/errors'
import { inviteLink } from '@/lib/invite-link'
import { usePageTitle } from '@/lib/brand'
import { formatDate } from '@/lib/locale'
import { saveCapturePrefs, tripCaptureNotice } from '@/lib/capture-settings'
import { setTripPaused } from '@/lib/capture-filters'
import * as payments from '@/lib/payments'
import { turnLine, whoseTurn } from '@/lib/fairness'
import { budgetStatus } from '../../shared/budget'
import { Detail, HintText, useShows, type Hint } from '@/components/Hint'
import { Avatar } from '@/components/Avatar'
import { ChequeIcon } from '@/components/ChequeIcon'
import { DebtGraph } from '@/components/DebtGraph'
import { GroupIcon } from '@/components/GroupIcon'
import { QrCode } from '@/components/QrCode'
import { Empty, LiveBadge, Loading, PageHeader, Segmented, formatRange } from '@/components/Misc'
import { Celebrate } from '@/components/Celebrate'
import { DeletedGroupCard, useDeleteGroup } from '@/components/DeleteGroup'
import { CardSkeleton, ListSkeleton } from '@/components/Skeleton'
import { Collapsible } from '@/components/Collapsible'
import { hasTripWindow, isLiveTrip, tripCaptureRelevant } from '@/lib/capture'
import { Sheet } from '@/components/Sheet'
import { repo } from '@/data'
import { useToast } from '@/components/Toast'
import { ActivityFeed, RecentlyDeleted, TrustBadges, useUndoableDelete } from '@/components/Trust'
import { PaymentPill, ProofButton, usePaymentAnswers } from '@/components/PaymentOk'
import { paymentState } from '@/lib/trust'
import { RemindActions } from '@/components/RemindActions'
import { SwipeRow } from '@/components/SwipeRow'
import { useRemoveMember } from '@/hooks/useRemoveMember'
import { activeMembers, isRemoved, listedMemberIds, memberRemoval, membersIn, repeatingByMember } from '@/lib/members'
import { sortOpenItems } from '@/lib/open-items'
import { hasUnread, READ_EVENT, readAtOf } from '@/lib/chat'
import { OpenItemsTab } from '@/features/open-items/OpenItemsTab'
import { deltaWords, handledVerb, handlersOf, isReceived, spending } from '../../shared/received'
import { labelForUid, labelOf } from '@/lib/shortNames'
import { useVaultOpen } from '@/hooks/useVault'
import { VaultLock } from '@/features/vault/VaultLock'
import { PrivateGroupSheet } from '@/features/vault/PrivateGroupSheet'
import { privateMenuShown } from '@/lib/vault-api'
import { lockVault } from '@/lib/vault-keys'

type Tab = 'expenses' | 'open' | 'balances' | 'activity'

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
  const [params] = useSearchParams()
  // ?tab=open: a push about an open item lands on the Open tab.
  const [tab, setTab] = useState<Tab>(() => (params.get('tab') === 'open' ? 'open' : 'expenses'))
  // Also when already on this group (Quick add from the + sheet, a notification tap): the screen isn't remounted.
  const wantsOpen = params.get('tab') === 'open'
  // biome-ignore lint/correctness/useExhaustiveDependencies: params changes on every navigation here, so a second ?tab=open after switching tabs still lands on Open
  useEffect(() => {
    if (wantsOpen) setTab('open')
  }, [wantsOpen, params])
  const [invite, setInvite] = useState(false)
  const [menu, setMenu] = useState(false)
  const [patternOpen, setPatternOpen] = useState(false)
  // ?private=pattern: after letting in someone with no way to open it, straight to giving it its own pattern.
  const wantsPattern = params.get('private') === 'pattern'
  // the card below the group's header: straight to giving it its own pattern
  const [patternFirst, setPatternFirst] = useState(false)
  /** the Expenses list's sort and filter sheet */
  const [listSheet, setListSheet] = useState(false)
  const toast = useToast()
  // The feed is the same shared listener the Activity tab and Home use; here it says who was nudged today.
  const feed = useActivity(groupId)
  const whoseTurnOn = useFlag('whoseTurn')
  const openItemsOn = useFlag('openItems')
  const vaults = usePrivateGroups()
  const chatOn = useFlag('groupChat')
  const openItems = useOpenItems(openItemsOn ? groupId : undefined)
  // The unread dot: only the newest message is watched here (one document), not the whole chat.
  const latestChat = useChat(groupId, 1, chatOn)
  const readAt = useChatReadAt(groupId)
  // Minimal look: the Whose-turn chip is optional, the group's facts (dates, Archived) stay.
  const showTurn = useShows(2)
  const vaultOpen = useVaultOpen(groupId)
  // Someone in it with no way in yet, however they came in (src/hooks/useVaultWaiting.ts).
  const waitingFor = useVaultWaiting({ id: groupId ?? '', vault: liveGroup?.vault, memberUids: liveGroup?.memberUids ?? [] }, !!vaultOpen)
  useEffect(() => {
    if (wantsPattern && vaultOpen) setPatternOpen(true)
  }, [wantsPattern, vaultOpen])
  // A locked private group's name stays off the tab and the app switcher too.
  usePageTitle(liveGroup ? (liveGroup.vault && !vaultOpen ? 'Private group' : liveGroup.name) : liveGroup === null ? 'Group not found' : undefined)

  const d = useMemo(
    () => (liveGroup && expenses && settlements ? computeGroupData(liveGroup, expenses, settlements, user.uid) : null),
    [liveGroup, expenses, settlements, user.uid],
  )
  const removeMember = useRemoveMember(d)
  const openList = useMemo(() => sortOpenItems(openItems, expenses).open, [openItems, expenses])

  if (liveGroup === null)
    return (
      <>
        {/* Fixed: this group is gone for you, and every screen of it behind this one would say the same, so back leaves the group. */}
        <PageHeader title="Group not found" back={{ to: '/groups', mode: 'fixed' }} />
        <Empty emoji="🔍" title="This group doesn’t exist or you’re not a member" />
      </>
    )
  // In Recently deleted: read-only, with Restore (and Delete forever for the creator).
  if (liveGroup && typeof liveGroup.deletedAt === 'number')
    return (
      <>
        <PageHeader title={liveGroup.name} back="/groups" />
        <DeletedGroupCard group={liveGroup} />
      </>
    )
  // A private group that is locked here: its pattern and a passkey first (docs/VAULT.md).
  if (liveGroup?.vault && !vaultOpen) return <VaultLock group={liveGroup} />
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
  const waiting =
    group.vault && waitingFor && !waitingFor.hasPattern ? waitingNote(waitingFor.noUniversal.map((u) => labelForUid(group.members, u, me) ?? 'Someone')) : null
  const cur = group.currency
  const myBal = me ? (net[me] ?? 0) : 0
  const personal = group.type === 'personal'
  const direct = group.type === 'direct'
  // A 1:1 is the two of you: once the friend has joined (has an account in it), there's nobody to invite.
  const canInvite = !personal && !(direct && group.peer && group.members[group.peer]?.uid)
  const openInvite = () => {
    setInvite(true)
    // An older 1:1 invite stored the friend's own name: fix it before it's shared.
    if (direct) repo.refreshInviteName(group).catch(() => {})
  }
  // Money received isn't spending (shared/received.ts): out of Total spent and the budget.
  const total = spending(d.expenses).reduce((s, e) => s + e.amount, 0)
  const receivedTotal = d.expenses.filter((e) => isReceived(e) && !d.pending.includes(e)).reduce((s, e) => s + e.amount, 0)
  const name = (id: string) => (id === me ? 'You' : labelOf(group.members, id, 'Someone', me))
  // The QR is scanned in person, so it stays short; shared links carry your name for their preview.
  const inviteUrl = inviteLink(location.origin, group.inviteCode)
  const shareInviteUrl = inviteLink(location.origin, group.inviteCode, group.members[me ?? '']?.name)
  const creator = group.createdBy === user.uid
  // A private group's sheet, or for its creator the way to make any other shared group private.
  const privateMenu = privateMenuShown(group, creator, vaults.offered)
  const fail = (e: unknown) => toast(errText(e), 'err')
  // A private hint for the next bill (src/lib/fairness.ts): never pushed, never a score.
  const turn = whoseTurnOn && showTurn && !personal && !group.archived ? whoseTurn({ group, expenses: d.expenses }) : null

  const showOpen = openItemsOn && !personal
  const showChat = chatOn && !personal
  const openCount = showOpen ? openList.length : 0
  const unread = showChat && hasUnread(latestChat?.[0], readAt, user.uid)
  const goOpen = () => {
    setTab('open')
    requestAnimationFrame(() => document.getElementById('group-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
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
          <div className="flex items-center">
            {group.vault && (
              <button
                type="button"
                onClick={() => lockVault(group.id)}
                // Open (it shows an open lock, as the Groups screen does): a tap locks it.
                className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-brand-700 transition active:scale-90 dark:bg-brand-900/40 dark:text-brand-200"
                aria-label="Lock this private group"
                title="Open: tap to lock"
                data-testid="vault-lock-now"
              >
                <LockOpen size={20} aria-hidden />
              </button>
            )}
            {showChat && (
              <Link
                to={`/groups/${group.id}/chat`}
                className="relative flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-200/60 dark:hover:bg-ink-800"
                aria-label={unread ? 'Group chat, new messages' : 'Group chat'}
                data-testid="group-chat"
              >
                <MessagesSquare size={22} aria-hidden />
                {unread && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-slate-50 dark:ring-ink-950" aria-hidden />}
              </Link>
            )}
            <button
              type="button"
              onClick={() => setMenu(true)}
              className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-200/60 dark:hover:bg-ink-800"
              aria-label="Group settings"
              aria-haspopup="dialog"
              data-testid="group-menu"
            >
              <Settings2 size={22} aria-hidden />
            </button>
          </div>
        }
      />

      <div className="card mb-4 p-5">
        <div className="flex items-center gap-4">
          <GroupIcon emoji={group.emoji} group={group} size={56} />
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
        {!personal && !direct && (
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
          // A 1:1 whose friend has joined has nobody left to invite.
          <div className={`mt-4 grid gap-2 ${canInvite ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button
              type="button"
              className={`${settled ? 'btn-secondary' : 'btn-primary'} whitespace-nowrap`}
              aria-label="Settle up"
              data-testid="group-settle"
              onClick={() => {
                // One payment of yours opens it; several open the list of them here (groupSettleTarget).
                const t = groupSettleTarget(group.id, debts, me)
                if ('href' in t) return nav(t.href)
                setTab('balances')
                requestAnimationFrame(() => document.getElementById('group-payments')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
              }}
            >
              {/* Narrow phones (most Androids are 360px) get "Settle", so the label stays on one line. */}
              <ChequeIcon size={22} />{' '}
              <span>
                Settle<span className="hidden min-[380px]:inline"> up</span>
              </span>
            </button>
            {canInvite && (
              <button
                type="button"
                className={`${settled ? 'btn-primary' : 'btn-secondary'} whitespace-nowrap`}
                onClick={() => openInvite()}
                data-testid="group-invite"
              >
                <Link2 size={18} aria-hidden /> Invite
              </button>
            )}
          </div>
        )}
      </div>

      {tripCaptureRelevant(group, todayISO()) && (
        <Detail min={2}>
          <TripCaptureLine group={group} />
        </Detail>
      )}

      {waiting && (
        <div className="card mb-4 space-y-3 p-4" data-testid="group-vault-waiting">
          <div>
            <p className="text-sm font-semibold">{waiting.title}</p>
            <p className="text-muted mt-1 text-sm">{waiting.detail}</p>
          </div>
          <button
            type="button"
            className="btn w-full"
            onClick={() => {
              setPatternFirst(true)
              setPatternOpen(true)
            }}
            data-testid="group-vault-waiting-set"
          >
            <KeySquare size={18} aria-hidden /> Give it its own pattern
          </button>
        </div>
      )}

      {!personal && <PendingClaims groupId={group.id} />}

      {!personal && (
        <div className="mb-4 scroll-mt-20" id="group-tabs">
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            label="Section"
            testId="group-tabs"
            options={[
              { value: 'expenses', label: 'Expenses' },
              ...(showOpen
                ? [
                    {
                      value: 'open' as const,
                      label: (
                        <span data-testid="tab-open">
                          Open
                          {openCount > 0 && (
                            <span className="ml-1 rounded-full bg-amber-200 px-1.5 text-xs text-amber-900 dark:bg-amber-500/25 dark:text-amber-100">
                              {openCount}
                            </span>
                          )}
                        </span>
                      ),
                    },
                  ]
                : []),
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
          sheetOpen={listSheet}
          onSheet={setListSheet}
        />
      )}

      {tab === 'open' && showOpen && <OpenItemsTab group={group} items={openItems} expenses={d.expenses} />}

      {tab === 'activity' && !personal && <ActivityTab group={group} expenseIds={new Set(d.expenses.map((e) => e.id))} />}

      {tab === 'balances' && !personal && (
        <div className="space-y-4">
          {openCount > 0 && (
            <button
              type="button"
              onClick={goOpen}
              className="card flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left text-sm"
              data-testid="balances-open-note"
            >
              <span aria-hidden>🧾</span>
              <span className="min-w-0 flex-1">
                {openCount} open {openCount === 1 ? 'item isn’t' : 'items aren’t'} counted yet. Claim {openCount === 1 ? 'it' : 'them'} before settling up.
              </span>
              <ChevronRight size={16} className="text-slate-300 dark:text-slate-600" aria-hidden />
            </button>
          )}
          {receivedTotal > 0 && (
            <Link
              to={`/groups/${group.id}/money`}
              className="card flex min-h-12 w-full items-center gap-2 px-4 py-3 text-sm"
              data-testid="balances-received-note"
            >
              <HandCoins size={18} className="pos shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">Includes {formatMoney(receivedTotal, cur)} money received. See what it changed for each person.</span>
              <ChevronRight size={16} className="text-slate-300 dark:text-slate-600" aria-hidden />
            </Link>
          )}
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
                  menuTitle={name(id)}
                  actions={
                    canRemove
                      ? [
                          {
                            label: 'Remove',
                            ariaLabel: `Remove ${name(id)} from the group`,
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
                    {name(id)} {isRemoved(m) && <span className="text-muted text-xs">(left)</span>}
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

      <Sheet open={invite} onClose={() => setInvite(false)} title={direct ? `Invite ${group.name}` : 'Invite to group'}>
        <HintText
          className="text-muted text-sm"
          hint={
            direct
              ? {
                  full: (
                    <>
                      Send this to <b>{group.name}</b> so they can join and see what you owe each other.
                    </>
                  ),
                  short: 'They join and see what you owe each other.',
                  tier: 'key',
                }
              : group.approveJoins || group.vault
                ? {
                    // New people need the creator's OK (or it's private): the link only asks.
                    full: (
                      <>
                        Anyone with this link can ask to join <b>{group.name}</b>. The person who made it lets them in from their Inbox.
                      </>
                    ),
                    short: 'Anyone with this link can ask to join.',
                    tier: 'key',
                  }
                : {
                    full: (
                      <>
                        Anyone with this link can join <b>{group.name}</b> and claim their name in the member list.
                      </>
                    ),
                    short: 'Anyone with this link can join.',
                    tier: 'key',
                  }
          }
        />
        <div className="mt-4 flex flex-col items-center rounded-2xl bg-slate-100 p-4 text-center dark:bg-ink-800">
          <QrCode value={inviteUrl} size={180} label={`QR code to join ${group.name}`} />
          <HintText hint={SCAN_INVITE_HINT} className="text-muted mt-1.5 text-xs" as="div" />
          <div className="text-muted mt-4 text-xs font-semibold uppercase tracking-wider">Invite code</div>
          <div className="mt-1 font-mono text-3xl font-extrabold tracking-[0.3em]">{group.inviteCode}</div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary" onClick={async () => toast((await copy(shareInviteUrl)) ? 'Link copied' : 'Copy failed', 'ok')}>
            Copy link
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() =>
              shareOrCopy(
                direct
                  ? // A 1:1 is named after the friend you're sending this to: say who it's with instead.
                    { title: 'Split with me on Split Now', text: 'Let’s split our expenses on Split Now, just the two of us:', url: shareInviteUrl }
                  : { title: `Join ${group.name} on Split Now`, text: `Join “${group.name}” on Split Now to split expenses:`, url: shareInviteUrl },
              )
            }
          >
            Share
          </button>
        </div>
      </Sheet>

      {privateMenu && (
        <PrivateGroupSheet
          group={group}
          open={patternOpen}
          onClose={() => {
            setPatternOpen(false)
            setPatternFirst(false)
          }}
          isCreator={creator}
          startWithPattern={wantsPattern || patternFirst}
        />
      )}
      <Sheet open={menu} onClose={() => setMenu(false)} title={group.name} testId="group-menu-sheet">
        <ul className="-mx-2 divide-y divide-slate-100 dark:divide-white/5">
          <MenuRow
            icon={<Pencil size={20} />}
            label="Edit group"
            hint={MENU_HINTS.edit}
            onClick={() => {
              setMenu(false)
              nav(`/groups/${group.id}/edit`)
            }}
          />
          {!personal && !direct && (
            <MenuRow
              icon={<Users size={20} />}
              label="Members"
              hint={MENU_HINTS.members}
              onClick={() => {
                setMenu(false)
                nav(`/groups/${group.id}/members`)
              }}
              testId="group-members"
            />
          )}
          {canInvite && (
            <MenuRow
              icon={<Link2 size={20} />}
              label="Invite"
              hint={MENU_HINTS.invite}
              onClick={() => {
                setMenu(false)
                openInvite()
              }}
            />
          )}
          {privateMenu && (
            <MenuRow
              icon={<Lock size={20} />}
              label={group.vault ? 'Private group' : 'Make private'}
              hint={MENU_HINTS.pattern}
              onClick={() => {
                setMenu(false)
                setPatternOpen(true)
              }}
              testId="vault-group-open"
            />
          )}
          {receivedTotal > 0 && (
            <MenuRow
              icon={<HandCoins size={20} />}
              label="Money received"
              hint={MENU_HINTS.received}
              onClick={() => {
                setMenu(false)
                nav(`/groups/${group.id}/money`)
              }}
              testId="group-money-menu"
            />
          )}
          <MenuRow
            icon={<BarChart3 size={20} />}
            label="Insights"
            hint={MENU_HINTS.insights}
            onClick={() => {
              setMenu(false)
              nav(`/insights?group=${group.id}`)
            }}
          />
          <MenuRow icon={<Download size={20} />} label="Export CSV" hint={MENU_HINTS.export} onClick={exportCsv} testId="group-export" />
          <MenuRow
            icon={<Archive size={20} />}
            label={archive.label}
            // Greyed out, its reason is a status line (always shown); otherwise what it does, like every other row.
            hint={
              archive.disabled
                ? undefined
                : { full: archive.hint, short: archive.label === 'Archive' ? 'Only for you' : 'Back into your balances', tier: 'help' }
            }
            status={archive.disabled ? archive.hint : undefined}
            disabled={archive.disabled}
            onClick={() => setArchived(!group.archived)}
            testId="group-archive"
          />
          {!personal && !creator && me && (
            <MenuRow
              icon={<LogOut size={20} />}
              label="Leave group"
              hint={MENU_HINTS.leave}
              status={myBal === 0 ? undefined : 'Settle up first'}
              onClick={() => {
                setMenu(false)
                void removeMember(me)
              }}
              tone="danger"
              testId="group-leave"
            />
          )}
          <DeleteRow group={group} debts={debts} creator={creator} close={() => setMenu(false)} />
        </ul>
      </Sheet>
    </div>
  )
}

/** This device's last-read time for a group's chat, following the chat screen as it marks messages read. */
function useChatReadAt(groupId: string | undefined): number | undefined {
  const [at, setAt] = useState(() => (groupId ? readAtOf(groupId) : undefined))
  useEffect(() => {
    if (!groupId) return
    setAt(readAtOf(groupId))
    const on = (e: Event) => {
      if ((e as CustomEvent).detail === groupId) setAt(readAtOf(groupId))
    }
    window.addEventListener(READ_EVENT, on)
    return () => window.removeEventListener(READ_EVENT, on)
  }, [groupId])
  return at
}

/** The ⋯ menu's lines: one per row, all 'help', so they show together or not at all (MenuRow). */
const MENU_HINTS = {
  edit: { full: 'Name, dates, currency and approvals', short: 'Name, dates, currency', tier: 'help' },
  members: { full: 'Add people, or remove someone who is settled up', short: 'Add or remove people', tier: 'help' },
  invite: { full: 'A link or QR code friends can join with', short: 'Share a join link', tier: 'help' },
  insights: { full: 'Where the group’s money went, in charts', short: 'Spending charts', tier: 'help' },
  pattern: { full: 'Encryption, its key and its own pattern', short: 'Encryption and patterns', tier: 'help' },
  received: { full: 'Refunds and reimbursements, and what they changed for each person', short: 'What came back', tier: 'help' },
  export: { full: 'Every expense and payment as a spreadsheet', short: 'Download a spreadsheet', tier: 'help' },
  leave: { full: 'You leave; what you added stays in the group', short: 'Leave this group', tier: 'help' },
  delete: { full: 'For everyone; anyone in the group can restore it', short: 'For everyone, and restorable', tier: 'help' },
} satisfies Record<string, Hint>

const SCAN_INVITE_HINT: Hint = { full: 'Friends next to you can scan this with their phone camera', short: 'Scan with a phone camera to join' }
const SIMPLIFY_TIP: Hint = {
  full: (
    <>
      Turn on <b>Simplify debts</b> in Edit group to use this.
    </>
  ),
}

function MenuRow({
  icon,
  label,
  hint,
  status,
  onClick,
  tone,
  testId,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  /**
   * What the row does. Every row of the ⋯ menu has one, all at the same tier (MENU_HINTS), so a
   * detail level shows a line under every row or under none: never some.
   */
  hint?: Hint
  /** Why the row is greyed out (or can't be done yet): state, not explanation, so it shows in every look. */
  status?: string
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
          {/* Inside the row's button: no (i) here, the line simply follows the look. */}
          {status ? (
            <span className="text-muted block text-xs">{status}</span>
          ) : (
            hint && <HintText hint={hint} className="text-muted block text-xs" as="span" />
          )}
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
  const tone = s.tone === 'over' ? 'text-rose-700 dark:text-rose-300' : s.tone === 'near' ? 'text-amber-700 dark:text-amber-300' : ''
  // One quiet row above the bar (the budget, how much is used) and one line under it (what's
  // left, or the warning with an icon), so a budget alert never pushes the card's layout around.
  return (
    <div className="mt-4" data-testid="budget-bar">
      <div className="text-muted mb-1.5 flex items-baseline justify-between gap-2 text-xs font-medium">
        <span className="truncate">Budget {formatMoney(budget, currency)}</span>
        <span className={`shrink-0 font-semibold tabular-nums ${tone}`}>{s.pct}% used</span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-ink-800"
        role="progressbar"
        aria-label="Budget used"
        aria-valuemin={0}
        aria-valuemax={budget}
        aria-valuenow={Math.min(spent, budget)}
        aria-valuetext={`${formatMoney(spent, currency)} of ${formatMoney(budget, currency)}, ${s.note}`}
      >
        <div
          className={`h-full rounded-full ${s.tone === 'over' ? 'bg-rose-600' : s.tone === 'near' ? 'bg-amber-500' : 'bg-gradient-to-r from-brand-500 to-duo-500'}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <div className={`mt-1.5 flex items-center gap-1.5 text-xs font-medium ${tone || 'text-muted'}`} data-testid="budget-note">
        {s.tone === 'over' ? (
          <AlertCircle size={14} className="shrink-0" aria-hidden />
        ) : s.tone === 'near' ? (
          <AlertTriangle size={14} className="shrink-0" aria-hidden />
        ) : null}
        <span className="truncate">{s.note}</span>
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
        {!d.group.simplify && saved > 0 && <HintText hint={SIMPLIFY_TIP} className="mt-1 text-xs" as="div" />}
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
        <ActivityFeed
          entries={feed}
          groups={{ [group.id]: group }}
          showGroup={false}
          linkable={(a) => expenseIds.has(a.targetId) || !!trash?.expenses.some((e) => e.id === a.targetId)}
        />
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
  sheetOpen,
  onSheet,
}: {
  group: Group
  expenses: Expense[]
  settlements: Settlement[]
  me?: string
  currency: string
  name: (id: string) => string
  personal: boolean
  sheetOpen: boolean
  onSheet: (open: boolean) => void
}) {
  const groupId = group.id
  const undoable = useUndoableDelete()
  const answers = usePaymentAnswers()
  const { user } = useMe()
  const navTo = useNavigate()
  const [filter, setFilter] = useState<ActivityFilter>(EMPTY_FILTER)
  const [onlyMe, setOnlyMe] = useState(false)
  // Minimal look: the category chips go (search and Sort and filter remain); Involving me stays.
  const catChips = useShows(2)
  const [sort, setSortState] = useState<SortKey>(readSort)
  const setSort = (k: SortKey) => {
    setSortState(k)
    saveSort(k)
  }
  const f: ActivityFilter = { ...filter, involving: onlyMe ? me : undefined }
  const sheetCount = sheetFilterCount(filter) + (sort !== DEFAULT_SORT ? 1 : 0)
  const byAdded = sort.startsWith('added')
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

  type Row = ({ kind: 'e'; e: Expense } | { kind: 's'; s: Settlement }) & { date: string; createdAt: number; amount: number }
  const all = expenses.length + settlements.length
  const rows: Row[] = sortRows(
    [
      ...expenses.filter((e) => expenseMatches(e, f)).map((e) => ({ kind: 'e' as const, e, date: e.date, createdAt: e.createdAt, amount: e.amount })),
      ...settlements
        .filter((s) => settlementMatches(s, f, name))
        .map((s) => ({ kind: 's' as const, s, date: s.date, createdAt: s.createdAt, amount: s.amount })),
    ],
    sort,
  )
  /** "added 5 Oct" beside the date spent: always when sorted by date added, else only when it was added days later. */
  const addedNote = (r: Pick<Row, 'date' | 'createdAt'>) => {
    if (byAdded) return `Added ${formatDate(r.createdAt)}`
    const later = addedLater(r, localISODate)
    return later && later > shiftDay(r.date, 1) ? `Added ${formatDate(later)}` : ''
  }
  if (all === 0)
    return (
      <Empty emoji="🧾" title="No expenses yet">
        Tap the + button to add the first one, or scan a receipt.
      </Empty>
    )

  const sections = sectionRows(rows, sort, (d) => formatDate(d, { month: 'long', year: 'numeric' }))
  const filters = (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
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
        <button
          type="button"
          onClick={() => onSheet(true)}
          className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${sheetCount ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'bg-slate-100 text-slate-600 dark:bg-ink-800 dark:text-slate-300'}`}
          aria-label={sheetCount ? `Sort and filter, ${sheetCount} on` : 'Sort and filter'}
          aria-haspopup="dialog"
          data-testid="list-options-open"
        >
          <ArrowDownUp size={18} aria-hidden />
          {sheetCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-fill px-1 text-[11px] font-bold text-on-fill">
              {sheetCount}
            </span>
          )}
        </button>
      </div>
      {((catChips && usedCategories.length > 1) || (!personal && me)) && (
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
          {catChips &&
            usedCategories.length > 1 &&
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
      {sort !== DEFAULT_SORT && !filtering && (
        <div className="text-muted flex items-center justify-between px-1 text-xs">
          <span>Sorted by {sort.startsWith('added') ? 'date added' : 'amount'}</span>
          <button type="button" onClick={() => setSort(DEFAULT_SORT)} className="min-h-9 font-semibold text-brand-600 dark:text-brand-300">
            Back to date spent
          </button>
        </div>
      )}
      {filtering && (
        <div className="text-muted flex items-center justify-between px-1 text-xs">
          <span>
            {rows.length} of {all} shown
          </span>
          <button
            type="button"
            onClick={() => {
              clear()
              setSort(DEFAULT_SORT)
            }}
            className="min-h-9 font-semibold text-brand-600 dark:text-brand-300"
          >
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
      {sections.map(({ label: month, rows: list }) => (
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
                      <MetaLine added={addedNote(r)}>
                        {methodLabel(r.s.method)} · {formatDate(r.s.date)}
                        {r.s.paid && <> · paid {formatMoney(r.s.paid.amount, r.s.paid.currency)}</>}
                        {r.s.proofPath && (
                          <>
                            {' · '}
                            <ProofButton s={r.s} />
                          </>
                        )}
                        {r.s.payLink && (
                          <Detail min={2}>
                            {' · '}
                            <Link
                              to={`/r/${r.s.payLink}`}
                              className="inline-flex min-h-6 items-center font-semibold text-brand-600 underline dark:text-brand-300"
                            >
                              Pay me link
                            </Link>
                          </Detail>
                        )}
                      </MetaLine>
                    </div>
                    <div className={`font-semibold ${ps.pill === 'needs-ok' || ps.pill === 'flagged' ? 'text-muted line-through decoration-1' : 'pos'}`}>
                      {formatMoney(r.s.amount, currency)}
                    </div>
                  </SwipeRow>
                )
              }
              const e = r.e
              const payers = Object.keys(handlersOf(e))
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
                      <IconFace iconSvg={e.iconSvg} iconImage={e.iconImage} emoji={expenseEmoji(e)} />
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
                      <MetaLine added={addedNote(r)}>
                        {personal ? (
                          formatDate(e.date)
                        ) : (
                          <>
                            {payers.length > 1 ? `${payers.length} people` : name(payers[0])} {handledVerb(e)} {formatMoney(e.amount, currency)} ·{' '}
                            {formatDate(e.date)}
                          </>
                        )}
                      </MetaLine>
                    </div>
                    <div className="text-right">
                      {personal ? (
                        <div className="font-semibold">{formatMoney(e.amount, currency)}</div>
                      ) : delta === 0 ? (
                        <div className="text-muted text-xs">{me && e.splits[me] === undefined && !e.paidBy[me] ? 'not involved' : 'even'}</div>
                      ) : (
                        <>
                          <div className={`text-xs ${delta > 0 ? 'pos' : 'neg'}`}>{deltaWords(e, delta)}</div>
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
      <ListOptionsSheet
        open={sheetOpen}
        onClose={() => onSheet(false)}
        group={group}
        order={memberOrder(group, [...expenses.flatMap((e) => Object.keys(e.paidBy)), ...settlements.map((s) => s.from)])}
        me={me}
        sort={sort}
        onSort={setSort}
        filter={filter}
        onFilter={(patch) => setFilter((p) => ({ ...p, ...patch }))}
        personal={personal}
      />
    </div>
  )
}

/** The list's order is a convenience kept on this device (the same for every group). */
const SORT_KEY = 'splitit-list-sort'
function readSort(): SortKey {
  try {
    const v = localStorage.getItem(SORT_KEY)
    return isSortKey(v) ? v : DEFAULT_SORT
  } catch {
    return DEFAULT_SORT
  }
}
function saveSort(k: SortKey) {
  try {
    if (k === DEFAULT_SORT) localStorage.removeItem(SORT_KEY)
    else localStorage.setItem(SORT_KEY, k)
  } catch {
    /* private mode */
  }
}
/** `iso` plus `n` days (local). */
const shiftDay = (iso: string, n: number) => localISODate(new Date(`${iso}T12:00:00`).getTime() + n * 86_400_000)

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

/**
 * The menu's "Delete group": shown to the creator, and to everyone once the creator has left
 * (greyed out with the reason until everyone is square). Its own component, so the delete hook
 * sits below GroupDetail's loading returns.
 */
function DeleteRow({ group, debts, creator, close }: { group: Group; debts: Debt[]; creator: boolean; close: () => void }) {
  const { state, run } = useDeleteGroup(group, debts)
  const creatorLeft = !group.memberUids.includes(group.createdBy)
  if (!creator && !creatorLeft) return null
  return (
    <MenuRow
      icon={<Trash2 size={20} />}
      label="Delete group"
      hint={state.allowed ? MENU_HINTS.delete : undefined}
      status={state.allowed ? undefined : state.reason}
      onClick={() => {
        close()
        void run()
      }}
      tone="danger"
      testId="group-delete"
      disabled={!state.allowed}
    />
  )
}

/**
 * A row's second line, with "Added 11 Oct" on the same line after a dot when it fits, else on
 * its own line without the dot. Every part carries a dot in the gutter to its left and the line is
 * shifted left by that gutter inside a clipping box, so whichever part starts a line has its dot
 * clipped off (no width measuring).
 */
function MetaLine({ children, added }: { children: ReactNode; added?: string | null }) {
  const part = "relative min-w-0 pl-3 before:absolute before:left-1 before:content-['·']"
  return (
    <div className="text-muted overflow-hidden text-xs">
      <div className="-ml-3 flex flex-wrap">
        <span className={`${part} truncate`}>{children}</span>
        {added && (
          <span className={`${part} whitespace-nowrap`} data-testid="row-added">
            {added}
          </span>
        )}
      </div>
    </div>
  )
}
