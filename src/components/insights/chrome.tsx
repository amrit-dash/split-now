import type { ReactNode } from 'react'
import { useIsDark } from '@/lib/chartPalette'

/** Axis / grid / surface tokens for Recharts, which needs literal colours. */
export function useChartTheme() {
  const dark = useIsDark()
  return {
    dark,
    axis: dark ? '#a8a7a0' : '#6b6a64',
    grid: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)',
    surface: dark ? '#13111f' : '#ffffff',
    muted: dark ? '#4a4858' : '#d4d3cf',
  }
}

export function ChartCard({ title, subtitle, right, children }: { title: string; subtitle?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** Tooltip body: value first (strong), series label after, keyed by a short line of the series colour. */
export function TipBox({ title, rows }: { title: ReactNode; rows: Array<{ color?: string; label: string; value: ReactNode }> }) {
  return (
    <div className="min-w-32 rounded-2xl bg-white px-3 py-2 text-xs shadow-xl ring-1 ring-slate-900/5 dark:bg-ink-800 dark:ring-white/10">
      <div className="mb-1 font-medium text-slate-500 dark:text-slate-400">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 whitespace-nowrap">
          {r.color && <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: r.color }} />}
          <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{r.value}</span>
          <span className="text-slate-500 dark:text-slate-400">{r.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Stat tile: label, value (proportional figures), optional delta line. */
export function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card min-w-0 p-4">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 truncate text-xl font-extrabold">{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  )
}

/**
 * Horizontal bar with a 4px rounded end; length is a fraction of the row. The bar is always full
 * width and slides in from the left (translateX inside a clipping track), so growing and resizing
 * are pure transforms and the rounded end never distorts. `frac` 0 → hidden; tweens on change.
 */
export function HBar({ frac, color, thin = false, delay = 0 }: { frac: number; color: string; thin?: boolean; delay?: number }) {
  const f = frac > 0 ? Math.max(0.015, Math.min(1, frac)) : 0
  return (
    <div className={`${thin ? 'h-1.5' : 'h-2'} ins-anim w-full overflow-hidden`}>
      <div
        className="h-full w-full rounded-r-[4px] will-change-transform"
        style={{
          background: color,
          transform: `translateX(${(f - 1) * 100}%)`,
          transition: `transform 750ms cubic-bezier(0.22, 0.8, 0.3, 1) ${delay}ms, background-color 300ms`,
        }}
      />
    </div>
  )
}
