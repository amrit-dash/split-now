import { useState } from 'react'
import { arcPath, donutSegments } from '@/lib/chartGeometry'

export interface DonutSlice { key: string; label: string; value: number; color: string }

/**
 * A ring chart. Tapping a slice shows its label and value in the middle (the whole is shown
 * otherwise). The picture is described in words for assistive tech; callers usually also
 * render a legend list next to it.
 */
export function Donut({ slices, size = 200, thickness = 0.34, format, label }: {
  slices: DonutSlice[]
  size?: number
  /** ring width as a fraction of the radius */
  thickness?: number
  format: (v: number) => string
  /** what the chart shows, e.g. "Spending by category" */
  label: string
}) {
  const [active, setActive] = useState<string | null>(null)
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0)
  const segs = donutSegments(slices.map((s) => s.value), 0.035)
  const c = size / 2, rOuter = size / 2, rInner = rOuter * (1 - thickness)
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0)
  const words = slices.map((s) => `${s.label} ${format(s.value)} (${pct(s.value)}%)`).join(', ')
  const current = slices.find((s) => s.key === active)
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${label}: ${words}`} className="shrink-0 select-none">
      {slices.map((s, i) => {
        const d = arcPath(c, c, rOuter, rInner, segs[i].start, segs[i].end)
        if (!d) return null
        const dim = active !== null && active !== s.key
        return (
          <path key={s.key} d={d} fill={s.color} opacity={dim ? 0.35 : 1} className="transition-opacity"
            onClick={() => setActive((a) => (a === s.key ? null : s.key))} />
        )
      })}
      <text x={c} y={c - 6} textAnchor="middle" className="fill-slate-500 text-xs font-medium dark:fill-slate-400">{current ? current.label : 'Total'}</text>
      <text x={c} y={c + 12} textAnchor="middle" className="fill-slate-900 text-[15px] font-bold dark:fill-white">{format(current ? current.value : total)}</text>
      {current && <text x={c} y={c + 28} textAnchor="middle" className="fill-slate-500 text-xs dark:fill-slate-400">{pct(current.value)}%</text>}
    </svg>
  )
}
