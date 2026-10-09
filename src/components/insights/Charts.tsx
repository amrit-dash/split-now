import { useId, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { Category } from '@/types'
import { CATEGORIES } from '@/lib/categories'
import { categoryChartColor, OTHER, seriesColor } from '@/lib/chartPalette'
import { currencySymbol, formatMoney } from '@/lib/money'
import { formatDate } from '@/lib/locale'
import { compactMoney, formatChange, type Bucket, type GroupTotal, type PaceWeek, type Slice, type TimePoint } from '@/lib/insights'
import { GroupIcon } from '@/components/GroupIcon'
import { ChartCard, HBar, TipBox, useChartTheme } from './chrome'
import { CountUp, EASE, monotonePath, niceTicks, svgId, useInView, useOutsideTap, useTween, useWidth } from './motion'

function bucketLabel(p: TimePoint, bucket: Bucket, long = false) {
  if (bucket === 'month') return formatDate(p.start, long ? { month: 'long', year: 'numeric' } : { month: 'short' })
  if (bucket === 'week') return long ? `${formatDate(p.start)} – ${formatDate(p.end)}` : formatDate(p.start)
  return long ? formatDate(p.start, { weekday: 'short', day: 'numeric', month: 'short' }) : String(Number(p.start.slice(8)))
}

/** Up to `max` evenly spread label indices, always including the first and last. */
function labelIndices(n: number, max: number) {
  if (n <= max) return Array.from({ length: n }, (_, i) => i)
  return [...new Set(Array.from({ length: max }, (_, k) => Math.round((k * (n - 1)) / (max - 1))))]
}

/** Readout box beside a scrub/tap position: to the right of x in the left half, to the left in the right half. */
function Readout({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  const right = x > width / 2
  return (
    <div className="pointer-events-none absolute top-0 z-10" style={right ? { right: width - x + 10 } : { left: x + 10 }}>
      {children}
    </div>
  )
}

const axisText = (fill: string) => ({ fill, fontSize: 11, fontVariantNumeric: 'tabular-nums' as const })

/**
 * Spend per day / week / month as one line with a faded area under it. Motion: the line draws on
 * (stroke-dashoffset), the area rises and fades in behind it, the bucket containing today pulses.
 * Filter changes morph the line from the old series to the new one. Tap or drag to scrub.
 */
export function TimeChart({ points, bucket, currency, approx }: { points: TimePoint[]; bucket: Bucket; currency: string; approx: string }) {
  const t = useChartTheme()
  const sym = currencySymbol(currency)
  const gid = svgId(useId())
  const [wRef, W] = useWidth<HTMLDivElement>()
  const [vRef, inView] = useInView<HTMLDivElement>()
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  const [scrub, setScrub] = useState<number | null>(null)
  useOutsideTap(box, scrub !== null, () => setScrub(null))

  const n = points.length
  const raw = points.map((p) => p.value)
  const avg = n ? raw.reduce((s, v) => s + v, 0) / n : 0
  const peak = points.reduce((m, p) => (p.value > m.value ? p : m), points[0])
  const ticks = niceTicks(Math.max(1, ...raw), 3)
  const vals = useTween(raw)
  const [avgT, topT] = useTween([avg, ticks[ticks.length - 1]])
  const accent = seriesColor(0, t.dark)
  const per = bucket === 'month' ? 'month' : bucket === 'week' ? 'week' : 'day'
  const money = (v: number) => approx + formatMoney(Math.round(v), currency)

  const H = 200,
    L = 44,
    R = 10,
    T = 14,
    B = 22
  const pw = Math.max(1, W - L - R),
    ph = H - T - B,
    base = T + ph
  const x = (i: number) => (n <= 1 ? L + pw / 2 : L + (i / (n - 1)) * pw)
  const y = (v: number) => base - (v / (topT || 1)) * ph
  const pts = vals.map((v, i) => [x(i), y(v)] as [number, number])
  const line = monotonePath(pts)
  const area = n > 1 ? `${line}L${x(n - 1)},${base}L${x(0)},${base}Z` : ''
  const cur = points.findIndex((p) => p.current)
  const si = scrub !== null && scrub < n ? scrub : null

  const onPointer = (e: ReactPointerEvent<SVGRectElement>) => {
    if (n === 0) return
    const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect()
    const i = n <= 1 ? 0 : Math.round(((e.clientX - r.left - L) / pw) * (n - 1))
    setScrub(Math.max(0, Math.min(n - 1, i)))
  }

  return (
    <ChartCard
      title="Spending over time"
      subtitle={
        <>
          Per {per} · average <CountUp value={Math.round(avg)} active={inView} format={money} />
          {peak?.value ? <> · peak {bucketLabel(peak, bucket, true)}</> : null}
        </>
      }
    >
      <div
        ref={(el) => {
          wRef(el)
          vRef(el)
          setBox(el)
        }}
        className="ins-anim relative h-[200px] select-none"
      >
        {W > 0 && (
          <svg
            width={W}
            height={H}
            className="block overflow-visible"
            role="img"
            aria-label={`Spending per ${per}, average ${money(avg)}${peak?.value ? `, peak ${bucketLabel(peak, bucket, true)} at ${money(peak.value)}` : ''}`}
          >
            <defs>
              <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={accent} stopOpacity={t.dark ? 0.42 : 0.3} />
                <stop offset="1" stopColor={accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            {ticks.map((v) => (
              <g key={v} style={{ opacity: v <= topT * 1.001 ? 1 : 0, transition: 'opacity 200ms' }}>
                <line x1={L} x2={L + pw} y1={y(v)} y2={y(v)} stroke={t.grid} />
                <text x={L - 8} y={y(v)} dy="0.32em" textAnchor="end" style={axisText(t.axis)}>
                  {compactMoney(v, currency, sym)}
                </text>
              </g>
            ))}
            {labelIndices(n, W < 340 ? 4 : 5).map((i) => (
              <text
                key={points[i].key}
                x={x(i)}
                y={H - 4}
                textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle'}
                style={{ ...axisText(t.axis), fontWeight: points[i].current ? 600 : 400 }}
              >
                {bucketLabel(points[i], bucket)}
              </text>
            ))}
            <g
              style={{
                opacity: inView ? 1 : 0,
                transform: inView ? 'none' : 'translateY(12px)',
                transition: `opacity 700ms ease 250ms, transform 900ms ${EASE} 250ms`,
              }}
            >
              {area && <path d={area} fill={`url(#${gid}-fill)`} />}
              {avg > 0 && (
                <>
                  <line x1={L} x2={L + pw} y1={y(avgT)} y2={y(avgT)} stroke={t.axis} strokeOpacity={0.7} strokeDasharray="3 3" />
                  <text x={L + 2} y={y(avgT) - 5} textAnchor="start" style={{ ...axisText(t.axis), fontSize: 10 }}>
                    avg
                  </text>
                </>
              )}
            </g>
            {n > 1 ? (
              <path
                d={line}
                fill="none"
                stroke={accent}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray="1 2"
                style={{ strokeDashoffset: inView ? 0 : 1, transition: 'stroke-dashoffset 1300ms cubic-bezier(0.45, 0.05, 0.25, 1)' }}
              />
            ) : n === 1 ? (
              <circle cx={pts[0][0]} cy={pts[0][1]} r={4} fill={accent} />
            ) : null}
            {cur >= 0 && pts[cur] && (
              <g style={{ opacity: inView && si === null ? 1 : 0, transition: `opacity 400ms ease ${inView ? 900 : 0}ms` }}>
                <circle cx={pts[cur][0]} cy={pts[cur][1]} r={4} fill={accent} className="ins-pulse" />
                <circle cx={pts[cur][0]} cy={pts[cur][1]} r={4} fill={accent} stroke={t.surface} strokeWidth={2} />
              </g>
            )}
            {si !== null && (
              <g pointerEvents="none">
                <line x1={x(si)} x2={x(si)} y1={T} y2={base} stroke={t.axis} strokeOpacity={0.6} />
                <circle cx={pts[si][0]} cy={pts[si][1]} r={5} fill={accent} stroke={t.surface} strokeWidth={2} />
              </g>
            )}
            <rect
              x={L - 6}
              y={0}
              width={pw + 12}
              height={H}
              fill="transparent"
              style={{ touchAction: 'pan-y', cursor: 'crosshair' }}
              onPointerDown={(e) => {
                onPointer(e)
                e.currentTarget.setPointerCapture?.(e.pointerId)
              }}
              onPointerMove={(e) => {
                if (e.pointerType === 'mouse' || e.buttons) onPointer(e)
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === 'mouse') setScrub(null)
              }}
            />
          </svg>
        )}
        {si !== null && (
          <Readout x={x(si)} width={W}>
            <TipBox
              title={
                <>
                  {bucketLabel(points[si], bucket, true)}
                  {points[si].current ? ' (so far)' : ''}
                </>
              }
              rows={[{ color: accent, label: 'spent', value: <CountUp value={points[si].value} duration={260} format={money} /> }]}
            />
          </Readout>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        {cur >= 0 && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: accent }} /> This {per} so far
          </span>
        )}
        {avg > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t border-dashed" style={{ borderColor: t.axis }} /> Average
          </span>
        )}
        <span className="ml-auto">Tap or drag to see a {per}</span>
      </div>
    </ChartCard>
  )
}

/**
 * This month vs last as grouped columns per week of the month (1–7, 8–14, …): last month grey, this
 * month in the accent, the current week a partial. Columns rise in from the baseline on view and
 * slide to new heights on filter changes (translateY inside a baseline clip, so pure transforms).
 */
export function PaceChart({
  weeks,
  thisTotal,
  lastToDate,
  lastTotal,
  currency,
  approx,
}: {
  weeks: PaceWeek[]
  thisTotal: number
  lastToDate: number
  lastTotal: number
  currency: string
  approx: string
}) {
  const t = useChartTheme()
  const sym = currencySymbol(currency)
  const cid = svgId(useId())
  const [wRef, W] = useWidth<HTMLDivElement>()
  const [vRef, inView] = useInView<HTMLDivElement>()
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  const [pick, setPick] = useState<number | null>(null)
  useOutsideTap(box, pick !== null, () => setPick(null))
  const a = seriesColor(0, t.dark),
    b = t.dark ? OTHER.dark : OTHER.light
  const change = lastToDate ? (thisTotal - lastToDate) / lastToDate : null
  const money = (v: number) => approx + formatMoney(Math.round(v), currency)

  const n = weeks.length
  const ticks = niceTicks(Math.max(1, ...weeks.flatMap((w) => [w.thisMonth ?? 0, w.lastMonth ?? 0])), 3)
  const top = ticks[ticks.length - 1]
  const H = 176,
    L = 44,
    R = 8,
    T = 12,
    B = 22
  const pw = Math.max(1, W - L - R),
    ph = H - T - B,
    base = T + ph
  const gw = pw / Math.max(1, n)
  const bw = Math.max(6, Math.min(18, (gw * 0.6 - 2) / 2))
  const y = (v: number) => base - (v / top) * ph
  const pi = pick !== null && pick < n ? pick : null

  const onPointer = (e: ReactPointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect()
    const i = Math.floor((e.clientX - r.left - L) / gw)
    setPick(Math.max(0, Math.min(n - 1, i)))
  }

  return (
    <ChartCard
      title="This month vs last"
      subtitle={
        <>
          <CountUp value={thisTotal} active={inView} format={money} /> so far
          {lastToDate > 0 && (
            <>
              {' '}
              vs <CountUp value={lastToDate} active={inView} format={money} /> by this day last month
              {change !== null && (
                <>
                  {' '}
                  (<span className={change > 0.05 ? 'neg' : change < -0.05 ? 'pos' : ''}>{formatChange(change)}</span>)
                </>
              )}
            </>
          )}
        </>
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: b }} /> Last month ({approx}
          {formatMoney(lastTotal, currency)})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: a }} /> This month
        </span>
      </div>
      <div
        ref={(el) => {
          wRef(el)
          vRef(el)
          setBox(el)
        }}
        className="ins-anim relative h-[176px] select-none"
      >
        {W > 0 && (
          <svg
            width={W}
            height={H}
            className="block overflow-visible"
            role="img"
            aria-label={`Spend per week of the month. ${weeks.map((w) => `Days ${w.from} to ${w.to}: last month ${money(w.lastMonth ?? 0)}${w.thisMonth !== undefined ? `, this month ${money(w.thisMonth)}${w.current ? ' so far' : ''}` : ''}`).join('. ')}`}
          >
            <defs>
              <clipPath id={`${cid}-clip`}>
                <rect x={L} y={T - 4} width={pw} height={ph + 4} />
              </clipPath>
            </defs>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={L} x2={L + pw} y1={y(v)} y2={y(v)} stroke={t.grid} />
                <text x={L - 8} y={y(v)} dy="0.32em" textAnchor="end" style={axisText(t.axis)}>
                  {compactMoney(v, currency, sym)}
                </text>
              </g>
            ))}
            <g clipPath={`url(#${cid}-clip)`}>
              {weeks.map((w, i) => {
                const cx = L + gw * i + gw / 2
                return [
                  { k: 'last', v: w.lastMonth, c: b, x: cx - 1 - bw },
                  { k: 'this', v: w.thisMonth, c: a, x: cx + 1 },
                ].map((s, j) => {
                  const h = s.v ? Math.max(2, (s.v / top) * ph) : 0
                  return (
                    <rect
                      key={`${w.key}-${s.k}`}
                      x={s.x}
                      y={T}
                      width={bw}
                      height={ph + 6}
                      rx={4}
                      fill={s.c}
                      style={{
                        transform: `translateY(${inView && h ? ph - h : ph + 6}px)`,
                        opacity: pi === null || pi === i ? 1 : 0.35,
                        transition: `transform 750ms ${EASE} ${i * 70 + j * 40}ms, opacity 200ms`,
                      }}
                    />
                  )
                })
              })}
            </g>
            <line x1={L} x2={L + pw} y1={base} y2={base} stroke={t.axis} strokeOpacity={0.35} />
            {weeks.map((w, i) => (
              <text key={w.key} x={L + gw * i + gw / 2} y={H - 4} textAnchor="middle" style={{ ...axisText(t.axis), fontWeight: w.current ? 700 : 400 }}>
                {w.from === w.to ? w.from : `${w.from}–${w.to}`}
              </text>
            ))}
            <rect
              x={L}
              y={0}
              width={pw}
              height={H}
              fill="transparent"
              style={{ touchAction: 'pan-y', cursor: 'pointer' }}
              onPointerDown={(e) => {
                onPointer(e)
                e.currentTarget.setPointerCapture?.(e.pointerId)
              }}
              onPointerMove={(e) => {
                if (e.pointerType === 'mouse' || e.buttons) onPointer(e)
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === 'mouse') setPick(null)
              }}
            />
          </svg>
        )}
        {pi !== null && (
          <Readout x={L + gw * pi + gw / 2} width={W}>
            <TipBox
              title={`Days ${weeks[pi].from}–${weeks[pi].to}`}
              rows={[
                ...(weeks[pi].thisMonth !== undefined
                  ? [
                      {
                        color: a,
                        label: weeks[pi].current ? 'this month so far' : 'this month',
                        value: <CountUp value={weeks[pi].thisMonth!} duration={260} format={money} />,
                      },
                    ]
                  : []),
                ...(weeks[pi].lastMonth !== undefined
                  ? [{ color: b, label: 'last month', value: <CountUp value={weeks[pi].lastMonth!} duration={260} format={money} /> }]
                  : []),
              ]}
            />
          </Readout>
        )}
      </div>
      <p className="mt-1 text-right text-xs text-slate-500 dark:text-slate-400">Days of the month · tap a week</p>
    </ChartCard>
  )
}

/**
 * Category split: a donut of the top slices (≤ 6) with the total in the hole, and the full sorted list
 * underneath as legend + exact values. Segments sweep in clockwise on view and slide to new sizes on
 * filter changes; tapping a segment focuses it (value in the hole). Tapping a row filters by it.
 */
export function CategoryBreakdown({
  donut,
  all,
  total,
  currency,
  approx,
  selected,
  onPick,
}: {
  donut: Array<Slice<Category | 'other-fold'>>
  all: Slice<Category>[]
  total: number
  currency: string
  approx: string
  selected: Category[]
  onPick: (c: Category) => void
}) {
  const t = useChartTheme()
  const [vRef, inView] = useInView<HTMLDivElement>()
  const [focus, setFocus] = useState<Category | 'other-fold' | null>(null)
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  useOutsideTap(box, focus !== null, () => setFocus(null))
  const inDonut = new Set(donut.map((s) => s.key))
  const colorOf = (c: Category) => (inDonut.has(c) ? categoryChartColor(c, t.dark) : t.dark ? OTHER.dark : OTHER.light)
  const max = all[0]?.value || 1
  const label = (k: Category | 'other-fold') => (k === 'other-fold' ? 'Everything else' : CATEGORIES[k].label)
  const money = (v: number) => approx + formatMoney(Math.round(v), currency)

  const S = 176,
    SW = 26,
    r = (S - SW) / 2 - 4,
    C = 2 * Math.PI * r,
    c0 = S / 2
  const sum = donut.reduce((s, d) => s + d.value, 0) || 1
  const gap = donut.length > 1 ? 2 : 0
  let acc = 0
  const segs = donut.map((d) => {
    const share = d.value / sum,
      start = acc
    acc += share
    return { ...d, share, start }
  })
  const focused = focus && segs.find((s) => s.key === focus)
  const SWEEP = 900

  const tapDonut = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rc = e.currentTarget.getBoundingClientRect()
    const dx = e.clientX - rc.left - c0,
      dy = e.clientY - rc.top - c0
    const dist = Math.hypot(dx, dy)
    if (dist < r - SW / 2 - 6 || dist > r + SW / 2 + 8) {
      setFocus(null)
      return
    }
    const frac = (((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360) / 360
    const hit = segs.find((s) => frac >= s.start && frac < s.start + s.share)
    setFocus(hit && hit.key !== focus ? hit.key : null)
  }

  return (
    <ChartCard title="Where it goes" subtitle="By category · tap the ring to focus, a row to filter">
      <div
        ref={(el) => {
          vRef(el)
          setBox(el)
        }}
        className="ins-anim"
      >
        {all.length > 1 && (
          <div className="relative mx-auto mb-3 h-44 w-44">
            <svg
              width={S}
              height={S}
              className="block overflow-visible"
              style={{ touchAction: 'manipulation', cursor: 'pointer' }}
              onPointerDown={tapDonut}
              role="img"
              aria-label={`Where it goes: ${segs.map((s) => `${label(s.key)} ${Math.round(s.share * 100)}%`).join(', ')}`}
            >
              <circle cx={c0} cy={c0} r={r} fill="none" stroke={t.grid} strokeWidth={SW} />
              {segs.map((s) => {
                const len = Math.max(0, s.share * C - gap)
                const on = focus === s.key
                return (
                  <circle
                    key={s.key}
                    cx={c0}
                    cy={c0}
                    r={r}
                    fill="none"
                    stroke={categoryChartColor(s.key, t.dark)}
                    strokeWidth={SW}
                    strokeDasharray={`${len} ${C}`}
                    style={{
                      strokeDashoffset: inView ? 0 : len,
                      transform: `rotate(${s.start * 360 - 90}deg) scale(${on ? 1.06 : 1})`,
                      transformOrigin: `${c0}px ${c0}px`,
                      opacity: focus && !on ? 0.3 : 1,
                      transition: `stroke-dashoffset ${Math.max(60, s.share * SWEEP)}ms linear ${s.start * SWEEP}ms, stroke-dasharray 600ms ${EASE}, transform 600ms ${EASE}, opacity 250ms`,
                    }}
                  />
                )
              })}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="max-w-24 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {focused ? (
                  <>
                    {label(focused.key)} · {Math.round(focused.share * 100)}%
                  </>
                ) : (
                  'Total'
                )}
              </span>
              <CountUp
                key={focused ? 'f' : 't'}
                className="max-w-28 truncate text-base font-extrabold"
                value={focused ? focused.value : total}
                active={inView}
                duration={focused ? 400 : 900}
                format={money}
              />
            </div>
          </div>
        )}
        <ul className="space-y-0.5">
          {all.map((s, i) => {
            const on = selected.includes(s.key)
            const lit = focus === s.key || (focus === 'other-fold' && !inDonut.has(s.key))
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => onPick(s.key)}
                  aria-pressed={on}
                  className={`-mx-2 block w-[calc(100%+1rem)] rounded-xl px-2 py-1.5 text-left transition hover:bg-slate-50 dark:hover:bg-ink-800 ${on ? 'bg-brand-50 dark:bg-brand-900/30' : lit ? 'bg-slate-50 dark:bg-ink-800' : ''}`}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorOf(s.key) }} />
                    <span className="min-w-0 flex-1 truncate">
                      {CATEGORIES[s.key].emoji} {CATEGORIES[s.key].label}
                    </span>
                    <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">{Math.round(s.share * 100)}%</span>
                    <CountUp className="w-24 shrink-0 text-right font-semibold" value={s.value} active={inView} format={money} />
                  </div>
                  <div className="mt-1 pl-[18px]">
                    <HBar frac={inView ? s.value / max : 0} color={colorOf(s.key)} thin delay={Math.min(i, 8) * 45} />
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </ChartCard>
  )
}

/** One series of horizontal bars by group, sorted, value at the end. Bars grow in; tap a row to focus it. */
export function GroupBars({
  groups,
  currency,
  approx,
  title,
  subtitle,
}: {
  groups: GroupTotal[]
  currency: string
  approx: string
  title: string
  subtitle: string
}) {
  const t = useChartTheme()
  const [vRef, inView] = useInView<HTMLUListElement>()
  const [focus, setFocus] = useState<string | null>(null)
  const max = groups[0]?.value || 1
  const total = groups.reduce((s, g) => s + g.value, 0) || 1
  const money = (v: number) => approx + formatMoney(Math.round(v), currency)
  return (
    <ChartCard title={title} subtitle={subtitle}>
      <ul ref={vRef} className="ins-anim space-y-1">
        {groups.map((g, i) => (
          <li key={g.id}>
            <button
              type="button"
              aria-pressed={focus === g.id}
              onClick={() => setFocus(focus === g.id ? null : g.id)}
              className="-mx-2 block w-[calc(100%+1rem)] rounded-xl px-2 py-1.5 text-left transition-opacity duration-200"
              style={{ opacity: focus && focus !== g.id ? 0.4 : 1 }}
            >
              <div className="flex items-center gap-2 text-sm">
                <GroupIcon emoji={g.emoji} size={24} />
                <span className="min-w-0 flex-1 truncate font-medium">{g.name}</span>
                <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">{Math.round((g.value / total) * 100)}%</span>
                <CountUp className="w-24 shrink-0 text-right font-semibold" value={g.value} active={inView} format={money} />
              </div>
              <div className="mt-1.5 pl-8">
                <HBar frac={inView ? g.value / max : 0} color={seriesColor(0, t.dark)} delay={Math.min(i, 8) * 60} />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </ChartCard>
  )
}

/**
 * Paid vs share: per member of one group, or per group for me. Two thin bars (fronted, consumed) on one
 * scale, with the difference in words: who is carrying the group. Bars grow in; tap a row to focus.
 */
export function PaidShare({
  rows,
  currency,
  approx,
  title,
  subtitle,
  footer,
}: {
  rows: Array<{ key: string; name: string; icon: React.ReactNode; paid: number; share: number }>
  currency: string
  approx: string
  title: string
  subtitle: string
  /** A line under the bars (the "whose turn" hint). */
  footer?: React.ReactNode
}) {
  const t = useChartTheme()
  const [vRef, inView] = useInView<HTMLUListElement>()
  const [focus, setFocus] = useState<string | null>(null)
  const max = Math.max(1, ...rows.flatMap((r) => [r.paid, r.share]))
  const cp = seriesColor(0, t.dark),
    cs = seriesColor(1, t.dark)
  const money = (v: number) => approx + formatMoney(Math.round(v), currency)
  return (
    <ChartCard title={title} subtitle={subtitle}>
      <div className="mb-3 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: cp }} /> Paid
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: cs }} /> Share
        </span>
      </div>
      <ul ref={vRef} className="ins-anim space-y-1.5">
        {rows.map((r, i) => {
          const diff = r.paid - r.share
          return (
            <li key={r.key}>
              <button
                type="button"
                aria-pressed={focus === r.key}
                onClick={() => setFocus(focus === r.key ? null : r.key)}
                className="-mx-2 block w-[calc(100%+1rem)] rounded-xl px-2 py-1.5 text-left transition-opacity duration-200"
                style={{ opacity: focus && focus !== r.key ? 0.4 : 1 }}
              >
                <div className="flex items-center gap-2 text-sm">
                  {r.icon}
                  <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                  <span className={`min-w-0 shrink truncate text-xs font-semibold tabular-nums ${diff > 0 ? 'pos' : diff < 0 ? 'neg' : 'text-slate-500'}`}>
                    {diff === 0 ? (
                      'even'
                    ) : (
                      <>
                        {diff > 0 ? 'fronted' : 'used'} <CountUp value={Math.abs(diff)} active={inView} format={money} /> {diff > 0 ? 'extra' : 'more'}
                      </>
                    )}
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 pl-8 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  <HBar frac={inView ? r.paid / max : 0} color={cp} thin delay={Math.min(i, 8) * 60} />
                  <CountUp className="w-20 text-right" value={r.paid} active={inView} format={money} />
                  <HBar frac={inView ? r.share / max : 0} color={cs} thin delay={Math.min(i, 8) * 60 + 40} />
                  <CountUp className="w-20 text-right" value={r.share} active={inView} format={money} />
                </div>
              </button>
            </li>
          )
        })}
      </ul>
      {footer}
    </ChartCard>
  )
}
