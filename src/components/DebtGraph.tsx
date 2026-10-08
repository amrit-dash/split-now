import type { Debt, Group } from '@/types'
import { formatMoney } from '@/lib/money'
import { initials } from '@/lib/colors'

/**
 * Circular node-link diagram of who owes whom. Arrow points from debtor to creditor. The same
 * list is given in words (aria-label), so the picture is never the only way to read it.
 */
export function DebtGraph({ group, debts, size = 300 }: { group: Group; debts: Debt[]; size?: number }) {
  const ids = [...new Set(debts.flatMap((d) => [d.from, d.to]))]
  if (ids.length === 0) {
    return <div className="text-muted flex h-40 items-center justify-center text-sm">All settled, nothing to draw</div>
  }
  const c = size / 2
  const r = size / 2 - 34
  const pos = Object.fromEntries(
    ids.map((id, i) => {
      const a = (i / ids.length) * Math.PI * 2 - Math.PI / 2
      return [id, { x: c + r * Math.cos(a), y: c + r * Math.sin(a) }]
    }),
  )
  const max = Math.max(...debts.map((d) => d.amount))
  const nodeR = 20
  const name = (id: string) => group.members[id]?.name ?? 'Former member'
  const words = debts.map((d) => `${name(d.from)} owes ${name(d.to)} ${formatMoney(d.amount, group.currency)}`).join('; ')

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-xs" role="img" aria-label={`Who owes whom: ${words}`}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="fill-rose-500" />
        </marker>
      </defs>
      {debts.map((d, i) => {
        const a = pos[d.from], b = pos[d.to]
        const dx = b.x - a.x, dy = b.y - a.y
        const len = Math.hypot(dx, dy) || 1
        const ux = dx / len, uy = dy / len
        // Slight curve so opposite edges don't overlap.
        const mx = (a.x + b.x) / 2 - uy * 18, my = (a.y + b.y) / 2 + ux * 18
        const sx = a.x + ux * nodeR, sy = a.y + uy * nodeR
        const ex = b.x - ux * (nodeR + 4), ey = b.y - uy * (nodeR + 4)
        const w = 1.5 + (d.amount / max) * 3.5
        return (
          <g key={i}>
            <path d={`M${sx},${sy} Q${mx},${my} ${ex},${ey}`} fill="none" className="stroke-rose-400/80" strokeWidth={w} markerEnd="url(#arrow)" />
            <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle" className="fill-slate-700 text-xs font-semibold dark:fill-slate-200" paintOrder="stroke" stroke="var(--graph-bg, white)" strokeWidth={4}>
              {formatMoney(d.amount, group.currency)}
            </text>
          </g>
        )
      })}
      {ids.map((id) => {
        const m = group.members[id]
        const p = pos[id]
        return (
          <g key={id}>
            <circle cx={p.x} cy={p.y} r={nodeR} fill={m?.color ?? '#64748b'} />
            <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" className="fill-white text-[12px] font-bold">{initials(m?.name ?? '?')}</text>
          </g>
        )
      })}
    </svg>
  )
}
