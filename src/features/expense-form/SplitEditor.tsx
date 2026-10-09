import { Minus, Plus } from 'lucide-react'
import type { Group, MemberId, SplitType } from '@/types'
import { centsToInput, formatMoney } from '@/lib/money'
import type { Action, SplitDraft } from '@/lib/expense-draft'
import { Avatar } from '@/components/Avatar'
import { MoneyInput } from '@/components/MoneyInput'
import { DecimalInput } from './DecimalInput'
import { CheckBox, MemberRow, nameOf, youFirst } from './bits'
import { ItemsEditor } from './ItemsEditor'

/** The editor for one split type. Amounts are in the entry currency `cur`; `splits` is the live preview. */
export function SplitEditor({
  type,
  split,
  dispatch,
  group,
  order,
  me,
  cur,
  amount,
  splits,
}: {
  type: SplitType
  split: SplitDraft
  dispatch: (a: Action) => void
  group: Group
  order: MemberId[]
  me: MemberId
  cur: string
  amount: number
  splits?: Record<MemberId, number>
}) {
  const shown = youFirst(order, me)
  const label = (id: MemberId) => nameOf(group, me, id)
  const share = (id: MemberId) => <span className="w-20 shrink-0 text-right text-sm tabular-nums text-muted">{formatMoney(splits?.[id] ?? 0, cur)}</span>
  const zero = centsToInput(0, cur)

  switch (type) {
    case 'equal': {
      const sel = split.selected
      const all = sel.length === order.length
      return (
        <div className="space-y-1">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted">
              {sel.length} of {order.length} people
            </span>
            <button
              type="button"
              className="min-h-9 font-semibold text-brand-600 dark:text-brand-300"
              onClick={() => dispatch({ type: 'selected', ids: all ? [me] : [...order] })}
            >
              {all ? 'Only me' : 'Everyone'}
            </button>
          </div>
          {shown.map((id) => {
            const on = sel.includes(id)
            return (
              <button
                key={id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => dispatch({ type: 'toggleMember', id })}
                className="flex min-h-12 w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-slate-50 dark:hover:bg-ink-800"
              >
                <CheckBox on={on} />
                <Avatar name={group.members[id]?.name ?? '?'} color={group.members[id]?.color ?? '#999'} photoURL={group.members[id]?.photoURL} size={32} />
                <span className="min-w-0 flex-1 truncate font-medium">{label(id)}</span>
                {share(id)}
              </button>
            )
          })}
        </div>
      )
    }
    case 'exact':
      return (
        <div className="space-y-2">
          {shown.map((id) => (
            <MemberRow key={id} group={group} id={id} me={me}>
              <MoneyInput
                className="!w-28 !py-2"
                value={split.exact[id]}
                currency={cur}
                placeholder={zero}
                aria-label={`${label(id)} amount`}
                onChange={(v) => dispatch({ type: 'exact', id, amount: v })}
              />
            </MemberRow>
          ))}
        </div>
      )
    case 'percent':
      return (
        <div className="space-y-2">
          {shown.map((id) => (
            <MemberRow key={id} group={group} id={id} me={me}>
              <div className="relative w-24 shrink-0">
                <DecimalInput
                  className="!py-2 pr-7"
                  value={split.percent[id]}
                  placeholder="0"
                  aria-label={`${label(id)} percent`}
                  onChange={(v) => dispatch({ type: 'percent', id, value: v })}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden>
                  %
                </span>
              </div>
              {share(id)}
            </MemberRow>
          ))}
        </div>
      )
    case 'shares':
      return (
        <div className="space-y-2">
          {shown.map((id) => {
            const v = split.shares[id] ?? 0
            const set = (n: number) => dispatch({ type: 'shares', id, value: Math.max(0, Math.round(n * 100) / 100) })
            return (
              <MemberRow key={id} group={group} id={id} me={me}>
                <div className="flex shrink-0 items-center gap-0.5 rounded-2xl bg-slate-100 p-0.5 dark:bg-ink-800">
                  <button
                    type="button"
                    className="flex h-10 w-10 items-center justify-center rounded-xl"
                    onClick={() => set(v - 1)}
                    aria-label={`Fewer shares for ${label(id)}`}
                  >
                    <Minus size={16} />
                  </button>
                  <DecimalInput
                    className="!w-12 !bg-transparent !px-1 !py-1 !text-center font-bold"
                    value={split.shares[id]}
                    placeholder="0"
                    aria-label={`${label(id)} shares`}
                    onChange={(n) => dispatch({ type: 'shares', id, value: n })}
                  />
                  <button
                    type="button"
                    className="flex h-10 w-10 items-center justify-center rounded-xl"
                    onClick={() => set(v + 1)}
                    aria-label={`More shares for ${label(id)}`}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {share(id)}
              </MemberRow>
            )
          })}
          <p className="text-xs text-muted">Use ratios like 2:1:1, so a couple counts as 2 shares.</p>
        </div>
      )
    case 'adjust': {
      const sel = split.selected
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted">Split equally, then add or subtract an amount for anyone who had more or less.</p>
          {shown.map((id) => {
            const on = sel.includes(id)
            return (
              <div key={id} className="flex items-center gap-2">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={`${label(id)} included`}
                  onClick={() => dispatch({ type: 'toggleMember', id })}
                  className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center"
                >
                  <CheckBox on={on} />
                </button>
                <Avatar name={group.members[id]?.name ?? '?'} color={group.members[id]?.color ?? '#999'} photoURL={group.members[id]?.photoURL} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{label(id)}</span>
                <MoneyInput
                  className="!w-24 !py-2"
                  value={split.adjust[id]}
                  currency={cur}
                  allowNegative
                  placeholder={`+${zero}`}
                  disabled={!on}
                  aria-label={`${label(id)} adjustment`}
                  onChange={(v) => dispatch({ type: 'adjust', id, amount: v })}
                />
                {share(id)}
              </div>
            )
          })}
        </div>
      )
    }
    case 'itemized':
      return (
        <ItemsEditor
          items={split.items}
          onChange={(items) => dispatch({ type: 'items', items })}
          group={group}
          order={order}
          me={me}
          cur={cur}
          amount={amount}
          splits={splits}
        />
      )
  }
}
