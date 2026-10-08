import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { useMe } from '@/hooks/auth'
import { useAllGroupData } from '@/hooks/data'
import { useTodayRates } from '@/hooks/useFx'
import type { Category } from '@/types'
import { CATEGORIES } from '@/lib/categories'
import { formatMoney } from '@/lib/money'
import { convertMinor } from '@/lib/fx'
import { chartFolds } from '@/lib/chartPalette'
import { formatDate } from '@/lib/locale'
import { todayISO } from '@/lib/id'
import {
  bucketFor, byCategory, byGroup, collectRows, counted, foldSlices, formatChange, headline, monthPace,
  overTime, paidVsShare, previousBounds, rangeBounds, type InsightFilters, type Source,
} from '@/lib/insights'
import { Empty, Loading, PageHeader } from '@/components/Misc'
import { Avatar } from '@/components/Avatar'
import { GroupIcon } from '@/components/GroupIcon'
import { ChartCard, StatTile } from '@/components/insights/chrome'
import { CategoryBreakdown, GroupBars, PaceChart, PaidShare, TimeChart } from '@/components/insights/Charts'
import { DEFAULT_FILTERS, FiltersPanel } from '@/components/insights/Filters'

export default function Insights() {
  const data = useAllGroupData()
  const { profile } = useMe()
  const home = profile.currency
  const [params, setParams] = useSearchParams()
  const [filters, setFilters] = useState<InsightFilters>(DEFAULT_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const rates = useTodayRates(home, data ? data.map((d) => d.group.currency) : [])
  const today = todayISO()

  // Selected groups live in the URL (?group=a,b) so a group's chart button can deep-link here.
  const groupIds = useMemo(() => {
    const raw = params.get('group')
    const ids = raw ? raw.split(',').filter(Boolean) : []
    return data ? ids.filter((id) => data.some((d) => d.group.id === id)) : ids
  }, [params, data])
  const setGroups = (ids: string[]) => setParams(ids.length ? { group: ids.join(',') } : {}, { replace: true })

  const view = useMemo(() => {
    if (!data) return null
    const picked = groupIds.length ? data.filter((d) => groupIds.includes(d.group.id)) : data
    // One currency in scope: exact, in that currency. Several: convert to home at today's ECB rate
    // (approximate), leaving out groups with no rate.
    const currencies = [...new Set(picked.map((d) => d.group.currency))]
    const single = currencies.length === 1
    const cur = single ? currencies[0] : home
    const scope = single ? picked : picked.filter((d) => d.group.currency === home || rates?.[d.group.currency])
    const convert = single ? undefined : (v: number, s: Source) => (s.group.currency === home ? v : convertMinor(v, s.group.currency, home, rates?.[s.group.currency]?.rate ?? 0))
    const converted = single ? [] : [...new Set(scope.filter((d) => d.group.currency !== home).map((d) => d.group.currency))]
    const skipped = single ? [] : [...new Set(picked.filter((d) => !scope.includes(d)).map((d) => d.group.currency))]

    const earliest = scope.reduce((m, d) => d.expenses.reduce((mm, e) => (e.date < mm ? e.date : mm), m), today)
    const b = rangeBounds(filters, today, earliest)
    const rows = collectRows(scope, b, filters, convert)
    const prevB = previousBounds(filters.range, b)
    const prevRows = prevB ? collectRows(scope, prevB, filters, convert) : null
    const head = headline(rows, b, today, prevRows)
    const cats = byCategory(rows)
    const bucket = bucketFor(b)
    const time = overTime(rows, b, today, bucket)
    // The pace chart compares this month with last, whatever the range, as long as the range reaches today.
    const firstOfLast = (() => { const t = new Date(today + 'T00:00'); return `${t.getMonth() === 0 ? t.getFullYear() - 1 : t.getFullYear()}-${String(((t.getMonth() + 11) % 12) + 1).padStart(2, '0')}-01` })()
    const pace = b.to >= today ? monthPace(collectRows(scope, { from: firstOfLast, to: today }, filters, convert), today) : null
    const groups = byGroup(rows)
    const one = scope.length === 1 ? scope[0] : undefined
    const members = one && one.group.type !== 'personal' ? paidVsShare(one, collectRows([one], b, { ...filters, basis: 'total' })) : []
    const top = counted(rows).sort((x, y) => y.value - x.value).slice(0, 5)
    const present = [...new Set(picked.flatMap((d) => d.expenses.map((e) => e.category)))].sort((x, y) => CATEGORIES[x].label.localeCompare(CATEGORIES[y].label))
    return { cur, approx: converted.length ? '≈ ' : '', converted, skipped, scope, b, rows, head, cats, bucket, time, pace, groups, one, members, top, present }
  }, [data, groupIds, rates, home, filters, today])

  if (!data || !view) return <Loading />
  const { cur, approx, head } = view
  const money = (v: number) => approx + formatMoney(v, cur)
  const pickCategory = (c: Category) =>
    setFilters((f) => ({ ...f, categories: f.categories.length === 1 && f.categories[0] === c ? [] : [c] }))
  const prevLabel = filters.range === 'month' ? 'same days last month' : filters.range === 'year' ? 'same point last year' : 'previous period'
  const multiGroupShare = !view.one && view.groups.filter((g) => g.paid || g.share).length > 1

  return (
    <div>
      <PageHeader title="Insights" />
      <FiltersPanel
        filters={filters} onChange={setFilters}
        groupIds={groupIds} onGroups={setGroups}
        groups={data.map((d) => d.group)} categories={view.present} home={home}
        open={filtersOpen} onOpenChange={setFiltersOpen}
      />

      {head.count === 0 ? (
        <Empty emoji="📊" title="Nothing to chart yet">No expenses match these filters. Try a longer date range or fewer filters.</Empty>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label={filters.basis === 'mine' ? 'You spent' : 'Total spent'}
              value={money(head.total)}
              sub={head.change !== null ? <Delta change={head.change} vs={prevLabel} /> : `${formatDate(view.b.from, { day: 'numeric', month: 'short', year: 'numeric' })} – now`}
            />
            <StatTile label="Daily average" value={money(head.dailyAvg)} sub={`over ${head.days} day${head.days > 1 ? 's' : ''}`} />
            <StatTile label="Expenses" value={String(head.count)} sub={`avg ${money(Math.round(head.total / Math.max(1, head.count)))} each`} />
            <StatTile
              label="Top category"
              value={view.cats[0] ? `${CATEGORIES[view.cats[0].key].emoji} ${CATEGORIES[view.cats[0].key].label}` : '—'}
              sub={view.cats[0] ? `${Math.round(view.cats[0].share * 100)}% · ${money(view.cats[0].value)}` : undefined}
            />
          </div>

          <TimeChart points={view.time} bucket={view.bucket} currency={cur} approx={approx} />

          {view.pace && (view.pace.thisTotal > 0 || view.pace.lastTotal > 0) && (
            <PaceChart {...view.pace} currency={cur} approx={approx} />
          )}

          <CategoryBreakdown
            donut={foldSlices(view.cats, 5, (c) => !chartFolds(c))}
            all={view.cats} total={head.total} currency={cur} approx={approx}
            selected={filters.categories} onPick={pickCategory}
          />

          {view.groups.length > 1 && (
            <GroupBars groups={view.groups} currency={cur} approx={approx} title="By group" subtitle={filters.basis === 'mine' ? 'Your share in each group' : 'Total spent in each group'} />
          )}

          {view.members.length > 1 && (
            <PaidShare
              title="Paid vs. share" subtitle="Who fronted the money vs. what they consumed"
              currency={cur} approx=""
              rows={view.members.map((m) => ({ key: m.id, name: m.me ? 'You' : m.name, icon: <Avatar name={m.name} color={m.color} size={24} />, paid: m.paid, share: m.share }))}
            />
          )}
          {multiGroupShare && (
            <PaidShare
              title="You paid vs. your share" subtitle="Per group: what you fronted vs. what you consumed"
              currency={cur} approx={approx}
              rows={view.groups.filter((g) => g.paid || g.share).map((g) => ({ key: g.id, name: g.name, icon: <GroupIcon emoji={g.emoji} size={24} />, paid: g.paid, share: g.share }))}
            />
          )}

          <ChartCard title="Biggest expenses">
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {view.top.map(({ e, src, value }) => (
                <li key={e.id}>
                  <Link to={`/groups/${src.group.id}/expenses/${e.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-slate-50 dark:hover:bg-ink-800">
                    <span className="text-xl">{CATEGORIES[e.category].emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{e.description}</div>
                      <div className="truncate text-xs text-slate-500">{src.group.name} · {formatDate(e.date, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{money(value)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </ChartCard>
        </div>
      )}

      {view.converted.length > 0 && (
        <p className="mt-4 px-1 text-center text-xs text-slate-400">≈ {view.converted.join(', ')} groups converted to {home} at today’s ECB rate. Filter to one group for exact amounts in its own currency.</p>
      )}
      {view.skipped.length > 0 && (
        <p className="mt-2 px-1 text-center text-xs text-slate-400">{view.skipped.join(', ')} groups aren’t included (no exchange rate available). Filter to one of them to see it.</p>
      )}
    </div>
  )
}

/** Spending up reads as the warning direction; icon + sign so it isn't colour alone. */
function Delta({ change, vs }: { change: number; vs: string }) {
  const up = change > 0.005, down = change < -0.005
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex items-center gap-0.5" title={`vs ${vs}`}>
      {(up || down) && <Icon size={13} className={up ? 'neg' : 'pos'} aria-hidden />}
      <span className={up ? 'neg font-semibold' : down ? 'pos font-semibold' : ''}>{formatChange(change)}</span>
      <span className="truncate">&nbsp;vs {vs}</span>
    </span>
  )
}

