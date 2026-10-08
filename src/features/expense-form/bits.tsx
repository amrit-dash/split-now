import type { ReactNode } from 'react'
import { AlertCircle, Check, CheckCircle2, History } from 'lucide-react'
import type { Group, MemberId, SplitType } from '@/types'
import { formatMoney } from '@/lib/money'
import { sumOf, type SplitDraft } from '@/lib/expense-draft'
import { Avatar } from '@/components/Avatar'

/** Members with you first, for lists people pick from (the split maths keeps the canonical order). */
export const youFirst = (order: MemberId[], me: MemberId) => [...order.filter((id) => id === me), ...order.filter((id) => id !== me)]

export const nameOf = (group: Pick<Group, 'members'>, me: MemberId, id: MemberId) => (id === me ? 'You' : group.members[id]?.name ?? 'Former member')

/** Avatar + name with a slot on the right (an amount, a field, a check). */
export function MemberRow({ group, id, me, size = 32, children, className = '' }: { group: Group; id: MemberId; me: MemberId; size?: number; children?: ReactNode; className?: string }) {
  const m = group.members[id]
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Avatar name={m?.name ?? '?'} color={m?.color ?? '#999'} size={size} />
      <span className="min-w-0 flex-1 truncate font-medium">{nameOf(group, me, id)}</span>
      {children}
    </div>
  )
}

/** The painted square check used in member lists; the owning button carries the role and state. */
export function CheckBox({ on, size = 'md' }: { on: boolean; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-5 w-5 rounded-md' : 'h-6 w-6 rounded-lg'
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center border-2 ${dim} ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-500 dark:border-slate-500'}`}>
      {on && <Check size={size === 'sm' ? 12 : 14} strokeWidth={3} />}
    </span>
  )
}

export function SameHint() {
  return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-slate-600 dark:bg-ink-800 dark:text-slate-400" data-testid="same-as-last"><History size={11} aria-hidden /> Same as last time</span>
}

/**
 * Status strip along a card's bottom edge (the card is p-4): green when it adds up, amber/rose
 * when not. `inline` renders it as a plain box for use inside a sheet.
 */
export function Footer({ tone, children, inline, testId = 'card-footer' }: { tone: 'ok' | 'warn' | 'err'; children: ReactNode; inline?: boolean; testId?: string }) {
  const Icon = tone === 'ok' ? CheckCircle2 : AlertCircle
  const color = tone === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-rose-700 dark:text-rose-400'
  const shape = inline ? 'mt-3 rounded-2xl' : '-mx-4 -mb-4 mt-4 rounded-b-3xl border-t border-slate-100 dark:border-white/5'
  return (
    <div className={`flex items-center gap-1.5 bg-slate-50/70 px-4 py-2.5 text-sm font-semibold dark:bg-white/[0.03] ${shape} ${color}`} data-testid={testId} role={tone === 'err' ? 'alert' : undefined}>
      <Icon size={16} className="shrink-0" aria-hidden /><span className="min-w-0">{children}</span>
    </div>
  )
}

/** Money still to assign: "All assigned", "₹120.00 left", "₹5.00 over". */
export function Left({ value, currency, inline }: { value: number; currency: string; inline?: boolean }) {
  if (value === 0) return <Footer tone="ok" inline={inline}>All assigned</Footer>
  return value > 0
    ? <Footer tone="warn" inline={inline}>{formatMoney(value, currency)} left to assign</Footer>
    : <Footer tone="err" inline={inline}>{formatMoney(-value, currency)} over the total</Footer>
}

/** The split's check under the editor: what's left for exact/percent, the totals for shares/adjust, else any error. */
export function SplitFooter({ type, split, order, amount, currency, error, inline }: {
  type: SplitType; split: SplitDraft; order: MemberId[]; amount: number; currency: string; error?: string; inline?: boolean
}) {
  if (type === 'exact') {
    if (!amount) return null
    return <Left value={amount - order.reduce((s, id) => s + (split.exact[id] ?? 0), 0)} currency={currency} inline={inline} />
  }
  if (type === 'percent') {
    const left = Math.round((100 - order.reduce((s, id) => s + (split.percent[id] ?? 0), 0)) * 100) / 100
    if (Math.abs(left) < 0.001) return <Footer tone="ok" inline={inline}>100% assigned</Footer>
    return left > 0 ? <Footer tone="warn" inline={inline}>{left}% left to assign</Footer> : <Footer tone="err" inline={inline}>{-left}% over 100%</Footer>
  }
  if (error) return <Footer tone="err" inline={inline}>{error}</Footer>
  if (type === 'shares') {
    const total = order.reduce((s, id) => s + (split.shares[id] ?? 0), 0)
    if (!total) return <Footer tone="warn" inline={inline}>Give at least one person a share</Footer>
    return <Footer tone="ok" inline={inline}>{Math.round(total * 100) / 100} {total === 1 ? 'share' : 'shares'}{amount ? ` · ${formatMoney(Math.round(amount / total), currency)} per share` : ''}</Footer>
  }
  if (type === 'adjust') {
    const adj = split.selected.reduce((s, id) => s + (split.adjust[id] ?? 0), 0)
    if (!adj) return null
    return <Footer tone="ok" inline={inline}>Adjustments {formatMoney(adj, currency, { sign: true })}, the rest split equally</Footer>
  }
  if (type === 'itemized' && amount) {
    const items = sumOf(Object.fromEntries(split.items.map((it, i) => [String(i), it.amount ?? 0])))
    const extra = amount - items
    if (extra === 0) return <Footer tone="ok" inline={inline}>Items add up to the total</Footer>
    return <Footer tone={extra > 0 ? 'ok' : 'warn'} inline={inline}>{formatMoney(Math.abs(extra), currency)} {extra > 0 ? 'tax, tip or fees shared in proportion' : 'discount shared in proportion'}</Footer>
  }
  return null
}
