import { ImagePlus, Paperclip, ReceiptText, ScanText, Users, X } from 'lucide-react'
import { type FormPhoto, formPhotoView } from '@/lib/receipt-photo'
import type { Group } from '@/types'
import { CATEGORIES } from '@/lib/categories'
import { expenseEmoji } from '@/lib/icons'
import { useLongPress } from '@/hooks/useLongPress'
import { centsToInput, currencySymbol } from '@/lib/money'
import type { Action, Draft, Errors } from '@/lib/expense-draft'
import { addDaysISO, type Suggestion } from '@/lib/recents'
import { todayISO } from '@/lib/id'
import { DateField } from '@/components/DateField'
import { MoneyInput } from '@/components/MoneyInput'
import { Spinner } from '@/components/Misc'
import { Detail, HintText, InfoTip, type Hint } from '@/components/Hint'
import { FxLine } from './FxLine'
import type { useFxRate } from './useFxRate'

const ITEMS_OFFER_HINT: Hint = { full: 'Split it by who had what', tier: 'help' }

/**
 * What, how much, when: category tile + description (with past-description chips), the big
 * amount with its currency, the exchange-rate line for a foreign currency, and the date row
 * whose Scan button fills the remaining width (icon only on the narrowest phones).
 */
export function AmountCard({
  draft,
  dispatch,
  group,
  existing,
  history,
  suggestions,
  onPickSuggestion,
  errors,
  fx,
  converted,
  onApplyRate,
  onOpenCategory,
  onOpenIcon,
  onOpenCurrency,
  scan,
  photo,
  photoSrc,
  onAttachPhoto,
  onRemovePhoto,
  scannedItems,
  onAssignItems,
  onSplitAtTable,
}: {
  draft: Draft
  dispatch: (a: Action) => void
  group: Group
  existing: boolean
  history: Suggestion[]
  suggestions: Suggestion[]
  onPickSuggestion: (s: Suggestion) => void
  errors: Errors
  fx: ReturnType<typeof useFxRate>
  converted?: number
  onApplyRate: () => void
  onOpenCategory: () => void
  /** press and hold on the icon: every icon (src/components/IconSheet.tsx) */
  onOpenIcon: () => void
  onOpenCurrency: () => void
  scan: { busy: boolean; label: string; onPick: () => void }
  /** the expense's photo: none, one picked here, or the saved one (src/lib/receipt-photo.ts) */
  photo: FormPhoto
  /** the photo itself, for the thumbnail (a picked file's object URL, or the saved one opened) */
  photoSrc: string | null
  /** pick a photo to keep with the expense without reading it */
  onAttachPhoto: () => void
  /** drop the photo picked here (the saved one stays until another replaces it) */
  onRemovePhoto: () => void
  /** a scanned bill with this many line items can be assigned item by item */
  scannedItems: number
  onAssignItems: () => void
  onSplitAtTable: () => void
}) {
  const today = todayISO()
  const yesterday = addDaysISO(today, -1)
  const cat = CATEGORIES[draft.category]
  const press = useLongPress({ onTap: onOpenCategory, onHold: onOpenIcon })
  const hasReceipt = photo !== 'none'
  const photoView = formPhotoView(photo)
  return (
    <div className="card mt-3 p-5">
      <div className="flex items-center gap-3">
        {/* Tap: the category. Press and hold (or the context menu): the icon. */}
        <button
          type="button"
          {...press}
          className="flex h-14 w-14 shrink-0 press-hold select-none items-center justify-center rounded-2xl text-3xl [-webkit-touch-callout:none]"
          style={{ background: cat.color + '22' }}
          aria-label={`Category: ${cat.label}. Change. Press and hold for the icon`}
          aria-haspopup="dialog"
          data-testid="expense-icon"
        >
          <span aria-hidden>{expenseEmoji(draft)}</span>
        </button>
        <div className="min-w-0 flex-1">
          <input
            id="expense-description"
            className="w-full bg-transparent text-lg font-semibold outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg"
            placeholder={draft.category !== 'other' && !draft.description ? cat.label : 'What was it for?'}
            aria-label="Description"
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? 'expense-description-error' : undefined}
            autoComplete="off"
            enterKeyHint="next"
            // A private group stores it encrypted, which takes more room (lib/vault-crypto.ts plainBytesFor).
            maxLength={group.vault ? 100 : undefined}
            value={draft.description}
            onChange={(e) => dispatch({ type: 'description', value: e.target.value, history })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                document.getElementById('expense-amount')?.focus()
              }
            }}
          />
          {errors.description && (
            <p id="expense-description-error" role="alert" className="neg mt-0.5 text-sm">
              {errors.description}
            </p>
          )}
        </div>
        {/* Scan reads a bill into the form (total, items, description) and keeps the photo. */}
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-brand-600 hover:bg-slate-100 disabled:opacity-60 dark:text-brand-300 dark:hover:bg-ink-800"
          onClick={scan.onPick}
          disabled={scan.busy}
          aria-label={scan.busy ? scan.label : hasReceipt ? 'Rescan receipt' : 'Scan receipt'}
          aria-busy={scan.busy || undefined}
          data-testid="receipt-scan"
        >
          {scan.busy ? <Spinner className="!h-5 !w-5" label={scan.label} /> : <ScanText size={22} aria-hidden />}
        </button>
      </div>
      {/* Past descriptions are a shortcut, not a choice: the Minimal look leaves them out. */}
      {suggestions.length > 0 && (
        <Detail min={2}>
          <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 py-1" data-testid="desc-suggestions" role="group" aria-label="Past descriptions">
            {suggestions.map((sg) => (
              <button key={sg.description} type="button" onClick={() => onPickSuggestion(sg)} className="chip min-h-9 shrink-0 !py-1.5 text-sm">
                <span aria-hidden>{expenseEmoji(sg)}</span>
                <span className="max-w-[10rem] truncate">{sg.description}</span>
              </button>
            ))}
          </div>
        </Detail>
      )}
      <div className="mt-4 flex items-baseline gap-3 border-t border-slate-100 pt-4 dark:border-white/5">
        {/* The symbol itself is the currency button (opens the list); sized to sit with the amount. */}
        <button
          type="button"
          onClick={onOpenCurrency}
          className={`min-h-11 min-w-11 shrink-0 rounded-xl pl-1 pr-0.5 font-extrabold leading-none tracking-tight transition active:scale-95 ${currencySymbol(draft.cur).length > 2 ? 'text-3xl' : 'text-5xl'} ${fx.foreign ? 'text-brand-600 dark:text-brand-300' : 'text-muted'}`}
          aria-label={`Currency: ${draft.cur}. Change`}
          aria-haspopup="dialog"
          data-testid="amount-currency"
        >
          {currencySymbol(draft.cur)}
        </button>
        <MoneyInput
          bare
          id="expense-amount"
          className="w-full min-w-0 rounded-lg bg-transparent text-5xl font-extrabold tabular-nums tracking-tight outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-brand-500 dark:placeholder:text-slate-600"
          placeholder={centsToInput(0, draft.cur)}
          aria-label={`Amount in ${draft.cur}`}
          aria-invalid={errors.amount ? true : undefined}
          aria-describedby={errors.amount ? 'expense-amount-error' : undefined}
          enterKeyHint="done"
          value={draft.amount}
          currency={draft.cur}
          onChange={(v) => dispatch({ type: 'amount', amount: v })}
          autoFocus={!existing}
        />
      </div>
      {errors.amount && (
        <p id="expense-amount-error" role="alert" className="neg mt-1 text-sm">
          {errors.amount}
        </p>
      )}
      {fx.foreign && (
        <FxLine
          cur={draft.cur}
          to={group.currency}
          fx={draft.fx}
          loading={fx.loading}
          converted={converted}
          rateEdit={fx.rateEdit}
          setRateEdit={fx.setRateEdit}
          onApply={onApplyRate}
          error={errors.fx}
        />
      )}
      {/* Date chips keep their size; Attach takes what's left (icon only on the narrowest phones). */}
      <div className="mt-4 flex gap-1.5">
        <DateField
          aria-label="Date"
          className="!w-auto shrink-0 !py-2 text-sm"
          value={draft.date}
          onChange={(v) => dispatch({ type: 'date', date: v || todayISO() })}
        />
        {[
          { d: today, label: 'Today' },
          { d: yesterday, label: 'Yesterday' },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => dispatch({ type: 'date', date: o.d })}
            aria-pressed={draft.date === o.d}
            className={`min-h-10 shrink-0 rounded-2xl px-2 text-xs font-semibold ${draft.date === o.d ? 'accent-live bg-fill text-on-fill' : 'bg-slate-100 text-slate-700 dark:bg-ink-800 dark:text-slate-300'}`}
          >
            {o.label}
          </button>
        ))}
        {/* Attach keeps a photo without reading it (a bill already typed in, a screenshot); Scan is beside the description.
            One photo per expense: while there is one, this is disabled and the photo's own row below replaces or removes it. */}
        <button
          type="button"
          className="@container btn-secondary !min-h-10 min-w-0 flex-1 !gap-1.5 !px-2 !py-2 text-sm disabled:opacity-40"
          onClick={onAttachPhoto}
          disabled={scan.busy || photoView.attachDisabled}
          aria-label={photoView.attachDisabled ? 'Attach a receipt photo (one is attached: replace it below)' : 'Attach a receipt photo'}
          data-testid="receipt-attach"
        >
          <ImagePlus size={16} className="shrink-0" aria-hidden />
          <span className="hidden @[3.75rem]:inline">Attach</span>
        </button>
      </div>
      {photoView.row && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-slate-50 p-2 pr-1 dark:bg-ink-800" data-testid="receipt-attached">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 dark:bg-ink-900 dark:ring-white/10">
            {photoSrc ? <img src={photoSrc} alt="" className="h-full w-full object-cover" /> : <Paperclip size={16} className="text-muted" aria-hidden />}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{photoView.row.label}</span>
          <button
            type="button"
            className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-semibold text-brand-600 hover:bg-white dark:text-brand-300 dark:hover:bg-ink-900"
            onClick={onAttachPhoto}
            disabled={scan.busy}
            data-testid="receipt-replace-form"
          >
            Replace
          </button>
          {photoView.row.remove && (
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-white hover:text-rose-600 dark:hover:bg-ink-900"
              onClick={onRemovePhoto}
              aria-label="Remove the photo"
              data-testid="receipt-remove"
            >
              <X size={18} aria-hidden />
            </button>
          )}
        </div>
      )}
      {scannedItems >= 2 && !existing && (
        <div className="mt-3 rounded-2xl bg-brand-50 p-3 dark:bg-brand-900/30" data-testid="split-items-offer">
          <div className="flex items-center gap-3">
            <ReceiptText size={22} className="shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex items-center">
                <div className="font-semibold">{scannedItems} items on this bill</div>
                <InfoTip hint={ITEMS_OFFER_HINT} label="About splitting by items" />
              </div>
              <HintText hint={ITEMS_OFFER_HINT} as="div" className="text-muted" />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="btn-primary btn-sm" onClick={onAssignItems} data-testid="assign-items">
              <ReceiptText size={16} aria-hidden /> Assign items myself
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={onSplitAtTable} data-testid="split-at-table">
              <Users size={16} aria-hidden /> Split at the table
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
