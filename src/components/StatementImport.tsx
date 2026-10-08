import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, ImageUp, Inbox, Loader2, Plus, Sparkles, X } from 'lucide-react'
import { repo } from '@/data'
import type { AiState, StatementTxn } from '@/data/repo'
import { useMe } from '@/hooks/auth'
import { memberOrder, myMemberId, useExpenses, useGroups } from '@/hooks/data'
import { useAiStatus } from '@/hooks/useAiStatus'
import { useFlag } from '@/hooks/useAppConfig'
import { useOnline } from '@/hooks/useOnline'
import type { Category, Group, MemberId } from '@/types'
import { aiAvailability } from '@/lib/ai-copy'
import { CATEGORIES, guessCategory } from '@/lib/categories'
import { aiScanPossible, unavailableText } from '@/lib/ai'
import { errText } from '@/lib/errors'
import { blobToDataUrl, downscale } from '@/lib/image'
import { todayISO, uid } from '@/lib/id'
import { formatDate } from '@/lib/locale'
import { formatMoney, fromHundredths } from '@/lib/money'
import { DEFAULT_ALL_PREFS, watchPrefs, type AllPrefs } from '@/lib/push'
import { bestGroup, buildExpense, flagsFor, preselect, tidyName, type Flag } from '@/lib/statement'
import { GroupIcon } from './GroupIcon'
import { MemberChips } from './MemberChips'
import { Select } from './Select'
import { useToast } from './Toast'

interface Row {
  id: string
  txn: StatementTxn
  /** minor units of the statement currency */
  amount: number
  description: string
  category: Category
  notes?: string
  on: boolean
  /** per-row split override */
  members?: MemberId[]
}

const FLAG: Record<Flag, { text: string; cls: string }> = {
  in_trip: { text: 'In trip dates', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' },
  outside_trip: { text: 'Outside trip dates', cls: 'bg-slate-100 text-slate-700 dark:bg-ink-800 dark:text-slate-300' },
  maybe_added: { text: 'Maybe already added', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  received: { text: 'Received', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300' },
  own_transfer: { text: 'Own transfer', cls: 'bg-slate-100 text-slate-700 dark:bg-ink-800 dark:text-slate-300' },
  refund: { text: 'Refund', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300' },
}

const MAX_FILES = 6

/**
 * Scan → Statement: screenshots of GPay / PhonePe / a bank app become a list of payments. Each
 * is flagged against the chosen group (in trip dates, maybe already added, received, own
 * transfer); the user ticks what belongs, sets who paid and the split once, and adds them all,
 * or sends them to the Inbox to finish one by one in the full expense form. This path has no
 * on-phone fallback, so it is gated up front when AI can't read for this account.
 */
export function StatementImport() {
  const groups = useGroups()
  const { user } = useMe()
  const toast = useToast()
  const nav = useNavigate()
  const online = useOnline()
  const status = useAiStatus()
  const statementImport = useFlag('statementImport')
  const fileRef = useRef<HTMLInputElement>(null)
  const [prefs, setPrefs] = useState<AllPrefs>(DEFAULT_ALL_PREFS)
  const [aiState, setAiState] = useState<AiState | null>(null)
  const [stage, setStage] = useState<'prep' | 'ai' | null>(null)
  const [saving, setSaving] = useState(false)
  const [currency, setCurrency] = useState('INR')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [groupId, setGroupId] = useState<string>()
  const [payer, setPayer] = useState<MemberId>()
  const [members, setMembers] = useState<MemberId[]>()
  const [open, setOpen] = useState<string | null>(null)
  const run = useRef(0)
  useEffect(() => (aiScanPossible() ? watchPrefs(user.uid, setPrefs) : undefined), [user.uid])
  useEffect(() => (aiScanPossible() ? repo.watchAiState(user.uid, setAiState) : undefined), [user.uid])

  const group = groups?.find((g) => g.id === groupId)
  const expenses = useExpenses(group?.id)
  const order = useMemo(() => (group ? memberOrder(group) : []), [group])
  const me = group ? (myMemberId(group, user.uid) ?? order[0]) : undefined
  const personal = group?.type === 'personal'
  const who = personal ? me : payer && order.includes(payer) ? payer : me
  const split = personal && me ? [me] : (members?.filter((m) => order.includes(m)) ?? order)
  const busy = stage !== null

  // Can AI read for this account right now? Demo mode shows a sample; an unknown status doesn't block.
  const avail = aiAvailability({ status, hasOwnKey: !!aiState?.hint, ownKeyBroken: !!aiState?.lastError, enabled: prefs.aiEnabled && prefs.aiImages })
  const blocked = aiScanPossible() && status !== undefined && !avail.images
  const keyWouldHelp = aiScanPossible() && !!status && status.app.images !== 'available' && !aiState?.hint

  const flags = useMemo(() => {
    const out: Record<string, Flag[]> = {}
    for (const r of rows ?? []) out[r.id] = flagsFor({ ...r.txn, amount: r.amount }, group, expenses ?? [])
    return out
  }, [rows, group, expenses])

  const pickGroup = (g: Group | undefined, list: Row[]) => {
    setGroupId(g?.id)
    setPayer(undefined)
    setMembers(undefined)
    // Re-tick for the new group's dates. Duplicates are re-checked once its expenses load (below).
    setRows(list.map((r) => ({ ...r, on: preselect(flagsFor({ ...r.txn, amount: r.amount }, g, [])) })))
  }

  // Untick likely duplicates once the group's expenses arrive (only rows still on the default).
  const [dupChecked, setDupChecked] = useState<string>()
  if (rows && group && expenses && dupChecked !== group.id) {
    setDupChecked(group.id)
    setRows(rows.map((r) => (r.on && flagsFor({ ...r.txn, amount: r.amount }, group, expenses).includes('maybe_added') ? { ...r, on: false } : r)))
  }

  const onFiles = async (files: File[]) => {
    if (!files.length) return
    if (!online && aiScanPossible()) return toast('You’re offline. Statement import needs a connection.', 'err')
    if (files.length > MAX_FILES) toast(`Using the first ${MAX_FILES} screenshots`)
    const id = ++run.current
    setStage('prep')
    try {
      const images = await Promise.all(
        files.slice(0, MAX_FILES).map(async (f) => {
          const url = await blobToDataUrl(await downscale(f, 2000, 0.8))
          const [head, image] = url.split(',', 2)
          return { image, mimeType: head.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg' }
        }),
      )
      if (run.current !== id) return
      setStage('ai')
      const r = await repo.readStatementAi(images, todayISO())
      if (run.current !== id) return
      if (r?.unavailable) return toast(unavailableText(r.reason).replace(/ Read(ing)? on your phone.*$/, ''), 'err')
      if (!r) return toast(!navigator.onLine ? 'You’re offline' : 'AI couldn’t read the screenshots right now. Try again in a little while.', 'err')
      const txns = r.statement?.transactions ?? []
      if (!txns.length) return toast('No transactions found in those screenshots', 'err')
      const cur = r.statement?.currency ?? 'INR'
      setCurrency(cur)
      const list: Row[] = txns.map((t) => {
        const description = tidyName(t.name)
        return {
          id: uid('s_'),
          txn: t,
          amount: fromHundredths(t.amount, cur),
          description,
          category: guessCategory(description) ?? 'other',
          notes: t.note,
          on: false,
        }
      })
      const usable = (groups ?? []).filter((g) => !g.archived && g.currency === cur)
      setDupChecked(undefined)
      pickGroup(bestGroup(usable.length ? usable : (groups ?? []).filter((g) => !g.archived), txns, todayISO()), list)
      toast(`Found ${txns.length} transaction${txns.length === 1 ? '' : 's'}`)
    } catch (e) {
      if (run.current === id) toast(errText(e), 'err')
    } finally {
      if (run.current === id) setStage(null)
    }
  }
  const cancel = () => {
    run.current++
    setStage(null)
  }

  const chosen = (rows ?? []).filter((r) => r.on)
  const total = chosen.reduce((s, r) => s + r.amount, 0)
  const wrongCurrency = group ? group.currency !== currency : false
  const set = (id: string, patch: Partial<Row>) => setRows((rs) => rs?.map((r) => (r.id === id ? { ...r, ...patch } : r)) ?? rs)

  const addAll = async () => {
    if (!group || !who || !chosen.length) return
    if (wrongCurrency) return toast(`${group.name} is in ${group.currency}; these payments are in ${currency}`, 'err')
    if (chosen.some((r) => !r.description.trim())) return toast('Every expense needs a description', 'err')
    setSaving(true)
    try {
      const now = Date.now()
      for (const r of chosen) {
        const m = personal ? split : (r.members?.filter((x) => order.includes(x)) ?? split)
        if (!m.length) throw new Error(`Choose who shares “${r.description}”`)
        await repo.saveExpense(
          buildExpense(
            { description: r.description, amount: r.amount, date: r.txn.date, category: r.category, notes: r.notes, payer: who, members: m },
            group,
            order,
            user.uid,
            uid('e_'),
            now,
          ),
        )
      }
      toast(`Added ${chosen.length} expense${chosen.length === 1 ? '' : 's'} to ${group.name}`)
      nav(`/groups/${group.id}`, { replace: true })
    } catch (e) {
      toast(errText(e), 'err')
      setSaving(false)
    }
  }

  const toInbox = async () => {
    if (!chosen.length) return
    setSaving(true)
    try {
      const now = Date.now()
      for (const r of chosen) {
        await repo.saveCapture(user.uid, {
          id: uid('c_'),
          amount: r.amount,
          currency,
          merchant: r.description,
          date: r.txn.date,
          source: 'statement',
          ...(r.notes ? { note: r.notes } : {}),
          ...(group ? { suggestedGroup: group.id } : {}),
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        })
      }
      toast(`${chosen.length} sent to your Inbox`)
      nav('/inbox', { replace: true })
    } catch (e) {
      toast(errText(e), 'err')
      setSaving(false)
    }
  }

  // The admin's switch (config/app flags.statementImport) hides the whole path; the server refuses the call too.
  if (!statementImport) return null

  if (!rows) {
    return (
      <div className="card mt-4 overflow-hidden" data-testid="statement-start">
        <div className="flex flex-col items-center px-6 py-8 text-center">
          <div
            className="mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-500 to-duo-600 text-3xl text-white shadow-lg"
            aria-hidden
          >
            📜
          </div>
          <h2 className="font-bold">Add expenses from a statement</h2>
          <p className="text-muted mt-1 text-sm">
            Screenshots of your Google Pay, PhonePe, Paytm or bank transactions. We’ll list every payment, flag the ones in your trip dates, and you pick what
            to add.
          </p>
        </div>
        <div className="p-3 pt-0">
          {blocked ? (
            <div className="rounded-2xl bg-slate-50 p-3 text-sm dark:bg-ink-800" role="status" data-testid="statement-blocked">
              <p>Statement import needs AI, which isn’t turned on for your account.</p>
              <p className="text-muted mt-1 text-xs">
                {!prefs.aiEnabled || !prefs.aiImages ? (
                  <>
                    Turn on AI reading in{' '}
                    <Link to="/settings/ai" className="font-semibold text-brand-600 dark:text-brand-300">
                      Settings → AI features
                    </Link>
                    .
                  </>
                ) : keyWouldHelp ? (
                  <>
                    You can{' '}
                    <Link to="/settings/ai" className="font-semibold text-brand-600 dark:text-brand-300">
                      add your own Gemini key
                    </Link>{' '}
                    under Advanced.
                  </>
                ) : (
                  avail.text
                )}
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="btn-primary w-full"
                onClick={() => fileRef.current?.click()}
                disabled={busy || !groups}
                data-testid="statement-pick"
              >
                {busy ? (
                  <>
                    <Loader2 size={18} className="animate-spin" aria-hidden /> {stage === 'prep' ? 'Preparing screenshots…' : 'Reading with AI…'}
                  </>
                ) : (
                  <>
                    <ImageUp size={18} aria-hidden /> Choose screenshots
                  </>
                )}
              </button>
              {busy ? (
                <button type="button" className="btn-ghost btn-sm mt-2 w-full" onClick={cancel} data-testid="statement-cancel">
                  <X size={16} aria-hidden /> Cancel
                </button>
              ) : (
                <p className="text-muted mt-2 flex items-center justify-center gap-1.5 text-xs">
                  <Sparkles size={12} className="text-brand-500" aria-hidden />
                  {aiScanPossible() ? `Up to ${MAX_FILES} screenshots. Read by Google Gemini, usually in under a minute.` : 'Demo: shows a sample statement.'}
                </p>
              )}
            </>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const f = [...(e.target.files ?? [])]
            e.target.value = ''
            onFiles(f)
          }}
        />
      </div>
    )
  }

  const usable = (groups ?? []).filter((g) => !g.archived)
  return (
    <div className="mt-4 pb-32">
      <div className="card space-y-3 p-4">
        <div>
          <div className="label">Add to</div>
          <Select
            aria-label="Group"
            value={groupId ?? ''}
            onChange={(v) =>
              pickGroup(
                groups?.find((g) => g.id === v),
                rows,
              )
            }
            options={usable.map((g) => ({
              value: g.id,
              text: g.name,
              label: g.name,
              icon: <GroupIcon emoji={g.emoji} size={28} />,
              hint:
                g.startDate || g.endDate
                  ? `${g.startDate ? formatDate(g.startDate) : '…'} – ${g.endDate ? formatDate(g.endDate) : '…'} · ${g.currency}`
                  : g.type === 'personal'
                    ? 'Just you'
                    : g.currency,
            }))}
          />
          {wrongCurrency && (
            <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
              {group!.name} is in {group!.currency}; these payments are in {currency}. Pick a {currency} group.
            </p>
          )}
        </div>
        {group && !personal && (
          <>
            <div>
              <div className="label">Paid by</div>
              <Select
                aria-label="Paid by"
                value={who ?? ''}
                onChange={setPayer}
                options={order.map((m) => ({ value: m, label: m === me ? 'You' : group.members[m].name }))}
              />
            </div>
            <div>
              <div className="label">Split equally between</div>
              <MemberChips
                group={group}
                order={order}
                me={me}
                selected={split}
                onToggle={(id) => setMembers(split.includes(id) ? split.filter((m) => m !== id) : [...split, id])}
              />
              <p className="text-muted mt-1.5 text-xs">For all ticked payments. Open one to change just that one.</p>
            </div>
          </>
        )}
      </div>

      <div className="mb-2 mt-4 flex items-center justify-between px-1 text-sm">
        <span className="text-muted font-semibold">{rows.length} transactions</span>
        <button
          type="button"
          className="min-h-9 font-semibold text-brand-600 dark:text-brand-300"
          data-testid="statement-all"
          onClick={() => {
            const payments = rows.filter((r) => r.txn.direction === 'debit' && r.txn.kind === 'payment')
            const allOn = payments.every((r) => r.on)
            setRows(rows.map((r) => (payments.includes(r) ? { ...r, on: !allOn } : r)))
          }}
        >
          {rows.filter((r) => r.txn.direction === 'debit' && r.txn.kind === 'payment').every((r) => r.on) ? 'Untick all' : 'Tick all payments'}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const f = [...(e.target.files ?? [])]
          e.target.value = ''
          onFiles(f)
        }}
      />

      <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
        {rows.map((r) => {
          const f = flags[r.id] ?? []
          const credit = r.txn.direction === 'credit'
          const isOpen = open === r.id
          const rowMembers = r.members?.filter((m) => order.includes(m)) ?? split
          return (
            <div key={r.id} data-testid="statement-row">
              <div className="flex items-center gap-3 px-3 py-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={r.on}
                  aria-label={`Add ${r.description}`}
                  onClick={() => set(r.id, { on: !r.on })}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 text-xs font-bold ${r.on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-400 dark:border-ink-700'}`}
                >
                  {r.on && '✓'}
                </button>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => setOpen(isOpen ? null : r.id)}
                  aria-expanded={isOpen}
                >
                  <span className="text-xl" aria-hidden>
                    {CATEGORIES[r.category].emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block break-words font-semibold leading-snug">{r.description}</span>
                    <span className="text-muted mt-0.5 flex flex-wrap items-center gap-1 text-xs">
                      {formatDate(r.txn.date)}
                      {r.notes && (
                        <>
                          {' '}
                          · <span className="truncate">{r.notes}</span>
                        </>
                      )}
                      {f.map((x) => (
                        <span key={x} className={`rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold ${FLAG[x].cls}`}>
                          {FLAG[x].text}
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className={`shrink-0 font-bold tabular-nums ${credit ? 'pos' : ''}`}>
                    {credit ? '+' : ''}
                    {formatMoney(r.amount, currency)}
                  </span>
                  <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
                </button>
              </div>
              {isOpen && (
                <div className="space-y-3 bg-slate-50 px-3 py-3 dark:bg-ink-800/50">
                  <input
                    className="input !py-2"
                    aria-label="Description"
                    value={r.description}
                    onChange={(e) => {
                      const description = e.target.value
                      set(r.id, {
                        description,
                        ...(r.category === 'other' || r.category === guessCategory(r.description)
                          ? { category: guessCategory(description) ?? r.category }
                          : {}),
                      })
                    }}
                  />
                  <Select
                    size="sm"
                    aria-label="Category"
                    value={r.category}
                    onChange={(c) => set(r.id, { category: c as Category })}
                    options={(Object.keys(CATEGORIES) as Category[]).map((c) => ({
                      value: c,
                      label: CATEGORIES[c].label,
                      icon: <span aria-hidden>{CATEGORIES[c].emoji}</span>,
                    }))}
                  />
                  {group && !personal && (
                    <div>
                      <div className="label">Split between</div>
                      <MemberChips
                        group={group}
                        order={order}
                        me={me}
                        selected={rowMembers}
                        onToggle={(id) => set(r.id, { members: rowMembers.includes(id) ? rowMembers.filter((m) => m !== id) : [...rowMembers, id] })}
                      />
                    </div>
                  )}
                  {credit && <p className="text-muted text-xs">Money you received. If a friend paid you back, record it with Settle up instead.</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <button type="button" className="btn-secondary btn-sm flex-1" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <ImageUp size={16} aria-hidden />}{' '}
          {busy ? (stage === 'prep' ? 'Preparing…' : 'Reading with AI…') : 'Add more screenshots'}
        </button>
        {busy && (
          <button type="button" className="btn-ghost btn-sm" onClick={cancel}>
            <X size={16} aria-hidden /> Cancel
          </button>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/70 bg-white/90 backdrop-blur-xl safe-bottom dark:border-white/5 dark:bg-ink-900/90">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-muted text-xs">{chosen.length} selected</div>
            <div className="text-xl font-extrabold tabular-nums">{formatMoney(total, currency)}</div>
          </div>
          <button
            type="button"
            className="btn-secondary !px-3"
            onClick={toInbox}
            disabled={saving || !chosen.length}
            aria-label="Send to Inbox to review one by one"
            title="Send to Inbox to review one by one"
          >
            <Inbox size={18} />
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={addAll}
            disabled={saving || !chosen.length || !group || wrongCurrency}
            data-testid="statement-add"
          >
            {saving ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Plus size={18} aria-hidden />} Add {chosen.length || ''}
          </button>
        </div>
      </div>
    </div>
  )
}
