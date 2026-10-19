import { useCallback, useEffect, useMemo, useState } from 'react'
import { useJoinRequests } from '@/hooks/data'
import type { JoinRequest } from '@/types'
import { isSealed } from '@/lib/vault-scramble'
import { decidesJoins, waitingRequests } from '@/lib/join-approval'
import { passkeyCancelled, passkeyProof } from '@/features/vault/passkey'
import { Link, useNavigate } from 'react-router-dom'
import { Ban, BookOpen, Check, CheckCheck, ChevronDown, ChevronRight, EyeOff, Flag, FolderInput, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { memberOrder, myMemberId, useAllGroupData, useCaptures, useCapturesMeta, useDeletedGroups, type GroupData } from '@/hooks/data'
import { useInbox } from '@/hooks/useInbox'
import { Detail, type Hint, HintText, InfoTip, useShows } from '@/components/Hint'
import { MergeApprovalRow } from '@/features/merge/Merge'
import { useFlag } from '@/hooks/useAppConfig'
import type { Capture, Expense, Group, Settlement } from '@/types'
import { usePageTitle } from '@/lib/brand'
import { SOURCE_LABEL, isSmsSource } from '@/lib/capture'
import { addIgnoreWord, saveCapturePrefs, watchCapturePrefs } from '@/lib/capture-settings'
import { CATEGORIES } from '@/lib/categories'
import { suggestCategory } from '@/lib/merchants'
import { useMerchantMemory } from '@/hooks/useMerchants'
import { errText } from '@/lib/errors'
import {
  canMarkAllRead,
  clearAllUpdates,
  collapseRuns,
  hideUpdate,
  isUnread,
  markInboxSeen,
  mergeOlder,
  orderToSort,
  sortUpdates,
  storeSorts,
  storedSorts,
  visibleUpdates,
  type ToSortOrder,
  type UpdatesSort,
} from '@/lib/inbox'
import { useInboxState } from '@/hooks/useInboxState'
import { tuning } from '../../shared/app-tuning'
import type { ActivityEntry } from '@/types'
import { bulkCandidates, sumCaptures, targetGroupFor, type BulkCandidate } from '@/lib/inbox-sort'
import { bulkDuplicates, duplicateLine } from '@/lib/duplicates'
import { todayISO, uid } from '@/lib/id'
import { formatDate } from '@/lib/locale'
import { formatMoney } from '@/lib/money'
import type { AllPrefs } from '@/lib/push'
import { buildExpense } from '@/lib/statement'
import { PageHeader, Segmented } from '@/components/Misc'
import { ClaimReview } from '@/components/ClaimReview'
import { NudgeCards } from '@/components/NudgeCards'
import { Sheet } from '@/components/Sheet'
import { ListSkeleton } from '@/components/Skeleton'
import { ActivityFeed } from '@/components/Trust'
import { ProofButton, usePaymentAnswers } from '@/components/PaymentOk'
import { useToast } from '@/components/Toast'
import { SwipeRow } from '@/components/SwipeRow'
import { labelForUid, labelOf, memberIdOfUid } from '@/lib/shortNames'
import { groupsDeletedByOthers } from '@/lib/trust'
import { daysLeft } from '../../shared/group-trash'
import { openOnce } from '@/lib/vault-open'
import { addedPrompt } from '@/lib/vault-setup'
import { useConfirm } from '@/components/ConfirmSheet'

type Tab = 'sort' | 'updates'
const HANDLED_FIRST = 15

/**
 * Inbox: "To sort" (reminders from people you owe, captured payments and expenses waiting for
 * your OK) and "Updates" (a log of everything in your groups, your own actions included). Only
 * other people's entries are ever new; opening Updates marks them read on this device. The
 * header and tabs render at once; each section shows placeholders until its own data is in.
 */
export default function Inbox() {
  usePageTitle('Inbox')
  const { user } = useMe()
  const data = useAllGroupData()
  const box = useInbox(data)
  const all = useCaptures()
  // The server hasn't confirmed the captures list yet: what's shown may be a stale device copy.
  const checking = useCapturesMeta()?.fromCache === true
  const [tab, setTab] = useState<Tab | null>(null)
  const current: Tab = tab ?? (box.toSort === 0 && box.unread > 0 ? 'updates' : 'sort')
  // The moment the user looks at Updates, everything up to now is read (the dots stay for this visit).
  const [seenBefore, setSeenBefore] = useState(box.seenAt)
  // biome-ignore lint/correctness/useExhaustiveDependencies: the length is the trigger (new entries while the tab is open are read too)
  useEffect(() => {
    if (current === 'updates') markInboxSeen()
  }, [current, box.updates.length])

  const [sorts, setSorts] = useState(storedSorts)
  const pickSort = useCallback((next: Partial<typeof sorts>) => {
    setSorts((s) => {
      const merged = { ...s, ...next }
      storeSorts(merged)
      return merged
    })
  }, [])

  const groups = useMemo(() => data?.map((d) => d.group) ?? null, [data])
  const groupsById = useMemo(() => Object.fromEntries((groups ?? []).map((g) => [g.id, g])), [groups])

  return (
    <div>
      <PageHeader
        title="Inbox"
        back
        right={
          // Only on Updates: To sort has nothing to mark read (its rows go when they're sorted).
          current === 'updates' &&
          canMarkAllRead(box.updates, user.uid, box.seenAt, seenBefore) && (
            <button
              type="button"
              onClick={() => {
                const now = Date.now()
                markInboxSeen(now)
                setSeenBefore(now)
              }}
              className="flex h-11 w-11 items-center justify-center rounded-full text-brand-700 hover:bg-slate-200/60 dark:text-brand-300 dark:hover:bg-ink-800"
              aria-label="Mark all read"
              title="Mark all read"
              data-testid="inbox-mark-read"
            >
              <CheckCheck size={22} aria-hidden />
            </button>
          )
        }
      />
      <Segmented<Tab>
        label="Inbox sections"
        testId="inbox-tabs"
        value={current}
        onChange={setTab}
        options={[
          { value: 'sort', label: <TabLabel text="To sort" n={box.toSort} tone="rose" /> },
          { value: 'updates', label: <TabLabel text="Updates" n={box.unread} tone="brand" /> },
        ]}
      />
      <div className="mt-4">
        {current === 'sort' && checking && (
          <p className="text-muted mb-3 px-1 text-xs" role="status">
            Checking for new captured payments…
          </p>
        )}
        {current === 'sort' ? (
          <ToSort
            box={box}
            data={data}
            groups={groups}
            handled={all ? all.filter((c) => c.status !== 'pending') : null}
            order={sorts.toSort}
            onOrder={(toSort) => pickSort({ toSort })}
          />
        ) : !data ? (
          <ListSkeleton rows={4} />
        ) : (
          <Updates
            box={box}
            groupsById={groupsById}
            isNew={(a) => isUnread(a, user.uid, seenBefore)}
            sort={sorts.updates}
            onSort={(updates) => pickSort({ updates })}
          />
        )}
      </div>
    </div>
  )
}

/** "To sort" is work (rose); "Updates" is news (brand), so the two don't read as one alarm. */
function TabLabel({ text, n, tone }: { text: string; n: number; tone: 'rose' | 'brand' }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {text}
      {n > 0 && (
        <span
          className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${tone === 'rose' ? 'bg-rose-600 text-white' : 'bg-fill text-on-fill'}`}
        >
          {n > 99 ? '99+' : n}
          <span className="sr-only"> {tone === 'rose' ? 'to sort' : 'unread'}</span>
        </span>
      )}
    </span>
  )
}

function ToSort({
  box,
  data,
  groups,
  handled,
  order,
  onOrder,
}: {
  box: ReturnType<typeof useInbox>
  data: GroupData[] | null
  groups: Group[] | null
  handled: Capture[] | null
  order: ToSortOrder
  onOrder: (o: ToSortOrder) => void
}) {
  const { user } = useMe()
  const toast = useToast()
  const [prefs, setPrefs] = useState<AllPrefs | null>(null)
  const [bulk, setBulk] = useState<BulkCandidate<Group> | null>(null)
  // The sort menu is optional: hidden in the Minimal look.
  const showSort = useShows(2)
  const deletedGroups = useDeletedGroups()
  const deletedByOthers = useMemo(() => groupsDeletedByOthers(deletedGroups ?? [], user.uid), [deletedGroups, user.uid])
  // Requests to join the groups you made that are private (vault op requestJoin) or need your OK
  // for new people (joinApproval op ask): yours to decide. A group with it turned off is left out,
  // its requests kept for if it's turned on again; someone who joined meanwhile isn't asked about.
  const mine = useMemo(() => {
    const ids = new Set(
      decidesJoins(
        (data ?? []).map((d) => d.group),
        user.uid,
      ).map((g) => g.id),
    )
    return (data ?? []).filter((d) => ids.has(d.group.id))
  }, [data, user.uid])
  const requested = useJoinRequests(data ? mine.map((d) => d.group.id) : null)
  const joins = useMemo(
    () =>
      waitingRequests(
        requested ?? [],
        mine.map((d) => d.group),
      ),
    [requested, mine],
  )
  useEffect(() => watchCapturePrefs(user.uid, repo.mode, setPrefs), [user.uid])
  const loadingCaptures = box.loading && box.captures.length === 0 && !handled
  const nothing =
    !loadingCaptures &&
    !!data &&
    box.captures.length === 0 &&
    box.approvals.length === 0 &&
    box.payments.length === 0 &&
    box.claims.length === 0 &&
    box.merges.length === 0 &&
    box.nudges.length === 0 &&
    joins.length === 0 &&
    deletedByOthers.length === 0
  const paused = prefs?.pausedTrips
  const candidates = useMemo(() => (groups ? bulkCandidates(box.captures, groups, paused) : []), [box.captures, groups, paused])
  // Each list in the chosen order (newest / oldest / biggest first); reminders keep theirs.
  const approvals = useMemo(
    () =>
      orderToSort(
        box.approvals,
        order,
        (x) => x.e.createdAt,
        (x) => x.e.amount,
      ),
    [box.approvals, order],
  )
  const payments = useMemo(
    () =>
      orderToSort(
        box.payments,
        order,
        (x) => x.s.createdAt,
        (x) => x.s.amount,
      ),
    [box.payments, order],
  )
  const claims = useMemo(
    () =>
      orderToSort(
        box.claims,
        order,
        (l) => l.paidAt ?? l.createdAt,
        (l) => l.amount,
      ),
    [box.claims, order],
  )
  const captures = useMemo(
    () =>
      orderToSort(
        box.captures,
        order,
        (c) => c.createdAt,
        (c) => c.amount,
      ),
    [box.captures, order],
  )
  const count = approvals.length + payments.length + claims.length + captures.length

  const setStatus = (c: Capture, status: Capture['status']) => repo.updateCapture(user.uid, c.id, { status })
  const notShared = (c: Capture) => {
    setStatus(c, 'dismissed').catch((e) => toast(errText(e), 'err'))
    toast(`“${c.merchant}” marked not shared`, 'ok', {
      action: {
        label: 'Undo',
        run: () => {
          void setStatus(c, 'pending')
        },
      },
    })
  }
  // "Ignore Swiggy": adds the merchant to the capture filters (the webhook skips it from now on) and files this one as not shared.
  const ignore = (c: Capture) => {
    if (!prefs) return
    const before = prefs.ignoreWords
    const next = addIgnoreWord(before, c.merchant)
    setPrefs({ ...prefs, ignoreWords: next })
    saveCapturePrefs(user.uid, repo.mode, { ignoreWords: next }).catch((e) => toast(errText(e), 'err'))
    setStatus(c, 'dismissed').catch((e) => toast(errText(e), 'err'))
    toast(`Payments at ${c.merchant} will be ignored from now on`, 'ok', {
      action: {
        label: 'Undo',
        run: () => {
          void saveCapturePrefs(user.uid, repo.mode, { ignoreWords: before })
          void setStatus(c, 'pending')
        },
      },
    })
  }

  return (
    <>
      {count > 1 && showSort && (
        <div className="mb-3 flex justify-end">
          <SortPicker<ToSortOrder>
            value={order}
            onChange={onOrder}
            testId="inbox-sort"
            options={[
              { value: 'newest', label: 'Newest first' },
              { value: 'oldest', label: 'Oldest first' },
              { value: 'amount', label: 'Biggest amount' },
            ]}
          />
        </div>
      )}
      {nothing && (
        <>
          <Quiet emoji="✨" title="All sorted">
            Captured payments, expenses waiting for your OK and payments to confirm show up here.
          </Quiet>
          {/* A promo, not a decision: hidden in the Minimal look. */}
          <Detail min={2}>
            <Link to="/settings/auto-capture" className="card mt-3 flex items-center gap-3 p-4" data-testid="inbox-setup">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300"
                aria-hidden
              >
                <BookOpen size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">Set up auto-capture</div>
                <HintText as="div" className="text-muted text-xs" hint={{ full: 'Bank & UPI payments from your phone land here automatically' }} />
              </div>
              <ChevronRight size={18} className="shrink-0 text-slate-400" aria-hidden />
            </Link>
          </Detail>
        </>
      )}

      {deletedByOthers.length > 0 && (
        <Section title="Deleted groups" hint={{ full: 'Anyone in a group can restore it', tier: 'key' }}>
          {deletedByOthers.map((g) => (
            <DeletedGroupRow key={g.id} group={g} />
          ))}
        </Section>
      )}

      {joins.length > 0 && (
        <Section title="Asking to join" hint={{ full: 'Only you let people into the groups you made that need your OK', tier: 'key' }}>
          {joins.map((r) => (
            <JoinRequestRow key={`${r.groupId}/${r.uid}`} request={r} d={mine.find((d) => d.group.id === r.groupId)} />
          ))}
        </Section>
      )}

      {box.merges.length > 0 && (
        <Section title="Merges to OK" hint={{ full: 'Two people who are one person' }}>
          {box.merges.map(({ r, d }) => (
            <MergeApprovalRow key={`${r.groupId}/${r.id}`} group={d.group} request={r} me={d.me} myUid={user.uid} />
          ))}
        </Section>
      )}

      {box.nudges.length > 0 && (
        <Section title="Reminders" hint={{ full: 'From people you owe', tier: 'extra' }}>
          <NudgeCards cards={box.nudges} />
        </Section>
      )}

      {!data ? (
        <Section title="Needs your OK">
          <ListSkeleton rows={1} />
        </Section>
      ) : (
        box.approvals.length > 0 && (
          <Section title="Needs your OK" hint={{ full: 'Not counted in balances until you approve', tier: 'key' }}>
            {approvals.map(({ e, d }) => (
              <ApprovalRow key={e.id} e={e} d={d} />
            ))}
          </Section>
        )
      )}

      {box.payments.length > 0 && (
        <Section title="Payments to confirm" hint={{ full: 'Waiting ones count once you confirm them', tier: 'key' }}>
          {payments.map(({ s, group, matched }) => (
            <PaymentConfirmRow key={s.id} s={s} group={group} matched={matched} />
          ))}
        </Section>
      )}

      {box.claims.length > 0 && (
        <Section title="Says they’ve paid" hint={{ full: 'Counts once you confirm it', tier: 'key' }}>
          {claims.map((l) => (
            <div key={l.code} className="card p-4" data-testid="inbox-claim">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                <span aria-hidden>{l.emoji ?? '🍽️'}</span>
                <span className="min-w-0 truncate">{l.groupName}</span>
                <span className="shrink-0">· Confirm</span>
              </div>
              <ClaimReview link={l} compact />
            </div>
          ))}
        </Section>
      )}

      {loadingCaptures ? (
        <Section title="Captured payments">
          <ListSkeleton rows={2} />
        </Section>
      ) : (
        box.captures.length > 0 && (
          <Section title="Captured payments" hint={`${box.captures.length} to sort`}>
            {candidates[0] && (
              <button type="button" className="btn-primary w-full" onClick={() => setBulk(candidates[0])} data-testid="inbox-bulk">
                <Plus size={18} aria-hidden /> Add all {candidates[0].captures.length} to {candidates[0].group.emoji} {candidates[0].group.name}
              </button>
            )}
            {captures.map((c) => (
              <CaptureCard
                key={c.id}
                c={c}
                groups={groups}
                paused={paused}
                onNotShared={() => notShared(c)}
                onIgnore={isSmsSource(c.source) && prefs ? () => ignore(c) : undefined}
              />
            ))}
          </Section>
        )
      )}

      {handled && handled.length > 0 && <Handled list={handled} groups={groups ?? []} />}

      {bulk && data && <BulkSheet candidate={bulk} data={data.find((d) => d.group.id === bulk.group.id)} onClose={() => setBulk(null)} />}
    </>
  )
}

function ApprovalRow({ e, d }: { e: Expense; d: GroupData }) {
  const toast = useToast()
  const by = labelForUid(d.group.members, e.createdBy, d.me) ?? 'someone'
  return (
    <div className="card flex items-center gap-3 p-3">
      <Link to={`/groups/${d.group.id}/expenses/${e.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-xl dark:bg-sky-500/10" aria-hidden>
          {CATEGORIES[e.category]?.emoji ?? '🧾'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">
            {e.description} · {formatMoney(e.amount, d.group.currency)}
          </span>
          <span className="text-muted block truncate text-xs">
            <span aria-hidden>{d.group.emoji} </span>
            {d.group.name} · added by {by} · your share {formatMoney(d.me ? (e.splits[d.me] ?? 0) : 0, d.group.currency)}
          </span>
        </span>
      </Link>
      <button
        type="button"
        className="btn-primary btn-sm shrink-0"
        onClick={() =>
          repo
            .approveExpense(d.group, e)
            .then(() => toast('Approved'))
            .catch((err) => toast(errText(err), 'err'))
        }
      >
        <Check size={16} aria-hidden /> Approve
      </button>
    </div>
  )
}

/**
 * A payment to you that needs your OK (Confirm / Not received), or one its screenshot cleared this
 * week (Looks right / Not received). The screenshot, when attached, opens in a sheet.
 */
function PaymentConfirmRow({ s, group, matched }: { s: Settlement; group: Group; matched: boolean }) {
  const answers = usePaymentAnswers()
  const { user } = useMe()
  const from = labelOf(group.members, s.from, 'Someone', memberIdOfUid(group.members, user.uid))
  return (
    <div className="card p-3" data-testid={matched ? 'inbox-payment-matched' : 'inbox-payment'}>
      <Link to={`/groups/${group.id}`} className="flex min-w-0 items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-xl dark:bg-emerald-500/10" aria-hidden>
          💸
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">
            {from} paid you {formatMoney(s.amount, group.currency)}
          </span>
          <span className="text-muted block truncate text-xs">
            <span aria-hidden>{group.emoji} </span>
            {group.name} · {formatDate(s.date)}
            {s.paid && <> · paid {formatMoney(s.paid.amount, s.paid.currency)}</>}
            {matched ? ' · cleared by their screenshot' : ''}
          </span>
        </span>
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ProofButton s={s} className="mr-auto text-sm" />
        <button type="button" className="btn-secondary btn-sm" onClick={() => answers.notReceived(s)} data-testid="inbox-payment-not-received">
          <Flag size={16} aria-hidden /> Not received
        </button>
        <button type="button" className="btn-primary btn-sm" onClick={() => answers.confirm(s)} data-testid="inbox-payment-confirm">
          <Check size={16} aria-hidden /> {matched ? 'Looks right' : 'Confirm'}
        </button>
      </div>
    </div>
  )
}

function CaptureCard({
  c,
  groups,
  paused,
  onNotShared,
  onIgnore,
}: {
  c: Capture
  groups: Group[] | null
  /** trips this person paused capture for: never the suggestion */
  paused?: string[]
  onNotShared: () => void
  onIgnore?: () => void
}) {
  const { profile } = useMe()
  const memory = useMerchantMemory()
  const best = groups ? targetGroupFor(c, groups, paused) : undefined
  const bestGroup = best ? groups?.find((g) => g.id === best) : undefined
  const cat = suggestCategory(c.merchant, { memory })
  const source = SOURCE_LABEL[c.source] ?? c.source
  return (
    <div className="card overflow-hidden" data-testid="inbox-capture">
      <Link to={`/capture/${c.id}`} className="flex items-center gap-3 p-3 pb-2.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-xl dark:bg-ink-800" aria-hidden>
          {cat ? CATEGORIES[cat].emoji : isSmsSource(c.source) ? '📩' : '💳'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{c.merchant}</span>
          <span className="text-muted block truncate text-xs">
            {formatDate(c.date)} · {source}
            {c.card ? ` · ${c.card}` : ''}
          </span>
        </span>
        <span className="shrink-0 text-right font-bold tabular-nums">{formatMoney(c.amount, c.currency ?? profile.currency)}</span>
      </Link>
      <div className="flex items-center gap-1.5 border-t border-slate-100 px-3 py-2 dark:border-white/5">
        {bestGroup ? (
          <Link
            to={`/add?group=${encodeURIComponent(bestGroup.id)}&capture=${encodeURIComponent(c.id)}`}
            data-testid="inbox-add"
            className="flex min-h-10 min-w-0 flex-1 items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-200"
          >
            <span className="shrink-0" aria-hidden>
              {bestGroup.emoji}
            </span>
            <span className="truncate">Add to {bestGroup.name}</span>
          </Link>
        ) : (
          <Link
            to={`/capture/${c.id}`}
            className="flex min-h-10 min-w-0 flex-1 items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-200"
          >
            <FolderInput size={16} className="shrink-0" aria-hidden />
            <span className="truncate">Choose a group</span>
          </Link>
        )}
        <button
          type="button"
          onClick={onNotShared}
          title="Not shared"
          className="text-muted flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-ink-800"
          aria-label={`Mark ${c.merchant} as not shared`}
        >
          <EyeOff size={16} aria-hidden />
          <span className="hidden min-[360px]:inline">Not shared</span>
        </button>
        {onIgnore && (
          <button
            type="button"
            onClick={onIgnore}
            title={`Ignore ${c.merchant} from now on`}
            className="text-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-ink-800"
            aria-label={`Ignore payments at ${c.merchant} from now on`}
            data-testid="inbox-ignore"
          >
            <Ban size={16} aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}

/** "Add all N to Goa trip": equal splits, you paid, everyone in. Undo removes them again. */
function BulkSheet({ candidate, data, onClose }: { candidate: BulkCandidate<Group>; data: GroupData | undefined; onClose: () => void }) {
  const { user } = useMe()
  const memory = useMerchantMemory()
  const toast = useToast()
  const checkDups = useFlag('duplicates')
  // Captures that are probably already in the group start unticked, with the reason under them.
  const dups = useMemo(
    () => (checkDups && data ? bulkDuplicates(candidate.captures, data.expenses, candidate.group.currency) : new Map<string, Expense>()),
    [checkDups, data, candidate],
  )
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(candidate.captures.filter((c) => !dups.has(c.id)).map((c) => c.id)))
  const [busy, setBusy] = useState(false)
  const g = candidate.group
  const chosen = candidate.captures.filter((c) => ticked.has(c.id))
  const toggle = (id: string) =>
    setTicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const add = async () => {
    if (!data || !chosen.length) return
    setBusy(true)
    const order = memberOrder(g)
    const me = data.me ?? myMemberId(g, user.uid) ?? order[0]
    const saved: Array<{ capture: Capture; expense: Expense }> = []
    try {
      const now = Date.now()
      for (const [i, c] of chosen.entries()) {
        const e = buildExpense(
          {
            description: c.merchant,
            amount: c.amount,
            date: c.date,
            category: suggestCategory(c.merchant, { memory }) ?? 'other',
            notes: c.note,
            payer: me,
            members: order,
          },
          g,
          order,
          user.uid,
          uid('e_'),
          now + i,
        )
        await repo.saveExpense(e, { isNew: true })
        await repo.updateCapture(user.uid, c.id, { status: 'assigned', groupId: g.id, expenseId: e.id })
        saved.push({ capture: c, expense: e })
      }
      toast(`Added ${saved.length} to ${g.name} · ${formatMoney(sumCaptures(chosen), g.currency)}`, 'ok', {
        action: {
          label: 'Undo',
          run: () => {
            for (const { capture, expense } of saved) {
              void repo.deleteExpense(g.id, expense.id)
              void repo.updateCapture(user.uid, capture.id, { status: 'pending' })
            }
          },
        },
      })
      onClose()
    } catch (e) {
      toast(errText(e), 'err')
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={`Add to ${g.name}`} testId="inbox-bulk-sheet">
      <HintText
        className="text-muted -mt-1 mb-3 text-sm"
        hint={{
          full: `Each one becomes an expense you paid, split equally between everyone in ${g.name}. You can edit any of them afterwards.`,
          short: `Each becomes an expense you paid, split equally in ${g.name}.`,
          tier: 'key',
        }}
      />
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {candidate.captures.map((c) => {
          const on = ticked.has(c.id)
          return (
            <li key={c.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(c.id)}
                className="flex w-full items-center gap-3 rounded-2xl p-2 text-left"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 ${on ? 'border-brand-600 bg-fill text-on-fill' : 'border-slate-400 dark:border-ink-700'}`}
                  aria-hidden
                >
                  {on && <Check size={14} strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.merchant}</span>
                  <span className="text-muted block text-xs">{formatDate(c.date)}</span>
                  {dups.has(c.id) && (
                    <span className="block text-xs font-medium text-amber-700 dark:text-amber-300" data-testid="inbox-bulk-dup">
                      {duplicateLine(dups.get(c.id)!, g.currency, todayISO())}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-bold tabular-nums">{formatMoney(c.amount, g.currency)}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <button type="button" className="btn-primary mt-4 w-full" onClick={add} disabled={busy || !chosen.length || !data} data-testid="inbox-bulk-add">
        {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Plus size={18} aria-hidden />} Add {chosen.length} ·{' '}
        {formatMoney(sumCaptures(chosen), g.currency)}
      </button>
    </Sheet>
  )
}

function Handled({ list, groups }: { list: Capture[]; groups: Group[] }) {
  const { user, profile } = useMe()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const name = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups])
  const shown = showAll ? list : list.slice(0, HANDLED_FIRST)
  // Deleting a handled capture is a tidy-up, not a decision: keep the object and offer Undo.
  const remove = (c: Capture) => {
    repo.deleteCapture(user.uid, c.id).catch((e) => toast(errText(e), 'err'))
    toast(`Deleted “${c.merchant}”`, 'ok', {
      action: {
        label: 'Undo',
        run: () => {
          void repo.saveCapture(user.uid, c)
        },
      },
    })
  }
  // Clear all is a tidy-up too: everything goes at once, and one Undo brings every one of them back.
  const clearAll = () => {
    const gone = [...list]
    repo
      .deleteCaptures(
        user.uid,
        gone.map((c) => c.id),
      )
      .catch((e) => toast(errText(e), 'err'))
    setOpen(false)
    setShowAll(false)
    toast(`Cleared ${gone.length} handled ${gone.length === 1 ? 'payment' : 'payments'}`, 'ok', {
      action: {
        label: 'Undo',
        run: () => {
          for (const c of gone) void repo.saveCapture(user.uid, c)
        },
      },
    })
  }
  return (
    <section className="mt-6">
      {/* Title, then Clear all (only while the list is open: it acts on what you can see), then the
          chevron. On the narrowest phones Clear all is just its icon, so the row never wraps. */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="text-muted flex min-h-11 min-w-0 flex-1 items-center px-1 py-1 text-left text-sm font-semibold"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          data-testid="inbox-handled"
        >
          Recently handled · {list.length}
        </button>
        {open && (
          <button
            type="button"
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full px-2.5 text-sm font-semibold text-brand-600 dark:text-brand-300"
            onClick={clearAll}
            aria-label={`Clear all ${list.length} recently handled payments`}
            data-testid="inbox-handled-clear"
          >
            <Trash2 size={15} aria-hidden />
            <span className="hidden min-[360px]:inline">Clear all</span>
          </button>
        )}
        <button
          type="button"
          className="text-muted flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? 'Hide recently handled' : 'Show recently handled'}
          data-testid="inbox-handled-chevron"
        >
          <ChevronDown size={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </div>
      {open && (
        <div className="card mt-2 divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
          {shown.map((c) => {
            const g = c.groupId ? name[c.groupId] : undefined
            const body = (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.merchant}</span>
                <span className="text-muted block truncate text-xs">
                  {formatMoney(c.amount, c.currency ?? profile.currency)} ·{' '}
                  {c.status === 'assigned' ? `Added to ${g ? `${g.emoji} ${g.name}` : 'a group'}` : 'Not shared'}
                </span>
              </span>
            )
            return (
              <SwipeRow
                key={c.id}
                as="div"
                contentClassName="flex items-center gap-1 px-3 py-2"
                menuTitle={c.merchant}
                actions={[{ label: 'Delete', ariaLabel: `Delete ${c.merchant}`, icon: <Trash2 size={20} strokeWidth={2.25} />, onClick: () => remove(c) }]}
              >
                {c.status === 'assigned' && c.groupId && c.expenseId ? (
                  <Link to={`/groups/${c.groupId}/expenses/${c.expenseId}`} className="flex min-w-0 flex-1 items-center py-1">
                    {body}
                  </Link>
                ) : (
                  body
                )}
                {c.status === 'dismissed' && (
                  <button
                    type="button"
                    className="flex h-11 w-11 items-center justify-center rounded-full text-brand-600 dark:text-brand-300"
                    aria-label={`Move ${c.merchant} back to sort`}
                    title="Back to sort"
                    onClick={() => repo.updateCapture(user.uid, c.id, { status: 'pending' }).catch((e) => toast(errText(e), 'err'))}
                  >
                    <RotateCcw size={16} />
                  </button>
                )}
              </SwipeRow>
            )
          })}
          {!showAll && list.length > HANDLED_FIRST && (
            <button
              type="button"
              className="min-h-11 w-full px-3 py-2 text-sm font-semibold text-brand-600 dark:text-brand-300"
              onClick={() => setShowAll(true)}
            >
              Show all {list.length}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

/** A group someone else deleted: who and when, how long is left, and Restore in one tap. */
function DeletedGroupRow({ group }: { group: Group }) {
  const { user } = useMe()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const now = Date.now()
  const by = labelForUid(group.members, group.deletedBy, memberIdOfUid(group.members, user.uid)) ?? 'Someone'
  const left = daysLeft(group.deletedAt ?? now, now)
  const restore = async () => {
    setBusy(true)
    try {
      await repo.restoreGroup(group)
      toast(`“${group.name}” is back`)
    } catch (e) {
      toast(errText(e), 'err')
      setBusy(false)
    }
  }
  return (
    <div className="card flex items-center gap-3 p-3" data-testid="inbox-deleted-group">
      <Link to={`/groups/${group.id}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-xl dark:bg-rose-500/10" aria-hidden>
          {group.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{group.name}</span>
          <span className="text-muted block truncate text-xs">
            {by} deleted it {group.deletedAt ? formatDate(group.deletedAt, { day: 'numeric', month: 'short' }) : ''} ·{' '}
            {left <= 1 ? 'last day to restore' : `${left} days left`}
          </span>
        </span>
      </Link>
      <button
        type="button"
        className="chip min-h-11 shrink-0"
        onClick={() => void restore()}
        disabled={busy}
        aria-label={`Restore ${group.name}`}
        data-testid="inbox-deleted-group-restore"
      >
        <RotateCcw size={15} aria-hidden /> Restore
      </button>
    </div>
  )
}

/** `hint`: plain text is a status (a count) and always shows; a Hint follows the detail level. */
function Section({ title, hint, children }: { title: string; hint?: string | Hint; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="flex items-center font-bold">
          {title}
          {hint && <InfoTip hint={hint} label={`About ${title}`} />}
        </h2>
        {hint && <HintText hint={hint} as="span" className="text-muted text-xs" />}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function Quiet({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-8 text-center">
      <div className="mb-2 text-4xl" aria-hidden>
        {emoji}
      </div>
      <h2 className="font-bold">{title}</h2>
      <p className="text-muted mt-1 text-sm">{children}</p>
    </div>
  )
}

/**
 * Updates: the live window (a few per group), shown a page at a time, with Show older reading
 * further back from the server. Clear all and ✕ hide entries for this person only (every device);
 * the groups' history itself is never touched.
 */
function Updates({
  box,
  groupsById,
  isNew,
  sort,
  onSort,
}: {
  box: ReturnType<typeof useInbox>
  groupsById: Record<string, Group>
  isNew: (a: ActivityEntry) => boolean
  sort: UpdatesSort
  onSort: (s: UpdatesSort) => void
}) {
  const { user } = useMe()
  const toast = useToast()
  const cleared = useInboxState()
  const page = tuning().inboxPageSize
  const [limit, setLimit] = useState(page)
  const [older, setOlder] = useState<ActivityEntry[]>([])
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [exhausted, setExhausted] = useState(false)

  const all = useMemo(() => mergeOlder(box.updates, visibleUpdates(collapseRuns(older), cleared)), [box.updates, older, cleared])
  const shown = useMemo(() => all.slice(0, limit), [all, limit])
  const sections = useMemo(() => sortUpdates(shown, sort, (id) => groupsById[id]?.name ?? 'Other'), [shown, sort, groupsById])
  // Where the next server read starts: the oldest entry read so far, cleared ones included.
  const oldestRead = Math.min(...box.feed.map((a) => a.createdAt), ...older.map((a) => a.createdAt))
  const canFetch = !exhausted && !!box.ids?.length && Number.isFinite(oldestRead) && oldestRead > cleared.clearedAt
  const more = all.length > limit || canFetch

  const save = (next: typeof cleared, undoTo?: typeof cleared, text?: string) => {
    repo.saveInboxState(user.uid, next).catch((e) => toast(errText(e), 'err'))
    if (undoTo && text)
      toast(text, 'ok', {
        action: {
          label: 'Undo',
          run: () => {
            void repo.saveInboxState(user.uid, undoTo)
          },
        },
      })
  }
  const clearAll = () => save(clearAllUpdates(Date.now()), cleared, 'Updates cleared')
  const hide = (a: ActivityEntry) => save(hideUpdate(cleared, a.id))

  const showOlder = async () => {
    if (all.length > limit) {
      setLimit((l) => l + page)
      return
    }
    if (!canFetch || !box.ids) return
    setLoadingOlder(true)
    try {
      // A private group's lines open with its key (or show locked), one entry at a time.
      const got = await Promise.all((await repo.fetchActivityBefore(box.ids, oldestRead, page)).map((a) => openOnce(a.groupId, a)))
      if (got.length < page) setExhausted(true)
      setOlder((o) => [...o, ...got])
      setLimit((l) => l + page)
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setLoadingOlder(false)
    }
  }

  if (all.length === 0 && !more)
    return (
      <Quiet emoji="🔔" title={cleared.clearedAt ? 'All caught up' : 'No updates yet'}>
        Expenses, payments, imports and new members in your groups show here. New ones from friends get a dot.
      </Quiet>
    )

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        {/* The sort menu is optional: hidden in the Minimal look (Clear all stays). */}
        <Detail min={2}>
          <SortPicker<UpdatesSort>
            value={sort}
            onChange={onSort}
            testId="updates-sort"
            options={[
              { value: 'newest', label: 'Newest first' },
              { value: 'oldest', label: 'Oldest first' },
              { value: 'group', label: 'By group' },
            ]}
          />
        </Detail>
        {all.length > 0 && (
          <button
            type="button"
            className="ml-auto min-h-11 rounded-xl px-3 text-sm font-semibold text-brand-600 dark:text-brand-300"
            onClick={clearAll}
            data-testid="updates-clear-all"
          >
            Clear all
          </button>
        )}
      </div>
      {all.length === 0 && (
        <p className="text-muted px-1 pb-2 text-sm" role="status">
          Everything recent is cleared.
        </p>
      )}
      <div className="space-y-4">
        {sections.map((sec) => (
          <section key={sec.groupId ?? 'all'}>
            {sec.title && (
              <h2 className="mb-2 px-1 font-bold">
                {sec.groupId && groupsById[sec.groupId] && <span aria-hidden>{groupsById[sec.groupId].emoji} </span>}
                {sec.title}
              </h2>
            )}
            <ActivityFeed entries={sec.entries} groups={groupsById} showGroup={!sec.title} isNew={isNew} onHide={hide} />
          </section>
        ))}
      </div>
      {more && (
        <button type="button" className="btn-secondary mt-3 w-full" onClick={showOlder} disabled={loadingOlder} data-testid="updates-older">
          {loadingOlder && <Loader2 size={18} className="animate-spin" aria-hidden />} Show older
        </button>
      )}
    </>
  )
}

/** A compact labelled sort menu (a native select: one tap, screen readers and keyboards for free). */
function SortPicker<T extends string>({
  value,
  onChange,
  options,
  testId,
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: string }>
  testId?: string
}) {
  return (
    <label className="text-muted flex min-h-11 items-center gap-1.5 text-sm">
      Sort
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          data-testid={testId}
          className="min-h-10 appearance-none rounded-xl bg-slate-100 py-2 pl-3 pr-8 text-sm font-semibold text-slate-900 dark:bg-ink-800 dark:text-white"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" aria-hidden />
      </span>
    </label>
  )
}

/**
 * Someone asking to join a group you made: let them in, as a new person or as one of its
 * placeholders, or not. A private group's through the vault op decideJoin, after your passkey;
 * while it is locked here its names are sealed: the person is "Someone", and they can only come in
 * as new. An ordinary group's (new people need your OK) through the joinApproval op decide.
 */
function JoinRequestRow({ request, d }: { request: JoinRequest; d: GroupData | undefined }) {
  const toast = useToast()
  const confirm = useConfirm()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const group = d?.group
  const open = !!group && !isSealed(group.name)
  const who = isSealed(request.name) ? 'Someone' : request.name
  const placeholders = open && group ? Object.entries(group.members).filter(([, m]) => !m.uid && m.removedAt === undefined) : []
  const decide = async (approve: boolean, memberId?: string) => {
    setPicking(false)
    setBusy(true)
    try {
      if (group && !group.vault) {
        await repo.joinApproval({ op: 'decide', groupId: request.groupId, uid: request.uid, approve, ...(memberId ? { memberId } : {}) })
        toast(approve ? `${who} is in the group now` : 'Request declined')
        return
      }
      const auth = await passkeyProof(repo)
      const r = await repo.vault<{ opens?: boolean }>({
        op: 'decideJoin',
        groupId: request.groupId,
        uid: request.uid,
        approve,
        ...(memberId ? { memberId } : {}),
        auth,
      })
      // Let in, with nothing to open it with yet: offer to give it its own pattern to tell them.
      if (approve && r.opens === false) {
        if (await confirm(addedPrompt(who))) nav(`/groups/${request.groupId}?private=pattern`)
      } else toast(approve ? `${who} can open it now` : 'Request declined')
    } catch (e) {
      if (!passkeyCancelled(e)) toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="card p-4" data-testid="join-request-row">
      <div className="text-sm">
        <b>{who}</b> asked to join <b>{open && group ? group.name : 'a private group'}</b>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={() => (placeholders.length ? setPicking(true) : void decide(true))}
          data-testid="join-approve"
        >
          Let them in
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void decide(false)} data-testid="join-decline">
          Decline
        </button>
      </div>
      <Sheet open={picking} onClose={() => setPicking(false)} title={`Who is ${who}?`}>
        <p className="text-muted mb-3 text-sm">If they’re already in the group under a name you added, pick it: what was theirs becomes theirs.</p>
        <div className="space-y-2">
          {placeholders.map(([id, m]) => (
            <button key={id} type="button" className="btn w-full" onClick={() => void decide(true, id)}>
              {m.name}
            </button>
          ))}
          <button type="button" className="btn-primary w-full" onClick={() => void decide(true)}>
            Someone new
          </button>
        </div>
      </Sheet>
    </div>
  )
}
