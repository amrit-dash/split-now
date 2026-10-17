import { type CSSProperties, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { StoryKind } from '@/lib/help'

/**
 * The explainers' pictures in Help (src/lib/help-content.ts `story`): an everyday picture of how a
 * part of Split Now thinks, drawn on a small lit stage. `beat` is the caption being read; each beat
 * plays its own motion (coins arc along paths, arrows draw themselves, amounts count, a beam springs
 * and settles) and the stage breathes a little while it waits. Everything uses the accent's colours,
 * so it follows the person's accent and dark mode. `still` (reduced motion, or animations off) shows
 * each beat's finished picture: every keyframe ends on the element's own style (index.css, sx-*).
 * Purely a picture: hidden from screen readers, which read the captions beside it.
 */
export function Story({ kind, beat, still }: { kind: StoryKind; beat: number; still: boolean }) {
  const View = VIEWS[kind]
  return (
    <Stage still={still} beat={beat}>
      {/* Keyed by beat: each caption replays its own entrances. */}
      <View key={beat} beat={beat} still={still} />
    </Stage>
  )
}

type View = (p: { beat: number; still: boolean }) => ReactNode

// The stage is drawn at a fixed size and scaled to fit, so motion paths (in px) line up at any width.
const W = 360
const H = 240

function Stage({ still, beat, children }: { still: boolean; beat: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(0.85)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const resize = () => setK(el.clientWidth / W)
    resize()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])
  return (
    <div
      ref={box}
      className="relative mx-auto w-full max-w-sm select-none overflow-hidden rounded-[1.75rem] bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] ring-1 ring-brand-100 dark:bg-ink-950/70 dark:shadow-none dark:ring-white/5"
      style={{ aspectRatio: `${W} / ${H}` }}
      aria-hidden
      data-testid="help-story"
      data-beat={beat}
    >
      <div className={`absolute left-0 top-0 ${still ? 'sx-still' : ''}`} style={{ width: W, height: H, transform: `scale(${k})`, transformOrigin: '0 0' }}>
        {/* The light behind the picture: two slow-drifting glows in the accent's colours and a faint dot grid. */}
        <div
          className="absolute -left-10 -top-12 h-44 w-44 rounded-full bg-brand-400/25 blur-3xl dark:bg-brand-500/20"
          style={ambient('sx-drift 9s ease-in-out infinite')}
        />
        <div
          className="absolute -bottom-16 -right-8 h-48 w-48 rounded-full bg-duo-400/25 blur-3xl dark:bg-duo-500/15"
          style={ambient('sx-drift 11s ease-in-out -4s infinite reverse')}
        />
        <svg className="absolute inset-0 text-brand-300/40 dark:text-white/[0.06]" width={W} height={H} aria-hidden>
          <defs>
            <pattern id="sx-dots" width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="currentColor" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#sx-dots)" />
        </svg>
        {children}
      </div>
    </div>
  )
}

const ambient = (animation: string): CSSProperties => ({ animation })

// ---- Shared parts ------------------------------------------------------------------------------

/** Something placed by its centre, in stage px. */
function At({ x, y, children, style, className = '' }: { x: number; y: number; children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div className={`absolute -translate-x-1/2 -translate-y-1/2 ${className}`} style={{ left: x, top: y, ...style }}>
      {children}
    </div>
  )
}

/** An entrance: pops (with a little overshoot) or rises in, after `d` ms. */
const pop = (d = 0, ms = 520): CSSProperties => ({ animation: `sx-pop ${ms}ms cubic-bezier(0.34, 1.56, 0.64, 1) ${d}ms both` })
const rise = (d = 0, ms = 520): CSSProperties => ({ animation: `sx-in ${ms}ms cubic-bezier(0.2, 0.9, 0.3, 1) ${d}ms both` })
const out = (d = 0, ms = 400): CSSProperties => ({ opacity: 0, animation: `sx-out ${ms}ms ease ${d}ms both` })

/**
 * Something that travels along a path (stage px) and stays where it lands, or vanishes there.
 * Its centre follows the path; it keeps upright.
 */
function Fly({ path, d = 0, ms = 1000, vanish, children }: { path: string; d?: number; ms?: number; vanish?: boolean; children: ReactNode }) {
  return (
    <div
      className="absolute left-0 top-0"
      style={{
        offsetPath: `path('${path}')`,
        offsetRotate: '0deg',
        offsetAnchor: '50% 50%',
        offsetDistance: '100%',
        opacity: vanish ? 0 : 1,
        animation: `${vanish ? 'sx-fly-vanish' : 'sx-fly'} ${ms}ms cubic-bezier(0.45, 0.05, 0.25, 1) ${d}ms both`,
      }}
    >
      {children}
    </div>
  )
}

const PEOPLE: Record<string, { from: string; to: string }> = {
  Asha: { from: 'var(--color-brand-400)', to: 'var(--color-brand-700)' },
  Ravi: { from: 'var(--color-duo-400)', to: 'var(--color-duo-700)' },
  Meera: { from: 'var(--color-brand-300)', to: 'var(--color-duo-500)' },
  Kabir: { from: 'var(--color-duo-300)', to: 'var(--color-brand-600)' },
}

/** A person as the app draws them: initials on their colour, with a soft ring, breathing a little. */
function Person({ name, size = 40, label = true }: { name: string; size?: number; label?: boolean }) {
  const c = PEOPLE[name] ?? PEOPLE.Asha
  return (
    <div className="flex flex-col items-center gap-1" style={ambient(`sx-breathe 3.2s ease-in-out ${(name.length % 4) * -0.7}s infinite`)}>
      <div
        className="flex items-center justify-center rounded-full font-bold text-white shadow-[0_6px_16px_-6px_rgba(76,29,149,0.55)] ring-[3px] ring-white dark:ring-ink-900"
        style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(140deg, ${c.from}, ${c.to})` }}
      >
        {name.slice(0, 1)}
      </div>
      {label && <div className="text-[11px] font-semibold leading-none text-slate-600 dark:text-slate-300">{name}</div>}
    </div>
  )
}

/** A rupee coin with a rim and a shine; `spin` turns it while it flies. */
function Coin({ label = '₹', size = 26, spin }: { label?: string; size?: number; spin?: boolean }) {
  return (
    <div
      className="flex items-center justify-center rounded-full font-extrabold text-amber-900 shadow-[0_4px_10px_-3px_rgba(180,83,9,0.6)]"
      style={{
        width: size,
        height: size,
        fontSize: label.length > 2 ? size * 0.3 : size * 0.42,
        background: 'radial-gradient(circle at 32% 28%, #fff7d1 0%, #fcd34d 32%, #f59e0b 70%, #b45309 100%)',
        boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.45), inset 0 -2px 0 rgba(146,64,14,0.35), 0 4px 10px -3px rgba(180,83,9,0.6)',
        animation: spin ? 'sx-spin-y 0.55s linear infinite' : undefined,
      }}
    >
      {label}
    </div>
  )
}

type Tone = 'up' | 'down' | 'even' | 'accent'
const TONES: Record<Tone, string> = {
  up: 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300',
  down: 'bg-rose-500/15 text-rose-700 ring-rose-500/30 dark:text-rose-300',
  even: 'bg-white/80 text-slate-600 ring-slate-200 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10',
  accent: 'bg-fill text-on-fill ring-transparent',
}

function Pill({ children, tone = 'even', style }: { children: ReactNode; tone?: Tone; style?: CSSProperties }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums ring-1 backdrop-blur ${TONES[tone]}`}
      style={style}
    >
      {children}
    </span>
  )
}

/** An amount that counts from `from` to `to`, easing out, when its beat starts (each beat remounts its view). */
function Count({
  from,
  to,
  still,
  ms = 900,
  d = 0,
  format = (n: number) => `₹${n.toLocaleString('en-IN')}`,
}: {
  from: number
  to: number
  still: boolean
  ms?: number
  d?: number
  format?: (n: number) => string
}) {
  const [v, setV] = useState(still ? to : from)
  useEffect(() => {
    if (still) return setV(to)
    const start = performance.now() + d
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - start) / ms))
      setV(Math.round(from + (to - from) * (1 - (1 - k) ** 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [from, to, still, ms, d])
  return <>{format(v)}</>
}

/** A little burst of four-pointed stars, for the moment something comes out square. */
function Sparkles({ x, y, d = 0, spread = 46 }: { x: number; y: number; d?: number; spread?: number }) {
  const stars = [
    [-1, -0.6, 14],
    [0.9, -0.8, 11],
    [1.1, 0.4, 9],
    [-0.8, 0.7, 10],
    [0.1, -1.1, 8],
    [-1.2, 0, 7],
  ]
  return (
    <>
      {stars.map(([dx, dy, s], i) => (
        <At key={`${dx}${dy}`} x={x + dx * spread} y={y + dy * spread}>
          <svg width={s * 2} height={s * 2} viewBox="-10 -10 20 20" style={{ opacity: 0, animation: `sx-sparkle 900ms ease-out ${d + i * 70}ms both` }}>
            <path d="M0,-10 C1.5,-2 2,-1.5 10,0 C2,1.5 1.5,2 0,10 C-1.5,2 -2,1.5 -10,0 C-2,-1.5 -1.5,-2 0,-10 Z" style={{ fill: 'var(--color-duo-400)' }} />
          </svg>
        </At>
      ))}
    </>
  )
}

/** Gradients and shadows the drawings share; ids are made unique per picture. */
function useIds() {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '')
  return (name: string) => `sx${raw}${name}`
}

// ---- What Split Now does: a shared jar ---------------------------------------------------------------

const JAR = 'M152,34 L208,34 L208,44 C208,52 232,54 232,68 L232,122 Q232,140 214,140 L146,140 Q128,140 128,122 L128,68 C128,54 152,52 152,44 Z'
const SEATS = { Asha: { x: 56, y: 178 }, Ravi: { x: 180, y: 178 }, Meera: { x: 304, y: 178 } } as const

const Pot: View = ({ beat, still }) => {
  const id = useIds()
  // How full the jar is at the end of this beat (it fills on the first, drains on the last).
  const full = beat < 3
  const liquidStyle: CSSProperties =
    beat === 0
      ? { transform: 'translateY(0)', animation: 'sx-rise 1100ms cubic-bezier(0.3, 0.9, 0.3, 1) 900ms both' }
      : beat === 3
        ? { transform: 'translateY(84px)', animation: 'sx-drain 1200ms cubic-bezier(0.5, 0, 0.3, 1) 1100ms both' }
        : { transform: full ? 'translateY(0)' : 'translateY(84px)' }
  return (
    <>
      <svg className="absolute inset-0" width={W} height={H}>
        <defs>
          <linearGradient id={id('liquid')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--color-brand-400)' }} />
            <stop offset="1" style={{ stopColor: 'var(--color-duo-600)' }} />
          </linearGradient>
          <linearGradient id={id('glass')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.12" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.35" />
          </linearGradient>
          <linearGradient id={id('lid')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--color-brand-300)' }} />
            <stop offset="1" style={{ stopColor: 'var(--color-brand-600)' }} />
          </linearGradient>
          <clipPath id={id('in')}>
            <path d={JAR} />
          </clipPath>
        </defs>
        {/* a soft shadow under the jar */}
        <ellipse cx="180" cy="146" rx="62" ry="6" className="fill-brand-900/15 dark:fill-black/40" />
        <path d={JAR} fill={`url(#${id('glass')})`} className="stroke-brand-200 dark:stroke-white/20" strokeWidth="2" />
        <g clipPath={`url(#${id('in')})`}>
          <g style={liquidStyle}>
            {/* the surface rolls gently */}
            <path
              d="M100,66 q13,-7 26,0 t26,0 t26,0 t26,0 t26,0 t26,0 t26,0 v90 h-182 z"
              fill={`url(#${id('liquid')})`}
              opacity="0.92"
              style={ambient('sx-wave 2.8s linear infinite')}
            />
          </g>
          {/* three shares, marked in the liquid */}
          {beat >= 1 && beat <= 2 && (
            <g className="stroke-white/70" strokeWidth="1.5" strokeDasharray="4 4" style={rise(100)}>
              <line x1="163" y1="72" x2="163" y2="140" />
              <line x1="197" y1="72" x2="197" y2="140" />
            </g>
          )}
        </g>
        {/* the glass shine, over everything inside */}
        <path d="M139,72 C136,90 136,108 141,126" fill="none" stroke="#fff" strokeOpacity="0.75" strokeWidth="4" strokeLinecap="round" />
        <path d="M146,62 L146,66" fill="none" stroke="#fff" strokeOpacity="0.75" strokeWidth="4" strokeLinecap="round" />
        <rect x="146" y="20" width="68" height="16" rx="5" fill={`url(#${id('lid')})`} />
        <rect x="150" y="23" width="40" height="3" rx="1.5" fill="#fff" opacity="0.45" />
      </svg>
      {/* what's in the jar */}
      <At x={180} y={102}>
        <div className={`text-center text-[22px] font-black tabular-nums drop-shadow-sm ${beat === 3 ? 'text-slate-400 dark:text-slate-500' : 'text-white'}`}>
          {beat === 0 ? (
            <Count from={0} to={900} still={still} d={900} ms={1100} />
          ) : beat === 3 ? (
            <Count from={900} to={0} still={still} d={1100} ms={1200} />
          ) : (
            '₹900'
          )}
        </div>
      </At>
      {beat >= 1 &&
        beat <= 2 &&
        [146, 180, 214].map((x, i) => (
          <At key={x} x={x} y={127} style={rise(150 + i * 90)}>
            <span className="text-[10px] font-bold text-white/90">₹300</span>
          </At>
        ))}
      {/* the people around the jar */}
      {(Object.keys(SEATS) as Array<keyof typeof SEATS>).map((n) => (
        <At key={n} x={SEATS[n].x} y={SEATS[n].y}>
          <Person name={n} />
        </At>
      ))}
      {/* beat 1: Asha's ₹900 arcs into the jar */}
      {beat === 0 && (
        <Fly path="M56,160 Q72,0 180,24 L180,92" ms={1100} d={150} vanish>
          <Coin label="₹900" size={34} spin />
        </Fly>
      )}
      {/* beat 2: a ₹300 share flies to each person */}
      {beat === 1 &&
        (Object.keys(SEATS) as Array<keyof typeof SEATS>).map((n, i) => (
          <Fly key={n} path={`M180,110 Q${(180 + SEATS[n].x) / 2},${n === 'Ravi' ? 150 : 60} ${SEATS[n].x},222`} ms={900} d={500 + i * 160}>
            <Pill tone="accent">₹300 share</Pill>
          </Fly>
        ))}
      {/* beat 3: what each one owes, or is owed */}
      {beat === 2 && (
        <>
          <At x={SEATS.Asha.x} y={222} style={pop(100)}>
            <Pill tone="up">
              owed <Count from={0} to={600} still={still} d={150} />
            </Pill>
          </At>
          <At x={SEATS.Ravi.x} y={222} style={pop(220)}>
            <Pill tone="down">
              owes <Count from={0} to={300} still={still} d={260} />
            </Pill>
          </At>
          <At x={SEATS.Meera.x} y={222} style={pop(340)}>
            <Pill tone="down">
              owes <Count from={0} to={300} still={still} d={380} />
            </Pill>
          </At>
        </>
      )}
      {/* beat 4: they pay Asha back, the jar empties, everyone is square */}
      {beat === 3 && (
        <>
          <Fly path="M180,170 Q118,96 56,160" ms={950} d={150} vanish>
            <Coin label="₹300" size={30} spin />
          </Fly>
          <Fly path="M304,170 Q180,-30 56,160" ms={1150} d={420} vanish>
            <Coin label="₹300" size={30} spin />
          </Fly>
          {(Object.keys(SEATS) as Array<keyof typeof SEATS>).map((n, i) => (
            <At key={n} x={SEATS[n].x} y={222} style={pop(1500 + i * 120)}>
              <Pill tone="up">✓ square</Pill>
            </At>
          ))}
          <Sparkles x={180} y={80} d={1700} spread={58} />
        </>
      )}
    </>
  )
}

// ---- How balances work: a balance beam ----------------------------------------------------------------

const PIVOT = { x: 180, y: 150 }

/** Turns with the beam (around the pivot) and plays its spring; `counter` keeps a rider upright. */
function beamTurn(beat: number, counter = false): CSSProperties {
  const c = counter ? '-c' : ''
  if (beat === 1) return { transform: `rotate(${counter ? -11 : 11}deg)`, animation: `sx-tip${c} 1500ms cubic-bezier(0.3, 0.7, 0.4, 1) 700ms both` }
  if (beat === 2) return { transform: 'rotate(0deg)', animation: `sx-level${c} 1500ms cubic-bezier(0.3, 0.7, 0.4, 1) 1300ms both` }
  return { transform: 'rotate(0deg)' }
}

/** Someone riding the beam at `x` (stage px), kept upright while it tips. */
function Rider({ x, beat, children }: { x: number; beat: number; children: ReactNode }) {
  return (
    <div className="absolute" style={{ left: x - 30, top: PIVOT.y - 78, width: 60, height: 78, transformOrigin: '30px 78px', ...beamTurn(beat, true) }}>
      <div className="flex h-full flex-col items-center justify-end pb-2">{children}</div>
    </div>
  )
}

const Seesaw: View = ({ beat, still }) => {
  const id = useIds()
  const caption = beat === 0 ? 'Level · nobody owes' : beat === 1 ? 'Asha paid ₹900 for three' : 'Paid back · level again'
  return (
    <>
      <At x={180} y={22} style={pop(0)}>
        <Pill tone={beat === 2 ? 'up' : 'even'}>
          {beat === 2 ? '✓ ' : ''}
          {caption}
        </Pill>
      </At>
      {/* the stand */}
      <svg className="absolute inset-0" width={W} height={H}>
        <defs>
          <linearGradient id={id('stand')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--color-brand-300)' }} />
            <stop offset="1" style={{ stopColor: 'var(--color-brand-700)' }} />
          </linearGradient>
        </defs>
        <ellipse cx="180" cy="214" rx="70" ry="5" className="fill-brand-900/15 dark:fill-black/40" />
        <path d="M180,150 L213,204 Q216,209 210,209 L150,209 Q144,209 147,204 Z" fill={`url(#${id('stand')})`} />
        <path d="M180,158 L196,184" stroke="#fff" strokeOpacity="0.35" strokeWidth="3" strokeLinecap="round" />
        {beat === 2 && (
          <circle
            cx="180"
            cy="150"
            r="16"
            fill="none"
            className="stroke-emerald-400"
            strokeWidth="2"
            style={{ opacity: 0, transformBox: 'fill-box', transformOrigin: 'center', animation: 'sx-ring 900ms ease-out 2300ms both' }}
          />
        )}
      </svg>
      {/* the beam, with a spirit level in the middle, turning on the pivot */}
      <div className="absolute left-0 top-0" style={{ width: W, height: H, transformOrigin: `${PIVOT.x}px ${PIVOT.y}px`, ...beamTurn(beat) }}>
        <svg className="absolute inset-0 overflow-visible" width={W} height={H}>
          <defs>
            <linearGradient id={id('beam')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--color-brand-400)' }} />
              <stop offset="1" style={{ stopColor: 'var(--color-duo-600)' }} />
            </linearGradient>
          </defs>
          <rect x="30" y="144" width="300" height="12" rx="6" fill={`url(#${id('beam')})`} className="drop-shadow" />
          <rect x="36" y="146" width="288" height="3" rx="1.5" fill="#fff" opacity="0.35" />
          <rect x="160" y="133" width="40" height="11" rx="5.5" className="fill-white/85 stroke-brand-200 dark:fill-ink-800 dark:stroke-white/10" />
          <circle
            cx="180"
            cy="138.5"
            r="3.6"
            className="fill-emerald-400"
            style={
              beat === 1
                ? { transform: 'translateX(-12px)', animation: 'sx-bubble 1200ms ease-out 900ms both' }
                : beat === 2
                  ? { transform: 'translateX(0)', animation: 'sx-bubble 1200ms ease-out 1400ms both' }
                  : undefined
            }
          />
          {/* the ₹300 each Ravi and Meera owe, hanging off their end */}
          {beat === 1 &&
            [272, 314].map((x, i) => (
              <g key={x} style={{ animation: `sx-drop 800ms cubic-bezier(0.3, 0.8, 0.4, 1) ${200 + i * 180}ms both` }}>
                <line x1={x} y1="156" x2={x} y2="172" className="stroke-slate-400" strokeWidth="1.5" />
                <path
                  d={`M${x - 14},176 Q${x - 14},172 ${x - 10},172 L${x + 10},172 Q${x + 14},172 ${x + 14},176 L${x + 17},196 Q${x + 18},200 ${x + 13},200 L${x - 13},200 Q${x - 18},200 ${x - 17},196 Z`}
                  className="fill-slate-700 dark:fill-slate-500"
                />
                <text x={x} y="191" textAnchor="middle" className="fill-white text-[9px] font-bold">
                  ₹300
                </text>
              </g>
            ))}
          {beat === 2 &&
            [272, 314].map((x, i) => (
              <g key={x} style={{ opacity: 0, transform: 'translateY(-40px)', animation: `sx-lift 700ms ease-in ${300 + i * 150}ms both` }}>
                <line x1={x} y1="156" x2={x} y2="172" className="stroke-slate-400" strokeWidth="1.5" />
                <path
                  d={`M${x - 14},176 Q${x - 14},172 ${x - 10},172 L${x + 10},172 Q${x + 14},172 ${x + 14},176 L${x + 17},196 Q${x + 18},200 ${x + 13},200 L${x - 13},200 Q${x - 18},200 ${x - 17},196 Z`}
                  className="fill-slate-700 dark:fill-slate-500"
                />
              </g>
            ))}
        </svg>
        <Rider x={58} beat={beat}>
          {beat === 1 && (
            <div className="mb-1" style={pop(1500)}>
              <Pill tone="up">
                owed <Count from={0} to={600} still={still} d={1550} />
              </Pill>
            </div>
          )}
          <Person name="Asha" size={36} />
        </Rider>
        <Rider x={262} beat={beat}>
          <Person name="Ravi" size={34} />
        </Rider>
        <Rider x={310} beat={beat}>
          <Person name="Meera" size={34} />
        </Rider>
      </div>
      {beat === 1 && (
        <At x={290} y={64} style={pop(1700)}>
          <Pill tone="down">owe ₹300 each</Pill>
        </At>
      )}
      {/* paying back: coins arc from Ravi and Meera to Asha */}
      {beat === 2 && (
        <>
          <Fly path="M262,120 Q160,30 60,98" ms={1000} d={200} vanish>
            <Coin label="₹300" size={28} spin />
          </Fly>
          <Fly path="M310,120 Q180,0 60,98" ms={1150} d={420} vanish>
            <Coin label="₹300" size={28} spin />
          </Fly>
          <Sparkles x={180} y={150} d={2400} spread={40} />
        </>
      )}
    </>
  )
}

// ---- Fewer payments: untangling -------------------------------------------------------------------

const NODES = [
  { name: 'Asha', x: 64, y: 64, net: 500 },
  { name: 'Ravi', x: 296, y: 64, net: -200 },
  { name: 'Meera', x: 296, y: 182, net: -400 },
  { name: 'Kabir', x: 64, y: 182, net: 100 },
]
// What was paid along the way (from → to, bend), and what Simplify debts suggests instead:
// Meera → Asha ₹400, Ravi → Asha ₹100, Ravi → Kabir ₹100. Everyone's balance stays the same.
const TANGLE: Array<[number, number, number]> = [
  [1, 0, 26],
  [2, 0, -34],
  [2, 1, 22],
  [3, 2, -22],
  [1, 3, 30],
  [0, 3, 24],
]
const SIMPLE: Array<[number, number, string]> = [
  [2, 0, '₹400'],
  [1, 0, '₹100'],
  [1, 3, '₹100'],
]

/** A curved arrow between two people: stops short of both, bending by `bend` px. */
function arc(f: number, t: number, bend: number) {
  const a = NODES[f]
  const b = NODES[t]
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  const x1 = a.x + ux * 30
  const y1 = a.y + uy * 30
  const x2 = b.x - ux * 32
  const y2 = b.y - uy * 32
  const cx = (x1 + x2) / 2 - uy * bend
  const cy = (y1 + y2) / 2 + ux * bend
  const at = (k: number) => ({ x: (1 - k) ** 2 * x1 + 2 * (1 - k) * k * cx + k * k * x2, y: (1 - k) ** 2 * y1 + 2 * (1 - k) * k * cy + k * k * y2 })
  // the direction the line arrives in, for its arrowhead
  const angle = (Math.atan2(y2 - cy, x2 - cx) * 180) / Math.PI
  return { d: `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`, at, end: { x: x2, y: y2 }, angle }
}

/** An arrowhead at the end of a line, popping in once the line has drawn (`d` ms). */
function Head({ x, y, angle, d, color, size = 1 }: { x: number; y: number; angle: number; d: number; color: string; size?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${size})`}>
      <path
        d="M-8,-5.5 L3,0 L-8,5.5 Q-5,0 -8,-5.5 Z"
        style={{ fill: color, transformBox: 'fill-box', transformOrigin: 'center', animation: `sx-pop 260ms ease-out ${d}ms both` }}
      />
    </g>
  )
}

const Untangle: View = ({ beat, still }) => {
  const id = useIds()
  return (
    <>
      <svg className="absolute inset-0" width={W} height={H}>
        <defs>
          {/* measured on the stage, not each line's box: a level line has no height, and its gradient would paint nothing */}
          <linearGradient id={id('line')} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2={H}>
            <stop offset="0" style={{ stopColor: 'var(--color-brand-400)' }} />
            <stop offset="1" style={{ stopColor: 'var(--color-duo-500)' }} />
          </linearGradient>
        </defs>
        {/* beat 1: everyone paid everyone along the way, a tangle of six payments */}
        {beat === 0 &&
          TANGLE.map(([f, t, bend], i) => {
            const a = arc(f, t, bend)
            return (
              <g key={`${f}${t}`}>
                <path
                  d={a.d}
                  pathLength={1}
                  fill="none"
                  strokeWidth="2"
                  strokeLinecap="round"
                  style={{ stroke: 'var(--color-brand-400)', strokeDasharray: 1, animation: `sx-draw 700ms ease-out ${150 + i * 170}ms both` }}
                />
                <Head {...a.end} angle={a.angle} d={820 + i * 170} color="var(--color-brand-400)" />
              </g>
            )
          })}
        {/* beat 2: the tangle melts away into what each person comes out at */}
        {beat === 1 &&
          TANGLE.map(([f, t, bend]) => (
            <path key={`${f}${t}`} d={arc(f, t, bend).d} fill="none" strokeWidth="2" style={{ stroke: 'var(--color-brand-400)', ...out(0, 500) }} />
          ))}
        {beat >= 1 &&
          NODES.map((n, i) => (
            <circle
              key={n.name}
              cx={n.x}
              cy={n.y}
              r="26"
              fill="none"
              pathLength={1}
              className={n.net > 0 ? 'stroke-emerald-400' : 'stroke-rose-400'}
              strokeWidth="4"
              strokeLinecap="round"
              transform={`rotate(-90 ${n.x} ${n.y})`}
              style={{ strokeDasharray: `${Math.abs(n.net) / 500} 1`, animation: beat === 1 ? `sx-draw 900ms ease-out ${300 + i * 120}ms both` : undefined }}
            />
          ))}
        {/* beat 3: three payments, biggest debt to biggest credit */}
        {beat === 2 &&
          SIMPLE.map(([f, t], i) => {
            const a = arc(f, t, 0)
            return (
              <g key={`${f}${t}`}>
                <path
                  d={a.d}
                  pathLength={1}
                  fill="none"
                  stroke={`url(#${id('line')})`}
                  strokeWidth="4"
                  strokeLinecap="round"
                  style={{ strokeDasharray: 1, animation: `sx-draw 750ms cubic-bezier(0.5, 0, 0.2, 1) ${300 + i * 380}ms both` }}
                />
                <Head {...a.end} angle={a.angle} d={1020 + i * 380} color="var(--color-duo-500)" size={1.3} />
              </g>
            )
          })}
      </svg>
      {NODES.map((n, i) => (
        <At key={n.name} x={n.x} y={n.y}>
          <Person name={n.name} size={38} label={false} />
          {beat === 0 && (
            <div className="absolute left-1/2 top-[44px] -translate-x-1/2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">{n.name}</div>
          )}
          {beat >= 1 && (
            <div className="absolute left-1/2 top-[38px] -translate-x-1/2" style={beat === 1 ? pop(600 + i * 120) : undefined}>
              <Pill tone={n.net > 0 ? 'up' : 'down'}>
                {n.name} · {n.net > 0 ? 'owed ' : 'owes '}
                {beat === 1 ? <Count from={0} to={Math.abs(n.net)} still={still} d={650 + i * 120} /> : `₹${Math.abs(n.net)}`}
              </Pill>
            </div>
          )}
        </At>
      ))}
      {beat === 2 &&
        SIMPLE.map(([f, t, label], i) => {
          const p = arc(f, t, 0).at(f === 1 && t === 0 ? 0.5 : f === 1 ? 0.42 : 0.3)
          return (
            <At key={`${f}${t}`} x={p.x} y={p.y} style={pop(700 + i * 380)}>
              <Pill tone="accent">{label}</Pill>
            </At>
          )
        })}
      <At x={180} y={beat === 2 ? 212 : 124} style={pop(beat === 0 ? 1300 : beat === 1 ? 400 : 1600)}>
        <div className="rounded-2xl bg-white/90 px-3 py-2 text-center shadow-lg ring-1 ring-brand-100 backdrop-blur dark:bg-ink-900/90 dark:ring-white/10">
          <div className="text-[18px] font-black leading-none text-slate-800 tabular-nums dark:text-white">
            {beat === 0 ? '6' : beat === 1 ? '=' : <Count from={6} to={3} still={still} d={1700} ms={700} format={(n) => String(n)} />}
          </div>
          <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{beat === 1 ? 'overall' : 'payments'}</div>
        </div>
      </At>
      {beat === 2 && <Sparkles x={180} y={212} d={2000} spread={40} />}
    </>
  )
}

// ---- Splits add up: ₹100 three ways ------------------------------------------------------------------

const SLICES = [
  { name: 'Asha', x0: 30, dx: -16, rot: -5 },
  { name: 'Ravi', x0: 130, dx: 0, rot: 0 },
  { name: 'Meera', x0: 230, dx: 16, rot: 5 },
]

/** The note's paper: its border, guilloche lines and watermark. `face` adds the printed ₹100. */
function Banknote({ id, face }: { id: (n: string) => string; face?: CSSProperties }) {
  return (
    <>
      <rect x="30" y="38" width="300" height="104" rx="14" fill={`url(#${id('note')})`} className="stroke-brand-300 dark:stroke-brand-700" strokeWidth="1.5" />
      <rect x="40" y="48" width="280" height="84" rx="9" fill="none" className="stroke-brand-400/50" strokeDasharray="3 3" />
      {[0, 1, 2, 3].map((i) => (
        <path
          key={i}
          d={`M40,${70 + i * 12} q35,-12 70,0 t70,0 t70,0 t70,0`}
          fill="none"
          className="stroke-brand-300/40 dark:stroke-brand-500/25"
          strokeWidth="1"
        />
      ))}
      {face && (
        <g style={face}>
          <circle cx="276" cy="90" r="30" className="fill-white/50 stroke-brand-300/60 dark:fill-white/5" />
          <text x="276" y="96" textAnchor="middle" className="fill-brand-400 text-[16px] font-black">
            SN
          </text>
          <text x="56" y="104" className="fill-brand-700 text-[40px] font-black dark:fill-brand-200">
            ₹100
          </text>
          <text x="58" y="124" className="fill-brand-500 text-[8px] font-bold tracking-[0.3em] dark:fill-brand-300">
            ONE HUNDRED RUPEES
          </text>
        </g>
      )}
    </>
  )
}

const Remainder: View = ({ beat, still }) => {
  const id = useIds()
  const labels = beat === 0 ? ['33.333…', '33.333…', '33.333…'] : beat === 1 ? ['33.33', '33.33', '33.33'] : ['33.34', '33.33', '33.33']
  // The note tears a moment into the first beat; after that it stays in three.
  const torn = (i: number): CSSProperties => ({
    transformBox: 'fill-box',
    transformOrigin: 'center',
    transform: `translateX(${SLICES[i].dx}px) rotate(${SLICES[i].rot}deg)`,
    animation: beat === 0 ? `sx-tear 1000ms cubic-bezier(0.34, 1.56, 0.64, 1) ${900 + i * 70}ms both` : undefined,
  })
  return (
    <>
      <svg className="absolute inset-0 overflow-visible" width={W} height={H}>
        <defs>
          {/* the paper: pale in light, deep in dark, so the printed amounts always read */}
          <linearGradient id={id('note')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" className="[stop-color:var(--color-brand-50)] dark:[stop-color:var(--color-brand-900)]" />
            <stop offset="1" className="[stop-color:var(--color-duo-100)] dark:[stop-color:var(--color-duo-900)]" />
          </linearGradient>
          {SLICES.map((sl, i) => {
            const left = i === 0 ? 'L28,150' : zig(sl.x0 + 4)
            const right = i === 2 ? 'L332,30' : zigUp(sl.x0 + 104)
            return (
              <clipPath key={sl.name} id={id(`cut${sl.name}`)}>
                <path d={`M${i === 0 ? 28 : sl.x0 + 4},30 ${left} L${i === 2 ? 332 : sl.x0 + 104},150 ${right} Z`} />
              </clipPath>
            )
          })}
        </defs>
        <ellipse cx="180" cy="152" rx="140" ry="6" className="fill-brand-900/10 dark:fill-black/40" />
        {SLICES.map((sl, i) => (
          <g key={sl.name} style={torn(i)}>
            <g clipPath={`url(#${id(`cut${sl.name}`)})`}>
              {/* the printed ₹100 fades as the note tears */}
              <Banknote id={id} face={beat === 0 ? { opacity: 0, animation: 'sx-out 500ms ease 850ms both' } : { opacity: 0 }} />
            </g>
            {/* each piece shows its own share */}
            <text
              x={sl.x0 + 50 + (i === 0 ? -2 : i === 2 ? 2 : 0)}
              y="98"
              textAnchor="middle"
              className={`${beat === 0 ? 'text-[15px]' : 'text-[19px]'} font-black ${beat === 2 && i === 0 ? 'fill-duo-600 dark:fill-duo-300' : 'fill-brand-700 dark:fill-brand-200'}`}
              style={
                beat === 0
                  ? { animation: `sx-pop 500ms cubic-bezier(0.34, 1.56, 0.64, 1) ${1500 + i * 120}ms both` }
                  : beat === 2 && i === 0
                    ? pop(1500)
                    : undefined
              }
            >
              ₹{labels[i]}
            </text>
            {beat === 2 && i === 0 && (
              <rect
                x="30"
                y="38"
                width="104"
                height="104"
                rx="14"
                fill="none"
                strokeWidth="3"
                style={{ stroke: 'var(--color-duo-400)', animation: 'sx-pop 500ms ease 1500ms both' }}
              />
            )}
          </g>
        ))}
      </svg>
      {SLICES.map((sl) => (
        <At key={sl.name} x={sl.x0 + 50 + sl.dx * 1.4} y={198}>
          <Person name={sl.name} size={30} />
        </At>
      ))}
      {/* the total: rounded down it misses a paisa; given to the first person it's exact */}
      <At x={180} y={16} style={pop(beat === 0 ? 0 : 200)}>
        <Pill tone={beat === 1 ? 'down' : beat === 2 ? 'up' : 'even'}>
          {beat === 0 ? '₹100 ÷ 3 people' : beat === 1 ? '3 × ₹33.33 = ₹99.99 · 1 paisa short' : '₹33.34 + ₹33.33 + ₹33.33 = ₹100.00 ✓'}
        </Pill>
      </At>
      {beat === 1 && (
        <At x={180} y={155} style={{ animation: 'sx-hop 1300ms ease-out 500ms both' }}>
          <Coin label="1p" size={30} spin={!still} />
        </At>
      )}
      {beat === 2 && (
        <>
          <Fly path="M180,160 Q120,170 76,96" ms={900} d={250} vanish>
            <Coin label="1p" size={30} spin />
          </Fly>
          <Sparkles x={76} y={92} d={1200} spread={44} />
        </>
      )}
    </>
  )
}

/** A torn edge going down at x, and one coming back up. */
const zig = (x: number) => Array.from({ length: 10 }, (_, i) => `L${x + (i % 2 ? 4 : -4)},${30 + (i + 1) * 12}`).join(' ')
const zigUp = (x: number) => Array.from({ length: 10 }, (_, i) => `L${x + (i % 2 ? -4 : 4)},${150 - (i + 1) * 12}`).join(' ')

// ---- What a private group hides: a safe -----------------------------------------------------------------

const WORDS = ['Goa trip', 'Rahul', 'Dinner']

function Safe({ id, beat }: { id: (n: string) => string; beat: number }) {
  return (
    <svg className="absolute inset-0 overflow-visible" width={W} height={H}>
      <defs>
        <linearGradient id={id('body')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#64748b" />
          <stop offset="1" stopColor="#1e293b" />
        </linearGradient>
        <linearGradient id={id('door')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#94a3b8" />
          <stop offset="1" stopColor="#334155" />
        </linearGradient>
        <radialGradient id={id('dial')} cx="0.35" cy="0.3">
          <stop offset="0" stopColor="#f8fafc" />
          <stop offset="1" stopColor="#94a3b8" />
        </radialGradient>
      </defs>
      <ellipse cx="106" cy="196" rx="64" ry="5" className="fill-brand-900/15 dark:fill-black/40" />
      <rect x="40" y="50" width="132" height="142" rx="20" fill={`url(#${id('body')})`} />
      <rect x="52" y="62" width="108" height="118" rx="13" fill={`url(#${id('door')})`} stroke="#fff" strokeOpacity="0.15" />
      <rect x="80" y="70" width="52" height="5" rx="2.5" fill="#0f172a" opacity="0.7" />
      {[70, 172].map((y) => (
        <rect key={y} x="166" y={y} width="9" height="14" rx="3" fill="#475569" />
      ))}
      <g
        style={{
          transformBox: 'fill-box',
          transformOrigin: 'center',
          transform: 'rotate(-180deg)',
          animation: beat === 0 ? 'sx-dial 1300ms cubic-bezier(0.4, 0, 0.2, 1) 1400ms both' : undefined,
        }}
      >
        <circle cx="106" cy="120" r="25" fill={`url(#${id('dial')})`} stroke="#334155" strokeWidth="2" />
        {Array.from({ length: 12 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: twelve fixed ticks
          <line key={i} x1="106" y1="99" x2="106" y2={i % 3 ? 102 : 105} stroke="#334155" strokeWidth="1.5" transform={`rotate(${i * 30} 106 120)`} />
        ))}
        <circle cx="106" cy="120" r="7" fill="#475569" />
        <path d="M106,104 L109,111 L103,111 Z" style={{ fill: 'var(--color-brand-500)' }} />
      </g>
      <rect x="142" y="106" width="8" height="30" rx="4" fill="#cbd5e1" />
      <text x="106" y="166" textAnchor="middle" className="fill-slate-200 font-mono text-[9px]" style={beat === 0 ? pop(2500) : undefined}>
        v1:x9Fq·k2Lm…
      </text>
    </svg>
  )
}

const Vault: View = ({ beat }) => {
  const id = useIds()
  return (
    <>
      <At x={106} y={30}>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Split Now’s server</span>
      </At>
      <Safe id={id} beat={beat} />
      {/* the lock that clicks shut */}
      <At x={168} y={52} style={beat === 0 ? pop(2500) : undefined}>
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-fill text-on-fill shadow-lg ring-2 ring-white dark:ring-ink-900">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
      </At>
      {/* the phone of someone in the group */}
      <At x={286} y={118}>
        <div className="relative h-[168px] w-[86px] rounded-[18px] bg-slate-900 p-[5px] shadow-xl ring-1 ring-white/10">
          <div className="relative flex h-full w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[14px] bg-gradient-to-b from-brand-50 to-white dark:from-ink-800 dark:to-ink-900">
            <div className="absolute top-1.5 h-1 w-8 rounded-full bg-slate-900/80" />
            {beat === 0 && (
              <div className="flex flex-col items-center gap-1" style={pop(1300)}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="stroke-emerald-500" strokeWidth="2.5" strokeLinecap="round">
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
                <span className="text-[9px] font-semibold text-slate-500">Sent, sealed</span>
              </div>
            )}
            {beat === 1 && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {[0, 4, 8, 2, 6, 1, 3, 5, 7].map((order, i) => (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: nine fixed dots
                      key={i}
                      className="h-2.5 w-2.5 rounded-full bg-fill ring-2 ring-brand-200 dark:ring-brand-800"
                      style={{ animation: `sx-pop 320ms ease-out ${1350 + order * 110}ms both` }}
                    />
                  ))}
                </div>
                <div className="mt-1" style={pop(2450)}>
                  <Pill tone="up">✓ Open</Pill>
                </div>
              </>
            )}
            {beat === 2 &&
              WORDS.map((w, i) => (
                <span
                  key={w}
                  className="whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[9.5px] font-semibold text-slate-700 shadow-sm ring-1 ring-brand-100 dark:bg-ink-700 dark:text-slate-100 dark:ring-white/10"
                  style={{ animation: `sx-reveal 600ms steps(8) ${900 + i * 260}ms both` }}
                >
                  {w}
                </span>
              ))}
          </div>
        </div>
      </At>
      {/* beat 1: the words go into the box */}
      {beat === 0 &&
        WORDS.map((w, i) => (
          <Fly key={w} path={`M286,${84 + i * 26} Q200,${-10 + i * 18} 106,72`} ms={1000} d={200 + i * 260} vanish>
            <span className="whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 shadow-md ring-1 ring-brand-100 dark:bg-ink-700 dark:text-slate-100">
              {w}
            </span>
          </Fly>
        ))}
      {/* beat 2: the key, sealed apart from the box, goes to the phone after the pattern */}
      {beat === 1 && (
        <Fly path="M150,214 Q230,250 286,150" ms={1100} d={150} vanish>
          <svg width="44" height="22" viewBox="0 0 44 22" style={{ filter: 'drop-shadow(0 3px 4px rgba(180,83,9,0.45))' }}>
            <circle cx="11" cy="11" r="9" fill="#fbbf24" stroke="#b45309" strokeWidth="2" />
            <circle cx="11" cy="11" r="3.5" fill="#fff7d1" />
            <path d="M20,9 H42 V13 H38 V17 H34 V13 H30 V16 H26 V13 H20 Z" fill="#fbbf24" stroke="#b45309" strokeWidth="1.5" />
          </svg>
        </Fly>
      )}
      {/* beat 3: the label outside the box: amounts, dates and who paid */}
      {beat === 2 && (
        <div className="absolute" style={{ left: 120, top: 136, transformOrigin: '30px 0px', animation: 'sx-swing 1500ms ease-out 200ms both' }}>
          <div className="mx-auto h-8 w-px bg-slate-400" style={{ marginLeft: 30 }} />
          <div className="-mt-0.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-[10px] font-bold leading-tight text-amber-900 shadow-lg ring-1 ring-amber-300">
            <div className="mx-auto mb-1 h-1.5 w-1.5 rounded-full bg-amber-300" />
            ₹2,400 · 12 Oct
            <div className="font-semibold text-amber-800">paid by person 1</div>
          </div>
        </div>
      )}
    </>
  )
}

// ---- How auto-capture picks payments: a sieve -------------------------------------------------------------

const MSGS = [
  { text: 'OTP 482913', bank: false, exit: 'M180,16 Q150,40 128,128 Q90,104 30,160' },
  { text: '50% off today', bank: false, exit: 'M180,42 Q210,70 232,128 Q270,104 330,160' },
  { text: '₹450 debited · UPI', bank: true, exit: 'M180,68 L180,206' },
  { text: 'See you at 8?', bank: false, exit: 'M180,94 Q150,118 120,132 Q70,96 20,86' },
]

function Bubble({ m, refused }: { m: (typeof MSGS)[number]; refused?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-2xl px-3 py-1.5 text-[11px] font-semibold shadow-md ring-1 ${
        m.bank
          ? 'bg-emerald-50 text-emerald-900 ring-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-100'
          : 'bg-white text-slate-700 ring-slate-200 dark:bg-ink-800 dark:text-slate-200 dark:ring-white/10'
      }`}
    >
      {m.bank ? '🏦' : '💬'} {m.text}
      {refused && (
        <span className="-mr-1 ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white" style={pop(650)}>
          ✕
        </span>
      )}
      {m.bank && refused === false && (
        <span className="-mr-1 ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-black text-white" style={pop(900)}>
          ✓
        </span>
      )}
    </span>
  )
}

const Filter: View = ({ beat }) => {
  const id = useIds()
  return (
    <>
      <svg className="absolute inset-0" width={W} height={H}>
        <defs>
          <linearGradient id={id('rim')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: 'var(--color-brand-400)' }} />
            <stop offset="1" style={{ stopColor: 'var(--color-duo-500)' }} />
          </linearGradient>
          <pattern id={id('mesh')} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path d="M0,0 V8 M0,0 H8" style={{ stroke: 'var(--color-brand-400)' }} strokeOpacity="0.55" strokeWidth="1.2" />
          </pattern>
          <clipPath id={id('bowl')}>
            <path d="M92,140 L268,140 Q256,182 180,184 Q104,182 92,140 Z" />
          </clipPath>
        </defs>
        <g style={{ opacity: beat === 2 ? 0.45 : 1, transition: 'opacity 600ms' }}>
          <path d="M92,140 L268,140 Q256,182 180,184 Q104,182 92,140 Z" className="fill-brand-100/60 dark:fill-brand-900/30" />
          <rect x="90" y="138" width="180" height="50" fill={`url(#${id('mesh')})`} clipPath={`url(#${id('bowl')})`} />
          <ellipse cx="180" cy="140" rx="90" ry="9" fill="none" stroke={`url(#${id('rim')})`} strokeWidth="5" />
          <ellipse
            cx="180"
            cy="128"
            rx="90"
            ry="9"
            fill="none"
            stroke={`url(#${id('rim')})`}
            strokeWidth="12"
            opacity="0.18"
            style={ambient('sx-pulse 2.4s ease-in-out infinite')}
          />
        </g>
      </svg>
      {/* beat 1: the messages arrive */}
      {beat === 0 &&
        MSGS.map((m, i) => (
          <At key={m.text} x={180} y={16 + i * 26} style={rise(150 + i * 200, 600)}>
            <Bubble m={m} />
          </At>
        ))}
      {/* beat 2: only the bank debit goes through; the rest bounce off and stay on the phone */}
      {beat === 1 &&
        MSGS.map((m, i) => (
          <Fly key={m.text} path={m.exit} ms={m.bank ? 1100 : 1300} d={200 + i * 180} vanish={!m.bank}>
            <Bubble m={m} refused={!m.bank} />
          </Fly>
        ))}
      {/* beat 3: it waits in the Inbox for a yes */}
      {beat === 2 && (
        <At x={180} y={206} style={pop(200, 650)}>
          <div className="mb-1 text-center text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Inbox · to sort</div>
          <div className="w-56 rounded-2xl bg-white p-2.5 shadow-xl ring-1 ring-brand-100 dark:bg-ink-900 dark:ring-white/10">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-800 dark:text-white">
              <span>Captured payment</span>
              <span className="tabular-nums">₹450</span>
            </div>
            <div className="mt-1.5 flex gap-1">
              {['Split', 'Personal', 'Not shared'].map((b, i) => (
                <span
                  key={b}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${i === 0 ? 'bg-fill text-on-fill' : 'bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200'}`}
                  style={pop(700 + i * 140)}
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
        </At>
      )}
      {beat === 2 && <Sparkles x={180} y={196} d={1100} spread={70} />}
    </>
  )
}

const VIEWS: Record<StoryKind, View> = { pot: Pot, seesaw: Seesaw, untangle: Untangle, remainder: Remainder, vault: Vault, filter: Filter }
