export interface BarSeries { key: string; label: string; color: string }
export interface BarRow { key: string; label: string; values: number[] }

/**
 * Horizontal bars, one row per item and one bar per series, with the value printed at the end
 * of every bar so colour is never the only way to tell them apart. Plain HTML, so the labels
 * are real text and the layout follows the font size.
 */
export function Bars({ rows, series, format, label }: {
  rows: BarRow[]
  series: BarSeries[]
  format: (v: number) => string
  /** what the chart shows, e.g. "Paid vs share" */
  label: string
}) {
  const max = Math.max(1, ...rows.flatMap((r) => r.values))
  return (
    <div role="figure" aria-label={label}>
      {series.length > 1 && (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: s.color }} aria-hidden />{s.label}</li>
          ))}
        </ul>
      )}
      <dl className="space-y-3">
        {rows.map((r) => (
          <div key={r.key} className="grid grid-cols-[4.5rem_1fr] items-center gap-3">
            <dt className="truncate text-sm font-medium">{r.label}</dt>
            <dd className="space-y-1">
              {series.map((s, i) => {
                const v = r.values[i] ?? 0
                return (
                  <div key={s.key} className="flex items-center gap-2">
                    <div className="h-3.5 rounded-sm transition-[width]" style={{ width: `${Math.max(v > 0 ? 1 : 0, (v / max) * 100)}%`, background: s.color }} aria-hidden />
                    <span className="text-muted shrink-0 text-xs"><span className="sr-only">{s.label}: </span>{format(v)}</span>
                  </div>
                )
              })}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
