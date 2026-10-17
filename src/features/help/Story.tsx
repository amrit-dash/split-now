import type { CSSProperties, ReactNode } from 'react'
import type { StoryKind } from '@/lib/help'

/**
 * The explainers' pictures in Help (src/lib/help-content.ts `story`): an everyday picture of how
 * a part of Split Now thinks (a shared pot, a seesaw, a tangle of arrows). `beat` is the caption
 * being read; each change of beat moves the picture on with CSS transitions, and `still` (reduced
 * motion, or animations off) shows the same frame without movement. Purely a picture: hidden from
 * screen readers, which read the captions beside it.
 */
export function Story({ kind, beat, still }: { kind: StoryKind; beat: number; still: boolean }) {
  const View = VIEWS[kind]
  return (
    <div
      className={`relative mx-auto h-56 w-full max-w-xs select-none overflow-hidden ${still ? '[&_*]:!transition-none' : ''}`}
      aria-hidden
      data-testid="help-story"
      data-beat={beat}
    >
      <View beat={beat} />
    </div>
  )
}

type View = (p: { beat: number }) => ReactNode

const ease = 'transition-all duration-700 ease-[cubic-bezier(0.2,0.9,0.3,1)]'

/** Something placed by its centre, in % of the picture, that glides when it moves. */
function At({ x, y, children, style, className = '' }: { x: number; y: number; children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div className={`absolute -translate-x-1/2 -translate-y-1/2 ${ease} ${className}`} style={{ left: `${x}%`, top: `${y}%`, ...style }}>
      {children}
    </div>
  )
}

function Person({ name, face }: { name: string; face: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl shadow ring-1 ring-slate-200 dark:bg-ink-800 dark:ring-white/10">
        {face}
      </span>
      <span className="text-[0.65rem] font-semibold text-slate-600 dark:text-slate-300">{name}</span>
    </div>
  )
}

function Badge({ text, tone }: { text: string; tone: 'up' | 'down' | 'even' }) {
  const c =
    tone === 'up'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200'
      : tone === 'down'
        ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200'
        : 'bg-slate-100 text-slate-700 dark:bg-ink-800 dark:text-slate-200'
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[0.65rem] font-bold tabular-nums ${c}`}>{text}</span>
}

function Coin({ label = '₹' }: { label?: string }) {
  return (
    <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-amber-300 px-1 text-[0.6rem] font-bold text-amber-900 shadow ring-2 ring-amber-400">
      {label}
    </span>
  )
}

// ---- What Split Now does: a shared pot -----------------------------------------------------

const POT_PEOPLE = [
  { name: 'Asha', face: '🙂', x: 16 },
  { name: 'Ravi', face: '😄', x: 50 },
  { name: 'Meera', face: '😊', x: 84 },
]

const Pot: View = ({ beat }) => {
  const badge = (i: number) =>
    beat === 2 ? (
      i === 0 ? (
        <Badge text="owed ₹600" tone="up" />
      ) : (
        <Badge text="owes ₹300" tone="down" />
      )
    ) : beat === 3 ? (
      <Badge text="square ✓" tone="even" />
    ) : null
  return (
    <>
      {/* The pot: the group's total, then its three shares */}
      <At x={50} y={32}>
        <div className="relative flex h-20 w-24 flex-col items-center justify-end rounded-b-[2rem] rounded-t-lg border-4 border-brand-400 bg-brand-50 pb-2 dark:bg-brand-900/30">
          <div className="absolute -top-3 h-3 w-28 rounded-full bg-brand-400" />
          <span className={`text-sm font-bold tabular-nums text-brand-800 dark:text-brand-200 ${ease}`} style={{ opacity: beat === 3 ? 0.35 : 1 }}>
            {beat === 3 ? '₹0' : '₹900'}
          </span>
          <div className={`mt-1 flex gap-0.5 ${ease}`} style={{ opacity: beat === 1 ? 1 : 0, transform: `scale(${beat === 1 ? 1 : 0.6})` }}>
            {[0, 1, 2].map((i) => (
              <span key={i} className="rounded bg-brand-500 px-1 text-[0.55rem] font-bold text-white">
                ₹300
              </span>
            ))}
          </div>
        </div>
      </At>
      {/* Asha's ₹900 drops into the pot; at the end Ravi's and Meera's ₹300 go to her */}
      <At x={beat === 0 ? 50 : 16} y={beat === 0 ? 30 : 66} style={{ opacity: beat === 0 ? 1 : 0 }}>
        <Coin label="₹900" />
      </At>
      {[1, 2].map((i) => (
        <At
          key={i}
          x={beat === 3 ? 10 + i * 12 : POT_PEOPLE[i].x}
          y={beat === 3 ? 50 : 66}
          style={{ opacity: beat === 3 ? 1 : 0, transitionDelay: `${i * 120}ms` }}
        >
          <Coin label="₹300" />
        </At>
      ))}
      {POT_PEOPLE.map((p) => (
        <At key={p.name} x={p.x} y={70}>
          <Person {...p} />
        </At>
      ))}
      {POT_PEOPLE.map((p, i) => (
        <At key={`b-${p.name}`} x={p.x} y={88} style={{ opacity: badge(i) ? 1 : 0 }}>
          {badge(i) ?? <span />}
        </At>
      ))}
    </>
  )
}

// ---- How balances work: a seesaw -----------------------------------------------------------

const Seesaw: View = ({ beat }) => {
  // Clockwise tips the left end (Asha) up: she paid, so she is owed.
  const tilt = beat === 1 ? 12 : 0
  return (
    <>
      <At x={50} y={8}>
        <span className="whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-300">
          {beat === 0 ? 'Level: nobody owes' : beat === 1 ? 'Asha paid ₹900 for three' : 'Paid back: level again'}
        </span>
      </At>
      <div className={`absolute left-[10%] right-[10%] top-[62%] ${ease}`} style={{ transform: `rotate(${tilt}deg)` }}>
        <div className="h-2.5 rounded-full bg-brand-500" />
        <div className="absolute -top-16 left-0 flex flex-col items-center">
          <Person name="Asha" face="🙂" />
          <Badge text={beat === 1 ? 'owed ₹600' : '₹0'} tone={beat === 1 ? 'up' : 'even'} />
        </div>
        <div className="absolute -top-16 right-0 flex gap-1">
          {(['Ravi', 'Meera'] as const).map((n) => (
            <div key={n} className="flex flex-col items-center">
              <Person name={n} face={n === 'Ravi' ? '😄' : '😊'} />
              <Badge text={beat === 1 ? 'owes ₹300' : '₹0'} tone={beat === 1 ? 'down' : 'even'} />
            </div>
          ))}
        </div>
      </div>
      {/* the pivot */}
      <At x={50} y={73}>
        <div className="h-0 w-0 border-x-[18px] border-b-[26px] border-x-transparent border-b-slate-400 dark:border-b-slate-500" />
      </At>
      <At x={beat === 2 ? 40 : 74} y={30} style={{ opacity: beat === 2 ? 1 : 0 }}>
        <Coin label="₹600" />
      </At>
    </>
  )
}

// ---- Fewer payments: untangling arrows ------------------------------------------------------

const NODES = [
  { name: 'Asha', face: '🙂', x: 18, y: 22, net: 500 },
  { name: 'Ravi', face: '😄', x: 82, y: 22, net: -200 },
  { name: 'Meera', face: '😊', x: 82, y: 78, net: -400 },
  { name: 'Kabir', face: '😎', x: 18, y: 78, net: 100 },
]
// Who paid whom along the way (from → to), and the payments Simplify debts suggests instead:
// Meera → Asha ₹400, Ravi → Asha ₹100, Ravi → Kabir ₹100 (each person's net is unchanged).
const TANGLE: Array<[number, number]> = [
  [1, 0],
  [2, 0],
  [2, 1],
  [3, 2],
  [1, 3],
  [0, 3],
]
const SIMPLE: Array<[number, number, string]> = [
  [2, 0, '₹400'],
  [1, 0, '₹100'],
  [1, 3, '₹100'],
]

function Arrow({ from, to, show, label, delay = 0 }: { from: number; to: number; show: boolean; label?: string; delay?: number }) {
  const a = NODES[from]
  const b = NODES[to]
  // Stop short of each face so the head stays visible.
  const k = 0.2
  const x1 = a.x + (b.x - a.x) * k
  const y1 = a.y + (b.y - a.y) * k
  const x2 = b.x - (b.x - a.x) * k
  const y2 = b.y - (b.y - a.y) * k
  return (
    <g className={ease} style={{ opacity: show ? 1 : 0, transitionDelay: `${delay}ms` }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-brand-500" strokeWidth={1.2} markerEnd="url(#help-arrow)" />
      {label && (
        <text x={x1 + (x2 - x1) * 0.2} y={y1 + (y2 - y1) * 0.2 - 2} textAnchor="middle" className="fill-slate-700 text-[5px] font-bold dark:fill-slate-200">
          {label}
        </text>
      )}
    </g>
  )
}

const Untangle: View = ({ beat }) => (
  <>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
      <defs>
        <marker id="help-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L6,3 L0,6 z" className="fill-brand-500" />
        </marker>
      </defs>
      {TANGLE.map(([f, t], i) => (
        <Arrow key={`t${f}${t}`} from={f} to={t} show={beat === 0} delay={i * 60} />
      ))}
      {SIMPLE.map(([f, t, l], i) => (
        <Arrow key={`s${f}${t}`} from={f} to={t} show={beat === 2} label={l} delay={300 + i * 200} />
      ))}
    </svg>
    {NODES.map((n) => (
      <At key={n.name} x={n.x} y={n.y}>
        <div className="flex flex-col items-center gap-0.5">
          <Person name={n.name} face={n.face} />
          <span className={ease} style={{ opacity: beat === 0 ? 0 : 1 }}>
            <Badge text={`${n.net > 0 ? 'owed' : 'owes'} ₹${Math.abs(n.net)}`} tone={n.net > 0 ? 'up' : 'down'} />
          </span>
        </div>
      </At>
    ))}
    <At x={50} y={6}>
      <span className="whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[0.65rem] font-bold text-slate-700 shadow dark:bg-ink-800 dark:text-slate-200">
        {beat === 0 ? '6 payments' : beat === 1 ? 'Overall' : '3 payments'}
      </span>
    </At>
  </>
)

// ---- Splits add up: ₹100 three ways ---------------------------------------------------------

const Remainder: View = ({ beat }) => {
  const labels = beat === 0 ? ['₹33.333…', '₹33.333…', '₹33.333…'] : beat === 1 ? ['₹33.33', '₹33.33', '₹33.33'] : ['₹33.34', '₹33.33', '₹33.33']
  const total = beat === 0 ? '₹100 ÷ 3' : beat === 1 ? '= ₹99.99' : '= ₹100.00 ✓'
  return (
    <>
      <At x={50} y={18}>
        <span className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">{total}</span>
      </At>
      <div className="absolute left-[8%] right-[8%] top-[38%] flex h-16 gap-1">
        {labels.map((l, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: three fixed shares
            key={i}
            className={`flex flex-1 flex-col items-center justify-center rounded-xl text-xs font-bold tabular-nums ${ease} ${
              beat === 2 && i === 0 ? 'bg-brand-600 text-white' : 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200'
            }`}
          >
            {l}
            <span className="text-[0.6rem] font-semibold opacity-80">{['Asha', 'Ravi', 'Meera'][i]}</span>
          </div>
        ))}
      </div>
      {/* the one paisa: falls out when rounded down, then goes to the first person */}
      <At
        x={beat === 2 ? 22 : 80}
        y={beat === 0 ? 50 : beat === 1 ? 82 : 50}
        style={{ opacity: beat === 1 ? 1 : 0, transform: `scale(${beat === 2 ? 0.4 : 1})` }}
      >
        <Coin label="1p" />
      </At>
      <At x={50} y={92} style={{ opacity: beat === 1 ? 1 : 0 }}>
        <span className="text-[0.65rem] font-semibold text-rose-700 dark:text-rose-300">one paisa left over</span>
      </At>
    </>
  )
}

// ---- What a private group hides: a locked box -----------------------------------------------

const WORDS = ['Goa trip', 'Rahul', 'Dinner']

const Vault: View = ({ beat }) => (
  <>
    {/* the box on the server: closed after the words go in, with the amounts on its label */}
    <At x={34} y={50}>
      <div className="relative flex h-24 w-28 flex-col items-center justify-center rounded-xl border-4 border-slate-500 bg-slate-100 dark:border-slate-400 dark:bg-ink-800">
        <div
          className={`absolute -top-3 left-[-4px] right-[-4px] h-4 origin-left rounded-md bg-slate-500 dark:bg-slate-400 ${ease}`}
          style={{ transform: `rotate(${beat === 0 ? -24 : 0}deg)`, transitionDelay: beat === 0 ? '0ms' : '400ms' }}
        />
        <span className="text-2xl">🔒</span>
        <span className="font-mono text-[0.55rem] text-slate-500 dark:text-slate-400">v1:x9Fq…</span>
        <div
          className={`absolute -bottom-7 rounded-md bg-amber-100 px-1.5 py-0.5 text-[0.6rem] font-semibold text-amber-900 shadow ${ease}`}
          style={{ opacity: beat === 2 ? 1 : 0 }}
        >
          ₹2,400 · 12 Oct · paid by 1
        </div>
      </div>
      <span className="mt-8 block text-center text-[0.6rem] font-semibold text-slate-500">Split Now’s server</span>
    </At>
    {/* the phone of someone in the group; the key travels to it after the pattern and passkey */}
    <At x={80} y={46}>
      <div className="flex h-32 w-16 flex-col items-center justify-end rounded-xl border-4 border-slate-800 bg-white pb-1 dark:border-ink-700 dark:bg-ink-950">
        <span className="text-[0.55rem] font-semibold text-slate-500">{beat === 0 ? 'locked' : 'open'}</span>
      </div>
    </At>
    <At x={beat === 0 ? 34 : 80} y={beat === 0 ? 50 : 88} style={{ opacity: beat === 0 ? 0 : 1 }}>
      <span className="text-xl">🗝️</span>
    </At>
    {/* the words go into the box, and show on the phone once it has the key */}
    {WORDS.map((w, i) => (
      <At
        key={w}
        x={beat === 2 ? 80 : 34}
        y={beat === 0 ? 8 + i * 9 : beat === 1 ? 50 : 30 + i * 11}
        style={{ opacity: beat === 1 ? 0 : 1, transitionDelay: `${i * 120}ms` }}
      >
        <span className="whitespace-nowrap rounded-full bg-white px-1.5 py-0.5 text-[0.6rem] font-semibold shadow dark:bg-ink-900">{w}</span>
      </At>
    ))}
  </>
)

// ---- How auto-capture picks payments: a filter -----------------------------------------------

const MESSAGES = [
  { text: 'OTP 482913', bank: false },
  { text: '50% off today', bank: false },
  { text: '₹450 debited, UPI', bank: true },
  { text: 'See you at 8?', bank: false },
]

const Filter: View = ({ beat }) => (
  <>
    {MESSAGES.map((m, i) => {
      // Before the filter: a column at the top. Through it: the bank debit drops in; the rest stay on the phone, greyed.
      const x = beat === 0 ? 50 : m.bank ? 50 : i < 2 ? 14 + i * 4 : 86
      const y = beat === 0 ? 10 + i * 11 : m.bank ? (beat === 1 ? 76 : 84) : 20 + i * 9
      return (
        <At key={m.text} x={x} y={y} style={{ opacity: beat === 0 || m.bank ? (beat === 2 && m.bank ? 0 : 1) : 0.35, transitionDelay: `${i * 90}ms` }}>
          <span
            className={`whitespace-nowrap rounded-2xl px-2 py-1 text-[0.6rem] font-semibold shadow ${
              m.bank
                ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100'
                : 'bg-white text-slate-700 dark:bg-ink-800 dark:text-slate-200'
            } ${beat > 0 && !m.bank ? 'line-through' : ''}`}
          >
            {m.text}
          </span>
        </At>
      )
    })}
    {/* the funnel */}
    <At x={50} y={60}>
      <div
        className={`h-0 w-0 border-x-[44px] border-t-[30px] border-x-transparent border-t-brand-300 dark:border-t-brand-700 ${ease}`}
        style={{ opacity: beat === 2 ? 0.3 : 1 }}
      />
    </At>
    {/* what arrives: a captured payment waiting for a yes */}
    <At x={50} y={80} style={{ opacity: beat === 2 ? 1 : 0, transform: `scale(${beat === 2 ? 1 : 0.8})` }}>
      <div className="w-44 rounded-xl bg-white p-2 shadow-lg ring-1 ring-slate-200 dark:bg-ink-900 dark:ring-white/10">
        <div className="text-[0.6rem] font-bold">Captured payment · ₹450</div>
        <div className="mt-1 flex gap-1">
          {['Split', 'Personal', 'Not shared'].map((b) => (
            <span
              key={b}
              className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[0.55rem] font-semibold text-brand-800 dark:bg-brand-900/40 dark:text-brand-200"
            >
              {b}
            </span>
          ))}
        </div>
      </div>
    </At>
  </>
)

const VIEWS: Record<StoryKind, View> = { pot: Pot, seesaw: Seesaw, untangle: Untangle, remainder: Remainder, vault: Vault, filter: Filter }
