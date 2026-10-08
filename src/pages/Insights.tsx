import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMe } from '@/hooks/auth'
import { useAllGroupData, type GroupData } from '@/hooks/data'
import type { Category } from '@/types'
import { CATEGORIES } from '@/lib/categories'
import { formatMoney, minorDigits } from '@/lib/money'
import { convertMinor } from '@/lib/fx'
import { useTodayRates } from '@/hooks/useFx'
import { categoryChartColor, seriesColor, useIsDark } from '@/lib/chartPalette'
import { PERIODS, compute, deltaPercent, parseBasis, parsePeriod, type Basis, type Period } from '@/lib/insights'
import { usePageTitle } from '@/lib/brand'
import { Empty, PageHeader, Segmented } from '@/components/Misc'
import { CardSkeleton } from '@/components/Skeleton'
import { appLocale, formatDate } from '@/lib/locale'
import { Select } from '@/components/Select'
import { GroupIcon } from '@/components/GroupIcon'
import { AreaChart, Bars, Donut } from '@/components/charts'

export default function Insights() {
  usePageTitle('Insights')
  const data = useAllGroupData()
  const { profile } = useMe()
  const [params, setParams] = useSearchParams()
  const groupId = params.get('group') ?? 'all'
  // Period and basis live in the URL (?p=12m&b=total) so a link or a back-swipe keeps them; defaults are left out.
  const period = parsePeriod(params.get('p'))
  const basis = parseBasis(params.get('b'))
  const setParam = (k: 'p' | 'b' | 'group', v: string, dflt: string) => setParams((prev) => {
    const next = new URLSearchParams(prev)
    if (v === dflt) next.delete(k); else next.set(k, v)
    return next
  }, { replace: true })
  const dark = useIsDark()
  const home = profile.currency
  const rates = useTodayRates(home, data ? data.map((d) => d.group.currency) : [])

  const scope = useMemo(() => {
    if (!data) return null
    if (groupId !== 'all') return data.filter((d) => d.group.id === groupId)
    // All groups: home-currency groups, plus others converted at today's ECB rate (approximate). Archived ones sit out.
    return data.filter((d) => !d.group.archived && (d.group.currency === home || rates?.[d.group.currency]))
  }, [data, groupId, home, rates])

  // Minor units of a group's currency → minor units of the home currency.
  const toHome = useMemo(() => {
    if (groupId !== 'all') return undefined
    return (v: number, d: GroupData) => (d.group.currency === home ? v : convertMinor(v, d.group.currency, home, rates?.[d.group.currency]?.rate ?? 0))
  }, [groupId, home, rates])

  const stats = useMemo(() => (scope ? compute(scope, period, basis, toHome) : null), [scope, period, basis, toHome])

  if (!data || !scope || !stats) {
    return (
      <div>
        <PageHeader title="Insights" />
        <div className="space-y-3" role="status" aria-label="Loading"><CardSkeleton className="h-12" /><CardSkeleton className="h-28" /><CardSkeleton className="h-64" /></div>
      </div>
    )
  }
  const cur = groupId === 'all' ? home : scope[0]?.group.currency ?? home
  const converted = groupId === 'all' ? [...new Set(scope.filter((d) => d.group.currency !== home).map((d) => d.group.currency))] : []
  const skipped = groupId === 'all' ? [...new Set(data.filter((d) => !d.group.archived && !scope.includes(d)).map((d) => d.group.currency))] : []
  const ax = converted.length ? '≈ ' : ''
  const single = groupId !== 'all' ? scope[0] : undefined
  const personal = single?.group.type === 'personal'
  const money = (v: number) => formatMoney(v, cur)
  const short = (v: number) => compact(v, cur)
  const delta = deltaPercent(stats.total, stats.prevTotal)
  const periodLabel = PERIODS.find((p) => p.value === period)!.label.toLowerCase()

  return (
    <div>
      <PageHeader title="Insights" />
      <div className="mb-3">
        <Select aria-label="Group" value={data.some((d) => d.group.id === groupId) ? groupId : 'all'} onChange={(v) => setParam('group', v, 'all')}
          options={[
            { value: 'all', label: 'All groups', text: 'All groups', icon: <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-slate-100 text-base dark:bg-ink-800" aria-hidden>📊</span> },
            ...data.map((d) => ({ value: d.group.id, label: d.group.name, text: d.group.name, icon: <GroupIcon emoji={d.group.emoji} size={28} />, hint: d.group.archived ? 'Archived' : d.group.currency !== home ? d.group.currency : undefined })),
          ]} />
      </div>
      <div className="mb-4 space-y-2">
        <Segmented<Period> value={period} onChange={(v) => setParam('p', v, '3m')} options={PERIODS} label="Period" testId="insights-period" />
        {!personal && <Segmented<Basis> value={basis} onChange={(v) => setParam('b', v, 'mine')} options={[{ value: 'mine', label: 'My share' }, { value: 'total', label: 'Group total' }]} label="Count" testId="insights-basis" />}
      </div>

      {stats.count === 0 ? (
        <Empty emoji="📊" title="Nothing to chart yet">Add a few expenses in this period to see your insights.</Empty>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Kpi label={basis === 'mine' && !personal ? 'Your spending' : 'Spending'} value={ax + money(stats.total)}
              sub={delta !== null ? <span className={delta > 0 ? 'neg' : delta < 0 ? 'pos' : ''}><span aria-hidden>{delta > 0 ? '↑' : delta < 0 ? '↓' : '='} </span><span className="sr-only">{delta > 0 ? 'up' : delta < 0 ? 'down' : 'same'} </span>{Math.abs(delta)}% vs previous {periodLabel}</span> : stats.prevTotal === 0 ? 'Nothing in the previous period' : undefined} />
            <Kpi label="Expenses" value={String(stats.count)} />
            <Kpi label="Average expense" value={ax + money(Math.round(stats.total / Math.max(1, stats.count)))} />
            <Kpi label="Top category" value={stats.cats[0] ? stats.cats[0].label : '—'} icon={stats.cats[0] ? CATEGORIES[stats.cats[0].cat as Category]?.emoji ?? '🧾' : undefined} />
          </div>

          <ChartCard title="By category" subtitle={basis === 'mine' && !personal ? 'Your share of each expense' : 'Full expense amounts'}>
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <Donut size={200} label="Spending by category" format={money}
                slices={stats.cats.map((c) => ({ key: c.cat, label: c.label, value: c.value, color: categoryChartColor(c.cat, dark) }))} />
              <ul className="w-full space-y-1.5">
                {stats.cats.map((c) => (
                  <li key={c.cat} className="flex items-center gap-2 text-sm">
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: categoryChartColor(c.cat, dark) }} aria-hidden />
                    <span className="flex-1 truncate">{c.label}</span>
                    <span className="text-muted">{Math.round((c.value / stats.total) * 100)}%</span>
                    <span className="w-24 text-right font-semibold">{money(c.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </ChartCard>

          <ChartCard title="Spending over time" subtitle={stats.bucket === 'week' ? 'Per week' : 'Per month'}>
            <AreaChart points={stats.series} color={seriesColor(0, dark)} format={money} compact={short} label={stats.bucket === 'week' ? 'Spending per week' : 'Spending per month'} />
          </ChartCard>

          {stats.budget && single && (
            <ChartCard title="Budget" subtitle={`${money(stats.budget.spent)} of ${money(stats.budget.budget)} spent · ${stats.budget.spent > stats.budget.budget ? `${money(stats.budget.spent - stats.budget.budget)} over` : `${money(stats.budget.budget - stats.budget.spent)} left`}`}>
              {stats.budget.points.length > 1 ? (
                <AreaChart points={stats.budget.points} color={stats.budget.spent > stats.budget.budget ? (dark ? '#e66767' : '#e34948') : seriesColor(2, dark)} format={money} compact={short}
                  label={`Spending run-up against the ${money(stats.budget.budget)} budget`} reference={{ value: stats.budget.budget, label: `Budget ${short(stats.budget.budget)}` }} />
              ) : <p className="text-muted text-sm">The run-up shows once there are expenses on more than one day.</p>}
            </ChartCard>
          )}

          {single && !personal && stats.members.length > 0 && (
            <ChartCard title="Paid vs. share" subtitle="Who fronted the money, and what each person consumed">
              <Bars label="Paid vs share per person" format={short}
                series={[{ key: 'paid', label: 'Paid', color: seriesColor(0, dark) }, { key: 'share', label: 'Share', color: seriesColor(1, dark) }]}
                rows={stats.members.map((m) => ({ key: m.id, label: m.name, values: [m.paid, m.share] }))} />
            </ChartCard>
          )}

          {!single && stats.people.length > 0 && (
            <ChartCard title="With people" subtitle="Your share of what you split with each person">
              <Bars label="Spending with each person" format={short} series={[{ key: 'v', label: 'Spent together', color: seriesColor(4, dark) }]}
                rows={stats.people.map((p) => ({ key: p.key, label: p.name.split(' ')[0], values: [p.value] }))} />
              <Link to="/friends" className="mt-3 inline-block text-sm font-semibold text-brand-600 dark:text-brand-300">Balances with people</Link>
            </ChartCard>
          )}

          <ChartCard title="Biggest expenses">
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {stats.top.map(({ e, d, v }) => (
                <li key={e.id}>
                  <Link to={`/groups/${d.group.id}/expenses/${e.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-slate-50 dark:hover:bg-ink-800">
                    <span className="text-xl" aria-hidden>{CATEGORIES[e.category].emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{e.description}</div>
                      <div className="text-muted truncate text-xs">{d.group.name} · {formatDate(e.date, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    </div>
                    <span className="text-sm font-semibold">{money(v)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </ChartCard>
          {converted.length > 0 && (
            <p className="text-muted px-1 text-center text-xs">≈ {converted.join(', ')} groups converted to {home} at today’s ECB rate. Pick a group above for exact amounts in its own currency.</p>
          )}
          {skipped.length > 0 && (
            <p className="text-muted px-1 text-center text-xs">{skipped.join(', ')} groups aren’t included (no exchange rate available). Pick a group above to see them.</p>
          )}
        </div>
      )}
    </div>
  )
}

function compact(cents: number, currency: string) {
  return new Intl.NumberFormat(appLocale(), { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(cents / 10 ** minorDigits(currency))
}

function Kpi({ label, value, sub, icon }: { label: string; value: string; sub?: React.ReactNode; icon?: string }) {
  return (
    <div className="card p-4">
      <div className="text-muted text-xs font-medium">{label}</div>
      <div className="mt-1 text-lg font-extrabold leading-tight [overflow-wrap:anywhere]">{icon && <span aria-hidden>{icon} </span>}{value}</div>
      {sub && <div className="text-muted mt-1 text-xs">{sub}</div>}
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="font-bold">{title}</h2>
      {subtitle && <p className="text-muted text-xs">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}
