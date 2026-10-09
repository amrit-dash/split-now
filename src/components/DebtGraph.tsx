import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, X } from 'lucide-react'
import type { Debt, Group, MemberId } from '@/types'
import { formatMoney } from '@/lib/money'
import {
  LABEL_GAP,
  LABEL_H,
  compactMoney,
  flowCurve,
  flowKey,
  flowSpeed,
  flowWidth,
  layoutRing,
  mergeDebts,
  netOf,
  shortNames,
  type FlowGeom,
  type RingNode,
} from '@/lib/insightsFlow'
import { useMe } from '@/hooks/auth'
import { memberOrder, myMemberId } from '@/hooks/data'
import { Avatar } from '@/components/Avatar'
import { useCountUp, useInView, useReducedMotion } from '@/components/graph/motion'
import '@/components/graph/graph.css'

type Mode = 'me' | 'all'
type Focus = { flow: string } | { person: MemberId } | null

interface DrawnFlow {
  key: string
  debt: Debt
  geom: FlowGeom
  width: number
  /** member colour (everyone view) or a tone class (your view: green in, red out) */
  color?: string
  tone?: 'in' | 'out'
  speed: number
}

const TONE = {
  in: 'stroke-emerald-500 dark:stroke-emerald-400',
  out: 'stroke-rose-500 dark:stroke-rose-400',
}

const css = (c: string) => (c === 'accent' ? 'var(--color-brand-500)' : c)

/**
 * Settle-up graph: people as avatars, money as dots flowing along curved paths from payer to
 * receiver (thicker and faster = more). "You" view puts you in the middle with what comes in
 * (green) and goes out (red); "Everyone" puts the whole group on the ring. Switching between the
 * Original and Simplified debts animates: removed payments drain away, new ones draw on. The exact
 * list of payments underneath is the readable source of truth.
 */
export function DebtGraph({ group, debts }: { group: Group; debts: Debt[]; size?: number }) {
  const { user } = useMe()
  const me = myMemberId(group, user.uid)
  const reduced = useReducedMotion()
  const flows = useMemo(() => mergeDebts(debts), [debts])
  const touchesMe = (d: Debt) => d.from === me || d.to === me
  const mine = useMemo(() => flows.filter((d) => d.from === me || d.to === me), [flows, me])
  const [mode, setMode] = useState<Mode>(() => (me && flows.some(touchesMe) ? 'me' : 'all'))
  const view: Mode = me && flows.length ? mode : 'all'
  const [focus, setFocus] = useState<Focus>(null)
  const [mountedAt] = useState(() => performance.now())

  // Width of the drawing, measured, so the layout can keep every label inside the card.
  const boxRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(300)
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const set = () => setWidth(Math.round(el.clientWidth) || 300)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const [rootRef, inView] = useInView<HTMLDivElement>()

  const ids = useMemo(() => {
    const out = memberOrder(group)
    for (const d of flows) for (const id of [d.from, d.to]) if (!out.includes(id)) out.push(id)
    return out
  }, [group, flows])
  const fullName = (id: MemberId) => group.members[id]?.name ?? 'Someone'
  const shorts = useMemo(() => shortNames(Object.fromEntries(ids.map((id) => [id, group.members[id]?.name ?? 'Someone']))), [ids, group])
  const label = (id: MemberId) => (id === me ? 'You' : shorts[id])
  const name = (id: MemberId) => (id === me ? 'You' : fullName(id))
  const color = (id: MemberId) => group.members[id]?.color ?? '#64748b'
  const photo = (id: MemberId) => group.members[id]?.photoURL
  const cur = group.currency
  const money = (v: number) => formatMoney(v, cur)
  const short = (v: number) => compactMoney(v, cur)
  const signed = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + short(Math.abs(v))

  const layout = useMemo(
    () =>
      layoutRing({
        width,
        // Your view: only the people you have a payment with, around you.
        ids: view === 'me' ? ids.filter((id) => id !== me && mine.some((d) => d.from === id || d.to === id)) : ids,
        center: view === 'me' ? me : flows.length ? null : '@',
      }),
    [width, ids, view, me, mine, flows.length],
  )
  const shown = view === 'me' ? mine : flows
  const net = useMemo(() => netOf(flows), [flows])
  const myNet = me ? (net.get(me) ?? 0) : 0

  const drawn: DrawnFlow[] = useMemo(() => {
    const max = Math.max(0, ...shown.map((d) => d.amount))
    const at = (n: RingNode) => ({ x: n.x, y: n.y, r: n.size / 2 + 4 })
    const centre = { x: layout.cx, y: layout.cy }
    return shown.flatMap((d) => {
      const a = layout.byId.get(d.from),
        b = layout.byId.get(d.to)
      if (!a || !b) return []
      const geom = view === 'me' ? flowCurve(at(a), at(b), centre, 0, 14) : flowCurve(at(a), at(b), centre, a.center || b.center ? 0 : 0.5, 9)
      return [
        {
          key: flowKey(d),
          debt: d,
          geom,
          width: flowWidth(d.amount, max),
          speed: flowSpeed(d.amount, max),
          ...(view === 'me' ? { tone: d.from === me ? ('out' as const) : ('in' as const) } : { color: css(group.members[d.from]?.color ?? '#64748b') }),
        },
      ]
    })
  }, [shown, layout, view, me, group])

  // Payments that disappear (Original → Simplified) stay a moment to drain away.
  const prev = useRef<{ view: Mode; width: number; drawn: DrawnFlow[] }>({ view, width, drawn: [] })
  const [exiting, setExiting] = useState<DrawnFlow[]>([])
  useEffect(() => {
    const p = prev.current
    prev.current = { view, width, drawn }
    if (p.view !== view || p.width !== width || reduced) return
    const now = new Set(drawn.map((f) => f.key + f.debt.amount))
    const gone = p.drawn.filter((f) => !now.has(f.key + f.debt.amount))
    if (!gone.length) return
    setExiting(gone)
    const t = setTimeout(() => setExiting([]), 520)
    return () => clearTimeout(t)
  }, [drawn, view, width, reduced])

  const fresh = performance.now() - mountedAt < 700
  // A busy picture (e.g. 29 original payments) stays calm: thin ghost lines, and only the biggest
  // payments carry moving dots and arrows until something is focused.
  const busy = drawn.length > 10
  const loud = useMemo(
    () =>
      new Set(
        [...drawn]
          .sort((a, b) => b.debt.amount - a.debt.amount)
          .slice(0, busy ? 6 : drawn.length)
          .map((f) => f.key),
      ),
    [drawn, busy],
  )
  const flowDelay = (i: number) => (fresh ? 380 + i * 45 : 180 + i * 35)

  // Focus: a payment or a person; everything else steps back.
  const focusFlow = focus && 'flow' in focus ? flows.find((d) => flowKey(d) === focus.flow) : undefined
  const focusPerson = focus && 'person' in focus ? focus.person : undefined
  const flowOn = (d: Debt) => (focusFlow ? flowKey(focusFlow) === flowKey(d) : focusPerson ? d.from === focusPerson || d.to === focusPerson : true)
  const involved = useMemo(() => new Set(shown.flatMap((d) => [d.from, d.to])), [shown])
  const personOn = (id: MemberId) => {
    if (focusFlow) return focusFlow.from === id || focusFlow.to === id
    if (focusPerson) return id === focusPerson || shown.some((d) => (d.from === focusPerson && d.to === id) || (d.to === focusPerson && d.from === id))
    return involved.has(id) || (view === 'me' && id === me)
  }
  const toggle = (f: NonNullable<Focus>) => setFocus((c) => (c && JSON.stringify(c) === JSON.stringify(f) ? null : f))

  const subFor = (id: MemberId): { text: string; cls: string; aria: string } => {
    if (view === 'me' && me && id !== me) {
      const owesMe = flows.filter((d) => d.from === id && d.to === me).reduce((s, d) => s + d.amount, 0)
      const iOwe = flows.filter((d) => d.from === me && d.to === id).reduce((s, d) => s + d.amount, 0)
      const v = owesMe - iOwe
      if (!owesMe && !iOwe) return { text: 'even', cls: 'text-muted', aria: 'nothing between you' }
      return v >= 0 ? { text: signed(v), cls: 'pos', aria: `owes you ${money(v)}` } : { text: signed(v), cls: 'neg', aria: `you owe ${money(-v)}` }
    }
    const v = net.get(id) ?? 0
    if (!v) return { text: 'settled', cls: 'text-muted', aria: 'settled' }
    return { text: signed(v), cls: v > 0 ? 'pos' : 'neg', aria: v > 0 ? `gets back ${money(v)}` : `owes ${money(-v)}` }
  }

  const total = flows.reduce((s, d) => s + d.amount, 0)
  const headTarget = view === 'me' ? Math.abs(myNet) : total
  const headText = money(headTarget)
  // Long amounts (₹1,23,45,678.90) step down a size instead of wrapping; the toggle wraps below.
  const headSize = headText.length > 15 ? 'text-lg' : headText.length > 12 ? 'text-xl' : 'text-2xl'
  const counted = useCountUp(headTarget, { delay: fresh ? 250 : 0, off: reduced })
  const list = view === 'me' ? [...mine, ...flows.filter((d) => !touchesMe(d))] : flows
  const settled = flows.length === 0

  return (
    <div ref={rootRef} className={inView ? '' : 'dg-paused'}>
      {/* Headline: the answer before the picture. */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex-auto">
          <div className="text-muted text-[11px] font-semibold uppercase tracking-wide">
            {settled
              ? 'All settled'
              : view === 'me'
                ? myNet > 0
                  ? 'You get back'
                  : myNet < 0
                    ? 'You owe'
                    : 'You’re square'
                : `${flows.length} payment${flows.length > 1 ? 's' : ''} settle everyone`}
          </div>
          {!settled && (
            <div
              className={`whitespace-nowrap font-extrabold leading-tight tabular-nums ${headSize} ${view === 'me' ? (myNet > 0 ? 'pos' : myNet < 0 ? 'neg' : 'text-muted') : ''}`}
            >
              {money(Math.round(counted))}
            </div>
          )}
        </div>
        {me && !settled && (
          <div className="flex shrink-0 rounded-full bg-slate-100 p-0.5 text-xs font-semibold dark:bg-ink-800" role="group" aria-label="Show">
            {(['me', 'all'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={view === m}
                onClick={() => {
                  setMode(m)
                  setFocus(null)
                }}
                className={`rounded-full px-3 py-1.5 transition ${view === m ? 'bg-white text-slate-900 shadow-sm dark:bg-ink-700 dark:text-white' : 'text-muted'}`}
              >
                {m === 'me' ? 'You' : 'Everyone'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* The picture: SVG flows under absolutely positioned avatar buttons. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: tapping empty space clears the highlight for pointers; keyboard users have the Clear button and the payment list. */}
      <div
        ref={boxRef}
        className="relative w-full select-none overflow-hidden"
        style={{ height: layout.height }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setFocus(null)
        }}
      >
        <svg
          width={layout.width}
          height={layout.height}
          className="absolute inset-0 overflow-visible"
          aria-hidden
          onClick={(e) => {
            if (e.target === e.currentTarget) setFocus(null)
          }}
        >
          {exiting.map((f) => (
            <path
              key={'x' + f.key + f.debt.amount}
              d={f.geom.d}
              pathLength={100}
              fill="none"
              strokeLinecap="round"
              strokeWidth={f.width}
              className={`dg-exit ${f.tone ? TONE[f.tone] : ''}`}
              style={f.color ? { stroke: f.color } : undefined}
            />
          ))}
          {drawn.map((f, i) => {
            const on = flowOn(f.debt)
            const d0 = flowDelay(i)
            const stroke = f.color ? { stroke: f.color } : undefined
            const tone = f.tone ? TONE[f.tone] : ''
            const chev = 3.5 + f.width * 0.35
            return (
              <g key={`${view}|${f.key}|${f.debt.amount}`} className="transition-opacity duration-300" opacity={on ? 1 : 0.1}>
                <path
                  d={f.geom.d}
                  pathLength={100}
                  fill="none"
                  strokeLinecap="round"
                  strokeWidth={f.width}
                  strokeOpacity={focus && on ? 0.45 : busy ? 0.2 : 0.3}
                  className={`dg-draw ${tone}`}
                  style={{ ...stroke, '--d': `${d0}ms` } as CSSProperties}
                />
                {on && (focus || loud.has(f.key)) && (
                  <path
                    d={f.geom.d}
                    fill="none"
                    strokeWidth={Math.min(9, Math.max(4, f.width * 0.8 + 1))}
                    className={`dg-dots ${tone}`}
                    style={{ ...stroke, '--dur': `${f.speed}s`, '--d': `${d0 + 550}ms` } as CSSProperties}
                  />
                )}
                {(focus ? on : loud.has(f.key)) && (
                  <g transform={`translate(${f.geom.arrow.x.toFixed(1)},${f.geom.arrow.y.toFixed(1)}) rotate(${f.geom.arrow.angle.toFixed(1)})`}>
                    <path
                      d={`M${-chev},${-chev} L${chev * 0.4},0 L${-chev},${chev}`}
                      fill="none"
                      strokeWidth={2.25}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`dg-fade-in ${tone}`}
                      style={{ ...stroke, '--d': `${d0 + 450}ms` } as CSSProperties}
                    />
                  </g>
                )}
                {/* biome-ignore lint/a11y/noStaticElementInteractions: a wide hit area for tapping a flow; the same toggle is a button in the payment list below. */}
                <path
                  d={f.geom.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={22}
                  pointerEvents="stroke"
                  className="cursor-pointer"
                  onClick={() => toggle({ flow: f.key })}
                >
                  <title>{`${name(f.debt.from)} → ${name(f.debt.to)}: ${money(f.debt.amount)}`}</title>
                </path>
              </g>
            )
          })}
        </svg>

        {settled && (
          <div
            className="pointer-events-none absolute flex flex-col items-center"
            style={{ left: layout.cx, top: layout.cy, transform: 'translate(-50%, -32px)' }}
          >
            <div className="relative">
              <span className="dg-ripple absolute inset-0 rounded-full bg-emerald-400/50" />
              <span
                className="dg-pop relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                style={{ '--d': '200ms' } as CSSProperties}
              >
                <Check size={32} strokeWidth={3} aria-hidden />
              </span>
            </div>
            <div className="dg-fade-in mt-2 whitespace-nowrap text-sm font-bold text-slate-900 dark:text-slate-100" style={{ '--d': '450ms' } as CSSProperties}>
              Everyone’s square
            </div>
          </div>
        )}

        {layout.nodes.map((n, i) => {
          const sub = subFor(n.id)
          const on = personOn(n.id)
          const picked = focusPerson === n.id
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => toggle({ person: n.id })}
              aria-pressed={picked}
              aria-label={`${name(n.id)}: ${sub.aria}`}
              title={fullName(n.id)}
              className={`dg-node absolute left-0 top-0 flex items-center ${n.above ? 'flex-col-reverse' : 'flex-col'}`}
              style={{
                width: n.labelW,
                transform: `translate(${(n.x - n.labelW / 2).toFixed(1)}px, ${(n.y - n.size / 2 - (n.above ? LABEL_GAP + LABEL_H : 0)).toFixed(1)}px)`,
                opacity: settled ? 1 : on ? 1 : 0.4,
              }}
            >
              <span
                className={`dg-pop block rounded-full ring-offset-2 ring-offset-white transition-shadow dark:ring-offset-ink-900 ${picked ? 'ring-2 ring-brand-500' : ''}`}
                style={{ '--d': `${i * 35}ms` } as CSSProperties}
              >
                <Avatar name={fullName(n.id)} color={color(n.id)} photoURL={photo(n.id)} size={n.size} />
              </span>
              {/* A soft card-coloured backing keeps labels readable where a flow passes behind them. */}
              <span
                className={`block max-w-full rounded-md bg-white/85 px-1 dark:bg-ink-900/85 ${n.above ? 'mb-[3px]' : 'mt-[3px]'}`}
                style={{ height: LABEL_H }}
              >
                <span
                  className={`block truncate text-center font-bold leading-[15px] text-slate-900 dark:text-slate-100 ${n.center ? 'text-[13px]' : 'text-[12px]'}`}
                >
                  {label(n.id)}
                </span>
                <span className={`block truncate text-center text-[11px] font-semibold leading-[15px] tabular-nums ${sub.cls}`}>
                  {settled ? 'settled' : sub.text}
                </span>
              </span>
            </button>
          )
        })}

        {focusFlow &&
          (() => {
            const f = drawn.find((x) => x.key === flowKey(focusFlow))
            if (!f) return null
            const x = Math.min(layout.width - 44, Math.max(44, f.geom.mid.x))
            return (
              <div
                className="pointer-events-none absolute left-0 top-0"
                style={{ transform: `translate(calc(${x.toFixed(1)}px - 50%), ${Math.max(0, f.geom.mid.y - 26).toFixed(1)}px)` }}
              >
                <div className="dg-rise max-w-[88px] truncate rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-bold tabular-nums text-white shadow dark:bg-white dark:text-slate-900">
                  {short(f.debt.amount)}
                </div>
              </div>
            )
          })()}
      </div>

      {!settled && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-muted text-[11px] font-medium">
          {view === 'me' ? (
            <>
              <span className="inline-flex items-center gap-1">
                <i className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden /> owes you
              </span>
              <span className="inline-flex items-center gap-1">
                <i className="h-2 w-2 rounded-full bg-rose-500" aria-hidden /> you owe
              </span>
            </>
          ) : (
            <span>Coloured by who pays</span>
          )}
          <span>Thicker = more · tap to focus</span>
        </div>
      )}

      {view === 'me' && !settled && mine.length === 0 && (
        <p className="text-muted mt-2 text-center text-sm">
          You’re all square here.{' '}
          <button type="button" className="font-semibold text-brand-600 dark:text-brand-300" onClick={() => setMode('all')}>
            See everyone
          </button>
        </p>
      )}

      {focus && (focusFlow || focusPerson) && <div key={JSON.stringify(focus)}>{focusCard()}</div>}

      {!settled && (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/5" aria-label="Payments">
          {list.map((d) => {
            const k = flowKey(d)
            const on = flowOn(d)
            return (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => toggle({ flow: k })}
                  aria-pressed={!!focusFlow && flowKey(focusFlow) === k}
                  className={`-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-opacity ${on ? '' : 'opacity-40'}`}
                >
                  <span className="flex shrink-0 items-center">
                    <Avatar name={fullName(d.from)} color={color(d.from)} photoURL={photo(d.from)} size={28} />
                    <span className="-ml-1.5">
                      <Avatar name={fullName(d.to)} color={color(d.to)} photoURL={photo(d.to)} size={28} ring />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className={`block truncate text-sm font-semibold ${d.from === me ? 'neg' : ''}`}>{name(d.from)}</span>
                    <span className="text-muted flex min-w-0 items-center gap-1 text-xs">
                      <ArrowRight size={12} className="shrink-0" aria-label="pays" />
                      <span className={`truncate font-medium ${d.to === me ? 'pos' : ''}`}>{name(d.to)}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm font-bold tabular-nums">{money(d.amount)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )

  function focusCard() {
    const settleLink = (d: Debt) => `/groups/${group.id}/settle?from=${d.from}&to=${d.to}&amount=${d.amount}`
    let title: ReactNode
    let detail: ReactNode
    let mineDebts: Debt[] = []
    if (focusFlow) {
      title = (
        <>
          <span className="truncate">{name(focusFlow.from)}</span>
          <ArrowRight size={14} className="shrink-0 text-slate-400" aria-label="pays" />
          <span className="truncate">{name(focusFlow.to)}</span>
        </>
      )
      detail = <span className="font-bold tabular-nums">{money(focusFlow.amount)}</span>
      if (touchesMe(focusFlow)) mineDebts = [focusFlow]
    } else if (focusPerson) {
      const v = net.get(focusPerson) ?? 0
      title = <span className="truncate">{name(focusPerson)}</span>
      detail = v ? (
        <span className={`tabular-nums ${v > 0 ? 'pos' : 'neg'}`}>
          {v > 0 ? (focusPerson === me ? 'get back ' : 'gets back ') : focusPerson === me ? 'owe ' : 'owes '}
          <b>{money(Math.abs(v))}</b>
        </span>
      ) : (
        <span className="text-muted">settled</span>
      )
      mineDebts = focusPerson === me ? mine : flows.filter((d) => (d.from === me && d.to === focusPerson) || (d.to === me && d.from === focusPerson))
    }
    return (
      <div className="dg-rise mt-3 rounded-2xl bg-slate-50 p-3 dark:bg-ink-800/70">
        <div className="flex items-start gap-2">
          <div className="flex-auto">
            <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">{title}</div>
            <div className="mt-0.5 text-sm">{detail}</div>
          </div>
          <button
            type="button"
            onClick={() => setFocus(null)}
            className="-m-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400"
            aria-label="Clear focus"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        {mineDebts.slice(0, 3).map((d) => (
          <Link key={flowKey(d)} to={settleLink(d)} className="btn-primary mt-2 !min-h-10 w-full !py-2 text-sm">
            <span className="truncate">{d.from === me ? `Pay ${name(d.to)} ${money(d.amount)}` : `Record ${name(d.from)}’s ${money(d.amount)}`}</span>
          </Link>
        ))}
      </div>
    )
  }
}
