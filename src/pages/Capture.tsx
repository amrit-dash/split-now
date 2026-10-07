import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Check, Inbox, User, X } from 'lucide-react'
import { repo } from '@/data'
import { draftToCapture } from '@/data/repo'
import { useMe } from '@/hooks/auth'
import { useCaptures, useGroups } from '@/hooks/data'
import type { Capture, Group } from '@/types'
import { SOURCE_LABEL, parseCaptureParams, rankGroupsForCapture } from '@/lib/capture'
import { colorFor } from '@/lib/colors'
import { formatMoney } from '@/lib/money'
import { todayISO, uid } from '@/lib/id'
import { GroupIcon } from '@/components/GroupIcon'
import { Empty, LiveBadge, Loading, PageHeader } from '@/components/Misc'
import { useToast } from '@/components/Toast'

/** Guards against React StrictMode / reloads creating the same capture twice. */
const inflight = new Map<string, Promise<string>>()

/**
 * /capture?amount=…&merchant=…  — files a capture from an automation link, then shows the prompt.
 * /capture/:captureId           — the "is this a group expense?" prompt for an existing capture.
 */
export default function CapturePage() {
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
    if (!parsed.ok) { setError(parsed.error); return }
    if (!captures) return
    const { draft } = parsed
    const key = params.toString()
    // A link with an idempotency key that we've already filed just reopens it.
    if (draft.ref && captures.some((c) => c.id === draft.ref)) { nav(`/capture/${draft.ref}`, { replace: true }); return }
    let p = inflight.get(key)
    if (!p) {
      const id = draft.ref ?? uid('c_')
      p = repo.saveCapture(user.uid, draftToCapture(draft, id)).then(() => id)
      inflight.set(key, p)
    }
    p.then((id) => nav(`/capture/${id}`, { replace: true })).catch((e) => { inflight.delete(key); setError((e as Error).message) })
  }, [parsed, captures, params, user.uid, nav])

  if (error) {
    return (
      <Shell>
        <Empty emoji="🤔" title="Couldn’t read that payment">
          {error}
          <div className="mt-4 flex justify-center gap-2">
            <Link to="/add" className="btn-primary">Add manually</Link>
            <Link to="/" className="btn-secondary">Home</Link>
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
  if (!c) return <Shell><Empty emoji="🔍" title="Payment not found">It may have been removed. <Link to="/inbox" className="font-semibold text-brand-600">Open inbox</Link></Empty></Shell>
  return <PromptView c={c} groups={groups} />
}

export function captureHeadline(c: Capture, fallbackCurrency: string) {
  return `${formatMoney(c.amount, c.currency ?? fallbackCurrency)} at ${c.merchant}`
}

function PromptView({ c, groups }: { c: Capture; groups: Group[] }) {
  const { user, profile } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const { ranked, best } = useMemo(() => rankGroupsForCapture(groups, c), [groups, c])
  const suggested = c.suggestedGroup && ranked.some((g) => g.id === c.suggestedGroup) ? c.suggestedGroup : best
  const [selected, setSelected] = useState<string | undefined>(suggested)
  const [busy, setBusy] = useState(false)
  const chosen = ranked.find((g) => g.id === selected)
  const cur = c.currency ?? profile.currency

  if (c.status !== 'pending') {
    return (
      <Shell>
        <Empty emoji={c.status === 'assigned' ? '✅' : '🙈'} title={c.status === 'assigned' ? 'Already added' : 'Dismissed'}>
          {captureHeadline(c, cur)} was {c.status === 'assigned' ? 'added to a group' : 'marked as not shared'}.
          <div className="mt-4 flex justify-center gap-2">
            {c.groupId && <Link to={`/groups/${c.groupId}`} className="btn-primary">Open group</Link>}
            {c.status === 'dismissed' && <button className="btn-secondary" onClick={() => repo.updateCapture(user.uid, c.id, { status: 'pending' })}>Undo</button>}
            <Link to="/inbox" className="btn-secondary">Inbox</Link>
          </div>
        </Empty>
      </Shell>
    )
  }

  const toExpense = (groupId: string) => nav(`/add?group=${groupId}&capture=${c.id}`)

  const personal = async () => {
    setBusy(true)
    try {
      const g = groups.find((x) => x.type === 'personal')
      const id = g?.id ?? await repo.createGroup({
        name: 'My spending', emoji: '👛', type: 'personal', currency: cur, simplify: false, createdBy: user.uid,
        memberUids: [user.uid], members: { [user.uid]: { name: profile.displayName, uid: user.uid, email: user.email, color: colorFor(0) } },
      })
      toExpense(id)
    } catch (e) {
      toast((e as Error).message, 'err')
      setBusy(false)
    }
  }

  const dismiss = async () => {
    await repo.updateCapture(user.uid, c.id, { status: 'dismissed' })
    toast('Dismissed — it won’t be shared')
    nav('/inbox', { replace: true })
  }

  return (
    <Shell>
      <div className="card p-5 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-500 to-fuchsia-500 text-2xl text-white shadow-lg">💳</div>
        <div className="text-lg font-bold leading-snug">
          You spent <span className="tabular-nums">{formatMoney(c.amount, cur)}</span> at {c.merchant} — is this a group expense?
        </div>
        <div className="mt-1.5 text-sm text-slate-500">
          {new Date(c.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
          {' · '}{SOURCE_LABEL[c.source] ?? c.source}{c.card ? ` · ${c.card}` : ''}
        </div>
        {c.note && <div className="mt-2 text-sm text-slate-500">“{c.note}”</div>}
      </div>

      {ranked.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 px-1 text-sm font-semibold text-slate-500">Split with</div>
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
            {ranked.map((g) => (
              <button key={g.id} onClick={() => setSelected(g.id)} className={`flex w-full items-center gap-3 px-4 py-3 text-left ${selected === g.id ? 'bg-brand-50 dark:bg-brand-900/30' : ''}`}>
                <GroupIcon emoji={g.emoji} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="truncate font-semibold">{g.name}</span>{g.inWindow && <LiveBadge />}</div>
                  <div className="text-xs text-slate-500">{Object.keys(g.members).length} people · {g.currency}</div>
                </div>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${selected === g.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 dark:border-ink-700'}`}>{selected === g.id && <Check size={14} />}</span>
              </button>
            ))}
          </div>
          {chosen && c.currency && chosen.currency !== c.currency && (
            <p className="mt-2 px-1 text-xs text-slate-500">{chosen.name} uses {chosen.currency}. The expense is entered as {formatMoney(c.amount, c.currency)} and converted to {chosen.currency} at the ECB rate for {c.date}; you can change the rate before saving.</p>
          )}
          <button className="btn-primary mt-3 w-full" disabled={!chosen || busy} onClick={() => chosen && toExpense(chosen.id)}>
            {chosen ? `Split equally in ${chosen.name}` : 'Pick a group'}
          </button>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="btn-secondary" disabled={busy} onClick={personal}><User size={18} /> Personal</button>
        <button className="btn-secondary" disabled={busy} onClick={dismiss}><X size={18} /> Not shared</button>
      </div>
      <Link to="/inbox" className="btn-ghost mt-2 w-full"><Inbox size={18} /> Decide later</Link>
      <p className="mt-4 text-center text-xs text-slate-400">Nothing is added until you save the expense.</p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-10">
      <PageHeader title="Captured payment" back="/inbox" />
      {children}
    </div>
  )
}
