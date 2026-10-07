import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useMe } from '@/hooks/auth'
import { useAllGroupData, type GroupData } from '@/hooks/data'
import type { Category, Expense } from '@/types'
import { CATEGORIES } from '@/lib/categories'
import { formatMoney, minorDigits } from '@/lib/money'
import { convertMinor } from '@/lib/fx'
import { useTodayRates } from '@/hooks/useFx'
import { categoryChartColor, chartFolds, seriesColor, useIsDark } from '@/lib/chartPalette'
import { Empty, Loading, PageHeader, Segmented } from '@/components/Misc'

type Period = '1m' | '3m' | '12m' | 'all'
type Basis = 'mine' | 'total'

export default function Insights() {
  const data = useAllGroupData()
  const { profile } = useMe()
  const [params, setParams] = useSearchParams()
  const groupId = params.get('group') ?? 'all'
  const [period, setPeriod] = useState<Period>('3m')
  const [basis, setBasis] = useState<Basis>('mine')
  const dark = useIsDark()
  const home = profile.currency
  const rates = useTodayRates(home, data ? data.map((d) => d.group.currency) : [])

  const scope = useMemo(() => {
    if (!data) return null
    if (groupId !== 'all') return data.filter((d) => d.group.id === groupId)
    // All groups: home-currency groups, plus others converted at today's ECB rate (approximate).
    return data.filter((d) => d.group.currency === home || rates?.[d.group.currency])
  }, [data, groupId, home, rates])

  // Minor units of a group's currency → minor units of the home currency.
  const toHome = useMemo(() => {
    if (groupId !== 'all') return undefined
    return (v: number, d: GroupData) => (d.group.currency === home ? v : convertMinor(v, d.group.currency, home, rates?.[d.group.currency]?.rate ?? 0))
  }, [groupId, home, rates])

  const stats = useMemo(() => (scope ? compute(scope, period, basis, toHome) : null), [scope, period, basis, toHome])

  if (!data || !scope || !stats) return <Loading />
  const cur = groupId === 'all' ? home : scope[0]?.group.currency ?? home
  const converted = groupId === 'all' ? [...new Set(scope.filter((d) => d.group.currency !== home).map((d) => d.group.currency))] : []
  const skipped = groupId === 'all' ? [...new Set(data.filter((d) => !scope.includes(d)).map((d) => d.group.currency))] : []
  const ax = converted.length ? '≈ ' : ''
  const single = groupId !== 'all' ? scope[0] : undefined
  const axis = dark ? '#a8a7a0' : '#6b6a64'
  const grid = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
  const tooltipStyle = { borderRadius: 16, border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,.15)', background: dark ? '#1c1a2b' : '#fff', color: dark ? '#fff' : '#0b0b0b' }

  return (
    <div>
      <PageHeader title="Insights" />
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        <button className={`chip shrink-0 ${groupId === 'all' ? 'chip-on' : ''}`} onClick={() => setParams({})}>All groups</button>
        {data.map((d) => (
          <button key={d.group.id} className={`chip shrink-0 ${groupId === d.group.id ? 'chip-on' : ''}`} onClick={() => setParams({ group: d.group.id })}>{d.group.emoji} {d.group.name}</button>
        ))}
      </div>
      <div className="mb-4 space-y-2">
        <Segmented<Period> value={period} onChange={setPeriod} options={[{ value: '1m', label: '30 days' }, { value: '3m', label: '3 months' }, { value: '12m', label: '12 months' }, { value: 'all', label: 'All time' }]} />
        <Segmented<Basis> value={basis} onChange={setBasis} options={[{ value: 'mine', label: 'My share' }, { value: 'total', label: 'Group total' }]} />
      </div>

      {stats.count === 0 ? (
        <Empty emoji="📊" title="Nothing to chart yet">Add a few expenses in this period to see your insights.</Empty>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Kpi label={basis === 'mine' ? 'Your spending' : 'Group spending'} value={ax + formatMoney(stats.total, cur)} />
            <Kpi label="Expenses" value={String(stats.count)} />
            <Kpi label="Avg / expense" value={ax + formatMoney(Math.round(stats.total / Math.max(1, stats.count)), cur)} />
            <Kpi label="Top category" value={stats.cats[0] ? `${CATEGORIES[stats.cats[0].cat as Category]?.emoji ?? '🧾'} ${stats.cats[0].label}` : '—'} />
          </div>

          <ChartCard title="By category" subtitle={basis === 'mine' ? 'Your share of each expense' : 'Full expense amounts'}>
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="h-52 w-52 shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={stats.cats} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke={dark ? '#13111f' : '#fff'} strokeWidth={2} cornerRadius={4}>
                      {stats.cats.map((c) => <Cell key={c.cat} fill={categoryChartColor(c.cat, dark)} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatMoney(Number(v), cur)} contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full space-y-1.5">
                {stats.cats.map((c) => (
                  <li key={c.cat} className="flex items-center gap-2 text-sm">
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: categoryChartColor(c.cat, dark) }} />
                    <span className="flex-1 truncate">{c.label}</span>
                    <span className="text-slate-500 tabular-nums">{Math.round((c.value / stats.total) * 100)}%</span>
                    <span className="w-24 text-right font-semibold tabular-nums">{formatMoney(c.value, cur)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </ChartCard>

          <ChartCard title="Spending over time" subtitle={stats.bucket === 'week' ? 'Per week' : 'Per month'}>
            <div className="h-56">
              <ResponsiveContainer>
                <AreaChart data={stats.series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor={seriesColor(0, dark)} stopOpacity={0.35} />
                      <stop offset="1" stopColor={seriesColor(0, dark)} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={grid} />
                  <XAxis dataKey="label" tick={{ fill: axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => compact(v, cur)} width={52} />
                  <Tooltip formatter={(v) => [formatMoney(Number(v), cur), 'Spent']} contentStyle={tooltipStyle} cursor={{ stroke: axis, strokeDasharray: '3 3' }} />
                  <Area type="monotone" dataKey="value" stroke={seriesColor(0, dark)} strokeWidth={2} fill="url(#area)" activeDot={{ r: 5, strokeWidth: 2, stroke: dark ? '#13111f' : '#fff' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {single && single.group.type !== 'personal' && (
            <ChartCard title="Paid vs. share" subtitle="Who fronted the money vs. what they consumed">
              <div style={{ height: Math.max(160, stats.members.length * 44 + 40) }}>
                <ResponsiveContainer>
                  <BarChart data={stats.members} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
                    <CartesianGrid horizontal={false} stroke={grid} />
                    <XAxis type="number" tick={{ fill: axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => compact(v, cur)} />
                    <YAxis type="category" dataKey="name" tick={{ fill: axis, fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
                    <Tooltip formatter={(v, n) => [formatMoney(Number(v), cur), n]} contentStyle={tooltipStyle} cursor={{ fill: grid }} />
                    <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="paid" name="Paid" fill={seriesColor(0, dark)} radius={[0, 4, 4, 0]} />
                    <Bar dataKey="share" name="Share" fill={seriesColor(1, dark)} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          )}

          <ChartCard title="Biggest expenses">
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {stats.top.map(({ e, d, v }) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <span className="text-xl">{CATEGORIES[e.category].emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{e.description}</div>
                    <div className="truncate text-xs text-slate-500">{d.group.name} · {e.date}</div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatMoney(v, cur)}</span>
                </li>
              ))}
            </ul>
          </ChartCard>
          {converted.length > 0 && (
            <p className="px-1 text-center text-xs text-slate-400">≈ {converted.join(', ')} groups converted to {home} at today’s ECB rate. Pick a group above for exact amounts in its own currency.</p>
          )}
          {skipped.length > 0 && (
            <p className="px-1 text-center text-xs text-slate-400">{skipped.join(', ')} groups aren’t included (no exchange rate available). Pick a group above to see them.</p>
          )}
        </div>
      )}
    </div>
  )
}

function compute(scope: GroupData[], period: Period, basis: Basis, toHome?: (v: number, d: GroupData) => number) {
  const now = new Date()
  const days = period === '1m' ? 30 : period === '3m' ? 91 : period === '12m' ? 365 : Infinity
  const cutoff = days === Infinity ? '' : new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10)
  const rows: Array<{ e: Expense; d: GroupData; v: number }> = []
  for (const d of scope) {
    for (const e of d.expenses) {
      if (e.date < cutoff) continue
      const raw = basis === 'total' || d.group.type === 'personal' ? e.amount : d.me ? e.splits[d.me] ?? 0 : 0
      const v = toHome ? toHome(raw, d) : raw
      if (v > 0) rows.push({ e, d, v })
    }
  }
  const total = rows.reduce((s, r) => s + r.v, 0)

  // Categories (non-palette ones fold into "Other").
  const byCat = new Map<Category | 'other-fold', number>()
  for (const r of rows) {
    const k = chartFolds(r.e.category) ? 'other-fold' : r.e.category
    byCat.set(k, (byCat.get(k) ?? 0) + r.v)
  }
  const cats = [...byCat].map(([cat, value]) => ({ cat, value, label: cat === 'other-fold' ? 'Other' : CATEGORIES[cat].label }))
    .sort((a, b) => (a.cat === 'other-fold' ? 1 : b.cat === 'other-fold' ? -1 : b.value - a.value))

  // Time series: weekly for 30 days, else monthly.
  const bucket: 'week' | 'month' = period === '1m' ? 'week' : 'month'
  const series = new Map<string, { label: string; value: number }>()
  const first = rows.reduce((m, r) => (r.e.date < m ? r.e.date : m), now.toISOString().slice(0, 10))
  if (bucket === 'month') {
    const start = new Date(first.slice(0, 7) + '-01T00:00')
    for (let d = new Date(start); d <= now; d.setMonth(d.getMonth() + 1)) {
      const k = d.toISOString().slice(0, 7)
      series.set(k, { label: d.toLocaleDateString(undefined, { month: 'short' }), value: 0 })
    }
    for (const r of rows) { const s = series.get(r.e.date.slice(0, 7)); if (s) s.value += r.v }
  } else {
    for (let i = 4; i >= 0; i--) {
      const end = new Date(now.getTime() - i * 7 * 86400000)
      series.set(String(i), { label: end.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), value: 0 })
    }
    for (const r of rows) {
      const age = Math.floor((now.getTime() - new Date(r.e.date + 'T12:00').getTime()) / (7 * 86400000))
      const s = series.get(String(Math.min(4, Math.max(0, age)))); if (s) s.value += r.v
    }
  }

  const members: Array<{ name: string; paid: number; share: number }> = []
  if (scope.length === 1) {
    const d = scope[0]
    for (const [id, m] of Object.entries(d.group.members)) {
      let paid = 0, share = 0
      for (const r of rows) { paid += r.e.paidBy[id] ?? 0; share += r.e.splits[id] ?? 0 }
      members.push({ name: id === d.me ? 'You' : m.name.split(' ')[0], paid, share })
    }
  }

  return {
    total, count: rows.length, cats, bucket,
    series: [...series.values()],
    members,
    top: [...rows].sort((a, b) => b.v - a.v).slice(0, 5),
  }
}

function compact(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(cents / 10 ** minorDigits(currency))
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 truncate text-xl font-extrabold tabular-nums">{value}</div>
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="font-bold">{title}</h2>
      {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}
