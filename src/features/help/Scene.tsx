import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { findMark, type Part, type Scene as SceneData, type Screen } from '@/lib/help-scenes'

/**
 * One main feature's scene in Help (src/lib/help-scenes.ts): a small phone showing the screen
 * that holds the step's part, with a pointer that moves to it and presses it, and the part
 * reacting (a field types, a switch turns on, a chip is picked). A sheet rises over the screen
 * before it. `still` (reduced motion, or animations off) shows the same frame without movement.
 * Purely a picture: hidden from screen readers, which read the steps beside it.
 */
export function Scene({ scene, mark, step, still }: { scene: SceneData; mark?: string; step: number; still: boolean }) {
  const at = findMark(scene, mark)
  const screen = at?.screen ?? 0
  const base = at?.base ?? null
  const box = useRef<HTMLDivElement>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  // The pointer goes to the marked part once the screen is laid out (and again on a resize).
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new screen moves the part even when the mark stays
  useLayoutEffect(() => {
    const root = box.current
    if (!root || !mark) return setPointer(null)
    const place = () => {
      const el = root.querySelector<HTMLElement>(`[data-mark="${CSS.escape(mark)}"]`)
      if (!el) return setPointer(null)
      const r = el.getBoundingClientRect()
      const o = root.getBoundingClientRect()
      setPointer({ x: r.left - o.left + r.width / 2, y: r.top - o.top + r.height / 2 })
    }
    // The sheet and the screen slide in: measure where they come to rest.
    place()
    const t = setTimeout(place, still ? 0 : 320)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    ro?.observe(root)
    return () => {
      clearTimeout(t)
      ro?.disconnect()
    }
  }, [mark, screen, still])
  return (
    <div
      className="relative mx-auto aspect-[9/16] w-full max-w-[15rem] select-none overflow-hidden rounded-[2rem] border-[6px] border-slate-800 bg-slate-50 shadow-xl dark:border-ink-700 dark:bg-ink-950"
      aria-hidden
      ref={box}
      data-testid="help-scene"
    >
      <div className="absolute left-1/2 top-1.5 z-20 h-1.5 w-12 -translate-x-1/2 rounded-full bg-slate-800 dark:bg-ink-700" />
      {base !== null ? (
        <>
          <ScreenView screen={scene[base]} mark={undefined} dim />
          <div
            key={`sheet-${screen}`}
            className={`absolute inset-x-0 bottom-0 z-10 rounded-t-2xl bg-white p-3 shadow-2xl dark:bg-ink-900 ${still ? '' : 'animate-sheet'}`}
          >
            <div className="mx-auto mb-2 h-1 w-8 rounded-full bg-slate-300 dark:bg-ink-700" />
            <Parts screen={scene[screen]} mark={mark} step={step} still={still} />
          </div>
        </>
      ) : (
        <div key={`screen-${screen}`} className={`absolute inset-0 ${still ? '' : 'animate-[help-slide_0.35s_cubic-bezier(0.2,0.9,0.3,1)]'}`}>
          <ScreenView screen={scene[screen]} mark={mark} step={step} still={still} />
        </div>
      )}
      {pointer && (
        <div
          className="pointer-events-none absolute z-30 -ml-4 -mt-4 h-8 w-8 transition-[left,top] duration-500 ease-out"
          style={{ left: pointer.x, top: pointer.y }}
        >
          <span
            key={step}
            className={`absolute inset-0 rounded-full bg-brand-500/30 ring-2 ring-brand-500 ${still ? '' : 'animate-[help-press_1.4s_ease-out_0.45s_both]'}`}
          />
          <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600 shadow" />
        </div>
      )}
    </div>
  )
}

function ScreenView({ screen, mark, step = 0, still = true, dim }: { screen: Screen; mark?: string; step?: number; still?: boolean; dim?: boolean }) {
  return (
    <div className={`absolute inset-0 flex flex-col px-3 pb-2 pt-6 ${dim ? 'opacity-40' : ''}`}>
      <Parts screen={screen} mark={mark} step={step} still={still} />
    </div>
  )
}

function Parts({ screen, mark, step, still }: { screen: Screen; mark?: string; step: number; still: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      {screen.parts.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a screen's parts never move
        <PartView key={i} part={p} mark={mark} step={step} still={still} />
      ))}
    </div>
  )
}

/** A part is "on" when its step is the one playing: it reacts the way the real control does. */
function PartView({ part: p, mark, step, still }: { part: Part; mark?: string; step: number; still: boolean }) {
  const on = !!mark && p.mark === mark
  const ring = on ? 'ring-2 ring-brand-500' : ''
  const tag = p.mark ? { 'data-mark': p.mark } : {}
  switch (p.kind) {
    case 'title':
      return <div className="truncate pb-1 text-[0.8rem] font-bold">{p.label}</div>
    case 'field':
      return (
        <div {...tag} className={`rounded-xl bg-white px-2 py-1.5 shadow-sm dark:bg-ink-800 ${ring}`}>
          <div className="text-muted text-[0.55rem]">{p.label}</div>
          <div className="flex items-center gap-1 text-[0.7rem] font-semibold">
            {p.icon && <span>{p.icon}</span>}
            <Typed text={p.value ?? ''} active={on} still={still} step={step} />
          </div>
        </div>
      )
    case 'row':
      return (
        <div {...tag} className={`flex items-center justify-between gap-2 rounded-xl bg-white px-2 py-1.5 text-[0.65rem] shadow-sm dark:bg-ink-800 ${ring}`}>
          <span className="font-semibold">{p.label}</span>
          <span className="text-muted truncate">{p.value}</span>
        </div>
      )
    case 'button':
      return (
        <div
          {...tag}
          className={`rounded-xl px-2 py-2 text-center text-[0.7rem] font-bold transition ${p.primary ? 'bg-fill text-on-fill' : 'bg-white shadow-sm dark:bg-ink-800'} ${on ? `${ring} scale-[0.97]` : ''}`}
        >
          {p.label}
        </div>
      )
    case 'chips':
      return (
        <div {...tag} className={`flex flex-wrap gap-1 rounded-xl ${on ? 'ring-2 ring-brand-500' : ''}`}>
          {(p.items ?? []).map((it) => {
            // A chip whose own step plays is picked; otherwise the part keeps its starting choice.
            const picked = (p.items ?? []).some((x) => x.mark && x.mark === mark) ? it.mark === mark : !!it.on
            return (
              <span
                key={it.label}
                {...(it.mark ? { 'data-mark': it.mark } : {})}
                className={`rounded-full px-2 py-1 text-[0.6rem] font-semibold transition ${picked ? 'bg-fill text-on-fill' : 'bg-white shadow-sm dark:bg-ink-800'}`}
              >
                {it.label}
              </span>
            )
          })}
        </div>
      )
    case 'tiles':
      return (
        <div className="grid grid-cols-2 gap-1.5">
          {(p.items ?? []).map((it) => (
            <div
              key={it.label}
              {...(it.mark ? { 'data-mark': it.mark } : {})}
              className={`flex flex-col items-center gap-0.5 rounded-xl bg-white p-1.5 text-[0.6rem] font-semibold shadow-sm dark:bg-ink-800 ${it.mark && it.mark === mark ? 'ring-2 ring-brand-500' : ''}`}
            >
              <span className="text-base">{it.icon}</span>
              {it.label}
            </div>
          ))}
        </div>
      )
    case 'list':
      return (
        <div {...tag} className={`rounded-xl bg-white p-1.5 shadow-sm dark:bg-ink-800 ${ring}`}>
          {p.label && <div className="text-muted px-0.5 pb-1 text-[0.55rem] font-semibold">{p.label}</div>}
          {(p.items ?? []).map((it, i) => (
            <div
              key={it.label}
              {...(it.mark ? { 'data-mark': it.mark } : {})}
              className={`flex items-center gap-1.5 rounded-lg px-0.5 py-1 text-[0.65rem] ${it.mark && it.mark === mark ? 'ring-2 ring-brand-500' : ''} ${on && !still ? 'animate-[help-in_0.4s_ease-out_both]' : ''}`}
              style={on && !still ? { animationDelay: `${i * 120}ms` } : undefined}
            >
              <span>{it.icon}</span>
              <span className="truncate">{it.label}</span>
            </div>
          ))}
        </div>
      )
    case 'switch': {
      const turned = p.value === 'on' || on
      return (
        <div
          {...tag}
          className={`flex items-center justify-between rounded-xl bg-white px-2 py-1.5 text-[0.65rem] font-semibold shadow-sm dark:bg-ink-800 ${ring}`}
        >
          {p.label}
          <span className={`relative h-4 w-7 rounded-full transition-colors duration-300 ${turned ? 'bg-fill' : 'bg-slate-300 dark:bg-ink-700'}`}>
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-[left] duration-300 ${turned ? 'left-3.5' : 'left-0.5'}`} />
          </span>
        </div>
      )
    }
    case 'note':
      return <div className="text-muted px-1 text-[0.55rem]">{p.label}</div>
    case 'emoji':
      return (
        <div className="grid grid-cols-6 gap-1">
          {(p.items ?? []).map((it, i) => (
            <span
              key={it.label}
              className={`flex aspect-square items-center justify-center rounded-lg bg-slate-100 text-sm dark:bg-ink-800 ${i === 0 && mark === 'search' && !still ? 'animate-pop' : ''}`}
            >
              {it.label}
            </span>
          ))}
        </div>
      )
    case 'qr':
      return (
        <div {...tag} className={`flex items-center gap-2 rounded-xl bg-white p-2 shadow-sm dark:bg-ink-800 ${ring}`}>
          <QrArt />
          <div className="min-w-0 text-[0.6rem]">
            <div className="font-bold">{p.label}</div>
            <div className="text-muted truncate">{p.value}</div>
          </div>
        </div>
      )
    case 'pattern':
      return (
        <div className="mt-auto flex flex-col items-center gap-1 pb-2">
          <div
            {...tag}
            className={`press-hold relative flex h-14 w-14 items-center justify-center rounded-full bg-fill text-xl text-on-fill shadow-lg ${ring}`}
            data-press={on && !still ? 'down' : 'idle'}
          >
            🔒
          </div>
          <div className="text-muted text-[0.55rem]">{p.label}</div>
          {on && !still && (
            <div className="flex gap-1" key={step}>
              {DEMO_PATTERN.map((c) => (
                <span
                  key={c.id}
                  className="h-1.5 animate-[help-in_0.25s_ease-out_both] rounded-full bg-brand-500"
                  style={{ animationDelay: `${300 + c.id * 260}ms`, width: c.long ? 12 : 6 }}
                />
              ))}
            </div>
          )}
        </div>
      )
    case 'faceid':
      return (
        <div {...tag} className="flex flex-col items-center gap-1 py-3 text-[0.7rem] font-semibold">
          <span className={`text-3xl ${still ? '' : 'animate-[help-press_1.4s_ease-out_0.3s_both]'}`}>🙂</span>
          {p.label}
        </div>
      )
    case 'locked':
      return (
        <div {...tag} className={`flex items-center gap-2 rounded-xl bg-white px-2 py-2 text-[0.65rem] shadow-sm dark:bg-ink-800 ${ring}`}>
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-200 dark:bg-ink-700">🔒</span>
          <span className="font-mono tracking-wider">{p.label}</span>
          <span className="ml-auto">🦊🐼</span>
        </div>
      )
    case 'donut':
      return (
        <div {...tag} className={`flex items-center gap-2 rounded-xl bg-white p-2 shadow-sm dark:bg-ink-800 ${ring}`}>
          <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
            {
              [
                [40, 'var(--color-brand-500)'],
                [25, 'var(--color-duo-500, #f59e0b)'],
                [20, '#10b981'],
                [15, '#94a3b8'],
              ].reduce<{ at: number; els: React.ReactNode[] }>(
                (acc, [v, c], i) => {
                  acc.els.push(
                    <circle
                      // biome-ignore lint/suspicious/noArrayIndexKey: fixed slices
                      key={i}
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke={c as string}
                      strokeWidth={on && i === 0 ? 7 : 5}
                      strokeDasharray={`${(v as number) * 0.88} 88`}
                      strokeDashoffset={-acc.at * 0.88}
                      className="transition-[stroke-width] duration-300"
                    />,
                  )
                  acc.at += v as number
                  return acc
                },
                { at: 0, els: [] },
              ).els
            }
          </svg>
          <div className="text-[0.6rem]">
            <div className="font-bold">{p.label}</div>
            <div className="text-muted">{on ? 'Food · 40%' : '4 categories'}</div>
          </div>
        </div>
      )
    case 'bars':
      return (
        <div {...tag} className={`rounded-xl bg-white p-2 shadow-sm dark:bg-ink-800 ${ring}`}>
          <div className="pb-1 text-[0.6rem] font-bold">{p.label}</div>
          <div className="flex h-10 items-end gap-1">
            {[40, 65, 30, 85, 55, 70].map((h, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed bars
                key={i}
                className={`flex-1 origin-bottom rounded-t bg-brand-500/70 ${on && !still ? 'animate-[help-grow_0.6s_ease-out_both]' : ''}`}
                style={{ height: `${h}%`, animationDelay: on ? `${i * 80}ms` : undefined }}
              />
            ))}
          </div>
        </div>
      )
    case 'tabbar':
      return (
        <div className="-mx-3 mt-auto flex items-end justify-around border-t border-slate-200 bg-white px-1 pb-1 pt-1.5 dark:border-white/5 dark:bg-ink-900">
          {(p.items ?? []).map((it) =>
            it.icon === '+' ? (
              <span
                key={it.label}
                {...(it.mark ? { 'data-mark': it.mark } : {})}
                className={`-mt-4 flex h-9 w-9 items-center justify-center rounded-full bg-fill text-lg font-bold text-on-fill shadow-lg ${it.mark && it.mark === mark ? 'ring-2 ring-brand-500 ring-offset-2' : ''}`}
              >
                +
              </span>
            ) : (
              <span
                key={it.label}
                {...(it.mark ? { 'data-mark': it.mark } : {})}
                className={`flex flex-col items-center text-[0.5rem] ${it.on || (it.mark && it.mark === mark) ? 'font-bold text-brand-600 dark:text-brand-300' : 'text-muted'}`}
              >
                <span className="text-sm">{it.icon}</span>
                {it.label}
              </span>
            ),
          )}
        </div>
      )
    case 'message':
      return (
        <div {...tag} className={`rounded-xl bg-slate-800 p-2 text-[0.6rem] text-white shadow ${ring} ${still ? '' : 'animate-[help-in_0.4s_ease-out_both]'}`}>
          <div className="font-bold">{p.label}</div>
          <div className="opacity-80">{p.value}</div>
        </div>
      )
  }
}

/** The scene's made-up pattern: taps and long presses, shown as they go in. */
const DEMO_PATTERN = [false, true, false, false, true, false].map((long, id) => ({ id, long }))

/** A field's value typed in when its step plays; shown whole otherwise. */
function Typed({ text, active, still, step }: { text: string; active: boolean; still: boolean; step: number }) {
  const [n, setN] = useState(text.length)
  // biome-ignore lint/correctness/useExhaustiveDependencies: each play of the step types again
  useEffect(() => {
    if (!active || still) return setN(text.length)
    setN(0)
    let i = 0
    const t = setInterval(() => {
      i += 1
      setN(i)
      if (i >= text.length) clearInterval(t)
    }, 55)
    return () => clearInterval(t)
  }, [active, still, text, step])
  return (
    <span className="truncate">
      {text.slice(0, n)}
      {active && !still && n < text.length && <span className="ml-px inline-block h-3 w-px animate-pulse bg-current align-middle" />}
    </span>
  )
}

/** A QR-looking square (not a real code: the scene only shows where the QR is). */
function QrArt() {
  const cells = [1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1]
  return (
    <span className="grid h-10 w-10 shrink-0 grid-cols-5 gap-px rounded bg-white p-0.5 ring-1 ring-slate-200">
      {cells.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed picture
        <span key={i} className={c ? 'bg-slate-900' : ''} />
      ))}
    </span>
  )
}
