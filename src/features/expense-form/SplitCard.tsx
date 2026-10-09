import { Equal, Percent, ReceiptText, Scale, SlidersHorizontal, Sigma } from 'lucide-react'
import type { Group, MemberId, SplitType } from '@/types'
import { formatMoney } from '@/lib/money'
import { describeSplit, validAmount, type Action, type Draft } from '@/lib/expense-draft'
import { Sheet } from '@/components/Sheet'
import { SameHint, SplitFooter, nameOf } from './bits'
import { SummaryCard } from './sheets'
import { SplitEditor } from './SplitEditor'

const TYPES: Array<{ value: SplitType; label: string; icon: typeof Equal }> = [
  { value: 'equal', label: 'Equally', icon: Equal },
  { value: 'exact', label: 'Exact', icon: Sigma },
  { value: 'percent', label: 'Percent', icon: Percent },
  { value: 'shares', label: 'Shares', icon: Scale },
  { value: 'adjust', label: 'Adjust', icon: SlidersHorizontal },
  { value: 'itemized', label: 'By items', icon: ReceiptText },
]

/** "Split equally · 4 people" as one row; the sheet holds the six split types and their editors. */
export function SplitCard({
  draft,
  dispatch,
  group,
  order,
  me,
  hint,
  splits,
  error,
  open,
  onOpen,
  onClose,
}: {
  draft: Draft
  dispatch: (a: Action) => void
  group: Group
  order: MemberId[]
  me: MemberId
  hint: boolean
  splits?: Record<MemberId, number>
  error?: string
  open: boolean
  onOpen: () => void
  onClose: () => void
}) {
  const amount = validAmount(draft) ? draft.amount : 0
  const Icon = TYPES.find((t) => t.value === draft.splitType)?.icon ?? Equal
  // A one-line preview: "₹300.00 each" when everyone pays the same, else the first few shares.
  let detail: string | undefined
  if (splits) {
    const parts = order.filter((id) => splits[id] !== undefined).map((id) => [id, splits[id]] as const)
    const same = parts.length > 1 && parts.every(([, v]) => v === parts[0][1])
    detail = same
      ? `${formatMoney(parts[0][1], draft.cur)} each`
      : parts
          .slice(0, 3)
          .map(([id, v]) => `${nameOf(group, me, id)} ${formatMoney(v, draft.cur)}`)
          .join(' · ') + (parts.length > 3 ? ` · +${parts.length - 3}` : '')
  }
  return (
    <>
      <SummaryCard
        id="split-card"
        label={<>Split{hint && <SameHint />}</>}
        title={describeSplit(draft, order, group, me)}
        detail={detail}
        icon={<Icon size={20} />}
        onClick={onOpen}
        testId="split-summary"
      >
        <SplitFooter type={draft.splitType} split={draft.split} order={order} amount={amount} currency={draft.cur} error={error} />
      </SummaryCard>
      <Sheet open={open} onClose={onClose} title="How to split it" testId="split-sheet">
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Split type">
          {TYPES.map((t) => {
            const on = draft.splitType === t.value
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => dispatch({ type: 'splitType', splitType: t.value, order })}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-2 text-xs font-semibold transition ${on ? 'accent-live bg-fill text-on-fill shadow-lg shadow-fill/30' : 'bg-slate-100 text-slate-700 dark:bg-ink-800 dark:text-slate-300'}`}
              >
                <t.icon size={18} aria-hidden />
                {t.label}
              </button>
            )
          })}
        </div>
        <div className="mt-4">
          <SplitEditor
            type={draft.splitType}
            split={draft.split}
            dispatch={dispatch}
            group={group}
            order={order}
            me={me}
            cur={draft.cur}
            amount={amount}
            splits={splits}
          />
        </div>
        <SplitFooter type={draft.splitType} split={draft.split} order={order} amount={amount} currency={draft.cur} error={error} inline />
        <button type="button" className="btn-primary mt-4 w-full" onClick={onClose} data-testid="split-done">
          Done
        </button>
      </Sheet>
    </>
  )
}
