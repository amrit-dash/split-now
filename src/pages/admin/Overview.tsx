import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useIsDark, seriesColor } from '@/lib/chartPalette'
import { errText } from '@/lib/errors'
import { formatDate } from '@/lib/locale'
import { AreaChart } from '@/components/charts'
import { Loading } from '@/components/Misc'
import { adminStats, type AdminStats, type DayStats } from './api'
import { Stat } from './common'

const DAYS = 14
const n = (v: number | null | undefined) => (v === null || v === undefined ? '–' : v.toLocaleString())
const sum = (r: Record<string, number>, keys: string[]) => keys.reduce((s, k) => s + (r[k] ?? 0), 0)
const dayLabel = (day: string) => formatDate(day, { day: 'numeric', month: 'short' })

/** Totals, today's counters and two weeks of sparklines, from the adminStats callable. */
export default function Overview() {
  const [stats, setStats] = useState<AdminStats | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const dark = useIsDark()
  const load = useCallback(() => {
    setError(null)
    adminStats(DAYS)
      .then(setStats)
      .catch((e) => {
        setError(errText(e))
        setStats(null)
      })
  }, [])
  useEffect(() => load(), [load])

  if (stats === undefined) return <Loading />
  if (!stats)
    return (
      <div className="card p-4 text-sm" role="alert">
        Couldn’t load the numbers{error ? `: ${error}` : ''}.
        <button type="button" className="btn-secondary btn-sm mt-3" onClick={load}>
          <RefreshCw size={16} /> Try again
        </button>
      </div>
    )
  const today = stats.days[stats.days.length - 1] ?? { day: stats.today, ai: {}, capture: {}, push: {}, nudge: {} }
  const series = (label: string, pick: (d: DayStats) => number, color: string) => (
    <div className="card p-4">
      <h3 className="mb-2 text-sm font-bold">{label}</h3>
      <AreaChart
        points={stats.days.map((d) => ({ key: d.day, label: dayLabel(d.day), value: pick(d) }))}
        height={140}
        color={color}
        format={(v) => n(v)}
        label={label}
      />
    </div>
  )
  return (
    <div className="space-y-4" data-testid="admin-overview">
      <div className="grid grid-cols-2 gap-3">
        <Stat
          n={n(stats.totals.users)}
          label="Accounts"
          hint={stats.totals.usersTruncated ? 'at least (Auth list cut off)' : undefined}
          testId="admin-stat-users"
        />
        <Stat n={n(stats.totals.groups)} label="Groups" testId="admin-stat-groups" />
        <Stat n={n(stats.totals.activeGroups)} label="Groups active in 7 days" />
        <Stat n={n(stats.totals.blocked)} label="Blocked accounts" />
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-bold">Today</h3>
          <span className="text-muted text-xs">{dayLabel(stats.today)} · IST</span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <Row
            k="AI calls"
            v={`${n(sum(today.ai, ['app', 'own']))}`}
            hint={`${n(today.ai.app)} shared key · ${n(today.ai.own)} own keys · ${n(today.ai.errors)} failed`}
          />
          <Row k="Captures" v={n(today.capture.captured)} hint={`${n(today.capture.received)} received · ${n(today.capture.ai)} read with AI`} />
          <Row k="Pushes" v={n(today.push.sent)} hint={`${n(today.push.failed)} failed · ${n(today.push.dead)} dead devices`} />
          <Row k="Nudges" v={n(today.nudge.sent)} hint={`${n(today.nudge.denied)} over the limit`} />
        </dl>
      </div>

      {series('AI calls per day', (d) => sum(d.ai, ['app', 'own']), seriesColor(0, dark))}
      {series('Captured payments per day', (d) => d.capture.captured ?? 0, seriesColor(2, dark))}
      {series('Pushes sent per day', (d) => d.push.sent ?? 0, seriesColor(6, dark))}

      <div className="flex justify-end">
        <button type="button" className="btn-ghost btn-sm" onClick={load}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
    </div>
  )
}

function Row({ k, v, hint }: { k: string; v: string; hint: string }) {
  return (
    <div>
      <dt className="text-muted text-xs">{k}</dt>
      <dd className="text-lg font-bold tabular-nums">{v}</dd>
      <dd className="text-muted text-[11px]">{hint}</dd>
    </div>
  )
}
