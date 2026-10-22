import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { findMark, type Part, type PartItem, type Scene as SceneData, type Screen } from '@/lib/help-scenes'
import type { SceneGlyph } from '@/lib/ui-icons'
import {
  AdvancedRocketIcon,
  BotIcon,
  CameraIcon,
  ChatIcon,
  CheckCircleIcon,
  CopyIcon,
  FaceIdIcon,
  FileIcon,
  GroupsIcon,
  HandCoinsIcon,
  HomeIcon,
  ImageAddIcon,
  LiveTableIcon,
  LockIcon,
  MailIcon,
  ProfileIcon,
  ReceiptIcon,
  SettingsIcon,
  SimpleModeIcon,
  SplitIcon,
} from '@/components/icons'
import { type AppIcon, FeatureIcon } from '@/components/Icon'
import { burstDots, MODE_SWITCH } from '@/lib/mode-icon'
import { ArrowDownUp, Check, Search } from 'lucide-react'
import './help-motion.css'

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
  // The full screen showing: the step's own, or the one its sheet rises over.
  const view = base ?? screen
  const box = useRef<HTMLDivElement>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number; jump: boolean } | null>(null)
  // A new screen pushes the old one off: it stays a moment, sliding left and fading, while the new one comes in.
  // It goes with the sheet that was over it, if any, so nothing blinks out first.
  const sheet = base !== null ? screen : null
  const [leaving, setLeaving] = useState<{ view: number; sheet: number | null } | null>(null)
  const shown = useRef({ view, sheet })
  useLayoutEffect(() => {
    const from = shown.current
    shown.current = { view, sheet }
    if (from.view === view) return
    if (still) return setLeaving(null)
    setLeaving(from)
    const t = setTimeout(() => setLeaving(null), 300)
    return () => clearTimeout(t)
  }, [view, sheet, still])
  // The pointer goes to the marked part. Measured by layout offsets, not on-screen boxes, so a sheet
  // or screen still sliding in gives where the part comes to rest; again on a resize.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new screen moves the part even when the mark stays
  useLayoutEffect(() => {
    const root = box.current
    if (!root || !mark) return setPointer(null)
    const place = () => {
      const part = root.querySelector<HTMLElement>(`[data-scene-now] [data-mark="${CSS.escape(mark)}"]`)
      // A row of chips is tapped on its first chip, not in the gap between two.
      const el = part?.querySelector<HTMLElement>('[data-point]') ?? part
      if (!el) return setPointer(null)
      const o = offsetIn(el, root)
      // Appearing, it starts where it is; after that it glides.
      setPointer((p) => ({ x: o.x + el.offsetWidth / 2, y: o.y + el.offsetHeight / 2, jump: !p }))
    }
    place()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    ro?.observe(root)
    return () => ro?.disconnect()
  }, [mark, screen, still])
  const enter = still ? 'animate-[fade-in_150ms_ease-out]' : 'animate-[help-enter_300ms_cubic-bezier(0.32,0.72,0,1)_both]'
  return (
    <div
      className="relative isolate mx-auto aspect-[9/14] select-none overflow-hidden rounded-[2rem] border-[6px] border-slate-800 bg-slate-50 shadow-xl dark:border-ink-700 dark:bg-ink-950"
      // As wide as fits: 14rem, the card, or what keeps the phone within 46% of the screen's height.
      style={{ width: 'min(14rem, 100%, calc(46svh * 9 / 14))' }}
      aria-hidden
      ref={box}
      data-testid="help-scene"
    >
      <div className="absolute left-1/2 top-1.5 z-20 h-1.5 w-12 -translate-x-1/2 rounded-full bg-slate-800 dark:bg-ink-700" />
      {leaving !== null && leaving.view !== view && (
        <div key={`leave-${leaving.view}`} className="absolute inset-0 animate-[help-leave_300ms_cubic-bezier(0.32,0.72,0,1)_both]">
          <ScreenView screen={scene[leaving.view]} />
          {leaving.sheet !== null && (
            <>
              <div className="absolute inset-0 bg-slate-900/35 dark:bg-black/50" />
              <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-3 shadow-2xl dark:bg-ink-900">
                <div className="mx-auto mb-2 h-1 w-8 rounded-full bg-slate-300 dark:bg-ink-700" />
                <Parts screen={scene[leaving.sheet]} step={step} still />
              </div>
            </>
          )}
        </div>
      )}
      <div key={`screen-${view}`} className={`absolute inset-0 ${leaving !== null || still ? enter : ''}`} {...(base === null ? { 'data-scene-now': '' } : {})}>
        <ScreenView screen={scene[view]} mark={base === null ? mark : undefined} step={step} still={still} />
      </div>
      {base !== null && (
        <>
          {/* The screen under a sheet dims (once, as the first sheet over it rises); the sheet slides up over it. */}
          <div
            key={`dim-${base}`}
            className={`absolute inset-0 z-[5] bg-slate-900/35 dark:bg-black/50 ${still ? '' : 'animate-[help-dim_200ms_ease-out_both]'}`}
          />
          <div
            key={`sheet-${screen}`}
            data-scene-now=""
            className={`absolute inset-x-0 bottom-0 z-10 rounded-t-2xl bg-white p-3 shadow-2xl dark:bg-ink-900 ${still ? 'animate-[fade-in_150ms_ease-out]' : 'animate-[help-sheet_320ms_cubic-bezier(0.32,0.72,0,1)_both]'}`}
          >
            <div className="mx-auto mb-2 h-1 w-8 rounded-full bg-slate-300 dark:bg-ink-700" />
            <Parts screen={scene[screen]} mark={mark} step={step} still={still} />
          </div>
        </>
      )}
      {pointer && (
        <div
          className={`pointer-events-none absolute left-0 top-0 z-30 -ml-4 -mt-4 h-8 w-8 ${still ? '' : 'animate-[help-dim_200ms_ease-out]'}`}
          style={{
            transform: `translate3d(${pointer.x}px, ${pointer.y}px, 0)`,
            transition: still || pointer.jump ? 'none' : `transform ${GLIDE}ms cubic-bezier(0.77, 0, 0.175, 1)`,
          }}
        >
          {/* The press, once the pointer lands: a ring spreads and fades, and the dot gives a little. */}
          <span
            key={`ring-${step}`}
            className="absolute inset-0 rounded-full bg-brand-500/25 ring-2 ring-brand-500"
            style={still ? { opacity: 0.8 } : { opacity: 0, animation: `help-tap 450ms cubic-bezier(0.23, 1, 0.32, 1) ${GLIDE}ms both` }}
          />
          <span
            key={`dot-${step}`}
            className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600 shadow ring-2 ring-white dark:ring-ink-950"
            // After the press the finger lifts: the dot fades back, so a small part it pressed (an icon) shows its change.
            style={
              still ? undefined : { animation: `help-dot 260ms cubic-bezier(0.23, 1, 0.32, 1) ${GLIDE}ms both, hm-lift 300ms ease-out ${GLIDE + 450}ms both` }
            }
          />
        </div>
      )}
    </div>
  )
}

/** The pointer's glide to the next part, in ms; the press (and the part lighting up) waits for it. */
const GLIDE = 450
/** A part's highlight comes on at the press, not before the pointer gets there. */
const HIT = 'animate-[help-hit_200ms_ease-out_450ms_both]'

/** An element's place inside the phone, from layout offsets: transforms mid-animation don't move it. */
function offsetIn(el: HTMLElement, root: HTMLElement): { x: number; y: number } {
  let x = 0
  let y = 0
  for (let n: HTMLElement | null = el; n && n !== root; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft
    y += n.offsetTop
  }
  return { x, y }
}

function ScreenView({ screen, mark, step = 0, still = true }: { screen: Screen; mark?: string; step?: number; still?: boolean }) {
  return (
    // Opaque, so a screen coming in covers the one going out.
    <div className="absolute inset-0 flex flex-col bg-slate-50 px-3 pb-2 pt-6 dark:bg-ink-950">
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

/** The app's own UI icon for each scene glyph, so a scene's tab bar and tiles match the real ones. */
const SCENE_ICONS: Record<SceneGlyph, AppIcon> = {
  camera: CameraIcon,
  chat: ChatIcon,
  checkCircle: CheckCircleIcon,
  copy: CopyIcon,
  divide: SplitIcon,
  envelope: MailIcon,
  faceId: FaceIdIcon,
  file: FileIcon,
  house: HomeIcon,
  liveTable: LiveTableIcon,
  lock: LockIcon,
  money: HandCoinsIcon,
  receipt: ReceiptIcon,
  user: ProfileIcon,
  users: GroupsIcon,
}

/** An item's picture: the interface icon as the app draws it, or the emoji the person chose. */
function ItemFace({ it, size, className = '' }: { it: PartItem; size: number; className?: string }) {
  if (it.glyph) {
    const Glyph = SCENE_ICONS[it.glyph]
    return <Glyph size={size} solid={it.on} className="shrink-0" />
  }
  return it.icon ? <span className={className}>{it.icon}</span> : null
}

/** A part is "on" when its step is the one playing: it reacts the way the real control does. */
function PartView({ part: p, mark, step, still }: { part: Part; mark?: string; step: number; still: boolean }) {
  const on = !!mark && p.mark === mark
  const hit = `ring-2 ring-brand-500 ${still ? '' : HIT}`
  const ring = on ? hit : ''
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
    case 'search': {
      const btn = p.items?.[0]
      return (
        <div className="flex items-center gap-1.5">
          <div {...tag} className={`flex min-w-0 flex-1 items-center gap-1 rounded-xl bg-white px-2 py-1.5 text-[0.65rem] shadow-sm dark:bg-ink-800 ${ring}`}>
            <Search size={10} className="text-muted shrink-0" />
            {p.value ? (
              <span className="min-w-0 font-semibold">
                <Typed text={p.value} active={on} still={still} step={step} />
              </span>
            ) : (
              <span className="text-muted truncate">{p.label}</span>
            )}
          </div>
          {btn && (
            <span
              {...(btn.mark ? { 'data-mark': btn.mark } : {})}
              className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${btn.label ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'bg-slate-100 text-slate-600 dark:bg-ink-800 dark:text-slate-300'} ${btn.mark && btn.mark === mark ? hit : ''}`}
            >
              <ArrowDownUp size={12} />
              {btn.label && (
                <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-fill px-0.5 text-[0.5rem] font-bold leading-none text-on-fill">
                  {btn.label}
                </span>
              )}
            </span>
          )}
        </div>
      )
    }
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
          className={`rounded-xl px-2 py-2 text-center text-[0.7rem] font-bold transition ${p.primary ? 'bg-fill text-on-fill' : 'bg-white shadow-sm dark:bg-ink-800'} ${on ? `${ring} scale-[0.97] delay-[450ms]` : ''}`}
        >
          {p.label}
        </div>
      )
    case 'chips':
      return (
        <div {...tag} className={`flex flex-wrap gap-1 rounded-xl ${ring}`}>
          {(p.items ?? []).map((it, i) => {
            // A chip whose own step plays is picked; otherwise the part keeps its starting choice.
            const picked = (p.items ?? []).some((x) => x.mark && x.mark === mark) ? it.mark === mark : !!it.on
            return (
              <span
                key={it.label}
                {...(it.mark ? { 'data-mark': it.mark } : {})}
                {...(i === 0 && p.mark ? { 'data-point': '' } : {})}
                className={`rounded-full px-2 py-1 text-[0.6rem] font-semibold transition-colors duration-200 ${it.mark && it.mark === mark && !still ? 'delay-[450ms]' : ''} ${picked ? 'bg-fill text-on-fill' : 'bg-white shadow-sm dark:bg-ink-800'}`}
              >
                {it.label}
              </span>
            )
          })}
        </div>
      )
    case 'tiles': {
      // Help's own tiles: a tick on the finished ones, a dot on the rest; a step in `alsoOn` ticks the next one.
      const next = p.done && mark && p.alsoOn?.includes(mark) ? (p.items ?? []).findIndex((x) => !x.on) : -1
      return (
        <div className="grid grid-cols-2 gap-1.5">
          {(p.items ?? []).map((it, i) => {
            const done = !!p.done && (!!it.on || i === next)
            return (
              <div
                key={it.label}
                {...(it.mark ? { 'data-mark': it.mark } : {})}
                className={`relative flex flex-col items-center gap-0.5 rounded-xl bg-white p-1.5 text-[0.6rem] font-semibold shadow-sm dark:bg-ink-800 ${done ? 'ring-[1.5px] ring-inset ring-brand-500/70' : ''} ${it.mark && it.mark === mark ? hit : ''}`}
              >
                {p.done &&
                  (done ? (
                    <span
                      key={`tick-${i === next ? step : 0}`}
                      className="absolute right-1 top-1 flex h-3 w-3 items-center justify-center rounded-full bg-fill text-on-fill"
                      style={i === next && !still ? { animation: `sx-pop 320ms cubic-bezier(0.23, 1, 0.32, 1) ${GLIDE + 150}ms both` } : undefined}
                    >
                      <Check size={8} strokeWidth={3.5} />
                    </span>
                  ) : (
                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand-500" />
                  ))}
                <ItemFace it={it} size={16} className="text-base" />
                {it.label}
              </div>
            )
          })}
        </div>
      )
    }
    case 'list':
      return (
        <div {...tag} className={`rounded-xl bg-white p-1.5 shadow-sm dark:bg-ink-800 ${ring}`}>
          {p.label && <div className="text-muted px-0.5 pb-1 text-[0.55rem] font-semibold">{p.label}</div>}
          {(p.items ?? []).map((it, i) => (
            <div
              key={it.label}
              {...(it.mark ? { 'data-mark': it.mark } : {})}
              className={`flex items-center gap-1.5 rounded-lg px-0.5 py-1 text-[0.65rem] ${it.mark && it.mark === mark ? hit : ''} ${on && !still ? 'animate-[help-in_0.4s_ease-out_both]' : ''}`}
              style={on && !still ? { animationDelay: `${i * 120}ms` } : undefined}
            >
              <ItemFace it={it} size={12} />
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
      return (
        <div {...tag} className={`text-muted rounded-lg px-1 text-[0.55rem] ${ring}`}>
          {p.label}
        </div>
      )
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
            <LockIcon size={22} />
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
          <span className={`text-brand-600 dark:text-brand-300 ${still ? '' : 'animate-[help-press_1.4s_ease-out_0.3s_both]'}`}>
            <FaceIdIcon size={30} />
          </span>
          {p.label}
        </div>
      )
    case 'locked':
      return (
        <div {...tag} className={`flex items-center gap-2 rounded-xl bg-white px-2 py-2 text-[0.65rem] shadow-sm dark:bg-ink-800 ${ring}`}>
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-200 dark:bg-ink-700">
            <LockIcon size={13} />
          </span>
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
                // The accent's own shades, like the app's Donut: every accent and dark mode keep it in their colours.
                [40, 'var(--color-brand-500)'],
                [25, 'var(--color-duo-500)'],
                [20, 'var(--color-brand-300)'],
                [15, 'var(--color-duo-200)'],
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
                className={`-mt-4 flex h-9 w-9 items-center justify-center rounded-full bg-fill text-lg font-bold text-on-fill shadow-lg ${it.mark && it.mark === mark ? `${hit} ring-offset-2` : ''}`}
              >
                +
              </span>
            ) : (
              <span
                key={it.label}
                {...(it.mark ? { 'data-mark': it.mark } : {})}
                className={`flex flex-col items-center text-[0.5rem] ${it.on || (it.mark && it.mark === mark) ? 'font-bold text-brand-600 dark:text-brand-300' : 'text-muted'}`}
              >
                <ItemFace it={it} size={14} className="text-sm" />
                {it.label}
              </span>
            ),
          )}
        </div>
      )
    case 'header': {
      // Profile's header: the title, then the mode icon (ModeButton) and Settings as round buttons.
      const btn = p.items?.[0]
      const advanced = !!mark && (btn?.mark === mark || !!p.alsoOn?.includes(mark))
      return (
        <div className="flex items-center justify-between pb-1">
          <span className="truncate text-[0.8rem] font-bold">{p.label}</span>
          <span className="flex items-center gap-0.5">
            <span
              {...(btn?.mark ? { 'data-mark': btn.mark } : {})}
              className={`relative flex h-7 w-7 items-center justify-center rounded-full text-brand-600 dark:text-brand-300 ${btn?.mark && btn.mark === mark ? hit : ''}`}
            >
              <ModeSwap key={`mode-${step}`} switching={btn?.mark === mark && !still} advanced={advanced} />
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full text-slate-700 dark:text-slate-200">
              <SettingsIcon size={14} />
            </span>
          </span>
        </div>
      )
    }
    case 'toast': {
      // The app's toast: shown on its own step, and after the press on a step that brings it (`alsoOn`).
      const own = !!mark && p.mark === mark
      const brought = !!mark && !!p.alsoOn?.includes(mark)
      if (!own && !brought) return null
      return (
        <div
          className="mt-auto flex items-center gap-1.5 rounded-xl bg-slate-900/95 py-1 pl-2 pr-0.5 text-[0.55rem] font-medium text-white shadow-lg ring-1 ring-white/10 dark:bg-ink-700/95"
          style={still ? undefined : { animation: `sx-in 260ms cubic-bezier(0.23, 1, 0.32, 1) ${own ? 0 : GLIDE + 350}ms both` }}
        >
          <CheckCircleIcon size={11} className="shrink-0 text-emerald-400" />
          <span className="min-w-0 flex-1 truncate">{p.label}</span>
          <span {...tag} className={`shrink-0 rounded-lg px-1.5 py-1 font-bold text-brand-300 ${own ? hit : ''}`}>
            {p.value}
          </span>
        </div>
      )
    }
    case 'scancard': {
      // Scan's card as the app draws it (ScanCard, ScanIntro, ScanAiCorner).
      const [cam, lib, ai] = p.items ?? []
      return (
        <div className="relative overflow-hidden rounded-xl bg-white shadow-sm dark:bg-ink-800">
          {ai && (
            <span
              {...(ai.mark ? { 'data-mark': ai.mark } : {})}
              className={`absolute right-1 top-1 flex h-4 items-center gap-0.5 rounded-full px-1.5 text-[0.48rem] font-semibold shadow-sm ${ai.on ? 'bg-fill text-on-fill' : 'bg-white/90 text-slate-600 ring-1 ring-slate-200 dark:bg-ink-900/85 dark:text-slate-300 dark:ring-white/10'} ${ai.mark && ai.mark === mark ? hit : ''}`}
            >
              <BotIcon size={9} solid={ai.on} />
              {ai.label}
            </span>
          )}
          <div className="flex flex-col items-center px-3 pb-2 pt-5 text-center">
            <span className="mb-1.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-fill-500 to-fill-to text-on-fill shadow">
              <FeatureIcon name="receipt" size={20} tone="current" />
            </span>
            <span className="text-[0.7rem] font-bold">{p.label}</span>
            <span className="text-muted text-[0.5rem]">The total, items and date</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 px-2 pb-2">
            {[cam, lib].map(
              (it, i) =>
                it && (
                  <span
                    key={it.label}
                    {...(it.mark ? { 'data-mark': it.mark } : {})}
                    className={`flex items-center justify-center gap-1 rounded-xl py-1.5 text-[0.6rem] font-bold transition-transform duration-150 ${i === 0 ? 'bg-fill text-on-fill' : 'bg-slate-100 text-slate-700 dark:bg-ink-700 dark:text-slate-100'} ${it.mark && it.mark === mark ? `${hit} ${still ? '' : 'scale-[0.97] delay-[450ms]'}` : ''}`}
                  >
                    {i === 0 ? <CameraIcon size={11} /> : <ImageAddIcon size={11} />}
                    {it.label}
                  </span>
                ),
            )}
          </div>
        </div>
      )
    }
    case 'helphead':
      return (
        <div className="flex items-center justify-between pb-1">
          <span className="truncate text-[0.8rem] font-bold">{p.label}</span>
          <span {...tag} className={`rounded-full ${ring}`}>
            <MiniRing from={Number(p.value ?? 0)} to={on ? Number(p.value ?? 0) + 20 : Number(p.value ?? 0)} still={still} step={step} />
          </span>
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

/**
 * The mode icon in a scene, as ModeButton switches it: the leaf shrinks away, the Advanced picture
 * pops in filled with a small overshoot, a burst of accent dots and a faint wash spread from it,
 * then it settles to the line look. It starts at the press. Without `switching`, the icon at rest.
 */
function ModeSwap({ switching, advanced }: { switching: boolean; advanced: boolean }) {
  if (!switching) return advanced ? <AdvancedRocketIcon size={14} /> : <SimpleModeIcon size={14} />
  const T = MODE_SWITCH
  const at = (ms: number) => `${GLIDE + ms}ms`
  return (
    <span className="absolute inset-0 flex items-center justify-center">
      <span
        className="pointer-events-none absolute inset-0 m-auto h-3 w-3 rounded-full"
        style={{
          opacity: 0,
          background:
            'radial-gradient(circle, color-mix(in oklab, var(--color-brand-500) 30%, transparent), color-mix(in oklab, var(--color-duo-500) 12%, transparent) 60%, transparent 72%)',
          animation: `hm-wash ${T.washFor}ms cubic-bezier(0.2, 0.6, 0.3, 1) ${at(T.washAt)} both`,
        }}
      />
      <span className="absolute inset-0 flex items-center justify-center" style={{ animation: `hm-exit ${T.exit}ms ease-in ${at(0)} both` }}>
        <SimpleModeIcon size={14} />
      </span>
      <span className="absolute inset-0 flex items-center justify-center" style={{ animation: `hm-enter ${T.total}ms linear ${at(0)} both` }}>
        <span className="absolute inset-0 flex items-center justify-center" style={{ opacity: 0, animation: `hm-solid ${T.total}ms linear ${at(0)} both` }}>
          <AdvancedRocketIcon size={14} solid />
        </span>
        <span className="absolute inset-0 flex items-center justify-center" style={{ animation: `hm-line ${T.total}ms linear ${at(0)} both` }}>
          <AdvancedRocketIcon size={14} />
        </span>
      </span>
      {SCENE_DOTS.map((d) => (
        <span
          key={`${d.dx},${d.dy}`}
          className="pointer-events-none absolute left-1/2 top-1/2 -ml-[1.5px] -mt-[1.5px] h-[3px] w-[3px] rounded-full"
          style={
            {
              opacity: 0,
              background: d.tone === 'brand' ? 'var(--color-brand-500)' : 'var(--color-duo-500)',
              '--dx': `${d.dx}px`,
              '--dy': `${d.dy}px`,
              animation: `hm-burst ${T.dotsFor}ms cubic-bezier(0.2, 0.7, 0.3, 1) ${at(T.dotsAt)} both`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  )
}

/** ModeButton's burst, scaled to the scene's smaller button. */
const SCENE_DOTS = burstDots().map((d) => ({ ...d, dx: Math.round(d.dx * 0.6), dy: Math.round(d.dy * 0.6) }))

/** Help's progress ring, small: it fills from `from` to `to` (%) at the press, and its number follows. */
function MiniRing({ from, to, still, step }: { from: number; to: number; still: boolean; step: number }) {
  const [shown, setShown] = useState(to)
  // biome-ignore lint/correctness/useExhaustiveDependencies: each play of the step fills it again
  useEffect(() => {
    if (still || to === from) return setShown(to)
    setShown(from)
    const t = setTimeout(() => setShown(to), GLIDE + 150)
    return () => clearTimeout(t)
  }, [from, to, still, step])
  const r = 11
  const c = 2 * Math.PI * r
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" className="block">
      <defs>
        <linearGradient id="help-scene-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--color-brand-600)' }} />
          <stop offset="1" style={{ stopColor: 'var(--color-duo-500)' }} />
        </linearGradient>
      </defs>
      <circle cx="14" cy="14" r={r} fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth="3" />
      <circle
        cx="14"
        cy="14"
        r={r}
        fill="none"
        stroke="url(#help-scene-ring)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${(c * shown) / 100} ${c}`}
        transform="rotate(-90 14 14)"
        style={{ transition: still ? 'none' : 'stroke-dasharray 600ms cubic-bezier(0.23, 1, 0.32, 1)' }}
      />
      <text x="14" y="14" textAnchor="middle" dominantBaseline="central" className="fill-current text-[7px] font-extrabold">
        {shown}%
      </text>
    </svg>
  )
}
