import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, Check, Home, Inbox, Loader2, Pencil, Plus, Undo2, User, X } from 'lucide-react'
import { repo } from '@/data'
import { draftToCapture } from '@/data/repo'
import { useMe } from '@/hooks/auth'
import { createGroup, memberOrder, myMemberId, useCaptures, useExpenses, useGroups } from '@/hooks/data'
import { useMerchantMemory } from '@/hooks/useMerchants'
import { usePausedTrips } from '@/hooks/useCapturePrefs'
import type { Capture, Group } from '@/types'
import { usePageTitle } from '@/lib/brand'
import { SOURCE_LABEL, parseCaptureParams, rankGroupsForCapture } from '@/lib/capture'
import { colorFor } from '@/lib/colors'
import { findDuplicate } from '@/lib/duplicates'
import { suggestCategory } from '@/lib/merchants'
import { errText } from '@/lib/errors'
import { formatDate } from '@/lib/locale'
import { formatMoney } from '@/lib/money'
import { todayISO, uid } from '@/lib/id'
import { buildExpense } from '@/lib/statement'
import { FIRST_WALLET_NAME, justMeTarget, walletsOf } from '@/lib/wallets'
import { GroupIcon } from '@/components/GroupIcon'
import { Empty, LiveBadge, Loading, PageHeader } from '@/components/Misc'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'

/** Guards against React StrictMode / reloads creating the same capture twice. */
const inflight = new Map<string, Promise<string>>()

/**
 * /capture?amount=…&merchant=…  — files a capture from an automation link, then shows the prompt.
 * /capture/:captureId           — the "is this a group expense?" prompt for an existing capture.
 */
export default function CapturePage() {
  usePageTitle('Captured payment')
  const { captureId } = useParams()
  return captureId ? <Prompt id={captureId} /> : <CreateFromLink />
}

function CreateFromLink() {
  const [params] = useSearchParams()
  const { user } = useMe()
  const captures = useCaptures()
  const nav = useNavigate()
  const [error, setError] = useState<string>()
  const parsed = useMemo(() => parseCaptureParams(params, todayISO()), [params])

  useEffect(() => {
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    if (!captures) return
    const { draft } = parsed
    const key = params.toString()
    // A link with an idempotency key that we've already filed just reopens it.
    if (draft.ref && captures.some((c) => c.id === draft.ref)) {
      nav(`/capture/${draft.ref}`, { replace: true })
      return
    }
    let p = inflight.get(key)
    if (!p) {
      const id = draft.ref ?? uid('c_')
      p = repo.saveCapture(user.uid, draftToCapture(draft, id)).then(() => id)
      inflight.set(key, p)
    }
    p.then((id) => nav(`/capture/${id}`, { replace: true })).catch((e) => {
      inflight.delete(key)
      setError(errText(e))
    })
  }, [parsed, captures, params, user.uid, nav])

  if (error) {
    return (
      <Shell>
        <Empty emoji="🤔" title="Couldn’t read that payment">
          {error}
          <div className="mt-4 flex justify-center gap-2">
            <Link to="/add" className="btn-primary">
              <Plus size={18} aria-hidden /> Add manually
            </Link>
            <Link to="/" className="btn-secondary">
              <Home size={18} aria-hidden /> Home
            </Link>
          </div>
        </Empty>
      </Shell>
    )
  }
  return <Loading />
}

function Prompt({ id }: { id: string }) {
  const captures = useCaptures()
  const groups = useGroups()
  if (!captures || !groups) return <Loading />
  const c = captures.find((x) => x.id === id)
  if (!c)
    return (
      <Shell>
        <Empty emoji="🔍" title="Payment not found">
          It may have been removed.{' '}
          <Link to="/inbox" className="font-semibold text-brand-600 dark:text-brand-300">
            Open Inbox
          </Link>
        </Empty>
      </Shell>
    )
  return <PromptView c={c} groups={groups.filter((g) => !g.archived)} />
}

export function captureHeadline(c: Capture, fallbackCurrency: string) {
  return `${formatMoney(c.amount, c.currency ?? fallbackCurrency)} at ${c.merchant}`
}

const SHEET_ROW = 'flex min-h-12 w-full items-center gap-3 rounded-2xl p-2.5 text-left hover:bg-slate-50 dark:hover:bg-ink-800'

/** Merchants the parser couldn't name read badly in "You spent ₹X at Payment". */
const merchantKnown = (m: string) => !!m && !/^(payment|upi payment|unknown merchant|shared payment)$/i.test(m.trim())

function PromptView({ c, groups }: { c: Capture; groups: Group[] }) {
  const { user, profile } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const paused = usePausedTrips()
  // Trips this person paused capture for stay in the list but are never pre-selected.
  const { ranked, best } = useMemo(() => rankGroupsForCapture(groups, { date: c.date, currency: c.currency, paused }), [groups, c, paused])
  const suggested = c.suggestedGroup && ranked.some((g) => g.id === c.suggestedGroup) ? c.suggestedGroup : best
  // Follows the suggestion until the person picks a group (the paused trips load after the first render).
  const [picked, setSelected] = useState<string | undefined>()
  const selected = picked ?? suggested
  const [busy, setBusy] = useState<'add' | 'personal' | 'dismiss' | null>(null)
  const [walletSheet, setWalletSheet] = useState(false)
  const chosen = ranked.find((g) => g.id === selected)
  const memory = useMerchantMemory()
  // The chosen group's expenses, to catch a payment that is already in it before the one-tap add.
  const chosenExpenses = useExpenses(chosen?.id)
  const cur = c.currency ?? profile.currency
  // One tap only when no conversion is needed; otherwise the form shows the rate first.
  const sameCurrency = !!chosen && (!c.currency || c.currency === chosen.currency)
  const source = SOURCE_LABEL[c.source] ?? c.source

  if (c.status !== 'pending') {
    return (
      <Shell>
        <Empty emoji={c.status === 'assigned' ? '✅' : '🙈'} title={c.status === 'assigned' ? 'Already added' : 'Not shared'}>
          {captureHeadline(c, cur)} was {c.status === 'assigned' ? 'added to a group' : 'marked as not shared'}.
          <div className="mt-4 flex justify-center gap-2">
            {c.groupId && (
              <Link to={`/groups/${c.groupId}`} className="btn-primary">
                <ArrowRight size={18} aria-hidden /> Open group
              </Link>
            )}
            {c.status === 'dismissed' && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => repo.updateCapture(user.uid, c.id, { status: 'pending' }).catch((e) => toast(errText(e), 'err'))}
              >
                <Undo2 size={18} aria-hidden /> Undo
              </button>
            )}
            <Link to="/inbox" className="btn-secondary">
              <Inbox size={18} aria-hidden /> Inbox
            </Link>
          </div>
        </Empty>
      </Shell>
    )
  }

  const toExpense = (groupId: string) => nav(`/add?group=${encodeURIComponent(groupId)}&capture=${encodeURIComponent(c.id)}`)

  // The one-tap add: an equal split that you paid, saved now, undoable from the toast.
  const addNow = async () => {
    if (!chosen) return
    const g = groups.find((x) => x.id === chosen.id)
    if (!g) return
    // Already in the group (same amount, a day apart, same merchant)? Open the form so it can be checked, nothing saved.
    const dup =
      chosenExpenses && findDuplicate(chosenExpenses, { amount: c.amount, cur: c.currency ?? g.currency, date: c.date, description: c.merchant }, g.currency)
    if (dup) {
      toast(`Looks like “${dup.description}” is already in ${g.name}. Check it before saving.`)
      toExpense(g.id)
      return
    }
    setBusy('add')
    try {
      const order = memberOrder(g)
      const me = myMemberId(g, user.uid) ?? order[0]
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
        Date.now(),
      )
      await repo.saveExpense(e)
      await repo.updateCapture(user.uid, c.id, { status: 'assigned', groupId: g.id, expenseId: e.id })
      toast(`Added to ${g.name} · ${formatMoney(c.amount, g.currency)}`, 'ok', {
        action: {
          label: 'Undo',
          run: () => {
            void repo.deleteExpense(g.id, e.id)
            void repo.updateCapture(user.uid, c.id, { status: 'pending' })
          },
        },
      })
      nav(`/groups/${g.id}`, { replace: true })
    } catch (e) {
      toast(errText(e), 'err')
      setBusy(null)
    }
  }

  // "Personal": straight to the only wallet, a new "My spending" when there is none, else a choice.
  const personal = async () => {
    const target = justMeTarget(groups)
    if (target.kind === 'pick') return setWalletSheet(true)
    if (target.kind === 'open') return toExpense(target.id)
    setBusy('personal')
    try {
      const id = await createGroup({
        name: FIRST_WALLET_NAME,
        emoji: '👛',
        type: 'personal',
        currency: cur,
        simplify: false,
        createdBy: user.uid,
        memberUids: [user.uid],
        members: { [user.uid]: { name: profile.displayName, uid: user.uid, email: user.email, color: colorFor(0) } },
      })
      toExpense(id)
    } catch (e) {
      toast(errText(e), 'err')
      setBusy(null)
    }
  }

  const dismiss = async () => {
    setBusy('dismiss')
    try {
      await repo.updateCapture(user.uid, c.id, { status: 'dismissed' })
      toast('Marked not shared', 'ok', {
        action: {
          label: 'Undo',
          run: () => {
            void repo.updateCapture(user.uid, c.id, { status: 'pending' })
          },
        },
      })
      nav('/inbox', { replace: true })
    } catch (e) {
      toast(errText(e), 'err')
      setBusy(null)
    }
  }

  return (
    <Shell>
      <div className="card p-5 text-center">
        <div
          className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-fill-500 to-fill-to text-2xl text-on-fill shadow-lg"
          aria-hidden
        >
          💳
        </div>
        <h2 className="text-lg font-bold leading-snug">
          {merchantKnown(c.merchant) ? (
            <>
              You spent <span className="tabular-nums">{formatMoney(c.amount, cur)}</span> at {c.merchant} — is this a group expense?
            </>
          ) : (
            <>
              You paid <span className="tabular-nums">{formatMoney(c.amount, cur)}</span> ({source}) — is this a group expense?
            </>
          )}
        </h2>
        <div className="text-muted mt-1.5 text-sm">
          {formatDate(c.date, { weekday: 'short', day: 'numeric', month: 'short' })}
          {' · '}
          {source}
          {c.card ? ` · ${c.card}` : ''}
        </div>
        {c.note && <div className="text-muted mt-2 text-sm">“{c.note}”</div>}
      </div>

      {ranked.length > 0 ? (
        <div className="mt-4">
          <h2 className="text-muted mb-2 px-1 text-sm font-semibold">Split with</h2>
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5" role="radiogroup" aria-label="Group">
            {ranked.map((g) => (
              <button
                key={g.id}
                type="button"
                role="radio"
                aria-checked={selected === g.id}
                onClick={() => setSelected(g.id)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left ${selected === g.id ? 'bg-brand-50 dark:bg-brand-900/30' : ''}`}
              >
                <GroupIcon emoji={g.emoji} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{g.name}</span>
                    {g.inWindow && <LiveBadge type={g.type} />}
                  </div>
                  <div className="text-muted text-xs">
                    {Object.keys(g.members).length} people · {g.currency}
                  </div>
                </div>
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${selected === g.id ? 'border-brand-600 bg-fill text-on-fill' : 'border-slate-400 dark:border-ink-700'}`}
                  aria-hidden
                >
                  {selected === g.id && <Check size={14} />}
                </span>
              </button>
            ))}
          </div>
          {chosen && c.currency && chosen.currency !== c.currency && (
            <p className="text-muted mt-2 px-1 text-xs">
              {chosen.name} uses {chosen.currency}. The expense is entered as {formatMoney(c.amount, c.currency)} and converted to {chosen.currency} at the ECB
              rate for {formatDate(c.date)}; you can check the rate before saving.
            </p>
          )}
          <button
            type="button"
            className="btn-primary mt-3 w-full"
            disabled={!chosen || !!busy}
            onClick={() => (sameCurrency ? addNow() : chosen && toExpense(chosen.id))}
            data-testid="capture-add"
          >
            {busy === 'add' ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Check size={18} aria-hidden />}
            {!chosen ? 'Pick a group' : sameCurrency ? `Split equally in ${chosen.name}` : `Add to ${chosen.name}`}
          </button>
          {chosen && sameCurrency && (
            <button type="button" className="btn-ghost mt-1 w-full" disabled={!!busy} onClick={() => toExpense(chosen.id)} data-testid="capture-edit">
              <Pencil size={16} aria-hidden /> Edit details first
            </button>
          )}
        </div>
      ) : (
        <div className="card mt-4 p-4 text-center">
          <p className="text-muted text-sm">No groups yet. Create one to split this, or keep it as personal spending.</p>
          <Link to="/groups/new?next=add" className="btn-primary mt-3 w-full">
            <Plus size={18} aria-hidden /> Create a group
          </Link>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary" disabled={!!busy} onClick={personal}>
          {busy === 'personal' ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <User size={18} aria-hidden />} Personal
        </button>
        <button type="button" className="btn-secondary" disabled={!!busy} onClick={dismiss} data-testid="capture-dismiss">
          {busy === 'dismiss' ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <X size={18} aria-hidden />} Not shared
        </button>
      </div>
      <Link to="/inbox" className="btn-ghost mt-2 w-full">
        <Inbox size={18} aria-hidden /> Decide later
      </Link>
      <Sheet open={walletSheet} onClose={() => setWalletSheet(false)} title="Which wallet?">
        <div className="space-y-1" data-testid="capture-wallets">
          {walletsOf(groups).map((g) => (
            <button key={g.id} type="button" className={SHEET_ROW} onClick={() => toExpense(g.id)}>
              <GroupIcon emoji={g.emoji} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{g.name}</span>
                <span className="text-muted block truncate text-xs">
                  {g.budget ? `Budget ${formatMoney(g.budget, g.currency)} · ` : ''}
                  {g.currency}
                </span>
              </span>
            </button>
          ))}
          <Link to={`/groups/new?type=personal&next=add&capture=${encodeURIComponent(c.id)}`} className={SHEET_ROW}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
              <Plus size={20} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 font-semibold">New wallet…</span>
          </Link>
        </div>
      </Sheet>
      <p className="text-muted mt-4 text-center text-xs">
        {sameCurrency ? 'Undo from the toast if you change your mind.' : 'Nothing is added until you save the expense.'}
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-10">
      <PageHeader title="Captured payment" back />
      {children}
    </div>
  )
}
