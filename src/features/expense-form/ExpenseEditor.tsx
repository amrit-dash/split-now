import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, Copy, X } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { memberOrder, myMemberId } from '@/hooks/data'
import { useFlag } from '@/hooks/useAppConfig'
import { useMerchantMemory } from '@/hooks/useMerchants'
import { useReceiptReader } from '@/hooks/useReceiptReader'
import type { Capture, Expense, Group, MemberId } from '@/types'
import { CURRENCIES, formatMoney, fromHundredths } from '@/lib/money'
import { convertMinor, lastCurrency, rememberCurrency } from '@/lib/fx'
import type { ParsedReceipt } from '@/lib/ocr-parse'
import { pending } from '@/lib/pending'
import { recordOutcome, type ScanKind } from '@/lib/scanHistory'
import { errText } from '@/lib/errors'
import { duplicateLine, findDuplicate } from '@/lib/duplicates'
import { learnFromSave, suggestCategory } from '@/lib/merchants'
import type { QuickPrefill } from '@/lib/nl-expense'
import { todayISO } from '@/lib/id'
import { lastSplit, rememberGroup, rememberSplit, sameSplit, suggestDescriptions, type Suggestion } from '@/lib/recents'
import {
  clearDraft,
  initialDraft,
  isDirty,
  reduce,
  restoreDraft,
  saveDraft,
  selectSplits,
  toExpense,
  toSplitInput,
  validAmount,
  validate,
  type Action,
  type Draft,
  type ErrorKey,
  type SeedArgs,
} from '@/lib/expense-draft'
import { GroupIcon } from '@/components/GroupIcon'
import { useToast } from '@/components/Toast'
import { usePageTitle } from '@/lib/brand'
import { useConfirm } from '@/components/ConfirmSheet'
import { AmountCard } from './AmountCard'
import { PayerCard } from './PayerCard'
import { SplitCard } from './SplitCard'
import { MoreCard } from './MoreCard'
import { CategorySheet, CurrencySheet, GroupPickerSheet, PayerSheet } from './sheets'
import { useFxRate } from './useFxRate'

type SheetKind = 'group' | 'category' | 'payer' | 'currency' | 'split' | null

/** Where to send the eye when a save is refused; the first problem in this order gets focus. */
const ERROR_ORDER: ErrorKey[] = ['amount', 'description', 'payers', 'split', 'fx', 'until']
const ERROR_TARGET: Record<ErrorKey, string> = {
  amount: 'expense-amount',
  description: 'expense-description',
  payers: 'payer-card',
  split: 'split-card',
  fx: 'fx-line',
  until: 'repeat-until',
}

/**
 * The expense form proper. State lives in the pure reducer (src/lib/expense-draft.ts); this
 * component wires it to the repo, the exchange-rate fetch, the bill reader and the sheets, and
 * keeps an unsaved draft in sessionStorage so a reload or an accidental back doesn't lose it.
 */
export function ExpenseEditor({
  group,
  groups,
  existing,
  again,
  capture,
  quick,
  expenses,
  history,
  onGroup,
  storeKey,
  restore,
}: {
  group: Group
  groups: Group[]
  existing?: Expense
  again?: Expense
  capture?: Capture
  /** Quick add: the parsed line to start from */
  quick?: QuickPrefill
  /** the group's live expenses (for the duplicate warning) */
  expenses: Expense[]
  history: Suggestion[]
  onGroup: (id: string) => void
  /** sessionStorage key for this route's draft */
  storeKey: string
  /** a draft stored for this route, to pick up where the user left off */
  restore?: Draft
}) {
  const { user, profile } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const reader = useReceiptReader()
  usePageTitle(existing ? 'Edit expense' : capture ? 'Captured payment' : 'Add expense')
  const fileRef = useRef<HTMLInputElement>(null)
  const order = useMemo(() => memberOrder(group), [group])
  const me = myMemberId(group, user.uid) ?? order[0]
  const personal = group.type === 'personal'
  // The categories this user picked by hand before (src/lib/merchants.ts), unless an admin turned the memory off.
  const memoryOn = useFlag('merchantMemory')
  const memoryLive = useMerchantMemory()
  const memory = memoryOn ? memoryLive : null
  const memoryRef = useRef(memory)
  memoryRef.current = memory
  const dupOn = useFlag('duplicates')
  const seedArgs = (g: Group, o: MemberId[], m: MemberId): SeedArgs => ({
    group: g,
    order: o,
    me: m,
    existing,
    again,
    capture,
    quick,
    history,
    last: existing ? {} : lastSplit(g.id, o),
    lastCurrency: lastCurrency(g.id),
    memory,
  })
  const [seed0] = useState(() => initialDraft(seedArgs(group, order, me)))
  /** what the form started from, to know whether anything was changed */
  const seedRef = useRef(seed0)
  const [draft, rawDispatch] = useReducer(reduce, seed0, (base) => (restore ? restoreDraft(restore, base, seedArgs(group, order, me)) : base))
  // The reducer stays pure: the actions that guess a category get the memory handed in here.
  const dispatch = useCallback((a: Action) => rawDispatch(a.type === 'description' || a.type === 'applyReceipt' ? { ...a, memory: memoryRef.current } : a), [])

  // Switching group (new expenses only) keeps the amount, description, category, date, notes and
  // receipt; payer and split start over from the new group's members (adjusting state while
  // rendering, so the old group's member ids never reach the new group's split).
  if (draft.seededFor.id !== group.id) {
    const args = seedArgs(group, order, me)
    seedRef.current = initialDraft(args)
    dispatch({ type: 'switchGroup', group, order, me, capture, last: args.last, lastCurrency: args.lastCurrency })
  }

  const [sheet, setSheet] = useState<SheetKind>(null)
  const [busy, setBusy] = useState(false)
  /** a save was attempted: show what is still wrong next to each field */
  const [submitted, setSubmitted] = useState(false)
  const [receipt, setReceipt] = useState<File | null>(null)
  /** a scanned bill with line items: offer item-by-item assignment or a live table */
  const [scanned, setScanned] = useState<{ parsed: ParsedReceipt; file: File } | null>(null)
  const done = useRef(false)

  // The unsaved draft follows every change; a clean form leaves nothing behind.
  const dirty = isDirty(draft, seedRef.current)
  useEffect(() => {
    if (done.current) return
    if (dirty) saveDraft(storeKey, { groupId: group.id, again: again?.id, capture: capture?.id, draft })
    else clearDraft(storeKey)
  }, [draft, dirty, storeKey, group.id, again?.id, capture?.id])
  useEffect(() => {
    if (restore) toast('Picked up where you left off')
  }, [restore, toast])
  useEffect(() => {
    if (quick) toast(quick.amount ? 'Filled in from your line. Check it over, then save.' : 'Couldn’t find an amount in your line. Add it, then save.')
  }, [quick, toast])

  // Duplicate warning: the same amount within a day, with a similar description, already in this group.
  const [dupIgnored, setDupIgnored] = useState<string | null>(null)
  const dup = useMemo(
    () =>
      dupOn && !existing && validAmount(draft)
        ? findDuplicate(expenses, { amount: draft.amount, cur: draft.cur, date: draft.date, description: draft.description }, group.currency)
        : undefined,
    [dupOn, existing, expenses, draft, group.currency],
  )
  const showDup = dup && dupIgnored !== dup.id

  const fx = useFxRate({ cur: draft.cur, to: group.currency, date: draft.date, fx: draft.fx, onFx: (f) => dispatch({ type: 'fx', fx: f }) })
  const converted = fx.foreign && draft.fx && validAmount(draft) ? convertMinor(draft.amount, draft.cur, group.currency, draft.fx.rate) : undefined

  const applyReceipt = (parsed: ParsedReceipt, file: File) => {
    dispatch({ type: 'applyReceipt', parsed })
    setReceipt(file)
    setScanned(parsed.items.length >= 2 && !personal ? { parsed, file } : null)
    const cur = parsed.currency && CURRENCIES.includes(parsed.currency) ? parsed.currency : draft.cur
    const total = parsed.total ? fromHundredths(parsed.total, cur) : undefined
    toast(
      total ? `Found ${formatMoney(total, cur)}${parsed.items.length ? ` and ${parsed.items.length} items` : ''}` : 'Couldn’t read a total, please enter it',
    )
  }
  const applyRef = useRef(applyReceipt)
  useEffect(() => {
    applyRef.current = applyReceipt
  })
  // A bill handed over from the Scan screen (its currency comes from the reader, not the group).
  /** the Recent scans entry it came from, so the saved expense can be noted on it */
  const scanFrom = useRef<{ id: string; kind: ScanKind }>(undefined)
  useEffect(() => {
    if (pending.receipt && !existing) {
      const r = pending.receipt
      pending.receipt = undefined
      scanFrom.current = r.history
      applyRef.current(r.parsed, r.file)
    }
  }, [existing])

  async function onScanFile(file: File) {
    try {
      const r = await reader.read(file)
      applyReceipt(r.parsed, file)
      if (r.fellBack) toast('Read on this phone (AI isn’t available right now)')
    } catch (e) {
      toast(`Couldn’t read the image: ${errText(e)}`, 'err')
    }
  }
  const splitAtTable = () => {
    if (scanned) pending.receipt = scanned
    done.current = true
    clearDraft(storeKey)
    nav(`/split${personal ? '' : `?group=${group.id}`}`, { replace: true })
  }
  const assignItems = () => {
    if (!scanned) return
    dispatch({ type: 'assignItems', items: scanned.parsed.items, order })
    setScanned(null)
    setSheet('split')
  }

  const ctx = { group, order, me, personal }
  const preview = useMemo(() => selectSplits(draft, order, me, personal), [draft, order, me, personal])
  const errors = submitted ? validate(draft, ctx) : {}

  const focusError = (k: ErrorKey) => {
    const el = document.getElementById(ERROR_TARGET[k])
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.focus({ preventScroll: true })
  }

  const save = async () => {
    setSubmitted(true)
    const errs = validate(draft, ctx)
    const first = ERROR_ORDER.find((k) => errs[k])
    if (first) {
      focusError(first)
      return
    }
    setBusy(true)
    try {
      const { expense: e, remember } = toExpense(draft, { ...ctx, existing, userUid: user.uid, now: Date.now() })
      await repo.saveExpense(e)
      // A category chosen by hand that differs from what would have been suggested teaches the merchant memory.
      if (memory && draft.catTouched) {
        const learned = learnFromSave(memory, e.description, e.category, suggestCategory(e.description, { memory, history }))
        if (learned) repo.saveMerchants(user.uid, learned).catch((err) => console.warn('Merchant memory not saved', err))
      }
      rememberCurrency(group.id, draft.cur)
      if (!existing) {
        rememberGroup(group.id)
        if (!personal) rememberSplit(group.id, remember)
      }
      if (capture) await repo.updateCapture(user.uid, capture.id, { status: 'assigned', groupId: group.id, expenseId: e.id }).catch(console.warn)
      // Note the outcome on the Recent scans entry this came from.
      if (scanFrom.current && !existing)
        void recordOutcome(user.uid, scanFrom.current.kind, scanFrom.current.id, {
          label: `Added to ${group.name}`,
          href: `/groups/${group.id}/expenses/${e.id}`,
        }).catch(() => {})
      // Upload after saving so a slow or offline network never blocks the save.
      if (receipt && !repo.attachReceipt(group.id, e.id, receipt)) toast('Offline, saved without the receipt image')
      done.current = true
      clearDraft(storeKey)
      toast(existing ? 'Expense updated' : 'Expense added')
      nav(`/groups/${group.id}`, { replace: true })
    } catch (err) {
      toast(errText(err), 'err')
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (dirty) {
      const ok = await confirm({
        title: existing ? 'Discard your changes?' : 'Discard this expense?',
        message: 'What you’ve entered here will be lost.',
        confirmLabel: 'Discard',
        tone: 'danger',
      })
      if (!ok) return
    }
    done.current = true
    clearDraft(storeKey)
    // Opened from the home-screen shortcut there is nothing to go back to.
    if (window.history.length > 1) nav(-1)
    else nav('/')
  }

  // "Same as last time": only when the remembered choice is in use and isn't the plain default.
  const last = useMemo(() => (existing ? {} : lastSplit(group.id, order)), [existing, group.id, order])
  const payerHint = !existing && !draft.multiPay && !!last.payer && last.payer === draft.payer && draft.payer !== me
  const everyone = draft.splitType === 'equal' && order.every((id) => draft.split.selected.includes(id))
  const splitHint = !existing && !everyone && sameSplit(draft.splitType, toSplitInput(draft.split, draft.splitType), last.splitType, last.input)

  const suggestions = existing || draft.picked ? [] : suggestDescriptions(history, draft.description)
  const currencyChoices = [...new Set([group.currency, draft.cur, profile.currency, ...CURRENCIES])]
  const applyRate = () => {
    if (!fx.applyRate()) toast('Enter a rate above 0', 'err')
  }

  return (
    <form
      className="mx-auto min-h-dvh max-w-lg px-4 pb-10"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      noValidate
    >
      <header className="sticky top-0 z-30 -mx-4 flex items-center justify-between bg-slate-50/85 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl dark:bg-ink-950/85">
        <button type="button" onClick={cancel} className="-ml-3 flex h-11 w-11 items-center justify-center rounded-full" aria-label="Cancel">
          <X size={24} />
        </button>
        <h1 className="text-base font-bold">{existing ? 'Edit expense' : capture ? 'Captured payment' : 'Add expense'}</h1>
        <button
          type="submit"
          disabled={busy}
          className="accent-live inline-flex min-h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-brand-600 px-4 py-2 text-sm font-bold leading-5 text-white disabled:opacity-50"
          data-testid="expense-save"
        >
          <Check size={16} strokeWidth={2.5} aria-hidden />
          {busy ? 'Saving…' : 'Save'}
        </button>
      </header>

      {/* Group picker */}
      <button
        type="button"
        onClick={() => setSheet('group')}
        disabled={!!existing}
        className="card mt-2 flex w-full items-center gap-3 p-3 text-left disabled:opacity-100"
        aria-haspopup="dialog"
        data-testid="group-picker"
      >
        <GroupIcon emoji={group.emoji} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted">{personal ? 'Personal wallet' : 'With'}</span>
          <span className="block truncate font-semibold">{group.name}</span>
        </span>
        {!existing && <span className="text-sm font-semibold text-brand-600 dark:text-brand-300">Change</span>}
      </button>

      <AmountCard
        draft={draft}
        dispatch={dispatch}
        group={group}
        existing={!!existing}
        history={history}
        suggestions={suggestions}
        onPickSuggestion={(s) => dispatch({ type: 'pickSuggestion', s, order, personal })}
        errors={errors}
        fx={fx}
        converted={converted}
        onApplyRate={applyRate}
        onOpenCategory={() => setSheet('category')}
        onOpenCurrency={() => setSheet('currency')}
        scan={{ busy: reader.busy, label: reader.label, onPick: () => fileRef.current?.click() }}
        hasReceipt={!!receipt || !!existing?.receiptUrl}
        scannedItems={scanned?.parsed.items.length ?? 0}
        onAssignItems={assignItems}
        onSplitAtTable={splitAtTable}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onScanFile(f)
          e.target.value = ''
        }}
      />
      {showDup && (
        <div
          className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-sm dark:border-amber-500/20 dark:bg-amber-500/10"
          role="status"
          data-testid="dup-warning"
        >
          <div className="flex items-start gap-2">
            <Copy size={18} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-amber-900 dark:text-amber-100">{duplicateLine(dup, group.currency, todayISO())}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link to={`/groups/${group.id}/expenses/${dup.id}`} className="btn-secondary btn-sm">
                  Open it
                </Link>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setDupIgnored(dup.id)} data-testid="dup-save-anyway">
                  It’s a different expense, save anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!personal && (
        <>
          <PayerCard draft={draft} dispatch={dispatch} group={group} order={order} me={me} hint={payerHint} onOpen={() => setSheet('payer')} />
          <SplitCard
            draft={draft}
            dispatch={dispatch}
            group={group}
            order={order}
            me={me}
            hint={splitHint}
            splits={preview.splits}
            error={preview.error ?? errors.split}
            open={sheet === 'split'}
            onOpen={() => setSheet('split')}
            onClose={() => setSheet(null)}
          />
        </>
      )}

      <MoreCard draft={draft} dispatch={dispatch} existing={existing} errors={errors} />

      <GroupPickerSheet
        open={sheet === 'group'}
        onClose={() => setSheet(null)}
        groups={groups}
        current={group.id}
        onPick={(id) => {
          onGroup(id)
          setSheet(null)
        }}
        onCreate={(q) => nav(`/groups/new?${q ? `type=${q}&` : ''}next=add`)}
      />
      <CurrencySheet
        open={sheet === 'currency'}
        onClose={() => setSheet(null)}
        value={draft.cur}
        choices={currencyChoices}
        groupName={group.name}
        groupCurrency={group.currency}
        onPick={(c) => dispatch({ type: 'currency', cur: c })}
      />
      <CategorySheet
        open={sheet === 'category'}
        onClose={() => setSheet(null)}
        value={draft.category}
        onPick={(c) => dispatch({ type: 'category', category: c })}
      />
      {!personal && (
        <PayerSheet
          open={sheet === 'payer'}
          onClose={() => setSheet(null)}
          group={group}
          order={order}
          me={me}
          value={draft.payer}
          multiPay={draft.multiPay}
          onPick={(id) => dispatch({ type: 'payer', id })}
          onMultiPay={() => dispatch({ type: 'multiPay', on: true })}
        />
      )}
    </form>
  )
}
