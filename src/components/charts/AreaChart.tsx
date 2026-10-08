import { useId, useState, type PointerEvent } from 'react'
import { linearScale, monotonePath, nearestIndex, niceTicks } from '@/lib/chartGeometry'
import { useWidth } from './useWidth'

export interface AreaPoint {
  key: string
  label: string
  value: number
}

/**
 * A filled line over evenly spaced points (months, weeks, dates). Touch or hover reads a
 * point; a dashed reference line (a budget) is optional. The data is also rendered as a
 * visually hidden table so the chart is readable without the picture.
 */
export function AreaChart({
  points,
  height = 208,
  color,
  format,
  compact = format,
  label,
  reference,
}: {
  points: AreaPoint[]
  height?: number
  color: string
  /** full value, for the tooltip and the table */
  format: (v: number) => string
  /** short value, for the axis */
  compact?: (v: number) => string
  /** what the chart shows, e.g. "Spending per month" */
  label: string
  reference?: { value: number; label: string }
}) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const gradId = useId()
  const max = Math.max(0, ...points.map((p) => p.value), reference?.value ?? 0)
  const ticks = niceTicks(max, 3)
  const top = ticks[ticks.length - 1] || 1
  const m = { top: 10, right: 12, bottom: 22, left: 8 + Math.max(...ticks.map((t) => compact(t).length)) * 6.5 }
  const w = Math.max(120, width),
    h = height
  const x = linearScale([0, Math.max(1, points.length - 1)], [m.left, w - m.right])
  const y = linearScale([0, top], [h - m.bottom, m.top])
  const xs = points.map((_, i) => x(i))
  const pts = points.map((p, i) => ({ x: xs[i], y: y(p.value) }))
  const line = monotonePath(pts)
  const area = pts.length > 1 ? `${line} L${pts[pts.length - 1].x} ${h - m.bottom} L${pts[0].x} ${h - m.bottom} Z` : ''
  // Enough x labels to read, never overlapping: about one per 56px.
  const every = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor((w - m.left - m.right) / 56))))
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * w
    setHover(nearestIndex(xs, px))
  }
  const cur = hover !== null ? points[hover] : null
  return (
    <div ref={ref} className="relative w-full" role="figure" aria-label={label}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        aria-hidden
        className="block w-full select-none touch-pan-y"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={0.35} />
            <stop offset="1" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={w - m.right} y1={y(t)} y2={y(t)} className="stroke-slate-900/[0.06] dark:stroke-white/[0.08]" />
            <text x={m.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-slate-500 text-xs dark:fill-slate-400">
              {compact(t)}
            </text>
          </g>
        ))}
        {reference && reference.value > 0 && (
          <g>
            <line
              x1={m.left}
              x2={w - m.right}
              y1={y(reference.value)}
              y2={y(reference.value)}
              stroke="currentColor"
              strokeDasharray="4 4"
              className="text-rose-500"
            />
            <text x={w - m.right} y={y(reference.value) - 4} textAnchor="end" className="fill-rose-600 text-xs font-semibold dark:fill-rose-400">
              {reference.label}
            </text>
          </g>
        )}
        {area && <path d={area} fill={`url(#${gradId})`} />}
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map(
          (p, i) =>
            (i % every === 0 || i === points.length - 1) && (
              <text
                key={p.key}
                x={xs[i]}
                y={h - 6}
                textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
                className="fill-slate-500 text-xs dark:fill-slate-400"
              >
                {p.label}
              </text>
            ),
        )}
        {hover !== null && (
          <g>
            <line x1={xs[hover]} x2={xs[hover]} y1={m.top} y2={h - m.bottom} stroke="currentColor" strokeDasharray="3 3" className="text-slate-400" />
            <circle cx={pts[hover].x} cy={pts[hover].y} r={5} fill={color} className="stroke-white dark:stroke-ink-900" strokeWidth={2} />
          </g>
        )}
      </svg>
      {cur && (
        <div
          className="pointer-events-none absolute top-0 rounded-xl bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg dark:bg-white dark:text-slate-900"
          style={{ left: `${(xs[hover!] / w) * 100}%`, transform: `translateX(${hover === 0 ? '0' : hover === points.length - 1 ? '-100%' : '-50%'})` }}
        >
          <div className="font-semibold">{format(cur.value)}</div>
          <div className="opacity-75">{cur.label}</div>
        </div>
      )}
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}>
              <th scope="row">{p.label}</th>
              <td>{format(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
