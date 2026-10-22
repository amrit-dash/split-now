import { type ReactNode, useEffect, useId, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useMotion } from '@/hooks/useMotion'
import { usePro } from '@/hooks/usePro'
import { activeMotion } from '@/lib/motion'
import { proMarkLabel, proTapTarget } from '@/lib/pro'
import { PRO_MASK, PRO_RATIO } from '@/lib/pro-glyph'
import { proRing, proTileRing, type RingArt, tileRingLength } from '@/lib/pro-ring'
import { mayRestart, PASS_MS, passTravel, type ShimmerKind, type ShimmerPass, shimmerPlan, shimmerTail } from '@/lib/pro-shimmer'

/*
 * The Pro badge (docs/PENDING.md, src/lib/pro.ts): the word PRO in the accent gradient, as a pill
 * beside a name or bent into a ring around a photo or a 1:1's tile. Geometry and timing are pure
 * and tested (src/lib/pro-ring.ts, pro-shimmer.ts); this file only draws and runs them.
 * Settings → Animations → Pro badge, the master switch and the device's reduce-motion setting
 * still the shine and the turning; the badges stay, still.
 */

/** Whether the badges move right now. */
function useProMoving(): boolean {
  const { prefs, reduced } = useMotion()
  return activeMotion(prefs, reduced).pro
}

/* ---------------------------------------------------------------- the one shared clock
 * Every PRO on screen catches the light at the same moment: one schedule for the app, which the
 * shining words subscribe to. A screen that shows a badge starts the opening round again, at most
 * once a minute (mayRestart); with no badge on screen nothing is scheduled. */

const listeners = new Set<(kind: ShimmerKind) => void>()
let timers: ReturnType<typeof setTimeout>[] = []
let lastRound: number | null = null

function clearTimers() {
  for (const t of timers) clearTimeout(t)
  timers = []
}
function run(plan: ShimmerPass[]) {
  clearTimers()
  for (const p of plan)
    timers.push(
      setTimeout(() => {
        for (const fn of listeners) fn(p.kind)
      }, p.at),
    )
  // When this plan runs out, the slow tail carries on (20–40 s apart).
  const end = plan.length ? plan[plan.length - 1].at : 0
  timers.push(setTimeout(() => run(shimmerTail(Math.random)), end + 1))
}
function subscribeShimmer(fn: (kind: ShimmerKind) => void): () => void {
  listeners.add(fn)
  const now = Date.now()
  if (mayRestart(lastRound, now)) {
    lastRound = now
    run(shimmerPlan(Math.random))
  } else if (!timers.length) {
    run(shimmerTail(Math.random))
  }
  return () => {
    listeners.delete(fn)
    if (!listeners.size) clearTimers()
  }
}

/* ---------------------------------------------------------------- the word */

/**
 * PRO, `h` px tall, in the accent gradient. Moving: the colours flow slowly inside the letters
 * and light passes on the shared clock. Decorative (aria-hidden): its holder names it.
 */
export function ProWord({ h, className = '' }: { h: number; className?: string }) {
  const moving = useProMoving()
  const sweep = useRef<HTMLSpanElement>(null)
  const glint = useRef<HTMLSpanElement>(null)
  // The flow starts where every other badge's flow is, so they move as one.
  const phase = useMemo(() => -(Math.round(typeof performance === 'undefined' ? 0 : performance.now()) % 9000), [])
  useEffect(() => {
    if (!moving) return
    return subscribeShimmer((kind) => {
      const el = kind === 'sweep' ? sweep.current : glint.current
      if (!el?.animate) return
      const [from, to] = passTravel(kind)
      el.animate(
        [
          { transform: `translateX(${from})`, opacity: 1 },
          { transform: `translateX(${to})`, opacity: 1 },
        ],
        { duration: PASS_MS[kind], easing: 'cubic-bezier(.4,0,.2,1)' },
      )
    })
  }, [moving])
  return (
    <span
      aria-hidden
      className={`pro-art pro-word ${moving ? '' : 'pro-still'} ${className}`}
      style={{ height: h, width: h * PRO_RATIO, '--pro-mask': PRO_MASK } as React.CSSProperties}
    >
      <span className="pro-flow" style={{ animationDelay: `${phase}ms` }} />
      {moving && (
        <>
          <span ref={sweep} className="pro-pass pro-sweep" />
          <span ref={glint} className="pro-pass pro-glint" />
        </>
      )}
    </span>
  )
}

/** PRO on a soft accent pill, sized to sit inline with a name (`h` = letter height: 12 Profile, 9 Members, 7 list lines). */
export function ProPill({ h, className = '' }: { h: number; className?: string }) {
  return (
    <span className={`pro-pill ${className}`} style={{ padding: `${(h * 0.42).toFixed(1)}px ${(h * 0.78).toFixed(1)}px` }}>
      <ProWord h={h} />
    </span>
  )
}

/**
 * Someone else's mark: for a viewer who hasn't earned Pro, a link to Help → Earn Pro; for one who
 * has, just the mark (src/lib/pro.ts proTapTarget). `className` sizes the tap area.
 */
export function ProTap({ children, className = '', testId }: { children: ReactNode; className?: string; testId?: string }) {
  const { earned } = usePro()
  const to = proTapTarget(earned)
  if (!to)
    return (
      <span className={className} data-testid={testId}>
        {children}
        <span className="sr-only">{proMarkLabel(false)}</span>
      </span>
    )
  return (
    <Link to={to} aria-label={proMarkLabel(true)} className={`transition active:scale-95 ${className}`} data-testid={testId}>
      {children}
    </Link>
  )
}

/* ---------------------------------------------------------------- the rings */

function RingSvg({ art, spin, gradientId, paths }: { art: RingArt; spin?: boolean; gradientId: string; paths?: (el: SVGGElement | null) => void }) {
  const half = art.size / 2
  return (
    <svg
      aria-hidden
      focusable="false"
      width={art.size}
      height={art.size}
      viewBox={`${-half} ${-half} ${art.size} ${art.size}`}
      className={`pro-art pointer-events-none absolute left-1/2 top-1/2 overflow-visible ${spin ? 'pro-spin' : ''}`}
      style={{ marginLeft: -half, marginTop: -half }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--pro-from)' }} />
          <stop offset="1" style={{ stopColor: 'var(--pro-to)' }} />
        </linearGradient>
      </defs>
      <g fill={`url(#${gradientId})`} ref={paths}>
        {art.words.map((d, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the words are positions on the ring; the count only changes with the size
          <path key={i} d={d} />
        ))}
        {art.dots.map((c, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: as above
          <circle key={`d${i}`} cx={c.x} cy={c.y} r={c.r} />
        ))}
      </g>
    </svg>
  )
}

const gid = (raw: string) => `pro${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`

/**
 * ・PRO・PRO・ bent around a round photo `photo` px across, turning once every 40 s. Wraps the
 * photo; the ring sits outside it without taking space (the holder keeps room around it).
 */
export function ProRing({ photo, children }: { photo: number; children: ReactNode }) {
  const moving = useProMoving()
  const art = useMemo(() => proRing(photo), [photo])
  const id = gid(useId())
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: photo, height: photo }}>
      {children}
      <RingSvg art={art} spin={moving} gradientId={id} />
    </span>
  )
}

/** The rounded square ring's trip round the tile, ms: as slow as the round ring. */
const TILE_LOOP_MS = 40_000

/**
 * The same ring along a 1:1's rounded tile (`tile` px, corner `radius`). A square can't simply be
 * rotated, so the words travel along the outline: their start moves round once every 40 s and the
 * paths are re-bent in place (a few times a second's worth of change, no React render).
 */
export function ProTileRing({ tile, radius, children }: { tile: number; radius: number; children: ReactNode }) {
  const moving = useProMoving()
  const art = useMemo(() => proTileRing(tile, radius), [tile, radius])
  const id = gid(useId())
  const group = useRef<SVGGElement | null>(null)
  useEffect(() => {
    if (!moving || typeof requestAnimationFrame === 'undefined') return
    const g = group.current
    if (!g) return
    const words = [...g.querySelectorAll('path')]
    const dots = [...g.querySelectorAll('circle')]
    const perimeter = tileRingLength(tile, radius)
    const t0 = performance.now()
    let shown = 0
    let raf = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const offset = (((now - t0) % TILE_LOOP_MS) / TILE_LOOP_MS) * perimeter
      // Only when it has moved enough to see (about a third of a pixel).
      if (Math.abs(offset - shown) < 0.33 && offset >= shown) return
      shown = offset
      const moved = proTileRing(tile, radius, offset)
      moved.words.forEach((d, i) => {
        words[i]?.setAttribute('d', d)
      })
      moved.dots.forEach((c, i) => {
        dots[i]?.setAttribute('cx', String(c.x))
        dots[i]?.setAttribute('cy', String(c.y))
      })
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [moving, tile, radius])
  return (
    <span className="relative inline-flex shrink-0" style={{ width: tile, height: tile }}>
      {children}
      <RingSvg
        art={art}
        gradientId={id}
        paths={(el) => {
          group.current = el
        }}
      />
    </span>
  )
}
