import { type CSSProperties, type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react'
import { AdvancedRocketIcon, SimpleModeIcon } from '@/components/icons'
import type { StoryKind } from '@/lib/help'
import './help-motion.css'

/**
 * The explainers' pictures in Help (src/lib/help-content.ts `story`): one everyday object per
 * explainer (a pot, a see-saw, a pizza, a piggy bank, a mailbox, a TV remote...), never a copy of
 * the app's screens. Each beat makes one big move (something drops, tips, flies or slides) with a
 * spring, and the last beat pays off. Drawn like the app's Solar duotone icons: thick rounded lines
 * over a soft translucent fill, all in the accent's tokens (help-motion.css `.story-art`), so it
 * follows the person's accent and dark mode; green and red only where they mean owed and owes.
 * `still` (reduced motion, or animations off) shows each beat's finished picture: every animation
 * runs FROM somewhere TO the element's own style, so with animations off the style is the end frame.
 * Keep each beat's motion inside its time in STORY_ANIM_MS (src/lib/help.ts).
 * Purely a picture: hidden from screen readers, which read the captions beside it.
 */
export function Story({ kind, beat, still }: { kind: StoryKind; beat: number; still: boolean }) {
  const View = VIEWS[kind]
  return (
    <Stage still={still} beat={beat}>
      <View beat={beat} />
    </Stage>
  )
}

type View = (p: { beat: number }) => ReactNode

// The stage is drawn at a fixed size and scaled to fit, so motion paths (in px) line up at any width.
const W = 360
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
      {/* Keyed by beat: each caption replays its own move. Still (reduced motion, animations off), a beat only crossfades in. */}
      <div
        key={beat}
        className={`story-art absolute left-0 top-0 ${still ? 'sx-still animate-[fade-in_150ms_ease-out]' : ''}`}
        style={{ width: W, height: H, transform: `scale(${k})`, transformOrigin: '0 0' }}
      >
        {/* The light behind the picture: two soft glows in the accent's colours. They stay put: only the story moves. */}
        <div className="absolute -left-10 -top-12 h-44 w-44 rounded-full bg-brand-400/20 blur-3xl dark:bg-brand-500/15" />
        <div className="absolute -bottom-16 -right-8 h-48 w-48 rounded-full bg-duo-400/20 blur-3xl dark:bg-duo-500/10" />
        {children}
      </div>
    </div>
  )
}

// ---- Motion ------------------------------------------------------------------------------------

/**
 * A spring as a CSS easing: a damped wave sampled into linear(). `decay` is how fast it settles,
 * `half` how many half swings it makes; it overshoots by about e^(-decay/half).
 */
function spring(decay: number, half: number): string {
  const pts: string[] = []
  for (let i = 0; i <= 48; i++) {
    const t = i / 48
    pts.push(i === 48 ? '1' : (1 - Math.exp(-decay * t) * Math.cos(half * Math.PI * t)).toFixed(3))
  }
  return `linear(${pts.join(', ')})`
}
/** Springy: pops and tips overshoot by about a fifth and settle. */
const SPRING = spring(5, 3)
/** Soft: travels overshoot a touch, so a long slide doesn't fly past. */
const SOFT = spring(6, 2)
const EASE_IN = 'cubic-bezier(0.5, 0, 0.75, 0)'

type Vars = CSSProperties & Record<`--${string}`, string | number>

/** Centre-based transforms for an SVG group (its own box), or `origin` for a pivot. */
const box = (origin = 'center'): CSSProperties => ({ transformBox: 'fill-box', transformOrigin: origin })

/** Comes FROM `t` (a transform) and fades in, springing to where its style puts it. */
const from = (t: string, d = 0, ms = 700, ease = SPRING, o = 0): Vars => ({ '--from': t, '--from-o': o, animation: `hm-from ${ms}ms ${ease} ${d}ms both` })
/** Pops in from nothing with a bounce. */
const pop = (d = 0, ms = 600): Vars => from('scale(0)', d, ms)
/** Leaves: ends hidden at `to` (its style), starting from where it is. */
const gone = (d = 0, ms = 350, to = 'scale(0.4)'): Vars => ({
  opacity: 0,
  transform: to,
  '--from': 'none',
  '--from-o': 1,
  animation: `hm-from ${ms}ms ${EASE_IN} ${d}ms both`,
})
/** Falls in from `h` px above, squashes on landing and bounces twice (origin: its feet). */
const drop = (d = 0, ms = 850, h = -150): Vars => ({ '--h': `${h}px`, animation: `ex-drop ${ms}ms linear ${d}ms both`, transformOrigin: '50% 100%' })
/** A thump, a shake or a press, on something that otherwise stays put. */
const thump = (d = 0, ms = 500): CSSProperties => ({ animation: `ex-squash ${ms}ms ease-out ${d}ms both` })
const shake = (d = 0, ms = 900): CSSProperties => ({ animation: `ex-shake ${ms}ms ease-in-out ${d}ms both` })
const press = (d = 0, ms = 450): CSSProperties => ({ animation: `ex-press ${ms}ms ease-out ${d}ms both` })

// ---- Shared parts ------------------------------------------------------------------------------

/** Something placed by its centre, in stage px. */
function At({ x, y, children, style }: { x: number; y: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: x, top: y, ...style }}>
      {children}
    </div>
  )
}

/** Something that travels along a path (stage px) and stays where it lands, or vanishes there. */
function Fly({ path, d = 0, ms = 900, vanish, children }: { path: string; d?: number; ms?: number; vanish?: boolean; children: ReactNode }) {
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

/** The SVG layer, with the accent's line gradient (brand → duo) under `${id('ln')}`. */
function Art({ id, children }: { id: (n: string) => string; children: ReactNode }) {
  return (
    <svg className="absolute inset-0 overflow-visible" width={W} height={H}>
      <defs>
        <linearGradient id={id('ln')} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2={H}>
          <stop offset="0" style={{ stopColor: 'var(--ln)' }} />
          <stop offset="1" style={{ stopColor: 'var(--ln2)' }} />
        </linearGradient>
      </defs>
      {children}
    </svg>
  )
}

/** A thick rounded outline in the accent gradient over a soft fill: the duotone look. */
const duo = (id: (n: string) => string, w = 5, fill = 'var(--soft)') => ({
  fill,
  stroke: `url(#${id('ln')})`,
  strokeWidth: w,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

/** Gradients the drawings share; ids are made unique per picture. */
function useIds() {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '')
  return (name: string) => `sx${raw}${name}`
}

const PEOPLE: Record<string, { from: string; to: string }> = {
  Asha: { from: 'var(--color-brand-400)', to: 'var(--color-brand-700)' },
  Ravi: { from: 'var(--color-duo-400)', to: 'var(--color-duo-700)' },
  Meera: { from: 'var(--color-brand-300)', to: 'var(--color-duo-500)' },
  Kabir: { from: 'var(--color-duo-300)', to: 'var(--color-brand-600)' },
}

/** A person as the app draws them: initials on their colour, with a soft ring. */
function Person({ name, size = 40, label = true }: { name: string; size?: number; label?: boolean }) {
  const c = PEOPLE[name] ?? PEOPLE.Asha
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex items-center justify-center rounded-full font-bold text-white ring-[3px] ring-white dark:ring-ink-900"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.4,
          background: `linear-gradient(140deg, ${c.from}, ${c.to})`,
          boxShadow: '0 6px 16px -6px color-mix(in oklab, var(--color-brand-700) 55%, transparent)',
        }}
      >
        {name.slice(0, 1)}
      </div>
      {label && <div className="text-[11px] font-semibold leading-none text-slate-600 dark:text-slate-300">{name}</div>}
    </div>
  )
}

/** A coin in the accent: a thick rim and a soft face. */
function Coin({ label = '₹', size = 32 }: { label?: string; size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full font-black tabular-nums leading-none"
      style={{
        width: size,
        height: size,
        fontSize: label.length > 4 ? size * 0.24 : label.length > 2 ? size * 0.3 : size * 0.42,
        background: 'var(--coin)',
        color: 'var(--ln)',
        border: `${Math.max(3, Math.round(size * 0.09))}px solid var(--ln)`,
        boxShadow: 'inset 0 -3px 0 var(--soft2), 0 6px 14px -8px color-mix(in oklab, var(--color-brand-700) 70%, transparent)',
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
  even: 'bg-white text-slate-700 ring-slate-200 dark:bg-ink-800 dark:text-slate-100 dark:ring-white/15',
  accent: 'bg-fill text-on-fill ring-transparent',
}

function Pill({ children, tone = 'even', big }: { children: ReactNode; tone?: Tone; big?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-bold tabular-nums ring-1 backdrop-blur ${big ? 'px-3.5 py-1.5 text-[15px]' : 'px-2.5 py-1 text-[12px]'} ${TONES[tone]}`}
    >
      {children}
    </span>
  )
}

/** A burst of four-pointed stars, for the moment something comes out right. */
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

/** A ring that spreads from a point and fades: something just happened here. */
function Ripple({ x, y, r = 24, d = 0 }: { x: number; y: number; r?: number; d?: number }) {
  return (
    <circle
      cx={x}
      cy={y}
      r={r}
      fill="none"
      strokeWidth="3"
      style={{ stroke: 'var(--ln2)', opacity: 0, ...box(), animation: `sx-ring 800ms ease-out ${d}ms both`, transform: 'scale(1.8)' }}
    />
  )
}

const Check = ({ size = 22 }: { size?: number }) => (
  <span className="flex items-center justify-center rounded-full bg-fill text-on-fill shadow-sm" style={{ width: size, height: size }}>
    <svg
      width={size * 0.6}
      height={size * 0.6}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  </span>
)

// ---- What Split Now does: a shared pot --------------------------------------------------------------
// 1 Asha's coin drops in and the pot fills. 2 A slice flies out to each. 3 Each slice becomes one
// number. 4 Ravi's and Meera's coins fly to Asha, the pot empties, everyone gets a tick.

const JAR = 'M152,34 L208,34 L208,44 C208,52 232,54 232,68 L232,122 Q232,140 214,140 L146,140 Q128,140 128,122 L128,68 C128,54 152,52 152,44 Z'
const SEATS = [
  { name: 'Asha', x: 60 },
  { name: 'Ravi', x: 180 },
  { name: 'Meera', x: 300 },
]
const SEAT_Y = 208
const NUM_Y = 162

const Pot: View = ({ beat }) => {
  const id = useIds()
  const liquid: CSSProperties =
    beat === 0 ? from('translateY(84px)', 950, 900, SOFT, 1) : beat === 3 ? gone(1500, 900, 'translateY(84px)') : { transform: 'none' }
  return (
    <>
      <Art id={id}>
        <defs>
          <clipPath id={id('in')}>
            <path d={JAR} />
          </clipPath>
          <linearGradient id={id('liquid')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--color-brand-400)' }} />
            <stop offset="1" style={{ stopColor: 'var(--color-duo-500)' }} />
          </linearGradient>
        </defs>
        <g style={{ ...box('50% 100%'), ...(beat === 0 ? thump(1000) : beat === 3 ? thump(1350) : {}) }}>
          <path d={JAR} {...duo(id, 5)} />
          <g clipPath={`url(#${id('in')})`}>
            <g style={{ ...liquid, ...(beat === 3 ? { opacity: 1 } : {}) }}>
              <path d="M120,70 q15,-8 30,0 t30,0 t30,0 t30,0 v80 h-120 z" fill={`url(#${id('liquid')})`} opacity="0.8" />
            </g>
          </g>
          <path d={JAR} fill="none" stroke={`url(#${id('ln')})`} strokeWidth="5" strokeLinejoin="round" />
          <rect x="144" y="20" width="72" height="16" rx="7" {...duo(id, 5, 'var(--soft2)')} />
          <path d="M142,76 C139,92 139,108 143,122" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="5" strokeLinecap="round" />
          {beat < 3 && (
            <text x="180" y="110" textAnchor="middle" className="fill-white text-[24px] font-black" style={{ ...box(), ...(beat === 0 ? pop(1300) : {}) }}>
              ₹900
            </text>
          )}
          {beat === 3 && (
            <text x="180" y="110" textAnchor="middle" className="fill-white text-[24px] font-black" style={{ ...box(), ...gone(1500, 500) }}>
              ₹900
            </text>
          )}
        </g>
      </Art>
      {SEATS.map((s) => (
        <At key={s.name} x={s.x} y={SEAT_Y}>
          <Person name={s.name} size={40} />
        </At>
      ))}
      {beat === 0 && (
        <Fly path={`M60,170 Q60,-10 180,26 L180,80`} ms={950} d={100} vanish>
          <Coin label="₹900" size={44} />
        </Fly>
      )}
      {beat === 1 &&
        SEATS.map((s, i) => (
          <Fly key={s.name} path={`M180,90 Q${(180 + s.x) / 2},${s.x === 180 ? 40 : -20} ${s.x},${NUM_Y}`} ms={800} d={200 + i * 150}>
            <Pill tone="accent">₹300</Pill>
          </Fly>
        ))}
      {beat === 2 &&
        SEATS.map((s, i) => (
          <At key={s.name} x={s.x} y={NUM_Y} style={pop(100 + i * 150)}>
            <Pill tone={i === 0 ? 'up' : 'down'}>{i === 0 ? 'owed ₹600' : 'owes ₹300'}</Pill>
          </At>
        ))}
      {beat === 3 && (
        <>
          {SEATS.map((s, i) => (
            <At key={s.name} x={s.x} y={NUM_Y} style={gone(1150, 300)}>
              <Pill tone={i === 0 ? 'up' : 'down'}>{i === 0 ? 'owed ₹600' : 'owes ₹300'}</Pill>
            </At>
          ))}
          <Fly path="M180,190 Q120,100 60,180" ms={900} d={200} vanish>
            <Coin label="₹300" size={34} />
          </Fly>
          <Fly path="M300,190 Q180,40 60,180" ms={1000} d={400} vanish>
            <Coin label="₹300" size={34} />
          </Fly>
          {SEATS.map((s, i) => (
            <At key={s.name} x={s.x} y={NUM_Y} style={pop(1500 + i * 120)}>
              <Check size={26} />
            </At>
          ))}
          <Sparkles x={180} y={84} d={2000} spread={62} />
        </>
      )}
    </>
  )
}

// ---- How balances work: a see-saw -----------------------------------------------------------------------
// 1 The plank drops on and sits level. 2 Asha's ₹900 lands on her end and tips it her way.
// 3 Ravi's and Meera's coins fly to her, the ₹900 goes, and it swings back level.

const PIVOT = { x: 180, y: 186 }
const TILT = -12
const RIDERS = [
  { name: 'Asha', x: 72 },
  { name: 'Ravi', x: 258 },
  { name: 'Meera', x: 306 },
]
/** Where a point on the plank is once it has tipped (stage px). */
function tipped(x: number, y: number) {
  const a = (TILT * Math.PI) / 180
  const dx = x - PIVOT.x
  const dy = y - PIVOT.y
  return { x: PIVOT.x + dx * Math.cos(a) - dy * Math.sin(a), y: PIVOT.y + dx * Math.sin(a) + dy * Math.cos(a) }
}

function Rider({ name, x }: { name: string; x: number }) {
  const c = PEOPLE[name]
  return (
    <g>
      <circle cx={x} cy={152} r={22} style={{ fill: c.to }} className="stroke-white dark:stroke-ink-900" strokeWidth="3" />
      <text x={x} y={159} textAnchor="middle" className="fill-white text-[19px] font-bold">
        {name.slice(0, 1)}
      </text>
    </g>
  )
}

const Seesaw: View = ({ beat }) => {
  const id = useIds()
  const turn: CSSProperties =
    beat === 1
      ? { transform: `rotate(${TILT}deg)`, ...from('rotate(0deg)', 700, 1300, SPRING, 1) }
      : beat === 2
        ? { transform: 'rotate(0deg)', ...from(`rotate(${TILT}deg)`, 1400, 1400, SPRING, 1) }
        : { transform: 'rotate(0deg)' }
  const asha = tipped(72, 152)
  const coinAt = tipped(118, 150)
  return (
    <>
      <Art id={id}>
        <path d="M180,186 L216,228 Q219,232 213,232 L147,232 Q141,232 144,228 Z" {...duo(id, 5, 'var(--soft2)')} />
        <g style={{ ...box('50% 100%'), ...(beat === 0 ? drop(0, 850, -120) : {}) }}>
          <g style={{ transformBox: 'view-box', transformOrigin: `${PIVOT.x}px ${PIVOT.y}px`, ...turn }}>
            <rect x="30" y="174" width="300" height="14" rx="7" {...duo(id, 5)} />
            {RIDERS.map((r) => (
              <Rider key={r.name} {...r} />
            ))}
            {beat === 1 && (
              <g style={{ ...box('50% 100%'), ...drop(150, 650, -140) }}>
                <circle cx="118" cy="150" r="22" style={{ fill: 'var(--coin)', stroke: 'var(--ln)' }} strokeWidth="4" />
                <text x="118" y="155" textAnchor="middle" className="text-[12px] font-black" style={{ fill: 'var(--ln)' }}>
                  ₹900
                </text>
              </g>
            )}
            {beat === 2 && (
              <g style={{ ...box(), ...gone(1250, 300) }}>
                <circle cx="118" cy="150" r="22" style={{ fill: 'var(--coin)', stroke: 'var(--ln)' }} strokeWidth="4" />
                <text x="118" y="155" textAnchor="middle" className="text-[12px] font-black" style={{ fill: 'var(--ln)' }}>
                  ₹900
                </text>
              </g>
            )}
          </g>
        </g>
        {beat === 2 && <Ripple x={180} y={186} r={20} d={2600} />}
      </Art>
      {beat === 1 && (
        <At x={asha.x + 12} y={asha.y - 52} style={pop(1700, 500)}>
          <Pill tone="up">owed ₹600</Pill>
        </At>
      )}
      {beat === 2 && (
        <>
          <At x={asha.x + 12} y={asha.y - 52} style={gone(1250, 300)}>
            <Pill tone="up">owed ₹600</Pill>
          </At>
          <Fly path={`M${tipped(258, 152).x},${tipped(258, 152).y} Q190,40 ${coinAt.x},${coinAt.y}`} ms={800} d={200} vanish>
            <Coin label="₹300" size={30} />
          </Fly>
          <Fly path={`M${tipped(306, 152).x},${tipped(306, 152).y} Q210,10 ${coinAt.x},${coinAt.y}`} ms={900} d={400} vanish>
            <Coin label="₹300" size={30} />
          </Fly>
          <At x={180} y={44} style={pop(2700, 500)}>
            <Pill tone="up" big>
              ✓ Level
            </Pill>
          </At>
          <Sparkles x={180} y={130} d={2600} spread={64} />
        </>
      )}
    </>
  )
}

// ---- Fewer payments: tangled strings, then three straight lines ------------------------------------
// 1 Strings draw between everyone: a tangle. 2 They fall away; each person keeps one number.
// 3 Three straight arrows shoot across, and everyone gets a tick.

const NODES = [
  { name: 'Asha', x: 70, y: 66, net: 500 },
  { name: 'Ravi', x: 290, y: 66, net: -200 },
  { name: 'Meera', x: 290, y: 190, net: -400 },
  { name: 'Kabir', x: 70, y: 190, net: 100 },
]
const STRINGS = [
  'M92,80 C150,30 130,210 196,140 S250,110 270,174',
  'M268,80 C200,130 236,30 160,104 S108,210 90,176',
  'M94,60 C140,112 176,8 220,72 S252,36 266,60',
  'M94,196 C140,148 172,236 212,182 S252,236 266,196',
  'M62,92 C20,124 128,140 66,166',
  'M298,92 C340,124 232,140 294,166',
]
// What Simplify debts suggests: Ravi → Asha ₹200, Meera → Asha ₹300, Meera → Kabir ₹100. No line crosses another.
const PAYS: Array<[number, number]> = [
  [1, 0],
  [2, 0],
  [2, 3],
]
/** The number under (or over) each person: top row above, bottom row below. */
const netAt = (n: (typeof NODES)[number]) => ({ x: n.x, y: n.y < 128 ? n.y - 40 : n.y + 40 })

function straight(f: number, t: number) {
  const a = NODES[f]
  const b = NODES[t]
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const ux = (b.x - a.x) / len
  const uy = (b.y - a.y) / len
  return { x1: a.x + ux * 30, y1: a.y + uy * 30, x2: b.x - ux * 34, y2: b.y - uy * 34, angle: (Math.atan2(uy, ux) * 180) / Math.PI }
}

const Untangle: View = ({ beat }) => {
  const id = useIds()
  return (
    <>
      <Art id={id}>
        {beat === 0 && (
          <g style={{ ...box(), ...shake(1600, 350) }}>
            {STRINGS.map((d, i) => (
              <path
                key={d}
                d={d}
                pathLength={1}
                fill="none"
                strokeWidth="4"
                strokeLinecap="round"
                style={{ stroke: i % 2 ? 'var(--ln2)' : 'var(--ln)', strokeDasharray: 1, animation: `sx-draw 700ms ease-out ${100 + i * 150}ms both` }}
              />
            ))}
          </g>
        )}
        {beat === 1 &&
          STRINGS.map((d, i) => (
            <path
              key={d}
              d={d}
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              style={{ stroke: i % 2 ? 'var(--ln2)' : 'var(--ln)', ...box(), ...gone(100 + i * 60, 550, `translateY(90px) rotate(${i % 2 ? 14 : -14}deg)`) }}
            />
          ))}
        {beat === 2 &&
          PAYS.map(([f, t], i) => {
            const s = straight(f, t)
            return (
              <g key={`${f}${t}`}>
                <line
                  x1={s.x1}
                  y1={s.y1}
                  x2={s.x2}
                  y2={s.y2}
                  pathLength={1}
                  stroke={`url(#${id('ln')})`}
                  strokeWidth="7"
                  strokeLinecap="round"
                  style={{ strokeDasharray: 1, animation: `sx-draw 450ms cubic-bezier(0.3, 0, 0.2, 1) ${200 + i * 350}ms both` }}
                />
                <g transform={`translate(${s.x2} ${s.y2}) rotate(${s.angle})`}>
                  <path
                    d="M-12,-10 L4,0 L-12,10"
                    fill="none"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ stroke: 'var(--ln2)', ...box(), ...pop(600 + i * 350, 400) }}
                  />
                </g>
              </g>
            )
          })}
      </Art>
      {NODES.map((n) => (
        <At key={n.name} x={n.x} y={n.y}>
          <Person name={n.name} size={42} label={false} />
        </At>
      ))}
      {beat >= 1 &&
        NODES.map((n, i) => (
          <At key={n.name} x={netAt(n).x} y={netAt(n).y} style={beat === 1 ? pop(700 + i * 120) : gone(1500 + i * 80, 300)}>
            <Pill tone={n.net > 0 ? 'up' : 'down'}>
              {n.net > 0 ? 'owed' : 'owes'} ₹{Math.abs(n.net)}
            </Pill>
          </At>
        ))}
      {beat === 2 && (
        <>
          {NODES.map((n, i) => (
            <At key={n.name} x={netAt(n).x} y={netAt(n).y} style={pop(1850 + i * 100, 500)}>
              <Check size={26} />
            </At>
          ))}
          <Sparkles x={180} y={128} d={2300} spread={70} />
        </>
      )}
    </>
  )
}

// ---- Splits add up: a pizza cut three ways --------------------------------------------------------------
// 1 A ₹100 pizza lands and is cut in three: ₹33.333… each. 2 Rounded down each slice is ₹33.33 and a
// crumb, one paisa, is left over. 3 The crumb hops onto the first person's slice: ₹33.34, ₹100 again.

const PIE = { x: 180, y: 98, r: 68 }
const deg = (a: number) => (a * Math.PI) / 180
const onPie = (a: number, r: number) => ({ x: PIE.x + Math.cos(deg(a)) * r, y: PIE.y + Math.sin(deg(a)) * r })
const SLICE = [0, 1, 2].map((i) => {
  const a0 = -90 + i * 120
  const mid = a0 + 60
  return { a0, a1: a0 + 120, mid, name: ['Asha', 'Ravi', 'Meera'][i] }
})
const GAP = 9

function Slice({ id, i }: { id: (n: string) => string; i: number }) {
  const s = SLICE[i]
  const p0 = onPie(s.a0, PIE.r)
  const p1 = onPie(s.a1, PIE.r)
  const c0 = onPie(s.a0, PIE.r - 6)
  const c1 = onPie(s.a1, PIE.r - 6)
  const t1 = onPie(s.mid - 40, 48)
  const t2 = onPie(s.mid + 40, 48)
  return (
    <g>
      <path d={`M${PIE.x},${PIE.y} L${p0.x},${p0.y} A${PIE.r},${PIE.r} 0 0 1 ${p1.x},${p1.y} Z`} style={{ fill: 'var(--soft2)' }} />
      <path
        d={`M${c0.x},${c0.y} A${PIE.r - 6},${PIE.r - 6} 0 0 1 ${c1.x},${c1.y}`}
        fill="none"
        stroke={`url(#${id('ln')})`}
        strokeWidth="10"
        strokeLinecap="round"
      />
      {[t1, t2].map((t) => (
        <circle key={t.x} cx={t.x} cy={t.y} r="6" style={{ fill: 'var(--soft)', stroke: 'var(--ln)' }} strokeWidth="2.5" />
      ))}
    </g>
  )
}

const Remainder: View = ({ beat }) => {
  const id = useIds()
  const apart = (i: number) => {
    const m = SLICE[i].mid
    return `translate(${Math.cos(deg(m)) * GAP}px, ${Math.sin(deg(m)) * GAP}px)`
  }
  const label = (i: number) => onPie(SLICE[i].mid, 34)
  const seat = (i: number) => {
    const p = onPie(SLICE[i].mid, PIE.r + 30)
    return { x: p.x + Math.cos(deg(SLICE[i].mid)) * GAP, y: p.y + Math.sin(deg(SLICE[i].mid)) * GAP }
  }
  return (
    <>
      <Art id={id}>
        <g style={{ ...box('50% 100%'), ...(beat === 0 ? drop(0, 900, -170) : {}) }}>
          {SLICE.map((s, i) => (
            <g key={s.name} style={{ transform: apart(i), ...(beat === 0 ? from('none', 1500 + i * 60, 700, SPRING, 1) : {}) }}>
              <g style={{ ...box(), ...(beat === 2 && i === 0 ? thump(850, 500) : {}) }}>
                <Slice id={id} i={i} />
              </g>
            </g>
          ))}
        </g>
        {beat === 0 &&
          SLICE.map((s, i) => {
            const p = onPie(s.a0, PIE.r + 4)
            return (
              <line
                key={s.name}
                x1={PIE.x}
                y1={PIE.y}
                x2={p.x}
                y2={p.y}
                pathLength={1}
                strokeWidth="4"
                strokeLinecap="round"
                style={{
                  stroke: 'var(--ln)',
                  strokeDasharray: 1,
                  opacity: 0,
                  animation: `sx-draw 300ms ease-out ${950 + i * 140}ms both, sx-out 250ms ease-in 1500ms both`,
                }}
              />
            )
          })}
        {beat === 0 && (
          <text x={PIE.x} y={PIE.y + 8} textAnchor="middle" className="text-[24px] font-black" style={{ fill: 'var(--ln)', ...box(), ...gone(950, 300) }}>
            ₹100
          </text>
        )}
        {beat >= 1 &&
          SLICE.map((s, i) => {
            const p = label(i)
            const m = SLICE[i].mid
            const x = p.x + Math.cos(deg(m)) * GAP
            const y = p.y + Math.sin(deg(m)) * GAP + 5
            const spare = beat === 2 && i === 0
            return (
              <g key={s.name}>
                <text
                  x={x}
                  y={y}
                  textAnchor="middle"
                  className="text-[14px] font-black"
                  style={{ fill: 'var(--ln)', ...box(), ...(beat === 1 ? pop(100 + i * 120, 500) : spare ? gone(850, 200) : {}) }}
                >
                  33.33
                </text>
                {spare && (
                  <text x={x} y={y} textAnchor="middle" className="text-[14px] font-black" style={{ fill: 'var(--ln)', ...box(), ...pop(900, 500) }}>
                    33.34
                  </text>
                )}
              </g>
            )
          })}
      </Art>
      {SLICE.map((s, i) => (
        <At key={s.name} x={seat(i).x} y={seat(i).y} style={beat === 0 ? pop(1600 + i * 100, 500) : undefined}>
          <Person name={s.name} size={28} label={false} />
        </At>
      ))}
      {beat === 0 && (
        <At x={180} y={238} style={pop(1700, 500)}>
          <Pill>₹33.333… each</Pill>
        </At>
      )}
      {beat === 1 && (
        <>
          <At x={PIE.x} y={PIE.y} style={{ ...pop(700, 600) }}>
            <Coin label="1p" size={26} />
          </At>
          <At x={180} y={238} style={pop(1000, 600)}>
            <Pill tone="down">₹99.99 · a paisa short</Pill>
          </At>
        </>
      )}
      {beat === 2 && (
        <>
          <Fly path={`M${PIE.x},${PIE.y} Q${PIE.x + 30},${PIE.y - 90} ${label(0).x + 8},${label(0).y - 18}`} ms={650} d={200} vanish>
            <Coin label="1p" size={26} />
          </Fly>
          <At x={180} y={238} style={pop(1300, 600)}>
            <Pill tone="up">✓ ₹100.00</Pill>
          </At>
          <Sparkles x={label(0).x + 10} y={label(0).y} d={1400} spread={44} />
        </>
      )}
    </>
  )
}

// ---- What a private group hides: a locked box with a tag outside ---------------------------------------
// 1 The words fly into the box, the lid slams and a padlock drops on. 2 The group's key flies into
// the lock: it springs open. 3 The lid shuts again; a tag with the amount swings outside.

const WORDS = ['Goa trip', 'Dinner', 'Rahul']
const LOCK = { x: 180, y: 158 }

function Box({ id, lid, shackle }: { id: (n: string) => string; lid: CSSProperties; shackle: CSSProperties }) {
  return (
    <>
      <rect x="116" y="114" width="128" height="84" rx="14" {...duo(id, 5)} />
      <g style={{ transformBox: 'view-box', transformOrigin: '112px 116px', ...lid }}>
        <rect x="110" y="92" width="140" height="26" rx="11" {...duo(id, 5, 'var(--soft2)')} />
      </g>
      <path
        d={`M${LOCK.x - 9},${LOCK.y - 4} V${LOCK.y - 13} a9,9 0 0 1 18,0 V${LOCK.y - 4}`}
        fill="none"
        stroke="var(--ln)"
        strokeWidth="5"
        strokeLinecap="round"
        style={shackle}
      />
      <rect x={LOCK.x - 16} y={LOCK.y - 6} width="32" height="26" rx="7" style={{ fill: 'var(--paper)', stroke: 'var(--ln)' }} strokeWidth="5" />
      <circle cx={LOCK.x} cy={LOCK.y + 6} r="3.5" style={{ fill: 'var(--ln)' }} />
    </>
  )
}

const KeyArt = () => (
  <svg width="52" height="24" viewBox="0 0 52 24" className="overflow-visible">
    <circle cx="11" cy="12" r="8" style={{ fill: 'var(--soft2)', stroke: 'var(--ln)' }} strokeWidth="4" />
    <path d="M19,12 H48 M40,12 V19 M33,12 V17" fill="none" style={{ stroke: 'var(--ln)' }} strokeWidth="4" strokeLinecap="round" />
  </svg>
)

const Vault: View = ({ beat }) => {
  const id = useIds()
  const OPEN = 'translate(-4px, -38px) rotate(-14deg)'
  const lid: CSSProperties =
    beat === 0
      ? { transform: 'none', ...from(OPEN, 1550, 700, SPRING, 1) }
      : beat === 1
        ? { transform: OPEN, ...from('none', 1700, 800, SPRING, 1) }
        : { transform: 'none', ...from(OPEN, 0, 600, SPRING, 1) }
  const shackle: CSSProperties =
    beat === 1
      ? { transform: 'translateY(-9px)', ...from('none', 1400, 600, SPRING, 1) }
      : beat === 2
        ? { transform: 'none', ...from('translateY(-9px)', 350, 500, SPRING, 1) }
        : {}
  return (
    <>
      <Art id={id}>
        <g style={{ ...box('50% 100%'), ...(beat === 0 ? thump(1700, 500) : {}) }}>
          {beat === 0 ? (
            <g>
              <rect x="116" y="114" width="128" height="84" rx="14" {...duo(id, 5)} />
              <g style={{ transformBox: 'view-box', transformOrigin: '112px 116px', ...lid }}>
                <rect x="110" y="92" width="140" height="26" rx="11" {...duo(id, 5, 'var(--soft2)')} />
              </g>
              <g style={{ ...box('50% 100%'), ...drop(2100, 700, -110) }}>
                <path
                  d={`M${LOCK.x - 9},${LOCK.y - 4} V${LOCK.y - 13} a9,9 0 0 1 18,0 V${LOCK.y - 4}`}
                  fill="none"
                  stroke="var(--ln)"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <rect x={LOCK.x - 16} y={LOCK.y - 6} width="32" height="26" rx="7" style={{ fill: 'var(--paper)', stroke: 'var(--ln)' }} strokeWidth="5" />
                <circle cx={LOCK.x} cy={LOCK.y + 6} r="3.5" style={{ fill: 'var(--ln)' }} />
              </g>
            </g>
          ) : (
            <Box id={id} lid={lid} shackle={shackle} />
          )}
        </g>
        {beat === 1 && <Ripple x={186} y={100} r={30} d={2100} />}
      </Art>
      {beat === 0 &&
        WORDS.map((w, i) => (
          <Fly key={w} path={`M${58 + (i % 2) * 14},${44 + i * 36} Q120,${-20 + i * 10} 180,104`} ms={700} d={200 + i * 300} vanish>
            <Pill>{w}</Pill>
          </Fly>
        ))}
      {beat === 1 && (
        <>
          {['Asha', 'Ravi', 'Meera'].map((n, i) => (
            <At key={n} x={34 + i * 30} y={214 - (i % 2) * 14} style={pop(i * 100, 500)}>
              <Person name={n} size={30} label={false} />
            </At>
          ))}
          <Fly path={`M64,176 Q90,40 ${LOCK.x + 24},${LOCK.y + 6}`} ms={900} d={450}>
            <KeyArt />
          </Fly>
          <At x={186} y={96} style={from('translateY(26px) scale(0.5)', 2100, 700, SPRING)}>
            <Pill>Goa trip</Pill>
          </At>
        </>
      )}
      {beat === 2 && (
        <div className="absolute" style={{ left: 244, top: 128, transformOrigin: '0 0', animation: `hm-swing 1100ms ${SOFT} 600ms both` }}>
          <svg width="40" height="30" className="absolute left-0 top-0 overflow-visible">
            <path d="M0,0 Q16,10 26,26" fill="none" strokeWidth="2.5" strokeLinecap="round" style={{ stroke: 'var(--ln)' }} />
          </svg>
          <div
            className="absolute flex flex-col items-center rounded-xl px-3 pb-2 pt-3 text-center leading-tight"
            style={{ left: 6, top: 24, background: 'var(--paper)', border: '3px solid var(--ln)', color: 'var(--ln)' }}
          >
            <span className="absolute left-1/2 top-1 h-1.5 w-1.5 -translate-x-1/2 rounded-full" style={{ background: 'var(--ln)' }} />
            <span className="text-[17px] font-black tabular-nums">₹2,400</span>
            <span className="text-[11px] font-bold opacity-80">12 Oct</span>
          </div>
        </div>
      )}
    </>
  )
}

// ---- How auto-capture picks payments: a sieve ------------------------------------------------------------
// 1 A chat, an offer and a payment drop into the sieve. 2 It shakes: only the payment falls through,
// into the tray below. 3 The rest stay behind; the payment waits in the tray, your Inbox.

const ITEMS_Y = 86
const BOWL = 'M96,100 H264 Q262,156 180,160 Q98,156 96,100 Z'
const ITEMS = [
  { x: 136, kind: 'chat' },
  { x: 180, kind: 'pay' },
  { x: 224, kind: 'offer' },
] as const

function Bubble() {
  return (
    <svg width="42" height="38" viewBox="0 0 42 38" className="overflow-visible">
      <path
        d="M8,3 H34 Q39,3 39,8 V24 Q39,29 34,29 H16 L8,36 V29 Q3,29 3,24 V8 Q3,3 8,3 Z"
        style={{ fill: 'var(--paper)', stroke: 'var(--ln)' }}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      {[13, 21, 29].map((x) => (
        <circle key={x} cx={x} cy="16" r="2.6" style={{ fill: 'var(--ln)' }} />
      ))}
    </svg>
  )
}

function OfferTag() {
  return (
    <svg width="44" height="34" viewBox="0 0 44 34" className="overflow-visible">
      <path
        d="M14,3 H38 Q41,3 41,6 V28 Q41,31 38,31 H14 L3,17 Z"
        style={{ fill: 'var(--paper)', stroke: 'var(--ln)' }}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <text x="26" y="23" textAnchor="middle" className="text-[16px] font-black" style={{ fill: 'var(--ln)' }}>
        %
      </text>
    </svg>
  )
}

const Item = ({ kind }: { kind: (typeof ITEMS)[number]['kind'] }) =>
  kind === 'chat' ? <Bubble /> : kind === 'offer' ? <OfferTag /> : <Coin label="₹" size={36} />

function Tray({ id }: { id: (n: string) => string }) {
  return <path d="M130,196 H156 L163,207 H197 L204,196 H230 V222 Q230,232 220,232 H140 Q130,232 130,222 Z" {...duo(id, 5, 'var(--soft2)')} />
}

const Filter: View = ({ beat }) => {
  const id = useIds()
  const sieve = (
    <>
      <path d="M262,102 L326,88" fill="none" stroke={`url(#${id('ln')})`} strokeWidth="9" strokeLinecap="round" />
      <defs>
        <clipPath id={id('bowl')}>
          <path d={BOWL} />
        </clipPath>
      </defs>
      <path d={BOWL} style={{ fill: 'var(--soft)' }} />
      {/* the mesh: a criss-cross of thin lines inside the bowl */}
      <g clipPath={`url(#${id('bowl')})`} style={{ stroke: 'var(--ln)', opacity: 0.45 }} strokeWidth="2">
        {Array.from({ length: 16 }, (_, i) => 60 + i * 13).map((x) => (
          <path key={x} d={`M${x},96 l60,66 M${x + 60},96 l-60,66`} />
        ))}
      </g>
      <path d={BOWL} fill="none" stroke={`url(#${id('ln')})`} strokeWidth="5" strokeLinejoin="round" />
    </>
  )
  return (
    <>
      <Art id={id}>
        {beat >= 1 && (
          <g
            style={{
              ...box('50% 100%'),
              ...(beat === 1 ? { ...pop(0, 500), animation: `hm-from 500ms ${SPRING} 0ms both, ex-squash 500ms ease-out 1500ms both` } : {}),
            }}
          >
            <Tray id={id} />
          </g>
        )}
      </Art>
      {/* the sieve and what's caught in it shake together */}
      <div className="absolute left-0 top-0" style={{ width: W, height: H, transformOrigin: '180px 120px', ...(beat === 1 ? shake(100, 900) : {}) }}>
        <svg className="absolute inset-0 overflow-visible" width={W} height={H}>
          <defs>
            <linearGradient id={id('ln')} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2={H}>
              <stop offset="0" style={{ stopColor: 'var(--ln)' }} />
              <stop offset="1" style={{ stopColor: 'var(--ln2)' }} />
            </linearGradient>
          </defs>
          {sieve}
        </svg>
        {ITEMS.filter((it) => it.kind !== 'pay').map((it, i) => (
          <At key={it.kind} x={it.x} y={ITEMS_Y} style={beat === 2 ? { opacity: 0.35, ...from('none', 200, 500, EASE_IN, 1) } : undefined}>
            <div style={beat === 0 ? drop(100 + i * 2 * 200, 800, -110) : undefined}>
              <Item kind={it.kind} />
            </div>
          </At>
        ))}
      </div>
      {beat === 0 && (
        <At x={180} y={ITEMS_Y}>
          <div style={drop(300, 800, -110)}>
            <Coin label="₹" size={36} />
          </div>
        </At>
      )}
      {beat === 1 && (
        <Fly path={`M180,${ITEMS_Y} L180,206`} ms={600} d={950}>
          <Coin label="₹" size={36} />
        </Fly>
      )}
      {beat === 2 && (
        <>
          <At x={180} y={206}>
            <div style={{ ...thump(300, 500), transformOrigin: '50% 100%' }}>
              <Coin label="₹" size={36} />
            </div>
          </At>
          <svg className="absolute inset-0 overflow-visible" width={W} height={H}>
            <Ripple x={180} y={210} r={30} d={500} />
          </svg>
          <At x={286} y={214} style={pop(800, 500)}>
            <Pill tone="accent">Inbox</Pill>
          </At>
        </>
      )}
    </>
  )
}

// ---- Simple and Advanced: a TV remote ------------------------------------------------------------------
// 1 The remote drops in with a few big buttons. 2 Advanced slides the cover off: lots of small
// buttons. 3 The cover slides back; a big button still works and the light says all is on.

const COVER_OFF = 'translate(116px, 10px) rotate(12deg)'
const BIG = [
  { x: 180, y: 74, r: 19 },
  { x: 157, y: 118, r: 15 },
  { x: 203, y: 118, r: 15 },
]
const SMALL = [162, 186, 210].flatMap((y) => [158, 180, 202].map((x) => ({ x, y })))

const Drawers: View = ({ beat }) => {
  const id = useIds()
  const cover: CSSProperties =
    beat === 1 ? { transform: COVER_OFF, ...from('none', 100, 700, SOFT, 1) } : beat === 2 ? { transform: 'none', ...from(COVER_OFF, 100, 700, SOFT, 1) } : {}
  return (
    <>
      <Art id={id}>
        <g style={{ ...box('50% 100%'), ...(beat === 0 ? drop(0, 800, -200) : {}) }}>
          <rect x="134" y="18" width="92" height="226" rx="32" {...duo(id, 5)} />
          <circle cx="180" cy="38" r="4.5" style={{ fill: 'var(--ln2)' }} />
          {beat === 2 && <Ripple x={180} y={38} r={8} d={900} />}
          {BIG.map((b, i) => (
            <g key={b.x + b.y} style={{ ...box(), ...(beat === 0 ? pop(500 + i * 120, 500) : beat === 2 && i === 0 ? press(800) : {}) }}>
              <circle cx={b.x} cy={b.y} r={b.r} {...duo(id, 4, 'var(--soft2)')} />
              {i === 0 ? (
                <path d="M175,68 A8,8 0 1 0 185,68 M180,64 V73" fill="none" style={{ stroke: 'var(--ln)' }} strokeWidth="3.5" strokeLinecap="round" />
              ) : (
                <path
                  d={i === 1 ? 'M152,118 H162 M157,113 V123' : 'M198,118 H208'}
                  fill="none"
                  style={{ stroke: 'var(--ln)' }}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
              )}
            </g>
          ))}
          {SMALL.map((s, i) => (
            <circle
              key={`${s.x}${s.y}`}
              cx={s.x}
              cy={s.y}
              r="7"
              style={{ fill: 'var(--soft2)', stroke: 'var(--ln)', ...box(), ...(beat === 1 ? pop(350 + i * 60, 400) : {}) }}
              strokeWidth="3"
            />
          ))}
          <g style={{ ...box(), ...cover }}>
            <rect x="142" y="142" width="76" height="92" rx="20" style={{ fill: 'var(--paper)' }} stroke={`url(#${id('ln')})`} strokeWidth="5" />
            <path d="M170,154 H190 M170,162 H190" fill="none" style={{ stroke: 'var(--ln)', opacity: 0.5 }} strokeWidth="3" strokeLinecap="round" />
          </g>
        </g>
      </Art>
      <At x={66} y={128} style={pop(beat === 0 ? 600 : 250, 500)}>
        <Pill tone={beat === 1 ? 'accent' : 'even'} big>
          {beat === 1 ? <AdvancedRocketIcon size={16} /> : <SimpleModeIcon size={16} />}
          {beat === 1 ? 'Advanced' : 'Simple'}
        </Pill>
      </At>
    </>
  )
}

// ---- One total from many currencies: a piggy bank ----------------------------------------------------------
// 1 Coins from three countries drop in. 2 They hop into the piggy bank; it shakes. 3 Out comes one
// stack of ₹, about ₹6,835.

const PIG = { x: 150, y: 172 }
const FOREIGN = [
  { label: '$40', x: 76 },
  { label: '€25', x: 162 },
  { label: '₹1,200', x: 248 },
]
const SLOT = { x: PIG.x, y: 122 }

function Piggy({ id }: { id: (n: string) => string }) {
  const { x, y } = PIG
  return (
    <>
      <rect x={x - 46} y={y + 34} width="16" height="22" rx="6" {...duo(id, 4, 'var(--soft2)')} />
      <rect x={x + 28} y={y + 34} width="16" height="22" rx="6" {...duo(id, 4, 'var(--soft2)')} />
      <path d={`M${x - 72},${y - 6} q-16,-4 -12,-16`} fill="none" stroke="var(--ln)" strokeWidth="5" strokeLinecap="round" />
      <path d={`M${x + 30},${y - 42} Q${x + 36},${y - 70} ${x + 56},${y - 60} Q${x + 60},${y - 46} ${x + 54},${y - 36}`} {...duo(id, 5, 'var(--soft2)')} />
      <ellipse cx={x} cy={y} rx="74" ry="52" {...duo(id, 5)} />
      <rect x={x + 62} y={y - 14} width="24" height="30" rx="11" {...duo(id, 5, 'var(--soft2)')} />
      <circle cx={x + 70} cy={y + 1} r="2.6" style={{ fill: 'var(--ln)' }} />
      <circle cx={x + 78} cy={y + 1} r="2.6" style={{ fill: 'var(--ln)' }} />
      <circle cx={x + 44} cy={y - 14} r="4" style={{ fill: 'var(--ln)' }} />
      <path d={`M${SLOT.x - 20},${SLOT.y} H${SLOT.x + 20}`} fill="none" stroke="var(--ln)" strokeWidth="7" strokeLinecap="round" />
    </>
  )
}

function Stack() {
  return (
    <svg width="58" height="54" viewBox="0 0 58 54" className="overflow-visible">
      {[40, 28, 16].map((y) => (
        <g key={y}>
          <rect x="4" y={y - 4} width="50" height="12" style={{ fill: 'var(--coin)' }} />
          <ellipse cx="29" cy={y + 8} rx="25" ry="7" style={{ fill: 'var(--coin)', stroke: 'var(--ln)' }} strokeWidth="3.5" />
          <path d={`M4,${y + 8} V${y - 4} M54,${y + 8} V${y - 4}`} style={{ stroke: 'var(--ln)' }} strokeWidth="3.5" />
        </g>
      ))}
      <ellipse cx="29" cy="12" rx="25" ry="7" style={{ fill: 'var(--coin)', stroke: 'var(--ln)' }} strokeWidth="3.5" />
      <text x="29" y="16" textAnchor="middle" className="text-[11px] font-black" style={{ fill: 'var(--ln)' }}>
        ₹
      </text>
    </svg>
  )
}

const Exchange: View = ({ beat }) => {
  const id = useIds()
  return (
    <>
      <Art id={id}>
        <g style={{ ...box('50% 100%'), ...(beat === 1 ? shake(1300, 800) : beat === 2 ? thump(0, 500) : {}) }}>
          <Piggy id={id} />
          {/* the coins, seen inside: they land as each drops in, and go when the total comes out */}
          {beat >= 1 &&
            [0, 1, 2].map((i) => (
              <circle
                key={i}
                cx={PIG.x - 24 + i * 24}
                cy={PIG.y + 30 - (i === 1 ? 6 : 0)}
                r="11"
                strokeWidth="3.5"
                style={{
                  fill: 'var(--coin)',
                  stroke: 'var(--ln)',
                  ...box(),
                  ...(beat === 1 ? pop(650 + i * 260, 450) : gone(300, 300, 'translateY(-40px) scale(0.3)')),
                }}
              />
            ))}
        </g>
      </Art>
      {beat === 0 &&
        FOREIGN.map((c, i) => (
          <At key={c.label} x={c.x} y={50}>
            <div style={drop(100 + i * 180, 800, -90)}>
              <Coin label={c.label} size={c.label.length > 3 ? 60 : 50} />
            </div>
          </At>
        ))}
      {beat === 1 &&
        FOREIGN.map((c, i) => (
          <Fly key={c.label} path={`M${c.x},50 Q${(c.x + SLOT.x) / 2},${0} ${SLOT.x},${SLOT.y - 4}`} ms={650} d={100 + i * 260} vanish>
            <Coin label={c.label} size={c.label.length > 3 ? 60 : 50} />
          </Fly>
        ))}
      {beat === 2 && (
        <>
          <Fly path={`M${SLOT.x},${SLOT.y} Q${SLOT.x + 60},-10 290,70`} ms={800} d={300}>
            <Stack />
          </Fly>
          <At x={290} y={124} style={pop(1100, 600)}>
            <Pill tone="accent" big>
              ≈ ₹6,835
            </Pill>
          </At>
          <Sparkles x={290} y={70} d={1300} spread={48} />
        </>
      )}
    </>
  )
}

// ---- Why a captured payment waits for you: a mailbox ---------------------------------------------------------
// 1 A letter drops into the mailbox, the flag pops up: who's it for? 2 It comes out and gets
// stamped with a group. 3 It flies off to that group's house.

const LETTER = { x: 214, y: 118 }

function Letter({ stamped }: { stamped?: CSSProperties }) {
  return (
    <div className="relative" style={{ width: 84, height: 56 }}>
      <svg width="84" height="56" viewBox="0 0 84 56" className="absolute inset-0 overflow-visible">
        <rect x="2" y="2" width="80" height="52" rx="8" style={{ fill: 'var(--paper)', stroke: 'var(--ln)' }} strokeWidth="4" />
        <path d="M6,8 L42,32 L78,8" fill="none" style={{ stroke: 'var(--ln)' }} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="absolute bottom-1.5 left-2.5 text-[12px] font-black tabular-nums" style={{ color: 'var(--ln)' }}>
        ₹850
      </span>
      {stamped && (
        <span
          className="absolute -right-3 -top-4 flex h-9 w-9 items-center justify-center rounded-full text-[10px] font-black leading-none"
          style={{ border: '3px solid var(--ln2)', color: 'var(--ln2)', background: 'var(--paper)', rotate: '-14deg', ...stamped }}
        >
          Goa
        </span>
      )}
    </div>
  )
}

function Mailbox({ id, flag }: { id: (n: string) => string; flag: CSSProperties }) {
  return (
    <>
      <rect x="82" y="150" width="12" height="86" rx="4" {...duo(id, 4, 'var(--soft2)')} />
      <g style={{ transformBox: 'view-box', transformOrigin: '140px 132px', ...flag }}>
        <path d="M140,132 V98" fill="none" stroke="var(--ln2)" strokeWidth="5" strokeLinecap="round" />
        <rect x="140" y="96" width="22" height="14" rx="3" style={{ fill: 'var(--ln2)' }} />
      </g>
      <path d="M40,152 V110 Q40,82 68,82 H108 Q136,82 136,110 V152 Z" {...duo(id, 5)} />
      <path d="M64,106 H112" fill="none" stroke="var(--ln)" strokeWidth="6" strokeLinecap="round" />
    </>
  )
}

const Sort: View = ({ beat }) => {
  const id = useIds()
  const flag: CSSProperties = beat === 0 ? { transform: 'none', ...from('rotate(90deg)', 650, 600, SPRING, 1) } : {}
  return (
    <>
      <Art id={id}>
        <g style={{ ...box('50% 100%'), ...(beat === 0 ? thump(600, 400) : {}) }}>
          <Mailbox id={id} flag={flag} />
        </g>
        {beat === 2 && (
          <g style={{ ...box('50% 100%'), ...pop(0, 600) }}>
            <g style={{ ...box('50% 100%'), ...thump(1250, 500) }}>
              <path d="M258,162 L298,126 L338,162 V200 Q338,208 330,208 H266 Q258,208 258,200 Z" {...duo(id, 5)} />
              <rect x="288" y="178" width="20" height="30" rx="5" {...duo(id, 4, 'var(--soft2)')} />
            </g>
          </g>
        )}
        {beat === 2 && <Ripple x={298} y={180} r={26} d={1300} />}
      </Art>
      {beat === 0 && (
        <>
          <Fly path="M88,-30 L88,104" ms={600} d={0} vanish>
            <Letter />
          </Fly>
          <At x={170} y={62} style={pop(900, 400)}>
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full text-[22px] font-black"
              style={{ background: 'var(--paper)', border: '3px solid var(--ln)', color: 'var(--ln)' }}
            >
              ?
            </span>
          </At>
        </>
      )}
      {beat === 1 && (
        <>
          <Fly path={`M88,104 Q140,10 ${LETTER.x},${LETTER.y}`} ms={700} d={100}>
            <Letter stamped={pop(1150, 500)} />
          </Fly>
          {/* the rubber stamp: thumps down on the letter and lifts away */}
          <At x={LETTER.x + 34} y={LETTER.y - 44} style={gone(1400, 350, 'translateY(-110px)')}>
            <div style={drop(750, 600, -140)}>
              <svg width="44" height="54" viewBox="0 0 44 54" className="overflow-visible">
                <circle cx="22" cy="10" r="8" style={{ fill: 'var(--soft2)', stroke: 'var(--ln)' }} strokeWidth="4" />
                <path d="M18,18 V28 M26,18 V28" style={{ stroke: 'var(--ln)' }} strokeWidth="4" strokeLinecap="round" />
                <rect x="4" y="28" width="36" height="16" rx="5" style={{ fill: 'var(--soft2)', stroke: 'var(--ln)' }} strokeWidth="4" />
                <rect x="8" y="44" width="28" height="6" rx="2" style={{ fill: 'var(--ln2)' }} />
              </svg>
            </div>
          </At>
        </>
      )}
      {beat === 2 && (
        <>
          <Fly path={`M${LETTER.x},${LETTER.y} Q260,40 298,186`} ms={1000} d={300} vanish>
            <Letter stamped={{}} />
          </Fly>
          <At x={298} y={230} style={pop(200, 500)}>
            <Pill>Goa trip</Pill>
          </At>
          <Sparkles x={298} y={160} d={1400} spread={50} />
        </>
      )}
    </>
  )
}

// ---- Earn Pro: the ring fills, then it rings your photo ------------------------------------------------------
// 1 Ticks land around a ring as it fills to 75%. 2 The last tick: it closes, bursts, 100%.
// 3 The ring settles round your photo and a PRO pill drops in.

const RING = { x: 180, y: 120, r: 72 }
const ringAt = (f: number) => ({ x: RING.x + Math.cos(deg(-90 + 360 * f)) * RING.r, y: RING.y + Math.sin(deg(-90 + 360 * f)) * RING.r })

/** A few pieces of confetti from the full ring: where each lands, its turn and when it goes. */
const CONFETTI = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2 + 0.4
  const r = 96 + (i % 3) * 18
  return { dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r * 0.8), rot: (i * 47) % 180, duo: i % 2 === 1, at: (i % 4) * 40 }
})

const Pro: View = ({ beat }) => {
  const id = useIds()
  const ring = (frac: number, fromFrac: number, d: number, ms: number) => (
    <circle
      cx={RING.x}
      cy={RING.y}
      r={RING.r}
      fill="none"
      stroke={`url(#${id('ln')})`}
      strokeWidth="14"
      strokeLinecap="round"
      pathLength={1}
      transform={`rotate(-90 ${RING.x} ${RING.y})`}
      style={{ strokeDasharray: `${frac} 2`, '--dash-from': frac - fromFrac, animation: `hm-dash ${ms}ms cubic-bezier(0.45, 0, 0.2, 1) ${d}ms both` } as Vars}
    />
  )
  const ticks = beat === 0 ? [0.25, 0.5, 0.75] : [0.25, 0.5, 0.75, 1]
  return (
    <>
      {beat < 2 && (
        <>
          <Art id={id}>
            <g style={{ ...box(), ...(beat === 1 ? thump(950, 600) : {}) }}>
              <circle cx={RING.x} cy={RING.y} r={RING.r} fill="none" strokeWidth="14" style={{ stroke: 'var(--soft)' }} />
              {beat === 0 ? ring(0.75, 0, 200, 1300) : ring(1, 0.75, 200, 600)}
              <text
                x={RING.x}
                y={RING.y + 10}
                textAnchor="middle"
                className="text-[30px] font-black"
                style={{ fill: 'var(--ln)', ...box(), ...(beat === 0 ? pop(1400, 500) : gone(650, 150)) }}
              >
                75%
              </text>
              {beat === 1 && (
                <text
                  x={RING.x}
                  y={RING.y + 10}
                  textAnchor="middle"
                  className="text-[30px] font-black"
                  style={{ fill: 'var(--ln)', ...box(), ...pop(900, 600) }}
                >
                  100%
                </text>
              )}
            </g>
          </Art>
          {ticks.map((f, i) => (
            <At key={f} x={ringAt(f).x} y={ringAt(f).y} style={beat === 0 ? pop(500 + i * 400, 450) : f === 1 ? pop(750, 450) : undefined}>
              <Check size={26} />
            </At>
          ))}
          {beat === 1 &&
            CONFETTI.map((c) => (
              <span
                key={`${c.dx},${c.dy}`}
                className="absolute h-[10px] w-[6px] rounded-[2px]"
                style={
                  {
                    left: RING.x - 3,
                    top: RING.y - 5,
                    opacity: 0,
                    rotate: `${c.rot}deg`,
                    background: c.duo ? 'var(--color-duo-400)' : 'var(--color-brand-500)',
                    '--dx': `${c.dx}px`,
                    '--dy': `${c.dy}px`,
                    animation: `hm-burst 1000ms cubic-bezier(0.2, 0.7, 0.3, 1) ${950 + c.at}ms both`,
                  } as Vars
                }
              />
            ))}
        </>
      )}
      {beat === 2 && (
        <>
          <Art id={id}>
            <circle
              cx={RING.x}
              cy={RING.y - 6}
              r="52"
              fill="none"
              stroke={`url(#${id('ln')})`}
              strokeWidth="7"
              style={{ ...box(), ...from('scale(1.3)', 0, 800, SPRING, 1) }}
            />
          </Art>
          <At x={RING.x} y={RING.y - 6} style={pop(300, 700)}>
            <Person name="Asha" size={84} label={false} />
          </At>
          <At x={RING.x} y={RING.y + 70}>
            <div style={drop(900, 700, -60)}>
              <span className="inline-block rounded-full bg-white px-4 py-1.5 shadow-md ring-2 ring-brand-200 dark:bg-ink-800 dark:ring-brand-400/40">
                <span className="bg-gradient-to-r from-brand-600 to-duo-500 bg-clip-text text-[16px] font-black tracking-[0.2em] text-transparent dark:from-brand-300 dark:to-duo-300">
                  PRO
                </span>
              </span>
            </div>
          </At>
          <Sparkles x={RING.x} y={RING.y - 6} d={1450} spread={74} />
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
  drawers: Drawers,
  exchange: Exchange,
  sort: Sort,
  pro: Pro,
}
