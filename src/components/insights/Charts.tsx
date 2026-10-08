import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Category } from '@/types'
import { CATEGORIES } from '@/lib/categories'
import { categoryChartColor, OTHER, seriesColor } from '@/lib/chartPalette'
import { currencySymbol, formatMoney } from '@/lib/money'
import { formatDate } from '@/lib/locale'
import { compactMoney, formatChange, type Bucket, type GroupTotal, type PacePoint, type Slice, type TimePoint } from '@/lib/insights'
import { GroupIcon } from '@/components/GroupIcon'
import { ChartCard, HBar, TipBox, useChartTheme } from './chrome'

const tick = (fill: string) => ({ fill, fontSize: 11 })

function bucketLabel(p: TimePoint, bucket: Bucket, long = false) {
  if (bucket === 'month') return formatDate(p.start, long ? { month: 'long', year: 'numeric' } : { month: 'short' })
  if (bucket === 'week') return long ? `${formatDate(p.start)} – ${formatDate(p.end)}` : formatDate(p.start)
  return long ? formatDate(p.start, { weekday: 'short', day: 'numeric', month: 'short' }) : String(Number(p.start.slice(8)))
}

/**
 * Spend per day / week / month. Columns, one series: the bucket containing today is the accent
 * (emphasis), past buckets are muted so "this month so far" reads against history. A hairline marks
 * the average. Daily columns are all accent (no single one is the story).
 */
export function TimeChart({ points, bucket, currency, approx }: { points: TimePoint[]; bucket: Bucket; currency: string; approx: string }) {
  const t = useChartTheme()
  const sym = currencySymbol(currency)
  const avg = points.length ? points.reduce((s, p) => s + p.value, 0) / points.length : 0
  const emphasise = bucket !== 'day' && points.some((p) => p.current)
  const accent = seriesColor(0, t.dark)
  const data = points.map((p) => ({ ...p, label: bucketLabel(p, bucket) }))
  const per = bucket === 'month' ? 'month' : bucket === 'week' ? 'week' : 'day'
  const peak = points.reduce((m, p) => (p.value > m.value ? p : m), points[0])
  return (
    <ChartCard
      title="Spending over time"
      subtitle={<>Per {per} · average {approx}{formatMoney(Math.round(avg), currency)}{peak?.value ? <> · peak {bucketLabel(peak, bucket, true)}</> : null}</>}
    >
      <div className="h-52">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 4, left: -4, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke={t.grid} />
            <XAxis dataKey="label" tick={tick(t.axis)} axisLine={{ stroke: t.grid }} tickLine={false} interval="preserveStartEnd" minTickGap={10} />
            <YAxis tick={tick(t.axis)} axisLine={false} tickLine={false} tickFormatter={(v) => compactMoney(v, currency, sym)} width={48} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: t.grid }}
              content={({ active, payload }) => {
                const p = active && payload?.[0]?.payload as (TimePoint | undefined)
                return p ? <TipBox title={<>{bucketLabel(p, bucket, true)}{p.current ? ' (so far)' : ''}</>} rows={[{ color: p.current || !emphasise ? accent : t.muted, label: 'spent', value: approx + formatMoney(p.value, currency) }]} /> : null
              }}
            />
            {avg > 0 && <ReferenceLine y={avg} stroke={t.axis} strokeOpacity={0.6} label={{ value: 'avg', position: 'insideTopRight', fill: t.axis, fontSize: 10 }} />}
            <Bar dataKey="value" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((p) => <Cell key={p.key} fill={!emphasise || p.current ? accent : t.muted} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {emphasise && (
        <div className="mt-2 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: accent }} /> This {per} so far</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: t.muted }} /> Earlier</span>
        </div>
      )}
    </ChartCard>
  )
}

/** Cumulative spend by day of month, this month vs last: "am I spending faster than last month?" */
export function PaceChart({ points, thisTotal, lastToDate, lastTotal, currency, approx }: { points: PacePoint[]; thisTotal: number; lastToDate: number; lastTotal: number; currency: string; approx: string }) {
  const t = useChartTheme()
  const sym = currencySymbol(currency)
  const a = seriesColor(0, t.dark), b = t.dark ? OTHER.dark : OTHER.light
  const change = lastToDate ? (thisTotal - lastToDate) / lastToDate : null
  const ring = { r: 4, strokeWidth: 2, stroke: t.surface }
  return (
    <ChartCard
      title="This month vs last"
      subtitle={<>
        {approx}{formatMoney(thisTotal, currency)} so far
        {lastToDate > 0 && <> vs {approx}{formatMoney(lastToDate, currency)} by this day last month{change !== null && <> (<span className={change > 0.05 ? 'neg' : change < -0.05 ? 'pos' : ''}>{formatChange(change)}</span>)</>}</>}
      </>}
    >
      <div className="mb-2 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: a }} /> This month</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: b }} /> Last month ({approx}{formatMoney(lastTotal, currency)})</span>
      </div>
      <div className="h-48">
        <ResponsiveContainer>
          <LineChart data={points} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={t.grid} />
            <XAxis dataKey="day" type="number" domain={[1, points.length]} ticks={[1, 8, 15, 22, 29].filter((d) => d <= points.length)} tick={tick(t.axis)} axisLine={{ stroke: t.grid }} tickLine={false} />
            <YAxis tick={tick(t.axis)} axisLine={false} tickLine={false} tickFormatter={(v) => compactMoney(v, currency, sym)} width={48} allowDecimals={false} />
            <Tooltip
              cursor={{ stroke: t.axis, strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as PacePoint
                return <TipBox title={`Day ${label}`} rows={[
                  ...(p.thisMonth !== undefined ? [{ color: a, label: 'this month', value: approx + formatMoney(p.thisMonth, currency) }] : []),
                  ...(p.lastMonth !== undefined ? [{ color: b, label: 'last month', value: approx + formatMoney(p.lastMonth, currency) }] : []),
                ]} />
              }}
            />
            <Line dataKey="lastMonth" type="monotone" stroke={b} strokeWidth={2} dot={false} activeDot={{ ...ring, fill: b }} isAnimationActive={false} connectNulls={false} />
            <Line dataKey="thisMonth" type="monotone" stroke={a} strokeWidth={2} dot={false} activeDot={{ ...ring, fill: a }} isAnimationActive={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}

/**
 * Category split: a donut of the top slices (≤ 6, so it reads at a glance) with the total in the
 * hole, and the full sorted list underneath as the legend + exact values. Tapping a row filters by it.
 */
export function CategoryBreakdown({ donut, all, total, currency, approx, selected, onPick }: {
  donut: Array<Slice<Category | 'other-fold'>>
  all: Slice<Category>[]
  total: number
  currency: string
  approx: string
  selected: Category[]
  onPick: (c: Category) => void
}) {
  const t = useChartTheme()
  const inDonut = new Set(donut.map((s) => s.key))
  const colorOf = (c: Category) => (inDonut.has(c) ? categoryChartColor(c, t.dark) : t.dark ? OTHER.dark : OTHER.light)
  const max = all[0]?.value || 1
  const label = (k: Category | 'other-fold') => (k === 'other-fold' ? 'Everything else' : CATEGORIES[k].label)
  return (
    <ChartCard title="Where it goes" subtitle="By category · tap one to filter">
      {all.length > 1 && (
        <div className="relative mx-auto mb-3 h-44 w-44">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={donut} dataKey="value" nameKey="key" innerRadius="68%" outerRadius="100%" paddingAngle={donut.length > 1 ? 2 : 0} stroke={t.surface} strokeWidth={2} cornerRadius={4} startAngle={90} endAngle={-270} isAnimationActive={false}>
                {donut.map((s) => <Cell key={s.key} fill={categoryChartColor(s.key, t.dark)} />)}
              </Pie>
              <Tooltip content={({ active, payload }) => {
                const s = active && payload?.[0]?.payload as (Slice<Category | 'other-fold'> | undefined)
                return s ? <TipBox title={label(s.key)} rows={[{ color: categoryChartColor(s.key, t.dark), label: `${Math.round(s.share * 100)}%`, value: approx + formatMoney(s.value, currency) }]} /> : null
              }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Total</span>
            <span className="max-w-28 truncate text-base font-extrabold">{approx}{formatMoney(total, currency)}</span>
          </div>
        </div>
      )}
      <ul className="space-y-0.5">
        {all.map((s) => {
          const on = selected.includes(s.key)
          return (
            <li key={s.key}>
              <button type="button" onClick={() => onPick(s.key)} aria-pressed={on}
                className={`-mx-2 block w-[calc(100%+1rem)] rounded-xl px-2 py-1.5 text-left transition hover:bg-slate-50 dark:hover:bg-ink-800 ${on ? 'bg-brand-50 dark:bg-brand-900/30' : ''}`}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorOf(s.key) }} />
                  <span className="min-w-0 flex-1 truncate">{CATEGORIES[s.key].emoji} {CATEGORIES[s.key].label}</span>
                  <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">{Math.round(s.share * 100)}%</span>
                  <span className="w-24 text-right font-semibold tabular-nums">{approx}{formatMoney(s.value, currency)}</span>
                </div>
                <div className="mt-1 pl-[18px]"><HBar frac={s.value / max} color={colorOf(s.key)} thin /></div>
              </button>
            </li>
          )
        })}
      </ul>
    </ChartCard>
  )
}

/** One series of horizontal bars by group, sorted, value at the end. */
export function GroupBars({ groups, currency, approx, title, subtitle }: { groups: GroupTotal[]; currency: string; approx: string; title: string; subtitle: string }) {
  const t = useChartTheme()
  const max = groups[0]?.value || 1
  const total = groups.reduce((s, g) => s + g.value, 0) || 1
  return (
    <ChartCard title={title} subtitle={subtitle}>
      <ul className="space-y-3">
        {groups.map((g) => (
          <li key={g.id}>
            <div className="flex items-center gap-2 text-sm">
              <GroupIcon emoji={g.emoji} size={24} />
              <span className="min-w-0 flex-1 truncate font-medium">{g.name}</span>
              <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">{Math.round((g.value / total) * 100)}%</span>
              <span className="w-24 text-right font-semibold tabular-nums">{approx}{formatMoney(g.value, currency)}</span>
            </div>
            <div className="mt-1.5 pl-8"><HBar frac={g.value / max} color={seriesColor(0, t.dark)} /></div>
          </li>
        ))}
      </ul>
    </ChartCard>
  )
}

/**
 * Paid vs share: per member of one group, or per group for me. Two thin bars (fronted, consumed) on one
 * scale, with the difference in words: who is carrying the group.
 */
export function PaidShare({ rows, currency, approx, title, subtitle }: {
  rows: Array<{ key: string; name: string; icon: React.ReactNode; paid: number; share: number }>
  currency: string
  approx: string
  title: string
  subtitle: string
}) {
  const t = useChartTheme()
  const max = Math.max(1, ...rows.flatMap((r) => [r.paid, r.share]))
  const cp = seriesColor(0, t.dark), cs = seriesColor(1, t.dark)
  return (
    <ChartCard title={title} subtitle={subtitle}>
      <div className="mb-3 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: cp }} /> Paid</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: cs }} /> Share</span>
      </div>
      <ul className="space-y-3.5">
        {rows.map((r) => {
          const diff = r.paid - r.share
          return (
            <li key={r.key}>
              <div className="flex items-center gap-2 text-sm">
                {r.icon}
                <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                <span className={`shrink-0 text-xs font-semibold tabular-nums ${diff > 0 ? 'pos' : diff < 0 ? 'neg' : 'text-slate-500'}`}>
                  {diff === 0 ? 'even' : `${diff > 0 ? 'fronted' : 'used'} ${approx}${formatMoney(Math.abs(diff), currency)} ${diff > 0 ? 'extra' : 'more'}`}
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 pl-8 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                <HBar frac={r.paid / max} color={cp} thin /><span className="w-20 text-right">{approx}{formatMoney(r.paid, currency)}</span>
                <HBar frac={r.share / max} color={cs} thin /><span className="w-20 text-right">{approx}{formatMoney(r.share, currency)}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </ChartCard>
  )
}

