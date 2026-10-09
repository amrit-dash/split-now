import { X } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { rateLabel, type FxRate } from '@/lib/fx'
import { Spinner } from '@/components/Misc'

/** "≈ A$51.23 at 1 THB = 0.0427 AUD (ECB, 2026-10-07)" with an edit-rate affordance. */
export function FxLine({
  cur,
  to,
  fx,
  loading,
  converted,
  rateEdit,
  setRateEdit,
  onApply,
  error,
}: {
  cur: string
  to: string
  fx: FxRate | null
  loading: boolean
  converted?: number
  rateEdit: string | null
  setRateEdit: (v: string | null) => void
  onApply: () => void
  /** a validation message to show under the line (after a failed save) */
  error?: string
}) {
  if (rateEdit !== null) {
    return (
      <form
        id="fx-line"
        className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm dark:bg-ink-800"
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onApply()
        }}
      >
        {!fx && (
          <div className="mb-2 text-amber-700 dark:text-amber-300">
            No {cur} → {to} rate available (offline, or not published by the ECB). Enter one:
          </div>
        )}
        <div className="flex items-center gap-2">
          <label htmlFor="fx-rate" className="shrink-0 font-semibold">
            1 {cur} =
          </label>
          <input
            id="fx-rate"
            className="input !py-2 text-right"
            inputMode="decimal"
            placeholder={fx ? String(fx.rate) : '0.00'}
            value={rateEdit}
            onChange={(e) => setRateEdit(e.target.value)}
            autoFocus
          />
          <span className="shrink-0 font-semibold">{to}</span>
          <button type="submit" className="min-h-11 rounded-xl bg-fill px-3 py-2 font-bold text-on-fill">
            Use
          </button>
          {fx && (
            <button type="button" className="flex h-11 w-11 items-center justify-center text-muted" onClick={() => setRateEdit(null)} aria-label="Cancel">
              <X size={16} />
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="neg mt-2 text-sm">
            {error}
          </p>
        )}
      </form>
    )
  }
  if (loading)
    return (
      <div id="fx-line" className="mt-3 flex items-center gap-2 text-sm text-muted">
        <Spinner className="!h-4 !w-4" label="Getting the exchange rate" /> Getting the {cur} → {to} rate…
      </div>
    )
  if (!fx)
    return error ? (
      <p id="fx-line" role="alert" className="neg mt-3 text-sm">
        {error}
      </p>
    ) : null
  return (
    <div id="fx-line" className="mt-3 text-sm" data-testid="fx-line">
      <div className="flex items-start justify-between gap-2">
        <span className="text-muted">
          {converted !== undefined && (
            <>
              <span className="font-semibold text-slate-700 dark:text-slate-200">≈ {formatMoney(converted, to)}</span> at{' '}
            </>
          )}
          {rateLabel({ currency: cur, rate: fx.rate, rateDate: fx.date, source: fx.source }, to)}
        </span>
        <button type="button" className="min-h-11 shrink-0 font-semibold text-brand-600 dark:text-brand-300" onClick={() => setRateEdit(String(fx.rate))}>
          Edit rate
        </button>
      </div>
      {error && (
        <p role="alert" className="neg mt-1">
          {error}
        </p>
      )}
    </div>
  )
}
