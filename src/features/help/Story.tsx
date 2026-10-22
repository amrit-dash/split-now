import { type CSSProperties, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { AdvancedRocketIcon, SimpleModeIcon } from '@/components/icons'
import { ProPill, ProRing } from '@/components/ProBadge'
import type { StoryKind } from '@/lib/help'
import './help-motion.css'

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
      <View beat={beat} still={still} />
    </Stage>
  )
}

type View = (p: { beat: number; still: boolean }) => ReactNode

// The stage is drawn at a fixed size and scaled to fit, so motion paths (in px) line up at any width.
const W = 360
// A little more than the drawings use: the pills under the people need room above the stage's edge.
const H = 256

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
      {/* Keyed by beat: each caption replays its own entrances. Still (reduced motion, animations off), a beat only crossfades in. */}
      <div
        key={beat}
        className={`absolute left-0 top-0 ${still ? 'sx-still animate-[fade-in_150ms_ease-out]' : ''}`}
        style={{ width: W, height: H, transform: `scale(${k})`, transformOrigin: '0 0' }}
      >
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

/**
 * An entrance: pops or rises in, after `d` ms. The pop's keyframe already swells a touch (to 1.06);
 * an ease-out curve on top keeps it quiet, with no second bounce.
 */
const pop = (d = 0, ms = 480): CSSProperties => ({ animation: `sx-pop ${ms}ms cubic-bezier(0.23, 1, 0.32, 1) ${d}ms both` })
const rise = (d = 0, ms = 520): CSSProperties => ({ animation: `sx-in ${ms}ms cubic-bezier(0.23, 1, 0.32, 1) ${d}ms both` })
const out = (d = 0, ms = 400): CSSProperties => ({ opacity: 0, animation: `sx-out ${ms}ms cubic-bezier(0.23, 1, 0.32, 1) ${d}ms both` })

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
        className="flex items-center justify-center rounded-full font-bold text-white ring-[3px] ring-white dark:ring-ink-900"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.36,
          background: `linear-gradient(140deg, ${c.from}, ${c.to})`,
          // the accent's own shade, so the shadow never reads violet on another accent
          boxShadow: '0 6px 16px -6px color-mix(in oklab, var(--color-brand-700) 55%, transparent)',
        }}
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
        animation: spin ? 'sx-spin-y 1.1s ease-in-out infinite' : undefined,
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
        {/* Draining, the amount stays white on the liquid and goes grey only once the jar is empty. */}
        <div
          className={`text-center text-[22px] font-black tabular-nums drop-shadow-sm ${beat === 3 ? 'text-slate-400 dark:text-slate-500' : 'text-white'}`}
          style={beat === 3 ? { animation: 'sx-whiten 2200ms steps(1, end) both' } : undefined}
        >
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
  // Asha pays and the shares weigh their end down; it stays tipped while the amounts show; paid back, it springs level.
  if (beat === 0) return { transform: `rotate(${counter ? -11 : 11}deg)`, animation: `sx-tip${c} 1500ms cubic-bezier(0.3, 0.7, 0.4, 1) 700ms both` }
  if (beat === 1) return { transform: `rotate(${counter ? -11 : 11}deg)` }
  return { transform: 'rotate(0deg)', animation: `sx-level${c} 1500ms cubic-bezier(0.3, 0.7, 0.4, 1) 1300ms both` }
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
  const caption = beat === 0 ? 'Asha paid ₹900 for three' : beat === 1 ? 'The heavy end owes' : 'Paid back · level again'
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
              beat === 0
                ? { transform: 'translateX(-12px)', animation: 'sx-bubble 1200ms ease-out 900ms both' }
                : beat === 1
                  ? { transform: 'translateX(-12px)' }
                  : { transform: 'translateX(0)', animation: 'sx-bubble 1200ms ease-out 1400ms both' }
            }
          />
          {/* the ₹300 each Ravi and Meera owe, hanging off their end */}
          {beat < 2 &&
            [272, 314].map((x, i) => (
              <g
                key={x}
                style={
                  beat === 0
                    ? ({
                        '--from': 'translateY(-36px)',
                        '--from-o': 0,
                        animation: `hm-from 600ms cubic-bezier(0.3, 0.8, 0.4, 1) ${200 + i * 180}ms both`,
                      } as CSSProperties)
                    : undefined
                }
              >
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
              <g
                key={x}
                style={{ opacity: 0, transform: 'translateY(-40px)', animation: `sx-lift 700ms cubic-bezier(0.5, 0, 0.75, 0) ${300 + i * 150}ms both` }}
              >
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
            <div className="mb-1" style={pop(200)}>
              <Pill tone="up">
                owed <Count from={0} to={600} still={still} d={250} />
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
        <At x={290} y={64} style={pop(450)}>
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
        </>
      )}
    </>
  )
}

// ---- Fewer payments: untangling -------------------------------------------------------------------

const NODES = [
  { name: 'Asha', x: 72, y: 64, net: 500 },
  { name: 'Ravi', x: 288, y: 64, net: -200 },
  { name: 'Meera', x: 288, y: 182, net: -400 },
  { name: 'Kabir', x: 72, y: 182, net: 100 },
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
      <At x={180} y={beat === 2 ? 206 : 124} style={pop(beat === 0 ? 150 : beat === 1 ? 400 : 1600)}>
        <div className="rounded-2xl bg-white/90 px-3 py-2 text-center shadow-lg ring-1 ring-brand-100 backdrop-blur dark:bg-ink-900/90 dark:ring-white/10">
          <div className="text-[18px] font-black leading-none text-slate-800 tabular-nums dark:text-white">
            {beat === 0 ? (
              <Count from={1} to={6} still={still} d={300} ms={1400} format={(n) => String(n)} />
            ) : beat === 1 ? (
              '4'
            ) : (
              <Count from={6} to={3} still={still} d={1700} ms={700} format={(n) => String(n)} />
            )}
          </div>
          <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{beat === 1 ? 'balances' : 'payments'}</div>
        </div>
      </At>
    </>
  )
}

// ---- Splits add up: ₹100 three ways ------------------------------------------------------------------

const SLICES = [
  { name: 'Asha', x0: 30, dx: -8, rot: -4 },
  { name: 'Ravi', x0: 130, dx: 0, rot: 0 },
  { name: 'Meera', x0: 230, dx: 8, rot: 4 },
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
                  : beat === 1
                    ? pop(150 + i * 110)
                    : beat === 2 && i === 0
                      ? pop(1100)
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
                style={{ stroke: 'var(--color-duo-400)', animation: 'sx-pop 500ms cubic-bezier(0.23, 1, 0.32, 1) 1100ms both' }}
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
      <At x={180} y={18} style={pop(beat === 0 ? 0 : 200)}>
        <Pill tone={beat === 1 ? 'down' : beat === 2 ? 'up' : 'even'}>
          {beat === 0 ? '₹100 ÷ 3 people' : beat === 1 ? '3 × ₹33.33 = ₹99.99 · 1 paisa short' : '₹33.34 + ₹33.33 + ₹33.33 = ₹100.00 ✓'}
        </Pill>
      </At>
      {beat === 1 && (
        <At x={180} y={154} style={{ animation: 'sx-hop 1300ms ease-out 500ms both' }}>
          <Coin label="1p" size={24} spin={!still} />
        </At>
      )}
      {beat === 2 && (
        <>
          <Fly path="M180,154 Q120,170 76,96" ms={900} d={250} vanish>
            <Coin label="1p" size={24} spin />
          </Fly>
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
        <div className="relative h-[168px] w-[86px] rounded-[18px] bg-slate-900 p-[5px] shadow-xl ring-1 ring-white/10 dark:bg-slate-950 dark:ring-white/20">
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
                      style={{ animation: `sx-pop 320ms cubic-bezier(0.23, 1, 0.32, 1) ${250 + order * 110}ms both` }}
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
      {/* where the key waits, sealed, apart from the box */}
      {beat >= 1 && (
        <At x={106} y={226} style={beat === 1 ? rise(0) : undefined}>
          <Pill>
            <Lock size={9} /> Key, sealed apart
          </Pill>
        </At>
      )}
      {beat === 1 && (
        <Fly path="M174,226 Q240,246 286,150" ms={1000} d={1300} vanish>
          <svg width="44" height="22" viewBox="0 0 44 22" style={{ filter: 'drop-shadow(0 3px 4px rgba(180,83,9,0.45))' }}>
            <circle cx="11" cy="11" r="9" fill="#fbbf24" stroke="#b45309" strokeWidth="2" />
            <circle cx="11" cy="11" r="3.5" fill="#fff7d1" />
            <path d="M20,9 H42 V13 H38 V17 H34 V13 H30 V16 H26 V13 H20 Z" fill="#fbbf24" stroke="#b45309" strokeWidth="1.5" />
          </svg>
        </Fly>
      )}
      {/* beat 3: the label outside the box: amounts, dates and who paid */}
      {beat === 2 && (
        <div
          className="absolute"
          style={{ left: 120, top: 136, transformOrigin: '30px 0px', animation: 'hm-swing 1100ms cubic-bezier(0.23, 1, 0.32, 1) 200ms both' }}
        >
          <div className="mx-auto h-8 w-px bg-slate-400 dark:bg-slate-500" style={{ marginLeft: 30 }} />
          <div className="-mt-0.5 rounded-lg bg-duo-50 px-2.5 py-1.5 text-[10px] font-bold leading-tight text-duo-900 shadow-lg ring-1 ring-duo-300 dark:bg-duo-900 dark:text-duo-50 dark:ring-duo-500/60">
            <div className="mx-auto mb-1 h-1.5 w-1.5 rounded-full bg-duo-300 dark:bg-duo-500" />
            ₹2,400 · 12 Oct
            <div className="font-semibold text-duo-800 dark:text-duo-200">paid by person 1</div>
          </div>
        </div>
      )}
    </>
  )
}

// ---- How auto-capture picks payments: a phone, a filter gate and the Inbox ----------------------------------

/*
 * The phone on the left holds the messages; the gate in the middle is the filter; the tray on the
 * right is the Inbox. A scan runs down the messages: the OTP, the offer and the chat are locked
 * where they are (they never leave the phone), and only the bank alert slides out through the gate
 * and lands in the Inbox as a captured payment, waiting for Split, Personal or Not shared.
 */
const PHONE = { left: 14, top: 34, w: 96, h: 172 }
/** The phone's screen, inside its 5px bezel; the messages are placed in its coordinates. */
const SCREEN = { left: PHONE.left + 5, top: PHONE.top + 5 }
const MSGS = [
  { text: 'OTP 482913', top: 18 },
  { text: '50% off', top: 44 },
  { text: 'On my way', top: 70 },
] as const
const BANK = { top: 98, w: 76, h: 30 }
const BANK_AT = { x: SCREEN.left + 6 + BANK.w / 2, y: SCREEN.top + BANK.top + BANK.h / 2 }
const GATE = { x: 128, top: 64, bottom: 176 }
const TRAY = { left: 146, top: 62, w: 200, h: 108 }
const CARD = { left: TRAY.left + 8, top: 94, w: TRAY.w - 16, h: 42 }
const CARD_AT = { x: CARD.left + CARD.w / 2, y: CARD.top + CARD.h / 2 }
const ROUTE = `M${BANK_AT.x},${BANK_AT.y} C${BANK_AT.x + 34},${BANK_AT.y} ${GATE.x - 26},120 ${GATE.x},120 S${CARD_AT.x - 40},${CARD_AT.y} ${CARD_AT.x},${CARD_AT.y}`

// Beat 2's timing (ms): the scan runs down the screen and reaches each message in turn.
const SCAN = { d: 250, ms: 1100, travel: 158 }
const scanAt = (screenY: number) => Math.round(SCAN.d + (SCAN.ms * screenY) / SCAN.travel)
const LEAVE = scanAt(BANK.top + BANK.h / 2) + 220
const LEAVE_MS = 950
const LAND = LEAVE + LEAVE_MS - 150

/** A small lock: this message stays on the phone. */
function Lock({ size = 8, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      style={style}
      className="shrink-0"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

/** The bank alert: the one message that is about money leaving the account. */
function BankBubble({ ok }: { ok?: CSSProperties }) {
  return (
    <div
      className="relative flex flex-col justify-center rounded-xl rounded-bl-sm bg-brand-50 px-2 text-left shadow-md ring-1 ring-brand-300 dark:bg-brand-900/60 dark:ring-brand-400/50"
      style={{ width: BANK.w, height: BANK.h }}
    >
      <span className="text-[7px] font-bold uppercase leading-none tracking-wider text-brand-700 dark:text-brand-200">Bank · UPI</span>
      <span className="mt-0.5 whitespace-nowrap text-[9.5px] font-bold leading-none text-slate-800 dark:text-white">₹450 debited</span>
      {ok && (
        <span
          className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-fill text-on-fill shadow ring-2 ring-white dark:ring-ink-800"
          style={ok}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
      )}
    </div>
  )
}

function Phone({ beat }: { beat: number }) {
  return (
    <div
      className="absolute rounded-[20px] bg-slate-900 p-[5px] shadow-xl ring-1 ring-white/10 dark:bg-slate-950 dark:ring-white/20"
      style={{ left: PHONE.left, top: PHONE.top, width: PHONE.w, height: PHONE.h }}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[15px] bg-gradient-to-b from-brand-50 to-white dark:from-ink-800 dark:to-ink-900">
        <div className="absolute left-1/2 top-1.5 h-1 w-8 -translate-x-1/2 rounded-full bg-slate-900/80" />
        {MSGS.map((m, i) => (
          <div
            key={m.text}
            className="absolute left-1.5 flex items-center gap-1 whitespace-nowrap rounded-xl rounded-bl-sm bg-white px-[7px] py-[5px] text-[8.5px] font-semibold leading-none text-slate-700 shadow-sm ring-1 ring-slate-200 dark:bg-ink-700 dark:text-slate-200 dark:ring-white/10"
            style={{ top: m.top, ...(beat === 0 ? rise(150 + i * 260, 560) : undefined) }}
          >
            {/* The ones that stay grey out a little, and get a lock, once the scan has passed them. */}
            <span
              style={beat === 1 ? { opacity: 0.55, animation: `sx-out 400ms ease ${scanAt(m.top + 11)}ms both` } : beat === 2 ? { opacity: 0.55 } : undefined}
            >
              {m.text}
            </span>
            {beat > 0 && (
              <span className="text-slate-500 dark:text-slate-300">
                <Lock style={beat === 1 ? pop(scanAt(m.top + 11), 420) : undefined} />
              </span>
            )}
          </div>
        ))}
        {beat === 0 && (
          <div className="absolute left-1.5" style={{ top: BANK.top, ...rise(150 + 3 * 260, 560) }}>
            <BankBubble />
          </div>
        )}
        {/* The bank alert waits for the scan, gets its tick and leaves (the flying copy takes over). */}
        {beat === 1 && (
          <div className="absolute left-1.5" style={{ top: BANK.top, ...out(LEAVE, 1) }}>
            <BankBubble ok={pop(scanAt(BANK.top + BANK.h / 2), 420)} />
          </div>
        )}
        {beat > 0 && (
          <div className="absolute inset-x-0 flex justify-center" style={{ top: BANK.top + 8, ...(beat === 1 ? rise(LEAVE + 250) : undefined) }}>
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-slate-900/[0.06] px-1.5 py-[3px] text-[7.5px] font-bold leading-none text-slate-600 dark:bg-white/10 dark:text-slate-300">
              <Lock />
              Stays on phone
            </span>
          </div>
        )}
        {/* The scan: a soft band of light that runs down the screen once. */}
        {beat === 1 && (
          <div
            className="absolute inset-x-0 top-[-8px] h-4"
            style={{ opacity: 0, transform: `translateY(${SCAN.travel}px)`, animation: `sx-scan ${SCAN.ms}ms linear ${SCAN.d}ms both` }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-brand-400/35 to-transparent dark:via-brand-300/30" />
            <div className="absolute inset-x-0 top-1/2 h-px bg-brand-500 dark:bg-brand-300" />
          </div>
        )}
        <div className="absolute bottom-1.5 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-slate-900/15 dark:bg-white/15" />
      </div>
    </div>
  )
}

/** The filter: a lit gate between the phone and the Inbox, with a funnel on top. */
function Gate() {
  const h = GATE.bottom - GATE.top
  return (
    <>
      <div
        className="absolute w-4 -translate-x-1/2 rounded-full bg-brand-400/40 blur-md dark:bg-brand-400/30"
        style={{ left: GATE.x, top: GATE.top, height: h, ...ambient('sx-pulse 2.6s ease-in-out infinite') }}
      />
      <div
        className="absolute w-2 -translate-x-1/2 rounded-full bg-gradient-to-b from-brand-400 via-duo-400 to-brand-600 shadow-[0_0_0_3px_rgba(255,255,255,0.7)] dark:shadow-[0_0_0_3px_rgba(255,255,255,0.08)]"
        style={{ left: GATE.x, top: GATE.top, height: h }}
      />
      <At x={GATE.x} y={GATE.top - 12}>
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-fill text-on-fill shadow-lg ring-[3px] ring-white dark:ring-ink-900">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round">
            <path d="M3 5h18l-7 8.5V19l-4 2v-7.5Z" />
          </svg>
        </div>
      </At>
    </>
  )
}

function Tray({ beat }: { beat: number }) {
  return (
    <div
      className="absolute rounded-3xl bg-white/70 shadow-[0_10px_30px_-14px_rgba(15,23,42,0.35)] ring-1 ring-brand-100 backdrop-blur dark:bg-white/[0.04] dark:shadow-none dark:ring-white/10"
      style={{ left: TRAY.left, top: TRAY.top, width: TRAY.w, height: TRAY.h }}
    >
      <div className="flex items-center gap-1.5 px-3 pt-2.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 12h-6l-2 3h-4l-2-3H2" />
          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
        </svg>
        Inbox
      </div>
      {/* the empty place the payment will land in */}
      {beat === 0 && (
        <div
          className="absolute rounded-2xl border-[1.5px] border-dashed border-brand-200 dark:border-white/15"
          style={{ left: CARD.left - TRAY.left, top: CARD.top - TRAY.top, width: CARD.w, height: CARD.h }}
        />
      )}
    </div>
  )
}

const CHOICES = ['Split', 'Personal', 'Not shared']

/** The captured payment in the Inbox; on the last beat with its three answers, lit one after another. */
function CapturedCard({ beat }: { beat: number }) {
  return (
    <div
      className="absolute rounded-2xl bg-white px-2.5 py-2 shadow-xl ring-1 ring-brand-100 dark:bg-ink-800 dark:ring-white/10"
      style={{ left: CARD.left, top: CARD.top, width: CARD.w, ...(beat === 1 ? pop(LAND, 560) : undefined) }}
    >
      <div className="flex items-center gap-1.5">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5" />
            <path d="M5 20h14" />
          </svg>
        </span>
        <div className="min-w-0 flex-1 leading-none">
          <div className="whitespace-nowrap text-[10.5px] font-bold text-slate-800 dark:text-white">Captured payment</div>
          <div className="mt-1 text-[8.5px] font-semibold text-slate-500 dark:text-slate-400">UPI · today</div>
        </div>
        <span className="text-[12px] font-extrabold tabular-nums text-slate-900 dark:text-white">₹450</span>
      </div>
      {beat === 2 && (
        <div className="mt-2 flex gap-1">
          {CHOICES.map((c, i) => (
            <span
              key={c}
              className="flex-auto whitespace-nowrap rounded-full bg-brand-50 px-1.5 py-[5px] text-center text-[9px] font-bold leading-none text-brand-800 ring-1 ring-brand-100 dark:bg-brand-900/40 dark:text-brand-100 dark:ring-white/10"
              style={{ animation: `sx-pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1) ${250 + i * 110}ms both, sx-lit 700ms ease-in-out ${1000 + i * 520}ms` }}
            >
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const Filter: View = ({ beat }) => (
  <>
    {/* the way a payment travels: out of the phone, through the gate, into the Inbox */}
    <svg className="absolute inset-0" width={W} height={H}>
      <path d={ROUTE} fill="none" className="stroke-brand-300 dark:stroke-white/20" strokeWidth="1.5" strokeDasharray="2 4" strokeLinecap="round" />
    </svg>
    <Tray beat={beat} />
    <Gate />
    <Phone beat={beat} />
    {beat > 0 && <CapturedCard beat={beat} />}
    {beat === 1 && (
      <Fly path={ROUTE} d={LEAVE} ms={LEAVE_MS} vanish>
        <BankBubble />
      </Fly>
    )}
  </>
)

// ---- Glass, shared by the jars, the glasses and the jug ----------------------------------------------

/** The jar's glass, lid and liquid gradients, under ids made unique per picture. */
function GlassDefs({ id }: { id: (n: string) => string }) {
  return (
    <defs>
      <linearGradient id={id('liquid')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={{ stopColor: 'var(--color-brand-400)' }} />
        <stop offset="1" style={{ stopColor: 'var(--color-duo-600)' }} />
      </linearGradient>
      <linearGradient id={id('liquid2')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={{ stopColor: 'var(--color-duo-300)' }} />
        <stop offset="1" style={{ stopColor: 'var(--color-duo-600)' }} />
      </linearGradient>
      <linearGradient id={id('liquid3')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={{ stopColor: 'var(--color-brand-300)' }} />
        <stop offset="1" style={{ stopColor: 'var(--color-brand-600)' }} />
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
    </defs>
  )
}

// ---- Why a captured payment waits: a coin on the counter, beside your jars ------------------------------

/*
 * The jar from What Split Now does, three times on a shelf: one per group, and Personal. A captured
 * payment is a coin that lands on the counter beside them and waits; it goes into a jar only when
 * you pick one.
 */
const SHELF_Y = 196
const JARS = [
  { label: 'Goa trip', x: 74, level: 0.45 },
  { label: 'Flat', x: 180, level: 0.6 },
  { label: 'Personal', x: 286, level: 0.3 },
] as const
/** A small jar: the big jar's outline at 60%, standing on the shelf at `x`. */
const MINI = { k: 0.6, w: 104 * 0.6, h: 120 * 0.6 }
const miniTop = SHELF_Y - MINI.h

function MiniJar({ id, x, level, fill, at, n }: { id: (n: string) => string; x: number; level: number; fill?: number; at?: number; n: number }) {
  // The big jar's path spans x 128–232, y 20–140; placed so its foot sits on the shelf.
  const tx = x - 180 * MINI.k
  const ty = SHELF_Y - 140 * MINI.k
  const depth = 84
  const from = depth * (1 - level)
  const to = depth * (1 - (fill ?? level))
  return (
    <g transform={`translate(${tx} ${ty}) scale(${MINI.k})`}>
      <clipPath id={id(`mini${n}`)}>
        <path d={JAR} />
      </clipPath>
      <path d={JAR} fill={`url(#${id('glass')})`} className="stroke-brand-200 dark:stroke-white/20" strokeWidth="3" />
      <g clipPath={`url(#${id(`mini${n}`)})`}>
        <g
          style={
            fill === undefined
              ? { transform: `translateY(${from}px)` }
              : ({
                  transform: `translateY(${to}px)`,
                  '--from': `translateY(${from}px)`,
                  animation: `hm-from 900ms cubic-bezier(0.3, 0.9, 0.3, 1) ${at ?? 0}ms both`,
                } as CSSProperties)
          }
        >
          <path
            d="M100,58 q13,-7 26,0 t26,0 t26,0 t26,0 t26,0 t26,0 t26,0 v100 h-182 z"
            fill={`url(#${id('liquid')})`}
            opacity="0.92"
            style={ambient(`sx-wave ${2.6 + n * 0.3}s linear infinite`)}
          />
        </g>
      </g>
      <path d="M139,72 C136,90 136,108 141,126" fill="none" stroke="#fff" strokeOpacity="0.75" strokeWidth="5" strokeLinecap="round" />
      <rect x="146" y="20" width="68" height="16" rx="5" fill={`url(#${id('lid')})`} />
    </g>
  )
}

const Jars: View = ({ beat }) => {
  const id = useIds()
  const goa = JARS[0]
  return (
    <>
      <svg className="absolute inset-0" width={W} height={H}>
        <GlassDefs id={id} />
        {/* the shelf */}
        <rect x="18" y={SHELF_Y} width="324" height="8" rx="4" className="fill-brand-200 dark:fill-white/15" />
        <ellipse cx="180" cy={SHELF_Y + 14} rx="150" ry="4" className="fill-brand-900/10 dark:fill-black/30" />
        {JARS.map((j, i) => (
          <MiniJar key={j.label} id={id} n={i} x={j.x} level={j.level} {...(beat === 2 && i === 0 ? { fill: j.level + 0.2, at: 950 } : {})} />
        ))}
      </svg>
      {/* each jar's name, on its label */}
      {JARS.map((j, i) => (
        <At key={j.label} x={j.x} y={SHELF_Y - MINI.h * 0.42}>
          <span
            className={`whitespace-nowrap rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-bold leading-none text-slate-700 shadow-sm dark:bg-ink-900/85 dark:text-slate-100 ${beat === 2 && i > 0 ? 'opacity-50' : ''}`}
            style={beat === 1 ? { animation: `sx-lit 700ms ease-in-out ${250 + i * 420}ms` } : undefined}
          >
            {j.label}
          </span>
        </At>
      ))}
      {/* the payment: a coin that lands on the counter and waits, with where it came from */}
      {beat < 2 ? (
        <>
          <At
            x={180}
            y={56}
            style={
              beat === 0
                ? ({ '--from': 'translateY(-40px)', '--from-o': 0, animation: 'hm-from 600ms cubic-bezier(0.23, 1, 0.32, 1) 200ms both' } as CSSProperties)
                : ambient('sx-breathe 2.8s ease-in-out infinite')
            }
          >
            <Coin label="₹450" size={46} />
          </At>
          <At x={180} y={96} style={beat === 0 ? rise(800) : undefined}>
            <Pill>Blue Tokai · UPI</Pill>
          </At>
          {beat === 1 && (
            <At x={180} y={22} style={pop(150)}>
              <Pill tone="accent">Which jar?</Pill>
            </At>
          )}
        </>
      ) : (
        <>
          {/* beat 3: you pick Goa trip, and only then does it go in */}
          <Fly path={`M180,56 Q${goa.x + 20},4 ${goa.x},${miniTop + 18}`} d={150} ms={850} vanish>
            <Coin label="₹450" size={40} />
          </Fly>
          <At x={goa.x} y={miniTop - 18} style={pop(1100)}>
            <Pill tone="up">✓ ₹150 each</Pill>
          </At>
          <At x={232} y={56} style={rise(1300)}>
            <Pill>in only when you pick</Pill>
          </At>
        </>
      )}
    </>
  )
}

// ---- Why a captured payment waits: a parcel with no name on it --------------------------------------------

/*
 * A captured payment is a parcel left in the hall: the label says ₹450 from Blue Tokai, but no
 * name. Three doors: a group, another group, and just you. It goes through a door only when you pick
 * one: the door swings open, the parcel slides in, the door shuts. The doors can be tapped (a
 * picture only, so no focus or screen-reader role: the captions say the same); otherwise the last
 * beat picks Goa trip.
 */
const DOORS = [
  { label: 'Goa trip', done: '✓ ₹150 each', x: 150 },
  { label: 'Flat', done: '✓ ₹225 each', x: 226 },
  { label: 'Just me', done: '✓ Personal', x: 302 },
] as const
const DOOR = { w: 56, h: 100, top: 78 }
const FLOOR_Y = DOOR.top + DOOR.h
const PARCEL = { x: 54, w: 64, h: 46 }

function Parcel() {
  return (
    <div className="relative" style={{ width: PARCEL.w, height: PARCEL.h }}>
      <div
        className="absolute inset-0 rounded-[7px] shadow-[0_8px_14px_-8px_rgba(120,72,20,0.7)]"
        style={{ background: 'linear-gradient(160deg, #f3d7a8 0%, #dcb07a 60%, #c99459 100%)' }}
      />
      {/* the tape across the top, and a fold */}
      <div className="absolute inset-x-0 top-[38%] h-[7px] bg-[#f7e6c4]/80" />
      <div className="absolute left-1/2 top-0 h-full w-[7px] -translate-x-1/2 bg-[#f7e6c4]/70" />
      {/* its label: how much and where, no name */}
      <div className="absolute -right-3 -top-3 rotate-[8deg] rounded-md bg-white px-1.5 py-1 text-center shadow-md ring-1 ring-black/5 dark:bg-ink-800 dark:ring-white/10">
        <div className="text-[11px] font-black leading-none tabular-nums text-slate-800 dark:text-white">₹450</div>
        <div className="mt-0.5 whitespace-nowrap text-[7px] font-semibold leading-none text-slate-500 dark:text-slate-400">Blue Tokai</div>
      </div>
    </div>
  )
}

const Doors: View = ({ beat }) => {
  // Someone tapping a door picks it; otherwise the last beat picks the first. Each pick replays.
  const [tapped, setTapped] = useState<{ door: number; n: number } | null>(null)
  const pick = tapped?.door ?? (beat === 2 ? 0 : null)
  const run = tapped ? `t${tapped.n}` : `b${beat}`
  const d = DOORS[pick ?? 0]
  // When the door opens, the parcel slides over and in, and the door shuts behind it (ms after the pick).
  const t = tapped ? 0 : 250
  const dx = d.x - PARCEL.x
  return (
    <>
      {/* the wall and the floor */}
      <div
        className="absolute inset-x-6 rounded-t-[22px] bg-white/50 ring-1 ring-brand-100 dark:bg-white/[0.03] dark:ring-white/5"
        style={{ top: DOOR.top - 26, height: FLOOR_Y - DOOR.top + 26 }}
      />
      <div className="absolute inset-x-3 h-2 rounded-full bg-brand-200 dark:bg-white/15" style={{ top: FLOOR_Y }} />
      {DOORS.map((door, i) => {
        const opens = pick === i
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: the picture is aria-hidden; tapping a door is a bonus, the captions say the same
          // biome-ignore lint/a11y/useKeyWithClickEvents: as above, nothing here takes focus
          <div
            key={door.label}
            className="absolute cursor-pointer"
            style={{ left: door.x - DOOR.w / 2, top: DOOR.top - 22, width: DOOR.w, height: DOOR.h + 22, perspective: 260 }}
            onClick={() => setTapped((p) => ({ door: i, n: (p?.n ?? 0) + 1 }))}
          >
            {/* the name plate */}
            <div
              className={`mx-auto mb-1.5 w-fit whitespace-nowrap rounded-md px-1.5 py-0.5 text-[9.5px] font-bold leading-none ring-1 ${opens ? 'bg-fill text-on-fill ring-transparent' : 'bg-white text-slate-700 ring-slate-200 dark:bg-ink-800 dark:text-slate-100 dark:ring-white/10'}`}
              style={beat === 1 && pick === null ? { animation: `sx-lit 700ms ease-in-out ${300 + i * 380}ms` } : undefined}
            >
              {door.label}
            </div>
            {/* the doorway, dark inside, and the door on its hinge */}
            <div className="relative rounded-t-[14px] bg-slate-800 dark:bg-black" style={{ width: DOOR.w, height: DOOR.h }}>
              <div
                key={`${run}-${door.label}`}
                className="absolute inset-0 rounded-t-[14px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]"
                style={{
                  background: 'linear-gradient(160deg, var(--color-brand-400), var(--color-brand-700))',
                  transformOrigin: 'left center',
                  ...(opens ? { animation: `hm-door 1500ms cubic-bezier(0.45, 0, 0.25, 1) ${t}ms both` } : {}),
                }}
              >
                <div className="absolute inset-x-2 top-2 h-9 rounded-t-[9px] bg-white/15" />
                <div className="absolute inset-x-2 bottom-3 h-9 rounded-[5px] bg-white/10" />
                <div className="absolute right-2 top-1/2 h-2 w-2 rounded-full bg-amber-300 shadow" />
              </div>
            </div>
          </div>
        )
      })}
      {/* the parcel: it slides in on the first beat and waits; picked, it goes through the door */}
      <div
        key={run}
        className="absolute"
        style={{
          left: PARCEL.x - PARCEL.w / 2,
          top: FLOOR_Y - PARCEL.h,
          ...(pick === null
            ? beat === 0
              ? ({ '--from': 'translateX(-120px)', '--from-o': 0, animation: 'hm-from 800ms cubic-bezier(0.23, 1, 0.32, 1) 200ms both' } as CSSProperties)
              : ambient('sx-breathe 2.8s ease-in-out infinite')
            : ({ '--dx': `${dx}px`, opacity: 0, animation: `hm-parcel 1100ms cubic-bezier(0.45, 0, 0.25, 1) ${t + 250}ms both` } as CSSProperties)),
        }}
      >
        <Parcel />
      </div>
      {pick === null ? (
        <At x={PARCEL.x} y={DOOR.top - 6} style={beat === 0 ? rise(900) : undefined}>
          <Pill tone={beat === 1 ? 'accent' : 'even'}>{beat === 1 ? 'Which door?' : 'No name on it'}</Pill>
        </At>
      ) : (
        <At key={`done-${run}`} x={d.x} y={FLOOR_Y + 24} style={pop(t + 1500)}>
          <Pill tone="up">{d.done}</Pill>
        </At>
      )}
      {pick !== null && (
        <At key={`note-${run}`} x={180} y={24} style={rise(t + 1700)}>
          <Pill>in only when you pick</Pill>
        </At>
      )}
    </>
  )
}

// ---- Simple and Advanced: a small pocket knife and a full Swiss knife ------------------------------------

/*
 * Simple is a small pocket knife with the one blade you use every day. Advanced is the same knife
 * grown into a full Swiss knife: the handle stretches and every tool folds out. Going back, the tools
 * fold in and it shrinks back to the small one; nothing is thrown away. The handle is two rounded ends
 * that slide apart over a body that stretches, each end carrying its rivet and the tools that turn on it.
 */
const KNIFE = { x: 180, y: 154, r: 19, small: 46, big: 104 }

type Tool = { d: string; at: 'L' | 'R'; open: number; line?: boolean; simple?: boolean; order: number }
/** Each drawn pointing right from its rivet; closed, a left tool points right (0°) and a right one left (180°), behind the handle. */
const KNIFE_TOOLS: Tool[] = [
  // the small knife: the everyday blade, and a bottle opener that stays folded
  { d: 'M0,-7 H66 Q88,-7 98,6 H0 Z', at: 'R', open: 348, simple: true, order: 0 },
  { d: 'M0,-5 H56 C68,-5 72,5 62,7 L58,2 H0 Z', at: 'L', open: 0, simple: true, order: 0 },
  // the Swiss knife adds the rest
  { d: 'M0,-6 H112 L118,0 L112,6 L107,2 L102,6 L97,2 L92,6 L87,2 L82,6 L77,2 L72,6 L67,2 L62,6 L57,2 L52,6 H0 Z', at: 'L', open: -168, order: 0 },
  { d: 'M0,-5 H40 L100,-1 L40,3 H0 Z M0,1 H40 L94,6 L40,7 H0 Z', at: 'L', open: -140, order: 1 },
  { d: 'M0,0 H30 L36,-5 L44,5 L52,-5 L60,5 L68,-5 L74,0', at: 'L', open: -114, line: true, order: 2 },
  { d: 'M0,-4 H84 L96,-2 V2 L84,4 H0 Z', at: 'L', open: -92, order: 3 },
  { d: 'M0,-3.5 H76 L100,0 L76,3.5 H0 Z', at: 'R', open: 322, order: 1 },
  { d: 'M0,-5 H92 Q100,0 92,5 H0 Z', at: 'R', open: 298, order: 2 },
  { d: 'M0,-3 H64 C70,-3 74,-8 80,-8 C86,-8 86,8 80,8 C74,8 70,3 64,3 H0 Z', at: 'R', open: 272, order: 3 },
]

const Knife: View = ({ beat }) => {
  const id = useIds()
  const big = beat === 1
  const half = big ? KNIFE.big : KNIFE.small
  // The ends slide apart on the second beat and back on the third.
  const slide = (side: -1 | 1): CSSProperties =>
    beat === 1
      ? ({
          transform: `translateX(${side * half}px)`,
          '--from': `translateX(${side * KNIFE.small}px)`,
          animation: 'hm-from 620ms cubic-bezier(0.3, 1.1, 0.5, 1) 200ms both',
        } as CSSProperties)
      : beat === 2
        ? ({
            transform: `translateX(${side * half}px)`,
            '--from': `translateX(${side * KNIFE.big}px)`,
            animation: 'hm-from 520ms cubic-bezier(0.4, 0, 0.2, 1) 800ms both',
          } as CSSProperties)
        : { transform: `translateX(${side * half}px)` }
  const stretch: CSSProperties =
    beat === 1
      ? ({
          transform: 'scaleX(1)',
          '--from': `scaleX(${KNIFE.small / KNIFE.big})`,
          animation: 'hm-from 620ms cubic-bezier(0.3, 1.1, 0.5, 1) 200ms both',
        } as CSSProperties)
      : beat === 2
        ? ({
            transform: `scaleX(${KNIFE.small / KNIFE.big})`,
            '--from': 'scaleX(1)',
            animation: 'hm-from 520ms cubic-bezier(0.4, 0, 0.2, 1) 800ms both',
          } as CSSProperties)
        : { transform: `scaleX(${KNIFE.small / KNIFE.big})` }
  const end = (side: 'L' | 'R') => (
    <g style={slide(side === 'L' ? -1 : 1)}>
      <g transform={`translate(${KNIFE.x} ${KNIFE.y})`}>
        {KNIFE_TOOLS.filter((t) => t.at === side).map((t) => {
          const closed = side === 'L' ? 0 : 180
          const shown = t.simple || big
          const angle = t.simple ? (t.open === 0 ? closed : t.open) : big ? t.open : closed
          let motion: CSSProperties = {}
          if (t.simple && t.open !== 0 && beat === 0)
            motion = { '--turn-from': `${closed}deg`, animation: 'hm-turn 640ms cubic-bezier(0.3, 1.15, 0.5, 1) 400ms both' } as CSSProperties
          if (!t.simple && beat === 1)
            motion = {
              '--turn-from': `${closed}deg`,
              animation: `hm-tool-in 760ms cubic-bezier(0.3, 1.1, 0.5, 1) ${650 + t.order * 110}ms both`,
            } as CSSProperties
          if (!t.simple && beat === 2)
            motion = {
              '--turn-from': `${t.open}deg`,
              '--turn-to': `${closed}deg`,
              animation: `hm-tool-out 640ms cubic-bezier(0.4, 0, 0.2, 1) ${150 + t.order * 80}ms both`,
            } as CSSProperties
          return (
            <g key={t.d} style={{ rotate: `${angle}deg`, transformOrigin: '0px 0px', opacity: shown ? 1 : 0, ...motion }}>
              {t.line ? (
                <path d={t.d} fill="none" stroke={`url(#${id('steel')})`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d={t.d} fill={`url(#${id('steel')})`} className="stroke-slate-400/80 dark:stroke-slate-500" strokeWidth="1.2" />
              )}
            </g>
          )
        })}
        {/* this end of the handle */}
        <circle r={KNIFE.r} fill={`url(#${id('cap')})`} />
      </g>
    </g>
  )
  return (
    <>
      <At x={180} y={24} style={pop(0)}>
        <Pill tone={big ? 'accent' : 'even'}>
          {big ? <AdvancedRocketIcon size={12} /> : <SimpleModeIcon size={12} />}
          {big ? 'Advanced' : 'Simple'}
        </Pill>
      </At>
      <svg className="absolute inset-0" width={W} height={H}>
        <defs>
          <linearGradient id={id('steel')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f8fafc" />
            <stop offset="0.55" stopColor="#cbd5e1" />
            <stop offset="1" stopColor="#94a3b8" />
          </linearGradient>
          <linearGradient id={id('handle')} x1="0" y1={KNIFE.y - KNIFE.r} x2="0" y2={KNIFE.y + KNIFE.r} gradientUnits="userSpaceOnUse">
            <stop offset="0" style={{ stopColor: 'var(--color-brand-400)' }} />
            <stop offset="1" style={{ stopColor: 'var(--color-brand-700)' }} />
          </linearGradient>
          {/* the same, for the ends, which are drawn about their own rivet */}
          <linearGradient id={id('cap')} x1="0" y1={-KNIFE.r} x2="0" y2={KNIFE.r} gradientUnits="userSpaceOnUse">
            <stop offset="0" style={{ stopColor: 'var(--color-brand-400)' }} />
            <stop offset="1" style={{ stopColor: 'var(--color-brand-700)' }} />
          </linearGradient>
        </defs>
        <ellipse
          cx={KNIFE.x}
          cy={KNIFE.y + KNIFE.r + 18}
          rx={KNIFE.big + 10}
          ry="6"
          className="fill-brand-900/15 dark:fill-black/40"
          style={{ transformBox: 'fill-box', transformOrigin: 'center', ...stretch }}
        />
        {end('L')}
        {end('R')}
        {/* the body between the ends, and its shine */}
        <g style={{ transformBox: 'view-box', transformOrigin: `${KNIFE.x}px ${KNIFE.y}px`, ...stretch }}>
          <rect x={KNIFE.x - KNIFE.big} y={KNIFE.y - KNIFE.r} width={KNIFE.big * 2} height={KNIFE.r * 2} fill={`url(#${id('handle')})`} />
          <rect x={KNIFE.x - KNIFE.big + 4} y={KNIFE.y - KNIFE.r + 7} width={KNIFE.big * 2 - 8} height="5" rx="2.5" fill="#fff" opacity="0.35" />
        </g>
        {/* the rivets sit over the body */}
        {(['L', 'R'] as const).map((side) => (
          <g key={side} style={slide(side === 'L' ? -1 : 1)}>
            <circle cx={KNIFE.x} cy={KNIFE.y} r="5" fill="#fff" opacity="0.85" />
          </g>
        ))}
      </svg>
      {beat === 2 && (
        <At x={180} y={KNIFE.y + KNIFE.r + 46} style={rise(1300)}>
          <Pill tone="up">✓ nothing thrown away</Pill>
        </At>
      )}
    </>
  )
}

// ---- One total from many currencies: three glasses poured into one jug ---------------------------------

/*
 * Three glasses of different drinks ($, €, ₹) that don't add up as they are. Collect in my currency
 * pours each, in turn, into one jug measured in ₹: a glass lifts over the jug, tips, a stream runs in,
 * the jug rises, the glass goes back empty and its label shows what it was in yours. Then the jug
 * shows one total, marked ≈.
 */
const POUR = [
  { from: '$40', to: '₹3,360', x: 26, liquid: 'liquid2' },
  { from: '€25', to: '₹2,275', x: 84, liquid: 'liquid3' },
  { from: '₹1,200', to: '₹1,200', x: 142, liquid: 'liquid' },
] as const
const CUP = { top: 122, w: 40, h: 54 }
const JUG = { x: 226, top: 100, w: 96, h: 112 }
/** Where a glass's centre goes to pour: its lip, tipped 115°, then sits just over the jug's middle. */
const POUR_AT = { x: JUG.x + JUG.w / 2 - 16, y: JUG.top - 40 }
const LIP_Y = JUG.top - 10
const POUR_MS = 1300
const pourStart = (i: number) => 200 + i * 1300
/** The jug's whole timeline in the second beat, and each pour's share of it (for the level and the count). */
const JUG_MS = pourStart(2) + POUR_MS

function cupPath(x: number) {
  const { top, w, h } = CUP
  return `M${x},${top} H${x + w} L${x + w - 4},${top + h - 6} Q${x + w - 5},${top + h} ${x + w - 11},${top + h} H${x + 11} Q${x + 5},${top + h} ${x + 4},${top + h - 6} Z`
}

const Jug: View = ({ beat, still }) => {
  const id = useIds()
  const depth = JUG.h
  return (
    <>
      <svg className="absolute inset-0" width={W} height={H}>
        <GlassDefs id={id} />
        <clipPath id={id('jug')}>
          <rect x={JUG.x} y={JUG.top} width={JUG.w} height={JUG.h} rx="16" />
        </clipPath>
        <ellipse cx="174" cy="216" rx="160" ry="5" className="fill-brand-900/10 dark:fill-black/30" />
        {/* the jug's liquid: empty, then up a step with each pour, then full */}
        <g clipPath={`url(#${id('jug')})`}>
          <g
            style={
              beat === 0
                ? { transform: `translateY(${depth}px)` }
                : beat === 1
                  ? ({
                      transform: 'translateY(0)',
                      animation: `hm-jug ${JUG_MS}ms linear both`,
                      '--jug-0': `${depth}px`,
                      '--jug-1': `${depth * 0.55}px`,
                      '--jug-2': `${depth * 0.22}px`,
                    } as CSSProperties)
                  : undefined
            }
          >
            <path
              d={`M${JUG.x - 8},${JUG.top + 18} q13,-6 26,0 t26,0 t26,0 t26,0 t26,0 t26,0 t26,0 t26,0 v${JUG.h} h-208 z`}
              fill={`url(#${id('liquid')})`}
              opacity="0.92"
              style={ambient('sx-wave 2.8s linear infinite')}
            />
          </g>
        </g>
        {/* each pour's stream, from the tipped glass's lip down into the jug */}
        {beat === 1 &&
          POUR.map((g, i) => (
            <rect
              key={g.from}
              x={POUR_AT.x + 14}
              y={LIP_Y}
              width="5"
              height={JUG.top + JUG.h - 8 - LIP_Y}
              rx="2.5"
              fill={`url(#${id(g.liquid)})`}
              style={{
                transform: 'scaleY(0)',
                transformBox: 'fill-box',
                transformOrigin: 'top',
                animation: `hm-stream ${POUR_MS}ms linear ${pourStart(i)}ms both`,
              }}
            />
          ))}
        {/* the jug: glass, its ₹ marks and a handle */}
        <path
          d={`M${JUG.x + JUG.w},${JUG.top + 24} C${JUG.x + JUG.w + 26},${JUG.top + 24} ${JUG.x + JUG.w + 26},${JUG.top + 76} ${JUG.x + JUG.w},${JUG.top + 80}`}
          fill="none"
          className="stroke-brand-200 dark:stroke-white/25"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <rect
          x={JUG.x}
          y={JUG.top}
          width={JUG.w}
          height={JUG.h}
          rx="16"
          fill={`url(#${id('glass')})`}
          className="stroke-brand-200 dark:stroke-white/20"
          strokeWidth="2"
        />
        {[0.3, 0.55, 0.8].map((k) => (
          <line
            key={k}
            x1={JUG.x + JUG.w - 20}
            x2={JUG.x + JUG.w - 9}
            y1={JUG.top + JUG.h * k}
            y2={JUG.top + JUG.h * k}
            stroke="#fff"
            strokeOpacity="0.85"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ))}
        <text x={JUG.x + JUG.w - 15} y={JUG.top + JUG.h * 0.3 - 6} textAnchor="middle" className="fill-white text-[10px] font-black" opacity="0.9">
          ₹
        </text>
        <path d={`M${JUG.x + 10},${JUG.top + 16} L${JUG.x + 12},${JUG.top + 74}`} stroke="#fff" strokeOpacity="0.75" strokeWidth="4" strokeLinecap="round" />
        {/* the glasses: in the second beat each lifts over the jug, tips, pours and comes back empty */}
        {POUR.map((g, i) => {
          const cx = g.x + CUP.w / 2
          const cy = CUP.top + CUP.h / 2
          return (
            <g
              key={g.from}
              style={
                beat === 0
                  ? ({
                      '--from': 'translateY(14px)',
                      '--from-o': 0,
                      animation: `hm-from 520ms cubic-bezier(0.23, 1, 0.32, 1) ${150 + i * 120}ms both`,
                    } as CSSProperties)
                  : beat === 1
                    ? ({
                        transformBox: 'view-box',
                        transformOrigin: `${cx}px ${cy}px`,
                        '--dx': `${POUR_AT.x - cx}px`,
                        '--dy': `${POUR_AT.y - cy}px`,
                        animation: `hm-pour ${POUR_MS}ms ease-in-out ${pourStart(i)}ms both`,
                      } as CSSProperties)
                    : { opacity: 0.6 }
              }
            >
              <clipPath id={id(`cup${i}`)}>
                <path d={cupPath(g.x)} />
              </clipPath>
              <g clipPath={`url(#${id(`cup${i}`)})`}>
                <rect
                  x={g.x - 4}
                  y={CUP.top + 14}
                  width={CUP.w + 8}
                  height={CUP.h}
                  fill={`url(#${id(g.liquid)})`}
                  style={
                    beat === 0
                      ? { opacity: 0.92 }
                      : beat === 1
                        ? { opacity: 0, animation: `hm-drain ${POUR_MS}ms linear ${pourStart(i)}ms both` }
                        : { opacity: 0 }
                  }
                />
              </g>
              <path d={cupPath(g.x)} fill={`url(#${id('glass')})`} className="stroke-brand-200 dark:stroke-white/25" strokeWidth="2" />
              <path d={`M${g.x + 8},${CUP.top + 9} L${g.x + 10},${CUP.top + 38}`} stroke="#fff" strokeOpacity="0.75" strokeWidth="3" strokeLinecap="round" />
            </g>
          )
        })}
      </svg>
      {/* under each glass: its own currency, then, once poured, what it was in yours */}
      {POUR.map((g, i) => (
        <At key={g.from} x={g.x + CUP.w / 2} y={CUP.top + CUP.h + 18}>
          <span className="relative block h-5 w-[64px] text-center text-[12px] font-black tabular-nums">
            <span
              className="absolute inset-0 text-slate-800 dark:text-white"
              style={beat === 0 ? rise(150 + i * 120) : beat === 1 ? out(pourStart(i) + 700, 250) : { opacity: 0 }}
            >
              {g.from}
            </span>
            <span
              className="absolute inset-0 text-brand-700 dark:text-brand-300"
              style={beat === 0 ? { opacity: 0 } : beat === 1 ? rise(pourStart(i) + 800, 360) : undefined}
            >
              {g.to}
            </span>
          </span>
        </At>
      ))}
      {beat >= 1 && (
        <At x={JUG.x + JUG.w / 2} y={JUG.top + JUG.h + 22} style={beat === 2 ? pop(200) : undefined}>
          <Pill tone={beat === 2 ? 'accent' : 'even'}>
            {beat === 1 ? <Count from={0} to={6835} still={still} d={pourStart(0) + 700} ms={JUG_MS - pourStart(0) - 600} /> : '≈ ₹6,835'}
          </Pill>
        </At>
      )}
    </>
  )
}

// ---- Earn Pro: close your ring --------------------------------------------------------------------

/*
 * Like a fitness ring: each Help section you finish fills a piece of a ring round your photo. Finish
 * them all and the ring closes; a closed ring becomes the real PRO ring (the app's own ProRing and
 * ProPill, so it moves and looks as it will).
 */
const RING = { x: 180, y: 112, r: 60, pieces: 8 }
const PIECE = 1 / RING.pieces
const PIECE_GAP = 0.018

const Pro: View = ({ beat }) => {
  const id = useIds()
  const filled = beat === 0 ? 6 : RING.pieces
  const drawAt = (i: number) => (beat === 0 ? (i < 6 ? 300 + i * 200 : undefined) : beat === 1 && i >= 6 ? 250 + (i - 6) * 260 : undefined)
  const photo = (
    <div
      className="flex h-[84px] w-[84px] items-center justify-center rounded-full text-[30px] font-bold text-white"
      style={{
        background: `linear-gradient(140deg, ${PEOPLE.Asha.from}, ${PEOPLE.Asha.to})`,
        boxShadow: '0 10px 24px -10px color-mix(in oklab, var(--color-brand-700) 60%, transparent)',
      }}
    >
      A
    </div>
  )
  return (
    <>
      {beat < 2 ? (
        <>
          <svg className="absolute inset-0" width={W} height={H}>
            <defs>
              <linearGradient id={id('ring')} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" style={{ stopColor: 'var(--color-brand-500)' }} />
                <stop offset="1" style={{ stopColor: 'var(--color-duo-500)' }} />
              </linearGradient>
            </defs>
            {Array.from({ length: RING.pieces }, (_, i) => {
              const len = PIECE - PIECE_GAP
              const turn = -90 + i * 360 * PIECE + (PIECE_GAP / 2) * 360
              const on = i < filled
              const d = drawAt(i)
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: the pieces are fixed positions round the ring
                <g key={i} transform={`rotate(${turn} ${RING.x} ${RING.y})`}>
                  <circle
                    cx={RING.x}
                    cy={RING.y}
                    r={RING.r}
                    fill="none"
                    pathLength={1}
                    strokeDasharray={`${len} 1`}
                    className="stroke-slate-900/[0.07] dark:stroke-white/10"
                    strokeWidth="12"
                    strokeLinecap="round"
                  />
                  {on && (
                    <circle
                      cx={RING.x}
                      cy={RING.y}
                      r={RING.r}
                      fill="none"
                      pathLength={1}
                      stroke={`url(#${id('ring')})`}
                      strokeWidth="12"
                      strokeLinecap="round"
                      style={{
                        strokeDasharray: `${len} 1`,
                        ...(d === undefined
                          ? {}
                          : ({ '--dash-from': len, animation: `hm-dash 360ms cubic-bezier(0.4, 0, 0.2, 1) ${d}ms both` } as CSSProperties)),
                      }}
                    />
                  )}
                </g>
              )
            })}
            {/* closed: the gaps fill and it becomes one ring */}
            {beat === 1 && (
              <circle
                cx={RING.x}
                cy={RING.y}
                r={RING.r}
                fill="none"
                stroke={`url(#${id('ring')})`}
                strokeWidth="12"
                style={{ animation: 'hm-close 420ms ease-out 900ms both' }}
              />
            )}
          </svg>
          <At x={RING.x} y={RING.y}>
            {photo}
          </At>
          <At x={180} y={214} style={beat === 1 ? pop(1200) : undefined}>
            <Pill tone={beat === 1 ? 'up' : 'even'}>{beat === 1 ? '✓ All done · Congratulations' : `${filled} of ${RING.pieces} sections`}</Pill>
          </At>
        </>
      ) : (
        <>
          {/* beat 3: the closed ring becomes the PRO ring, and the badge by the name */}
          <At x={RING.x} y={RING.y} style={pop(150, 560)}>
            <ProRing photo={84}>{photo}</ProRing>
          </At>
          <div className="absolute left-0 flex w-full items-center justify-center gap-2" style={{ top: 204 }}>
            <span className="text-[18px] font-black leading-none text-slate-800 dark:text-white" style={rise(500)}>
              Asha Rao
            </span>
            <span style={pop(800)}>
              <ProPill h={11} />
            </span>
          </div>
        </>
      )}
    </>
  )
}

const VIEWS: Record<StoryKind, View> = {
  pot: Pot,
  seesaw: Seesaw,
  untangle: Untangle,
  remainder: Remainder,
  vault: Vault,
  filter: Filter,
  knife: Knife,
  jug: Jug,
  jars: Jars,
  doors: Doors,
  pro: Pro,
}
