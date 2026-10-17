import { useBack } from '@/hooks/useBack'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, Copy, X } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { memberOrder, myMemberId } from '@/hooks/data'
import { useFlag } from '@/hooks/useAppConfig'
import { useMerchantMemory } from '@/hooks/useMerchants'
import { attachedNote, fitAttached, formPhoto, MAX_ATTACHED, scanReplacedNote } from '@/lib/receipt-photo'
import { usePhotoUrl, usePhotoUrls } from '@/hooks/useVault'
import { useAttachedPhotos } from './useAttachedPhotos'
import { useReceiptReader } from '@/hooks/useReceiptReader'
import type { Capture, Expense, Group, MemberId, OpenItem } from '@/types'
import { CURRENCIES, formatMoney, fromHundredths } from '@/lib/money'
import { expenseMemberIds } from '@/lib/members'
import { convertMinor, lastCurrency, rememberCurrency } from '@/lib/fx'
import type { ParsedReceipt } from '@/lib/ocr-parse'
import { pending } from '@/lib/pending'
import { recordOutcome, type ScanKind } from '@/lib/scanHistory'
import { errText } from '@/lib/errors'
import { duplicateLine, findDuplicate } from '@/lib/duplicates'
import { learnFromSave, suggestCategory } from '@/lib/merchants'
import type { QuickPrefill } from '@/lib/nl-expense'
import { todayISO } from '@/lib/id'
import { deleteDraftBlob, draftBlobKey, getDraftBlob, isDraftBlobKey, putDraftBlob } from '@/lib/draft-blob'
import { downscale, imagePreviewUrl } from '@/lib/image'
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
  descriptionOf,
} from '@/lib/expense-draft'
import { GroupIcon } from '@/components/GroupIcon'
import { useToast } from '@/components/Toast'
import { Detail, HintText } from '@/components/Hint'
import { Segmented } from '@/components/Misc'
import { isReceived } from '../../../shared/received'
import { usePageTitle } from '@/lib/brand'
import { useConfirm } from '@/components/ConfirmSheet'
import { OpenItemSheet } from '@/features/open-items/OpenItemSheet'
import { CATEGORIES } from '@/lib/categories'
import { categoryIcons, expenseEmoji } from '@/lib/icons'
import { IconSheet } from '@/components/IconSheet'
import { useIconAi } from '@/hooks/useIconAi'
import { openItemMeta } from '@/lib/open-items'
import { AmountCard } from './AmountCard'
import { PayerCard } from './PayerCard'
import { SplitCard } from './SplitCard'
import { MoreCard } from './MoreCard'
import { CategorySheet, CurrencySheet, GroupPickerSheet, PayerSheet } from './sheets'
import { useFxRate } from './useFxRate'

type SheetKind = 'group' | 'category' | 'icon' | 'payer' | 'currency' | 'split' | null

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
  openItem,
  fromChat,
  expenses,
  history,
  onGroup,
  storeKey,
  restore,
  restoreReceipt,
  restorePhotos,
}: {
  group: Group
  groups: Group[]
  existing?: Expense
  again?: Expense
  capture?: Capture
  /** Quick add: the parsed line to start from */
  quick?: QuickPrefill
  /** the open item this expense claims (its details arrive as `quick`) */
  openItem?: OpenItem
  /** opened from the group chat: post the new expense's card there, and go back to it */
  fromChat?: boolean
  /** the group's live expenses (for the duplicate warning) */
  expenses: Expense[]
  history: Suggestion[]
  onGroup: (id: string) => void
  /** sessionStorage key for this route's draft */
  storeKey: string
  /** a draft stored for this route, to pick up where the user left off */
  restore?: Draft
  /** where the restored draft's receipt photo is kept on this device (src/lib/draft-blob.ts) */
  restoreReceipt?: string
  /** the restored draft's attached photos, kept the same way */
  restorePhotos?: string[]
}) {
  const { user, profile } = useMe()
  const nav = useNavigate()
  const goBack = useBack('/')
  const toast = useToast()
  const confirm = useConfirm()
  const reader = useReceiptReader()
  const fileRef = useRef<HTMLInputElement>(null)
  const attachRef = useRef<HTMLInputElement>(null)
  // The thumbnail in the form: the photo picked here, or the one the expense already has (a private group's opened here).
  const savedSrc = usePhotoUrl(group.id, { path: existing?.receiptPath, url: existing?.receiptUrl })
  const savedAttached = existing?.photos ?? []
  const savedAttachedSrcs = usePhotoUrls(group.id, savedAttached)
  // People who left stay in the pickers only for the old expense being edited (never for a new one).
  const order = useMemo(() => memberOrder(group, existing && existing.groupId === group.id ? expenseMemberIds(existing) : undefined), [group, existing])
  const me = myMemberId(group, user.uid) ?? order[0]
  const personal = group.type === 'personal'
  // The categories this user picked by hand before (src/lib/merchants.ts), unless an admin turned the memory off.
  const memoryOn = useFlag('merchantMemory')
  const memoryLive = useMerchantMemory()
  const memory = memoryOn ? memoryLive : null
  const memoryRef = useRef(memory)
  memoryRef.current = memory
  const dupOn = useFlag('duplicates')
  // Money received (shared/received.ts): offered for a new entry while the flag is on; an existing one keeps its switch.
  const receivedOn = useFlag('moneyReceived')
  const seedArgs = (g: Group, o: MemberId[], m: MemberId): SeedArgs => ({
    group: g,
    order: o,
    me: m,
    existing,
    again,
    capture,
    // With money received off, a "refund 500" line opens as an ordinary expense.
    quick: quick && !receivedOn ? { ...quick, received: undefined } : quick,
    notes: openItem?.notes,
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
  const iconAi = useIconAi(!!group.vault)
  const [busy, setBusy] = useState(false)
  /** a save was attempted: show what is still wrong next to each field */
  const [submitted, setSubmitted] = useState(false)
  const [receipt, setReceipt] = useState<File | null>(null)
  // Its thumbnail, while it's in the form (the object URL goes when the photo changes or the form closes).
  // imagePreviewUrl (lib/image.ts): only a checked image type, copied into a fresh blob typed as an image.
  const [receiptSrc, setReceiptSrc] = useState<string | null>(null)
  useEffect(() => {
    const url = receipt ? imagePreviewUrl(receipt) : undefined
    setReceiptSrc(url ?? null)
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [receipt])
  // The receipt photo is kept in IndexedDB beside the sessionStorage draft, so a reload brings it
  // back instead of asking for a re-scan. The ref is the key in use (or being written) right now;
  // the state is what the stored draft points at. Any storage failure just leaves the draft without it.
  const [receiptKey, setReceiptKey] = useState(() => (restore && isDraftBlobKey(restoreReceipt, storeKey) ? restoreReceipt : undefined))
  const receiptKeyRef = useRef(receiptKey)
  /** a scanned bill with line items: offer item-by-item assignment or a live table */
  const [scanned, setScanned] = useState<{ parsed: ParsedReceipt; file: File } | null>(null)
  const done = useRef(false)
  const attached = useAttachedPhotos(storeKey, restore ? restorePhotos : undefined, done)
  const attachedKeys = attached.keys.join('|')

  // The unsaved draft follows every change; a clean form leaves nothing behind.
  const dirty = isDirty(draft, seedRef.current)
  useEffect(() => {
    if (done.current) return
    if (dirty || attachedKeys)
      saveDraft(storeKey, {
        groupId: group.id,
        again: again?.id,
        capture: capture?.id,
        open: openItem?.id,
        receipt: receiptKey,
        ...(attachedKeys ? { photos: attachedKeys.split('|') } : {}),
        draft,
      })
    else clearDraft(storeKey)
  }, [draft, dirty, storeKey, group.id, again?.id, capture?.id, openItem?.id, receiptKey, attachedKeys])
  // Bring back the restored draft's photo; a scan made meanwhile wins.
  useEffect(() => {
    const key = receiptKeyRef.current
    if (!key || key !== restoreReceipt) return
    let live = true
    getDraftBlob(key).then((f) => {
      if (!live || receiptKeyRef.current !== key) return
      if (f) setReceipt(f)
      else {
        receiptKeyRef.current = undefined
        setReceiptKey(undefined)
      }
    })
    return () => {
      live = false
    }
  }, [restoreReceipt])
  /** Keep a new receipt photo for the draft (downscaled as the upload would be), replacing the previous one. */
  const keepReceipt = (file: File) => {
    void deleteDraftBlob(receiptKeyRef.current)
    setReceiptKey(undefined)
    const key = draftBlobKey(storeKey)
    receiptKeyRef.current = key
    void (async () => {
      const small = await downscale(file, 1600, 0.8).catch(() => file)
      const ok = await putDraftBlob(key, small, file.name)
      // Saved, discarded or replaced while writing: don't leave it behind.
      if (receiptKeyRef.current !== key || done.current) {
        if (ok) void deleteDraftBlob(key)
      } else if (ok) setReceiptKey(key)
      else receiptKeyRef.current = undefined
    })()
  }
  /** The draft is finished with (saved, discarded, handed to the live table): drop its photo too. */
  const forgetReceipt = () => {
    void deleteDraftBlob(receiptKeyRef.current)
    receiptKeyRef.current = undefined
    attached.forget()
  }
  useEffect(() => {
    if (restore) toast('Picked up where you left off')
  }, [restore, toast])
  // Once per form: the prefill object is rebuilt as live data arrives, which must not repeat the toast.
  const prefillToast = useRef(false)
  useEffect(() => {
    if (!quick || prefillToast.current) return
    prefillToast.current = true
    if (openItem) toast(quick.amount ? 'Paid by you, split equally. Change anything, then save.' : 'Add what you paid, then save.')
    else toast(quick.amount ? 'Filled in from your line. Check it over, then save.' : 'Couldn’t find an amount in your line. Add it, then save.')
  }, [quick, openItem, toast])
  const openItemsOn = useFlag('openItems')
  const what = draft.received && !personal ? 'money received' : 'expense'
  const title = existing ? `Edit ${what}` : capture ? 'Captured payment' : draft.received && !personal ? 'Add money received' : 'Add expense'
  usePageTitle(title)
  const showReceived = !personal && !capture && !openItem && (existing ? isReceived(existing) : receivedOn || draft.received)
  const [asOpenItem, setAsOpenItem] = useState(false)

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
    // One scanned receipt per expense: a new scan replaces it, and says so (attached photos stay).
    const replaced = scanReplacedNote(!!receipt || !!(existing?.receiptUrl || existing?.receiptPath))
    dispatch({ type: 'applyReceipt', parsed })
    setReceipt(file)
    keepReceipt(file)
    setScanned(parsed.items.length >= 2 && !personal ? { parsed, file } : null)
    const cur = parsed.currency && CURRENCIES.includes(parsed.currency) ? parsed.currency : draft.cur
    const total = parsed.total ? fromHundredths(parsed.total, cur) : undefined
    toast(
      (total
        ? `Found ${formatMoney(total, cur)}${parsed.items.length ? ` and ${parsed.items.length} items` : ''}.`
        : 'Couldn’t read a total, please enter it.') + replaced,
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
      // A private group's bill is read on the phone only (docs/VAULT.md).
      const r = await reader.read(file, !!group.vault)
      applyReceipt(r.parsed, file)
      if (r.fellBack) toast('Read on this phone (AI isn’t available right now)')
    } catch (e) {
      // Not read, but still the receipt: it stays with the expense, and the amount is typed in.
      setReceipt(file)
      keepReceipt(file)
      toast(`Couldn’t read it (${errText(e)}). The photo is attached; enter the amount.`, 'err')
    }
  }
  const splitAtTable = () => {
    if (scanned) pending.receipt = scanned
    done.current = true
    clearDraft(storeKey)
    forgetReceipt()
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
      await repo.saveExpense(e, { isNew: !existing, ...(openItem && !existing ? { claim: openItem.id } : {}) })
      // A category chosen by hand that differs from what would have been suggested teaches the merchant memory.
      // Never for a private group: the memory is stored as plain text.
      if (memory && draft.catTouched && !group.vault) {
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
      // A private group's photo is sealed before it leaves the phone (src/data/vault-repo.ts).
      const photosOffline =
        (receipt && !repo.attachReceipt(group.id, e.id, receipt)) ||
        attached.picks.map((p) => repo.attachReceipt(group.id, e.id, p.file, { slot: 'attached' })).some((ok) => !ok)
      if (photosOffline) toast('Offline, saved without the photos')
      done.current = true
      clearDraft(storeKey)
      forgetReceipt()
      toast(
        existing
          ? what === 'expense'
            ? 'Expense updated'
            : 'Money received updated'
          : openItem
            ? `Claimed “${openItem.title}”`
            : what === 'expense'
              ? 'Expense added'
              : 'Money received added',
      )
      if (fromChat && !existing && !personal) {
        const name = group.members[me]?.name || profile.displayName || 'Someone'
        repo
          .postChat(group.id, { authorUid: user.uid, authorName: name.slice(0, 80), text: '', kind: 'expense', ref: e.id, createdAt: Date.now() })
          .catch((err) => console.warn('Expense card not posted', err))
        nav(`/groups/${group.id}/chat`, { replace: true })
      } else nav(`/groups/${group.id}`, { replace: true })
    } catch (err) {
      toast(errText(err), 'err')
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (dirty || attached.picks.length) {
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
    forgetReceipt()
    // Back to where it was opened from; from the home-screen shortcut, Home.
    goBack()
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
      <header className="sticky top-[var(--banner-h,0px)] z-30 -mx-4 flex items-center justify-between bg-slate-50/85 px-4 pb-3 pt-[calc(var(--safe-top)+0.75rem)] backdrop-blur-xl dark:bg-ink-950/85">
        <button type="button" onClick={cancel} className="-ml-3 flex h-11 w-11 items-center justify-center rounded-full" aria-label="Cancel">
          <X size={24} />
        </button>
        <h1 className="text-base font-bold">{title}</h1>
        <button
          type="submit"
          disabled={busy}
          className="accent-live inline-flex min-h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-fill px-4 py-2 text-sm font-bold leading-5 text-on-fill disabled:opacity-50"
          data-testid="expense-save"
        >
          <Check size={16} strokeWidth={2.5} aria-hidden />
          {busy ? 'Saving…' : 'Save'}
        </button>
      </header>

      {/* Claiming an open item: said first, above the group and the details it filled in. */}
      {openItem && (
        <div className="mt-2 flex items-center gap-3 rounded-2xl bg-amber-50 p-3 text-sm dark:bg-amber-500/10" data-testid="claiming-open-item">
          <span className="text-xl" aria-hidden>
            {CATEGORIES[openItem.category ?? 'other'].emoji}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Claiming an open item</span>
            <span className="text-muted block truncate text-xs">
              {openItem.title} · {openItemMeta(openItem, group.currency, todayISO())}
            </span>
          </span>
        </div>
      )}

      {/* Group picker */}
      <button
        type="button"
        onClick={() => setSheet('group')}
        disabled={!!existing}
        className="card mt-2 flex w-full items-center gap-3 p-3 text-left disabled:opacity-100"
        aria-haspopup="dialog"
        data-testid="group-picker"
      >
        <GroupIcon emoji={group.emoji} group={group} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted">{personal ? 'Personal wallet' : 'With'}</span>
          <span className="block truncate font-semibold">{group.name}</span>
        </span>
        {!existing && <span className="text-sm font-semibold text-brand-600 dark:text-brand-300">Change</span>}
      </button>

      {/* Expense or money received first: it decides what the card below is. */}
      {showReceived && (
        <div className="mt-3">
          <Segmented<'expense' | 'received'>
            label="What is it"
            value={draft.received ? 'received' : 'expense'}
            onChange={(v) => dispatch({ type: 'received', on: v === 'received' })}
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'received', label: 'Money received' },
            ]}
            testId="expense-kind"
          />
          {draft.received && (
            <HintText
              hint={{ full: 'A refund or reimbursement one person got that belongs to several. Whoever received it owes the others their share.', tier: 'key' }}
              as="p"
              className="text-muted mt-2 px-1 text-xs"
            />
          )}
        </div>
      )}

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
        onOpenIcon={() => setSheet('icon')}
        onOpenCurrency={() => setSheet('currency')}
        scan={{ busy: reader.busy, label: reader.label, onPick: () => fileRef.current?.click() }}
        photo={formPhoto({ picked: !!receipt, stored: !!(existing?.receiptUrl || existing?.receiptPath) })}
        photoSrc={receiptSrc ?? savedSrc}
        onAttachPhoto={() => attachRef.current?.click()}
        onRemovePhoto={() => {
          setReceipt(null)
          void deleteDraftBlob(receiptKeyRef.current)
          receiptKeyRef.current = undefined
          setReceiptKey(undefined)
        }}
        attached={[
          ...savedAttached.map((p, i) => ({ id: p.path ?? p.url ?? `s${i}`, src: savedAttachedSrcs[i], saved: true })),
          ...attached.picks.map((p) => ({ id: p.id, src: p.src, saved: false })),
        ]}
        onRemoveAttached={attached.remove}
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
      {/* Attach a photo: no camera-only capture, so the photo library and files are offered too. */}
      <input
        ref={attachRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-testid="receipt-attach-file"
        onChange={(e) => {
          // Several at once go in while there's room; the toast says if some didn't fit.
          const files = [...(e.target.files ?? [])]
          if (files.length) {
            const fit = fitAttached(files, MAX_ATTACHED - savedAttached.length - attached.picks.length)
            attached.add(fit.take)
            toast(attachedNote(fit.take.length, fit.dropped), fit.take.length ? 'ok' : 'err')
          }
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

      {/* Open items are a niche path: the Minimal look leaves the offer out. */}
      {openItemsOn && !existing && !capture && !openItem && !personal && (
        <Detail min={2}>
          <div className="mt-4 text-center">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setAsOpenItem(true)} data-testid="save-as-open-item">
              Don’t know who paid? Save as an open item
            </button>
          </div>
        </Detail>
      )}
      {asOpenItem && (
        <OpenItemSheet
          open
          onClose={() => setAsOpenItem(false)}
          group={group}
          initial={{
            title: draft.description,
            // an amount in another currency would need a rate: left for whoever claims it
            amount: draft.cur === group.currency && validAmount(draft) ? draft.amount : undefined,
            date: draft.date,
            category: draft.catTouched ? draft.category : undefined,
            notes: draft.notes,
          }}
          onSaved={() => {
            done.current = true
            clearDraft(storeKey)
            forgetReceipt()
            nav(`/groups/${group.id}?tab=open`, { replace: true })
          }}
        />
      )}

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
        icon={expenseEmoji(draft)}
        onOpenIcon={() => setSheet('icon')}
      />
      <IconSheet
        open={sheet === 'icon'}
        onClose={() => setSheet(null)}
        title="Icon"
        value={draft.icon}
        auto={expenseEmoji({ ...draft, icon: undefined })}
        first={categoryIcons(draft.category)}
        onPick={(icon) => dispatch({ type: 'icon', icon })}
        ai={iconAi.suggest && descriptionOf(draft) ? { title: descriptionOf(draft), kind: 'expense', category: CATEGORIES[draft.category].label } : undefined}
        svgValue={draft.iconSvg}
        onPickSvg={(svg) => dispatch({ type: 'iconSvg', svg })}
        picture={iconAi.picture}
        pictureHint={iconAi.pictureHint}
        aiWaiting={iconAi.suggest && !descriptionOf(draft) ? 'Type what it was for first: AI suggests icons from it.' : undefined}
        imageValue={draft.iconImage}
        onPickImage={(image) => dispatch({ type: 'iconImage', image })}
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
          received={draft.received}
        />
      )}
    </form>
  )
}
