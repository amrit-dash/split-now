import { useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { Debt, Group, MemberId } from '@/types'
import { formatMoney } from '@/lib/money'
import { layoutFlow, ribbonPath } from '@/lib/insightsFlow'
import { useMe } from '@/hooks/auth'
import { myMemberId } from '@/hooks/data'
import { Avatar } from '@/components/Avatar'

type Focus = { link: number } | { person: MemberId } | null

const W = 326
const LABEL = 98
const BAR = 8
const X_PAY = LABEL
const X_GET = W - LABEL - BAR

/**
 * Settle-up flow: who pays (left) whom (right), one ribbon per payment, thickness ∝ amount,
 * with the same payments listed underneath (the readable, tappable table view).
 * Tapping a ribbon, a person or a row highlights it.
 */
export function DebtGraph({ group, debts }: { group: Group; debts: Debt[]; size?: number }) {
  const { user } = useMe()
  const me = myMemberId(group, user.uid)
  const [focus, setFocus] = useState<Focus>(null)
  const layout = useMemo(() => layoutFlow(debts), [debts])

  if (layout.links.length === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-slate-400">All settled — nothing to draw 🎉</div>
  }

  const name = (id: MemberId) => (id === me ? 'You' : group.members[id]?.name ?? 'Someone')
  const color = (id: MemberId) => group.members[id]?.color ?? '#64748b'
  const short = (s: string) => (s.length > 11 ? s.slice(0, 10) + '…' : s)
  const money = (v: number) => formatMoney(v, group.currency)
  const on = (d: Debt, i: number) =>
    !focus || ('link' in focus ? focus.link === i : d.from === focus.person || d.to === focus.person)
  const personOn = (id: MemberId) =>
    !focus || ('person' in focus ? focus.person === id : debts[focus.link]?.from === id || debts[focus.link]?.to === id)
  const toggle = (f: NonNullable<Focus>) =>
    setFocus((cur) => (cur && JSON.stringify(cur) === JSON.stringify(f) ? null : f))
  const total = layout.links.reduce((s, l) => s + l.debt.amount, 0)
  const summary = layout.links.map((l) => `${name(l.debt.from)} pays ${name(l.debt.to)} ${money(l.debt.amount)}`).join('; ')

  return (
    <div>
      <div className="mb-1 flex justify-between px-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <span>Pays</span>
        <span>{layout.links.length} payment{layout.links.length > 1 ? 's' : ''} · {money(total)}</span>
        <span>Gets</span>
      </div>
      <svg viewBox={`0 0 ${W} ${layout.height}`} className="block w-full select-none" role="img" aria-label={`Who pays whom: ${summary}`} onClick={(e) => { if (e.target === e.currentTarget) setFocus(null) }}>
        {layout.links.map((l) => {
          const active = on(l.debt, l.index)
          return (
            <path
              key={l.index}
              d={ribbonPath(l, X_PAY + BAR, X_GET)}
              fill={color(l.debt.from)}
              fillOpacity={active ? (focus ? 0.6 : 0.38) : 0.08}
              className="cursor-pointer transition-[fill-opacity] duration-200"
              onClick={() => toggle({ link: l.index })}
            >
              <title>{`${name(l.debt.from)} → ${name(l.debt.to)}: ${money(l.debt.amount)}`}</title>
            </path>
          )
        })}
        {[...layout.pay, ...layout.get].map((n) => {
          const left = n.side === 'pay'
          const x = left ? X_PAY : X_GET
          const tx = left ? x - 8 : x + BAR + 8
          const dim = !personOn(n.id)
          return (
            <g key={n.side + n.id} className="cursor-pointer transition-opacity duration-200" opacity={dim ? 0.35 : 1} onClick={() => toggle({ person: n.id })}>
              {/* Generous transparent hit area over the label and bar. */}
              <rect x={left ? 0 : x} y={n.cy - 20} width={LABEL + BAR} height={40} fill="transparent" />
              <rect x={x} y={n.y} width={BAR} height={n.h} rx={Math.min(3, n.h / 2)} fill={color(n.id)} />
              <text x={tx} y={n.cy - 3} textAnchor={left ? 'end' : 'start'} className="fill-slate-900 text-[13px] font-bold dark:fill-slate-100">{short(name(n.id))}</text>
              <text x={tx} y={n.cy + 12} textAnchor={left ? 'end' : 'start'} className="fill-slate-500 text-[11px] font-medium tabular-nums dark:fill-slate-400">{money(n.total)}</text>
            </g>
          )
        })}
      </svg>

      <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/5" aria-label="Payments">
        {layout.links.map((l) => {
          const d = l.debt
          const active = on(d, l.index)
          return (
            <li key={l.index}>
              <button
                type="button"
                onClick={() => toggle({ link: l.index })}
                aria-pressed={!!focus && 'link' in focus && focus.link === l.index}
                className={`-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition-opacity ${active ? '' : 'opacity-40'}`}
              >
                <Avatar name={group.members[d.from]?.name ?? '?'} color={color(d.from)} size={26} />
                <span className={`min-w-0 truncate font-semibold ${d.from === me ? 'neg' : ''}`}>{name(d.from)}</span>
                <ArrowRight size={14} className="shrink-0 text-slate-400" aria-label="pays" />
                <Avatar name={group.members[d.to]?.name ?? '?'} color={color(d.to)} size={26} />
                <span className={`min-w-0 flex-1 truncate font-semibold ${d.to === me ? 'pos' : ''}`}>{name(d.to)}</span>
                <span className="shrink-0 font-bold tabular-nums">{money(d.amount)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
