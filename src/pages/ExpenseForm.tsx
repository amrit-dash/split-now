import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Camera, Check, ChevronDown, Minus, Plus, Repeat, Trash2, X } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { memberOrder, myMemberId, useCaptures, useExpenses, useGroup, useGroups } from '@/hooks/data'
import { useOcr } from '@/hooks/useOcr'
import type { Capture, Category, Expense, Group, MemberId, OriginalAmount, ReceiptItem, Recurrence, RecurrenceFreq, SplitInput, SplitType } from '@/types'
import { CATEGORIES, guessCategory } from '@/lib/categories'
import { CURRENCIES, centsToInput, formatMoney, fromHundredths, parseMoney } from '@/lib/money'
import { convertExpense, convertMinor, getRate, lastCurrency, parseRate, rateLabel, rememberCurrency, toOriginal, type FxRate } from '@/lib/fx'
import { computeSplits, SplitError } from '@/lib/splits'
import { parseReceipt, type ParsedReceipt } from '@/lib/ocr-parse'
import { pending } from '@/lib/pending'
import { liveTripFor } from '@/lib/capture'
import { todayISO, uid } from '@/lib/id'
import { firstNextDate, FREQ_LABEL, nextAfter } from '@/lib/recurrence'
import { Avatar } from '@/components/Avatar'
import { GroupIcon } from '@/components/GroupIcon'
import { MemberChips } from '@/components/MemberChips'
import { Empty, Loading, Spinner } from '@/components/Misc'
import { Sheet } from '@/components/Sheet'
import { StartTableButton } from '@/components/StartTableButton'
import { useToast } from '@/components/Toast'
import { appLocale } from '@/lib/locale'
import { DateField } from '@/components/DateField'
import { Select } from '@/components/Select'

const REPEAT_OPTIONS: Array<RecurrenceFreq | 'never'> = ['never', 'weekly', 'fortnightly', 'monthly', 'yearly']

const SPLIT_TYPES: Array<{ value: SplitType; label: string; icon: string }> = [
  { value: 'equal', label: 'Equally', icon: '=' },
  { value: 'exact', label: 'Exact', icon: '1.23' },
  { value: 'percent', label: 'Percent', icon: '%' },
  { value: 'shares', label: 'Shares', icon: '⅔' },
  { value: 'adjust', label: 'Adjust', icon: '+/−' },
  { value: 'itemized', label: 'Items', icon: '🧾' },
]

export default function ExpenseForm() {
  const { groupId: editGroupId, expenseId } = useParams()
  const [params] = useSearchParams()
  const groups = useGroups()
  const [groupId, setGroupId] = useState<string | undefined>(editGroupId ?? params.get('group') ?? undefined)
  const group = useGroup(groupId)
  const expenses = useExpenses(editGroupId)
  const existing = expenseId ? expenses?.find((e) => e.id === expenseId) : undefined
  // Prefill from a captured payment (/add?group=…&capture=…), handed over from the capture prompt.
  const captureId = expenseId ? undefined : params.get('capture') ?? undefined
  const captures = useCaptures()
  const capture = captureId ? captures?.find((c) => c.id === captureId && c.status === 'pending') : undefined

  useEffect(() => {
    // Default to a trip that's running today, else the most recently used group.
    if (!groupId && groups?.length) setGroupId(liveTripFor(groups, todayISO()) ?? groups[0].id)
  }, [groups, groupId])

  if (!groups || (groupId && group === undefined) || (expenseId && !expenses) || (captureId && !captures)) return <Loading />
  if (groups.length === 0) return <NoGroups />
  if (!group) return <Loading />
  if (expenseId && !existing) return <Empty emoji="🔍" title="Expense not found" />

  return <Form key={group.id + (existing?.id ?? '')} group={group} groups={groups} existing={existing} capture={capture} onGroup={setGroupId} />
}

function NoGroups() {
  const nav = useNavigate()
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-[calc(env(safe-area-inset-top)+2rem)]">
      <Empty emoji="👀" title="Create a group first">
        Expenses live inside a group, a 1:1 friend, or your personal wallet.
        <div className="mt-4 flex justify-center gap-2">
          <button className="btn-primary" onClick={() => nav('/groups/new')}>New group</button>
          <button className="btn-secondary" onClick={() => nav('/groups/new?type=personal')}>Personal</button>
        </div>
      </Empty>
    </div>
  )
}

function Form({ group, groups, existing, capture, onGroup }: { group: Group; groups: Group[]; existing?: Expense; capture?: Capture; onGroup: (id: string) => void }) {
  const { user, profile } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const ocr = useOcr()
  const fileRef = useRef<HTMLInputElement>(null)
  const order = useMemo(() => memberOrder(group), [group])
  const me = myMemberId(group, user.uid) ?? order[0]
  const personal = group.type === 'personal'

  // Entry currency. A foreign-currency expense is typed in `cur` and converted to the group's
  // currency on save at a locked rate (see src/lib/fx.ts). New expenses reuse the group's last one.
  const [cur, setCur] = useState(() => existing ? existing.original?.currency ?? group.currency : capture ? capture.currency ?? group.currency : lastCurrency(group.id) ?? group.currency)
  const foreign = cur !== group.currency
  const fg = useMemo(() => (foreign ? { ...group, currency: cur } : group), [group, cur, foreign])
  const [amountStr, setAmountStr] = useState(existing ? centsToInput(existing.original?.amount ?? existing.amount, cur) : capture ? centsToInput(capture.amount, cur) : '')
  const [description, setDescription] = useState(existing?.description ?? capture?.merchant ?? '')
  const [category, setCategory] = useState<Category>(existing?.category ?? (capture && guessCategory(capture.merchant)) ?? 'other')
  const [catTouched, setCatTouched] = useState(!!existing)
  const [date, setDate] = useState(existing?.date ?? capture?.date ?? todayISO())
  const [notes, setNotes] = useState(existing?.notes ?? capture?.note ?? '')
  const [payers, setPayers] = useState<Record<MemberId, string>>(
    existing ? Object.fromEntries(Object.entries(existing.original ? toOriginal(existing.paidBy, existing.original) : existing.paidBy).map(([k, v]) => [k, centsToInput(v, cur)])) : { [me]: '' },
  )
  const [multiPay, setMultiPay] = useState(existing ? Object.keys(existing.paidBy).length > 1 : false)
  const [splitType, setSplitType] = useState<SplitType>(existing?.splitType ?? 'equal')
  const [input, setInput] = useState<SplitInput>(existing?.splitInput ?? { selected: order })
  const [receipt, setReceipt] = useState<File | null>(null)
  const [receiptUrl] = useState(existing?.receiptUrl)
  const [repeat, setRepeat] = useState<RecurrenceFreq | 'never'>(existing?.recurrence?.freq ?? 'never')
  const [until, setUntil] = useState(existing?.recurrence?.until ?? '')
  const isOccurrence = !!existing?.recurringFrom
  const [sheet, setSheet] = useState<'group' | 'category' | 'payer' | 'currency' | null>(null)
  const [busy, setBusy] = useState(false)

  const amount = parseMoney(amountStr, cur)
  const validAmount = Number.isFinite(amount) && amount > 0

  // Exchange rate: an edited expense keeps its locked rate until the currency or date changes.
  const [fx, setFx] = useState<FxRate | null>(existing?.original ? { rate: existing.original.rate, date: existing.original.rateDate, source: existing.original.source } : null)
  const [fxLoading, setFxLoading] = useState(false)
  const [rateEdit, setRateEdit] = useState<string | null>(null)
  const fxFor = useRef(existing?.original ? `${existing.original.currency}|${existing.date}` : '')
  useEffect(() => {
    if (!foreign) return
    const k = `${cur}|${date}`
    if (fxFor.current === k) return
    // A rate the user typed survives a date change; a different currency needs a new rate.
    const keepManual = fx?.source === 'manual' && fxFor.current.startsWith(cur + '|')
    fxFor.current = k
    if (keepManual) return
    setFx(null)
    setRateEdit(null)
    setFxLoading(true)
    getRate(cur, group.currency, date).then((r) => {
      if (fxFor.current !== k) return
      setFx(r)
      setFxLoading(false)
      if (!r) setRateEdit('')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, date, foreign, group.currency])
  const converted = foreign && fx && validAmount ? convertMinor(amount, cur, group.currency, fx.rate) : undefined

  // Apply a receipt handed over from the Scan screen.
  useEffect(() => {
    if (pending.receipt && !existing) {
      applyReceipt(pending.receipt.parsed, pending.receipt.file)
      pending.receipt = undefined
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyReceipt(parsed: ParsedReceipt, file: File) {
    // OCR reads amounts as hundredths; convert to this group's minor units (e.g. whole yen).
    const p = { ...parsed, total: parsed.total && fromHundredths(parsed.total, cur), items: parsed.items.map((it) => ({ ...it, amount: fromHundredths(it.amount, cur) })) }
    setReceipt(file)
    if (p.total) setAmountStr(centsToInput(p.total, cur))
    if (p.merchant) { setDescription(titleCase(p.merchant)); const g = guessCategory(p.merchant); if (g) setCategory(g) }
    if (p.date) setDate(p.date)
    if (p.items.length >= 2 && !personal) {
      setSplitType('itemized')
      setInput((i) => ({ ...i, items: p.items.map((it) => ({ ...it, members: [...order] })) }))
    }
    toast(p.total ? `Found ${formatMoney(p.total, cur)}${p.items.length ? ` and ${p.items.length} items` : ''}` : 'Couldn’t read a total — please enter it')
  }

  async function onScanFile(file: File) {
    try {
      const text = await ocr.run(file)
      applyReceipt(parseReceipt(text), file)
    } catch (e) {
      toast('Scan failed: ' + (e as Error).message, 'err')
    }
  }

  // Equal split by default: auto-fill single payer amount.
  const paidBy: Record<MemberId, number> = useMemo(() => {
    if (personal) return validAmount ? { [me]: amount } : {}
    if (!multiPay) {
      const id = Object.keys(payers)[0] ?? me
      return validAmount ? { [id]: amount } : {}
    }
    return Object.fromEntries(Object.entries(payers).map(([k, v]) => [k, parseMoney(v, cur)]).filter(([, v]) => Number.isFinite(v as number) && (v as number) > 0))
  }, [payers, multiPay, amount, validAmount, me, personal, cur])
  const paidSum = Object.values(paidBy).reduce((a, b) => a + b, 0)

  const preview = useMemo((): { splits?: Record<MemberId, number>; error?: string } => {
    if (!validAmount) return {}
    if (personal) return { splits: { [me]: amount } }
    try {
      return { splits: computeSplits(amount, splitType, input, order) }
    } catch (e) {
      return { error: e instanceof SplitError ? e.message : String(e) }
    }
  }, [amount, validAmount, splitType, input, order, personal, me])

  const save = async () => {
    if (!validAmount) return toast('Enter an amount', 'err')
    if (!description.trim()) return toast('Add a description', 'err')
    if (preview.error || !preview.splits) return toast(preview.error ?? 'Check the split', 'err')
    if (paidSum !== amount) return toast(`Payers add up to ${formatMoney(paidSum, cur)}, not ${formatMoney(amount, cur)}`, 'err')
    if (foreign && !fx) return toast(`Enter the ${cur} → ${group.currency} exchange rate`, 'err')
    // Convert to the group currency once, here; balances only ever see group-currency amounts.
    let money = { amount, paidBy, splits: preview.splits }
    let original: OriginalAmount | undefined
    if (foreign && fx) {
      const c = convertExpense(money, cur, group.currency, fx.rate)
      if (!c) return toast(`That’s less than the smallest ${group.currency} amount`, 'err')
      money = c
      original = { currency: cur, amount, rate: fx.rate, rateDate: fx.date, source: fx.source }
    }
    if (repeat !== 'never' && until && until < date) return toast('The repeat end date is before the expense date', 'err')
    setBusy(true)
    try {
      const now = Date.now()
      const e: Expense = {
        id: existing?.id ?? uid('e_'),
        groupId: group.id,
        description: description.trim(),
        amount: money.amount, category, date, notes: notes.trim() || undefined,
        paidBy: money.paidBy, splits: money.splits, splitType: personal ? 'equal' : splitType,
        splitInput: personal ? { selected: [me] } : clean(input, splitType),
        receiptUrl,
        recurrence: isOccurrence ? undefined : buildRecurrence(repeat, date, until, existing),
        recurringFrom: existing?.recurringFrom,
        original,
        createdBy: existing?.createdBy ?? user.uid,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      await repo.saveExpense(e)
      rememberCurrency(group.id, cur)
      if (capture) await repo.updateCapture(user.uid, capture.id, { status: 'assigned', groupId: group.id, expenseId: e.id }).catch(console.warn)
      // Upload after saving so a slow or offline network never blocks the save.
      if (receipt && !repo.attachReceipt(group.id, e.id, receipt)) toast('Offline — saved without the receipt image')
      toast(existing ? 'Expense updated' : 'Expense added ✅')
      nav(`/groups/${group.id}`, { replace: true })
    } catch (err) {
      toast((err as Error).message, 'err')
      setBusy(false)
    }
  }

  const singlePayer = Object.keys(payers)[0] ?? me
  const currencyChoices = [...new Set([group.currency, cur, profile.currency, ...CURRENCIES])]
  const applyRate = () => {
    const r = parseRate(rateEdit ?? '')
    if (!Number.isFinite(r)) return toast('Enter a rate above 0', 'err')
    setFx({ rate: r, date, source: 'manual' })
    setRateEdit(null)
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-10">
      <header className="sticky top-0 z-30 -mx-4 flex items-center justify-between bg-slate-50/85 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl dark:bg-ink-950/85">
        <button onClick={() => nav(-1)} className="-ml-2 rounded-full p-2" aria-label="Cancel"><X size={24} /></button>
        <div className="font-bold">{existing ? 'Edit expense' : capture ? 'Captured payment' : 'Add expense'}</div>
        <button onClick={save} disabled={busy} className="rounded-full bg-brand-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? '…' : 'Save'}</button>
      </header>

      {/* Group picker */}
      <button onClick={() => !existing && setSheet('group')} className="card mt-2 flex w-full items-center gap-3 p-3 text-left">
        <GroupIcon emoji={group.emoji} size={40} />
        <div className="flex-1">
          <div className="text-xs text-slate-500">{personal ? 'Personal wallet' : 'With'}</div>
          <div className="font-semibold">{group.name}</div>
        </div>
        {!existing && <span className="text-sm font-semibold text-brand-600 dark:text-brand-300">Change</span>}
      </button>

      {/* Amount */}
      <div className="card mt-3 p-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setSheet('category')} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl" style={{ background: CATEGORIES[category].color + '22' }} aria-label="Category">
            {CATEGORIES[category].emoji}
          </button>
          <input
            className="w-full bg-transparent text-lg font-semibold outline-none placeholder:text-slate-400"
            placeholder="What was it for?"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              if (!catTouched) setCategory(guessCategory(e.target.value) ?? 'other')
            }}
          />
        </div>
        <div className="mt-4 flex items-baseline gap-2 border-t border-slate-100 pt-4 dark:border-white/5">
          <button type="button" onClick={() => setSheet('currency')} className={`flex shrink-0 items-center text-2xl font-bold ${foreign ? 'text-brand-600 dark:text-brand-300' : 'text-slate-400'}`} aria-label={`Currency: ${cur}. Change`}>
            {cur}<ChevronDown size={18} />
          </button>
          <input
            className="w-full bg-transparent text-5xl font-extrabold tabular-nums tracking-tight outline-none placeholder:text-slate-300 dark:placeholder:text-ink-700"
            inputMode="decimal"
            placeholder="0.00"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            autoFocus={!existing}
          />
        </div>
        {foreign && (
          <FxLine cur={cur} to={group.currency} fx={fx} loading={fxLoading} converted={converted}
            rateEdit={rateEdit} setRateEdit={setRateEdit} onApply={applyRate} />
        )}
        <div className="mt-4 flex gap-2">
          <DateField aria-label="Date" className="!w-auto !py-2 text-sm" value={date} onChange={(v) => setDate(v || todayISO())} />
          <button type="button" className="btn-secondary !min-h-0 flex-1 !py-2 text-sm" onClick={() => fileRef.current?.click()} disabled={ocr.busy}>
            {ocr.busy ? <><Spinner className="!h-4 !w-4" /> Reading {Math.round(ocr.progress * 100)}%</> : <><Camera size={16} /> {receipt || receiptUrl ? 'Rescan receipt' : 'Scan receipt'}</>}
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onScanFile(f); e.target.value = '' }} />
        </div>
        {(receipt || receiptUrl) && <div className="mt-2 text-xs text-emerald-600">📎 Receipt attached</div>}
      </div>

      {!personal && (
        <>
          {/* Paid by */}
          <div className="card mt-3 p-4">
            <div className="flex items-center justify-between">
              <div className="label !mb-0">Paid by</div>
              <button className="text-sm font-semibold text-brand-600 dark:text-brand-300" onClick={() => {
                if (!multiPay) setPayers({ [singlePayer]: amountStr })
                else setPayers({ [singlePayer]: '' })
                setMultiPay(!multiPay)
              }}>{multiPay ? 'Single payer' : 'Multiple people'}</button>
            </div>
            {!multiPay ? (
              <button onClick={() => setSheet('payer')} className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-slate-50 p-3 text-left dark:bg-ink-800">
                <Avatar name={group.members[singlePayer]?.name ?? '?'} color={group.members[singlePayer]?.color ?? '#999'} size={32} />
                <span className="flex-1 font-semibold">{singlePayer === me ? 'You' : group.members[singlePayer]?.name}</span>
                <span className="text-sm text-slate-500">Change</span>
              </button>
            ) : (
              <div className="mt-3 space-y-2">
                {order.map((id) => (
                  <AmountRow key={id} group={fg} id={id} me={me} value={payers[id] ?? ''} onChange={(v) => setPayers((p) => ({ ...p, [id]: v }))} />
                ))}
                <Remaining label="Left to assign" value={validAmount ? amount - paidSum : 0} currency={cur} />
              </div>
            )}
          </div>

          {/* Split */}
          <div className="card mt-3 p-4">
            <div className="label">Split</div>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {SPLIT_TYPES.map((t) => (
                <button key={t.value} type="button" onClick={() => { setSplitType(t.value); setInput((i) => seedInput(i, t.value, order, amount)) }}
                  className={`flex min-w-[4.5rem] flex-col items-center gap-1 rounded-2xl px-3 py-2.5 text-xs font-semibold transition ${splitType === t.value ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30' : 'bg-slate-100 text-slate-600 dark:bg-ink-800 dark:text-slate-300'}`}>
                  <span className="text-base font-bold">{t.icon}</span>{t.label}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <SplitEditor type={splitType} input={input} setInput={setInput} group={fg} order={order} me={me} amount={validAmount ? amount : 0} splits={preview.splits} />
            </div>
            {preview.error && <div className="mt-3 rounded-xl bg-rose-50 p-2.5 text-sm font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{preview.error}</div>}
          </div>
          {splitType === 'itemized' && !existing && (
            <StartTableButton className="mt-3" draft={() => ({
              merchant: description, currency: group.currency, date, groupId: group.id,
              items: input.items ?? [], total: validAmount ? amount : undefined,
            })} />
          )}
        </>
      )}

      {!isOccurrence && (
        <div className="card mt-3 p-4">
          <div className={`grid gap-3 ${repeat !== 'never' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div className="min-w-0">
              <div className="label flex items-center gap-1.5"><Repeat size={14} /> Repeat</div>
              <Select aria-label="Repeat" value={repeat} onChange={(v) => setRepeat(v as RecurrenceFreq | 'never')}
                options={REPEAT_OPTIONS.map((f) => ({ value: f, label: f === 'never' ? 'Never' : FREQ_LABEL[f] }))} />
            </div>
            {repeat !== 'never' && (
              <div className="min-w-0">
                <label htmlFor="repeat-until" className="label">Ends</label>
                <DateField id="repeat-until" aria-label="Repeat until" placeholder="Never" clearable value={until} min={date} onChange={setUntil} />
              </div>
            )}
          </div>
          {repeat !== 'never' && (
            <div className="mt-3">
              <p className="text-xs text-slate-500">
                Next copy on {fmtDate(buildRecurrence(repeat, date, until, existing)?.nextDate)}. Copies are added automatically when anyone in the group opens the app.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="card mt-3 p-4">
        <label className="label">Notes</label>
        <textarea className="input min-h-20" placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <button className="btn-primary mt-5 w-full" onClick={save} disabled={busy}><Check size={18} /> {existing ? 'Save changes' : 'Add expense'}</button>

      <Sheet open={sheet === 'group'} onClose={() => setSheet(null)} title="Choose group">
        <div className="space-y-1">
          {groups.map((g) => (
            <button key={g.id} onClick={() => { onGroup(g.id); setSheet(null) }} className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-left ${g.id === group.id ? 'bg-brand-50 dark:bg-brand-900/30' : ''}`}>
              <GroupIcon emoji={g.emoji} size={40} /><span className="flex-1 font-semibold">{g.name}</span>{g.id === group.id && <Check size={18} className="text-brand-600" />}
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet open={sheet === 'currency'} onClose={() => setSheet(null)} title="Currency">
        <p className="mb-2 text-sm text-slate-500">{group.name} is in {group.currency}. Other currencies are converted at the ECB rate for the expense date, then locked.</p>
        <div className="grid grid-cols-4 gap-2">
          {currencyChoices.map((c) => (
            <button key={c} onClick={() => { setCur(c); setSheet(null) }} className={`rounded-2xl py-3 text-sm font-bold ${c === cur ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-ink-800'}`}>{c}</button>
          ))}
        </div>
      </Sheet>
      <Sheet open={sheet === 'category'} onClose={() => setSheet(null)} title="Category">
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(CATEGORIES) as Category[]).map((c) => (
            <button key={c} onClick={() => { setCategory(c); setCatTouched(true); setSheet(null) }} className={`flex flex-col items-center gap-1 rounded-2xl p-3 text-xs font-semibold ${c === category ? 'ring-2 ring-brand-500' : ''}`} style={{ background: CATEGORIES[c].color + '18' }}>
              <span className="text-2xl">{CATEGORIES[c].emoji}</span>{CATEGORIES[c].label}
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet open={sheet === 'payer'} onClose={() => setSheet(null)} title="Who paid?">
        <div className="space-y-1">
          {order.map((id) => (
            <button key={id} onClick={() => { setPayers({ [id]: '' }); setSheet(null) }} className="flex w-full items-center gap-3 rounded-2xl p-2.5 text-left hover:bg-slate-50 dark:hover:bg-ink-800">
              <Avatar name={group.members[id].name} color={group.members[id].color} size={36} />
              <span className="flex-1 font-semibold">{id === me ? 'You' : group.members[id].name}</span>
              {id === singlePayer && <Check size={18} className="text-brand-600" />}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

/** "≈ A$51.23 at 1 THB = 0.0427 AUD (ECB, 2026-10-07)" with an edit-rate affordance. */
function FxLine({ cur, to, fx, loading, converted, rateEdit, setRateEdit, onApply }: {
  cur: string; to: string; fx: FxRate | null; loading: boolean; converted?: number
  rateEdit: string | null; setRateEdit: (v: string | null) => void; onApply: () => void
}) {
  if (rateEdit !== null) {
    return (
      <form className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm dark:bg-ink-800" onSubmit={(e) => { e.preventDefault(); onApply() }}>
        {!fx && <div className="mb-2 text-amber-600 dark:text-amber-400">No {cur} → {to} rate available (offline, or not published by the ECB). Enter one:</div>}
        <div className="flex items-center gap-2">
          <label htmlFor="fx-rate" className="shrink-0 font-semibold">1 {cur} =</label>
          <input id="fx-rate" className="input !py-2 text-right" inputMode="decimal" placeholder={fx ? String(fx.rate) : '0.00'} value={rateEdit} onChange={(e) => setRateEdit(e.target.value)} autoFocus />
          <span className="shrink-0 font-semibold">{to}</span>
          <button type="submit" className="rounded-xl bg-brand-600 px-3 py-2 font-bold text-white">Use</button>
          {fx && <button type="button" className="px-1 text-slate-500" onClick={() => setRateEdit(null)} aria-label="Cancel"><X size={16} /></button>}
        </div>
      </form>
    )
  }
  if (loading) return <div className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Spinner className="!h-4 !w-4" /> Getting the {cur} → {to} rate…</div>
  if (!fx) return null
  return (
    <div className="mt-3 flex items-start justify-between gap-2 text-sm" data-testid="fx-line">
      <span className="text-slate-500">
        {converted !== undefined && <><span className="font-semibold text-slate-700 dark:text-slate-200">≈ {formatMoney(converted, to)}</span> at </>}
        {rateLabel({ currency: cur, rate: fx.rate, rateDate: fx.date, source: fx.source }, to)}
      </span>
      <button type="button" className="shrink-0 font-semibold text-brand-600 dark:text-brand-300" onClick={() => setRateEdit(String(fx.rate))}>Edit rate</button>
    </div>
  )
}

function SplitEditor({ type, input, setInput, group, order, me, amount, splits }: {
  type: SplitType; input: SplitInput; setInput: (f: (i: SplitInput) => SplitInput) => void
  group: Group; order: MemberId[]; me: MemberId; amount: number; splits?: Record<MemberId, number>
}) {
  const cur = group.currency
  const label = (id: MemberId) => (id === me ? 'You' : group.members[id].name)
  const share = (id: MemberId) => <span className="w-20 text-right text-sm tabular-nums text-slate-500">{formatMoney(splits?.[id] ?? 0, cur)}</span>
  const toggle = (id: MemberId) => setInput((i) => {
    const sel = i.selected ?? []
    return { ...i, selected: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id] }
  })

  switch (type) {
    case 'equal': {
      const sel = input.selected ?? []
      return (
        <div className="space-y-1">
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-slate-500">{sel.length} of {order.length} people</span>
            <button className="font-semibold text-brand-600 dark:text-brand-300" onClick={() => setInput((i) => ({ ...i, selected: sel.length === order.length ? [me] : [...order] }))}>{sel.length === order.length ? 'Only me' : 'Everyone'}</button>
          </div>
          {order.map((id) => (
            <button key={id} type="button" onClick={() => toggle(id)} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-slate-50 dark:hover:bg-ink-800">
              <span className={`flex h-6 w-6 items-center justify-center rounded-lg border-2 ${sel.includes(id) ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 dark:border-ink-700'}`}>{sel.includes(id) && <Check size={14} strokeWidth={3} />}</span>
              <Avatar name={group.members[id].name} color={group.members[id].color} size={32} />
              <span className="flex-1 font-medium">{label(id)}</span>
              {share(id)}
            </button>
          ))}
        </div>
      )
    }
    case 'exact': {
      const sum = order.reduce((s, id) => s + (input.exact?.[id] ?? 0), 0)
      return (
        <div className="space-y-2">
          {order.map((id) => (
            <AmountRow key={id} group={group} id={id} me={me}
              value={input.exact?.[id] !== undefined ? centsToInput(input.exact[id], group.currency) : ''}
              onChange={(v) => setInput((i) => ({ ...i, exact: { ...i.exact, [id]: Number.isFinite(parseMoney(v, group.currency)) ? parseMoney(v, group.currency) : 0 } }))} />
          ))}
          <Remaining label="Left to assign" value={amount - sum} currency={cur} />
        </div>
      )
    }
    case 'percent': {
      const sum = order.reduce((s, id) => s + (input.percent?.[id] ?? 0), 0)
      return (
        <div className="space-y-2">
          {order.map((id) => (
            <div key={id} className="flex items-center gap-3">
              <Avatar name={group.members[id].name} color={group.members[id].color} size={32} />
              <span className="flex-1 truncate font-medium">{label(id)}</span>
              <div className="relative w-24">
                <input className="input !py-2 pr-7 text-right" inputMode="decimal" placeholder="0" value={input.percent?.[id] ?? ''}
                  onChange={(e) => { const n = parseFloat(e.target.value); setInput((i) => ({ ...i, percent: { ...i.percent, [id]: Number.isFinite(n) ? n : 0 } })) }} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">%</span>
              </div>
              {share(id)}
            </div>
          ))}
          <div className={`text-right text-sm font-semibold ${Math.abs(sum - 100) < 0.001 ? 'pos' : 'neg'}`}>{Math.round(sum * 100) / 100}% of 100%</div>
        </div>
      )
    }
    case 'shares':
      return (
        <div className="space-y-2">
          {order.map((id) => {
            const v = input.shares?.[id] ?? 0
            const set = (n: number) => setInput((i) => ({ ...i, shares: { ...i.shares, [id]: Math.max(0, n) } }))
            return (
              <div key={id} className="flex items-center gap-3">
                <Avatar name={group.members[id].name} color={group.members[id].color} size={32} />
                <span className="flex-1 truncate font-medium">{label(id)}</span>
                <div className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-ink-800">
                  <button type="button" className="rounded-xl p-1.5" onClick={() => set(v - 1)} aria-label="Fewer shares"><Minus size={16} /></button>
                  <input className="w-10 bg-transparent text-center font-bold tabular-nums outline-none" inputMode="decimal" value={v} onChange={(e) => set(parseFloat(e.target.value) || 0)} />
                  <button type="button" className="rounded-xl p-1.5" onClick={() => set(v + 1)} aria-label="More shares"><Plus size={16} /></button>
                </div>
                {share(id)}
              </div>
            )
          })}
          <p className="text-xs text-slate-500">Use ratios like 2:1:1 — e.g. a couple counts as 2 shares.</p>
        </div>
      )
    case 'adjust': {
      const sel = input.selected ?? []
      return (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Split equally, then add or subtract an amount for anyone who had more or less.</p>
          {order.map((id) => (
            <div key={id} className="flex items-center gap-2">
              <button type="button" onClick={() => toggle(id)} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 ${sel.includes(id) ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 dark:border-ink-700'}`}>{sel.includes(id) && <Check size={14} strokeWidth={3} />}</button>
              <Avatar name={group.members[id].name} color={group.members[id].color} size={28} />
              <span className="flex-1 truncate text-sm font-medium">{label(id)}</span>
              <input className="input !w-24 !py-2 text-right" inputMode="decimal" placeholder="+0.00" disabled={!sel.includes(id)}
                defaultValue={input.adjust?.[id] ? centsToInput(input.adjust[id], group.currency) : ''}
                onChange={(e) => { const c = parseMoney(e.target.value, group.currency); setInput((i) => ({ ...i, adjust: { ...i.adjust, [id]: Number.isFinite(c) ? c : 0 } })) }} />
              {share(id)}
            </div>
          ))}
        </div>
      )
    }
    case 'itemized':
      return <ItemsEditor items={input.items ?? []} setItems={(items) => setInput((i) => ({ ...i, items }))} group={group} order={order} me={me} amount={amount} splits={splits} />
  }
}

function ItemsEditor({ items, setItems, group, order, me, amount, splits }: {
  items: ReceiptItem[]; setItems: (i: ReceiptItem[]) => void; group: Group; order: MemberId[]; me: MemberId; amount: number; splits?: Record<MemberId, number>
}) {
  const cur = group.currency
  const itemsTotal = items.reduce((s, i) => s + i.amount, 0)
  const extra = amount - itemsTotal
  const update = (idx: number, patch: Partial<ReceiptItem>) => setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  return (
    <div className="space-y-3">
      {items.map((it, idx) => (
        <div key={idx} className="rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
          <div className="flex gap-2">
            <input className="input !bg-white !py-2 dark:!bg-ink-900" placeholder="Item" value={it.name} onChange={(e) => update(idx, { name: e.target.value })} />
            <input className="input !w-24 !bg-white !py-2 text-right dark:!bg-ink-900" inputMode="decimal" placeholder="0.00" defaultValue={it.amount ? centsToInput(it.amount, group.currency) : ''}
              onChange={(e) => { const c = parseMoney(e.target.value, group.currency); update(idx, { amount: Number.isFinite(c) ? c : 0 }) }} />
            <button type="button" className="p-2 text-slate-400 hover:text-rose-500" onClick={() => setItems(items.filter((_, i) => i !== idx))} aria-label="Remove item"><Trash2 size={18} /></button>
          </div>
          <div className="mt-2">
            <MemberChips group={group} order={order} me={me} selected={it.members}
              onToggle={(id) => update(idx, { members: it.members.includes(id) ? it.members.filter((m) => m !== id) : [...it.members, id] })} />
          </div>
        </div>
      ))}
      <button type="button" className="btn-secondary w-full !min-h-0 !py-2.5 text-sm" onClick={() => setItems([...items, { name: '', amount: 0, members: [...order] }])}><Plus size={16} /> Add item</button>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between text-slate-500"><span>Items</span><span className="tabular-nums">{formatMoney(itemsTotal, cur)}</span></div>
        <div className="flex justify-between text-slate-500"><span>Tax / tip / discount (shared proportionally)</span><span className="tabular-nums">{formatMoney(extra, cur, { sign: true })}</span></div>
      </div>
      {splits && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
          {order.filter((id) => splits[id]).map((id) => (
            <span key={id} className="chip !py-1 !pl-1"><Avatar name={group.members[id].name} color={group.members[id].color} size={20} />{formatMoney(splits[id], cur)}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function AmountRow({ group, id, me, value, onChange }: { group: Group; id: MemberId; me: MemberId; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={group.members[id].name} color={group.members[id].color} size={32} />
      <span className="flex-1 truncate font-medium">{id === me ? 'You' : group.members[id].name}</span>
      <input className="input !w-28 !py-2 text-right" inputMode="decimal" placeholder="0.00" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function Remaining({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <div className={`text-right text-sm font-semibold ${value === 0 ? 'pos' : 'neg'}`}>
      {value === 0 ? 'All assigned ✓' : `${label}: ${formatMoney(value, currency)}`}
    </div>
  )
}

/** When switching split type, pre-fill sensible defaults from what's already chosen. */
function seedInput(i: SplitInput, t: SplitType, order: MemberId[], amount: number): SplitInput {
  const sel = i.selected?.length ? i.selected : order
  switch (t) {
    case 'equal':
    case 'adjust':
      return { ...i, selected: sel }
    case 'shares':
      return { ...i, shares: i.shares ?? Object.fromEntries(order.map((m) => [m, sel.includes(m) ? 1 : 0])) }
    case 'percent': {
      if (i.percent) return i
      const each = Math.floor((10000 / sel.length)) / 100
      const pct: Record<string, number> = Object.fromEntries(sel.map((m) => [m, each]))
      pct[sel[0]] = Math.round((100 - each * (sel.length - 1)) * 100) / 100
      return { ...i, percent: pct }
    }
    case 'exact': {
      if (i.exact || !Number.isFinite(amount) || amount <= 0) return i
      return { ...i, exact: computeSplits(amount, 'equal', { selected: sel }, order) }
    }
    case 'itemized':
      return { ...i, items: i.items ?? [{ name: '', amount: Number.isFinite(amount) && amount > 0 ? amount : 0, members: [...sel] }] }
  }
}

/** Only persist the input relevant to the chosen split type. */
function clean(i: SplitInput, t: SplitType): SplitInput {
  switch (t) {
    case 'equal': return { selected: i.selected }
    case 'exact': return { exact: i.exact }
    case 'percent': return { percent: i.percent }
    case 'shares': return { shares: i.shares }
    case 'adjust': return { selected: i.selected, adjust: i.adjust }
    case 'itemized': return { items: i.items }
  }
}

/**
 * New templates start right after their date (so a back-dated monthly bill catches up).
 * When an existing template's schedule changes, start after today instead so already
 * generated copies aren't recreated on different dates.
 */
function buildRecurrence(repeat: RecurrenceFreq | 'never', date: string, until: string, existing?: Expense): Recurrence | undefined {
  if (repeat === 'never') return undefined
  const prev = existing?.recurrence
  let nextDate: string
  if (prev && prev.freq === repeat && existing.date === date) nextDate = prev.nextDate
  else if (existing) nextDate = nextAfter(date, repeat, todayISO())
  else nextDate = firstNextDate(date, repeat)
  return { freq: repeat, nextDate, until: until || undefined }
}

function fmtDate(d?: string) {
  return d ? new Date(d + 'T00:00').toLocaleDateString(appLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}
