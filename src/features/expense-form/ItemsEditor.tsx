import { useState } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import type { Group, MemberId } from '@/types'
import { centsToInput, formatMoney } from '@/lib/money'
import { portion } from '@/lib/splits'
import { uid } from '@/lib/id'
import type { ItemDraft } from '@/lib/expense-draft'
import { Avatar } from '@/components/Avatar'
import { MemberChips } from '@/components/MemberChips'
import { MoneyInput } from '@/components/MoneyInput'
import { nameOf } from './bits'

/** Line items of a bill, each assigned to the people who had it (with portions when shared unevenly). */
export function ItemsEditor({
  items,
  onChange,
  group,
  order,
  me,
  cur,
  amount,
  splits,
}: {
  items: ItemDraft[]
  onChange: (items: ItemDraft[]) => void
  group: Group
  order: MemberId[]
  me: MemberId
  cur: string
  amount: number
  splits?: Record<MemberId, number>
}) {
  const itemsTotal = items.reduce((s, i) => s + (i.amount ?? 0), 0)
  const extra = amount - itemsTotal
  const update = (id: string, patch: Partial<ItemDraft>) => onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  return (
    <div className="space-y-3">
      {items.map((it, idx) => (
        <div key={it.id} className="rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
          <div className="flex gap-2">
            <input
              className="input !bg-white !py-2 dark:!bg-ink-900"
              placeholder="Item"
              aria-label={`Item ${idx + 1} name`}
              value={it.name}
              onChange={(e) => update(it.id, { name: e.target.value })}
            />
            <MoneyInput
              className="!w-24 shrink-0 !bg-white !py-2 dark:!bg-ink-900"
              value={it.amount}
              currency={cur}
              placeholder={centsToInput(0, cur)}
              aria-label={`Item ${idx + 1} amount`}
              onChange={(v) => update(it.id, { amount: v })}
            />
            <button
              type="button"
              className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:text-rose-600"
              onClick={() => onChange(items.filter((x) => x.id !== it.id))}
              aria-label={`Remove item ${idx + 1}`}
            >
              <Trash2 size={18} />
            </button>
          </div>
          <div className="mt-2">
            <MemberChips
              group={group}
              order={order}
              me={me}
              selected={it.members}
              onToggle={(id) => {
                const members = it.members.includes(id) ? it.members.filter((m) => m !== id) : [...it.members, id]
                const shares = it.shares && Object.fromEntries(Object.entries(it.shares).filter(([m]) => members.includes(m)))
                update(it.id, { members, shares: shares && Object.keys(shares).length ? shares : undefined })
              }}
            />
          </div>
          {it.members.length > 1 && <Portions it={it} order={order} group={group} me={me} onChange={(shares) => update(it.id, { shares })} />}
        </div>
      ))}
      <button type="button" className="btn-secondary btn-sm w-full" onClick={() => onChange([...items, { id: uid('it_'), name: '', members: [...order] }])}>
        <Plus size={16} aria-hidden /> Add item
      </button>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between text-muted">
          <span>Items</span>
          <span className="tabular-nums">{formatMoney(itemsTotal, cur)}</span>
        </div>
        <div className="flex justify-between text-muted">
          <span>Tax, tip or discount (shared in proportion)</span>
          <span className="tabular-nums">{formatMoney(extra, cur, { sign: true })}</span>
        </div>
      </div>
      {splits && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
          {order
            .filter((id) => splits[id])
            .map((id) => (
              <span key={id} className="chip !py-1 !pl-1">
                <Avatar name={group.members[id]?.name ?? '?'} color={group.members[id]?.color ?? '#999'} size={20} />
                {formatMoney(splits[id], cur)}
              </span>
            ))}
        </div>
      )}
    </div>
  )
}

/** Per-person portions of a shared item (e.g. 2 of 3 beers). Collapsed while everyone has one. */
function Portions({
  it,
  order,
  group,
  me,
  onChange,
}: {
  it: ItemDraft
  order: MemberId[]
  group: Group
  me: MemberId
  onChange: (s: Record<MemberId, number> | undefined) => void
}) {
  const [open, setOpen] = useState(!!it.shares)
  const members = order.filter((m) => it.members.includes(m))
  const set = (m: MemberId, n: number) => {
    const next = Object.fromEntries(members.map((x) => [x, x === m ? n : portion(it, x)]))
    onChange(Object.values(next).every((v) => v === 1) ? undefined : next)
  }
  if (!open)
    return (
      <button type="button" className="mt-2 min-h-9 text-xs font-semibold text-brand-600 dark:text-brand-300" onClick={() => setOpen(true)}>
        Shared unevenly? Set portions
      </button>
    )
  return (
    <div className="mt-2 space-y-1.5 rounded-xl bg-white p-2 dark:bg-ink-900" data-testid="portions">
      {members.map((m) => {
        const n = portion(it, m)
        const who = nameOf(group, me, m)
        return (
          <div key={m} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{who}</span>
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-0.5 dark:bg-ink-800">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-lg disabled:opacity-30"
                disabled={n <= 1}
                onClick={() => set(m, n - 1)}
                aria-label={`Fewer portions for ${who}`}
              >
                <Minus size={14} />
              </button>
              <span className="w-5 text-center font-bold tabular-nums" aria-live="polite">
                {n}
              </span>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-lg disabled:opacity-30"
                disabled={n >= 20}
                onClick={() => set(m, n + 1)}
                aria-label={`More portions for ${who}`}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        )
      })}
      {it.shares && (
        <button type="button" className="min-h-9 text-xs font-semibold text-muted" onClick={() => onChange(undefined)}>
          Reset to equal
        </button>
      )}
    </div>
  )
}
