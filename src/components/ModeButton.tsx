import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AdvancedBrainIcon, AdvancedChipIcon, AdvancedDevToolsIcon, AdvancedRocketIcon, AdvancedToolsIcon, SimpleModeIcon } from '@/components/icons'
import type { AppIcon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { useMode, useModeChoice } from '@/hooks/useMode'
import { useMotion } from '@/hooks/useMotion'
import type { Mode } from '@/lib/mode'
import {
  burstDots,
  formatIconPick,
  type IconPick,
  MODE_ICON_KEY,
  MODE_SWITCH as T,
  type ModeIconKey,
  modeButtonLabel,
  modeIconKey,
  modeSwitchMotion,
  modeSwitchToast,
  otherMode,
  parseIconPick,
  pickAdvancedIcon,
  settleIconPick,
} from '@/lib/mode-icon'
import { setModePref } from '@/lib/mode-pref'

/** In the order of src/lib/mode-icon.ts's indexes: rocket, chip, brain, tools, dev tools. */
const ADVANCED_ICONS: AppIcon[] = [AdvancedRocketIcon, AdvancedChipIcon, AdvancedBrainIcon, AdvancedToolsIcon, AdvancedDevToolsIcon]
const iconFor = (k: ModeIconKey): AppIcon => (k === 'simple' ? SimpleModeIcon : (ADVANCED_ICONS[k] ?? ADVANCED_ICONS[0]))

function readPick(): IconPick | null {
  try {
    return parseIconPick(localStorage.getItem(MODE_ICON_KEY))
  } catch {
    return null
  }
}
function writePick(p: IconPick) {
  try {
    localStorage.setItem(MODE_ICON_KEY, formatIconPick(p))
  } catch {
    /* private mode: the pick lasts for this visit */
  }
}
/** The pick for this mode: the stored one, or a new one stored now (Advanced set elsewhere, or a first visit). */
function settledPick(mode: Mode): IconPick | null {
  const stored = readPick()
  const next = settleIconPick(mode, stored, Math.random())
  if (!next) return stored
  writePick(next)
  return next
}

/**
 * Preferences' Advanced option: the same picture the mode button shows in Advanced (picked now if
 * Advanced is on without one). In Simple, the last one shown, or a random one until there is one.
 */
export function AdvancedPickIcon({ size = 16 }: { size?: number }) {
  const mode = useMode()
  const [fallback] = useState(() => pickAdvancedIcon(Math.random(), null))
  const pick = mode === 'advanced' ? settledPick('advanced') : readPick()
  const Icon = iconFor(pick?.index ?? fallback)
  return <Icon size={size} aria-hidden />
}

const SPRING = 'cubic-bezier(.3,1.3,.5,1)'
const OUT = 'cubic-bezier(.2,.7,.3,1)'
const DOTS = burstDots()

/**
 * Simple / Advanced in Profile's header: the leaf, or one of five Advanced pictures. A tap switches
 * (with Undo in the toast); any switch while it's on screen plays a short pop, a burst of accent dots
 * and a faint accent wash behind the page (transform and opacity only), or an instant swap when the
 * device or Settings → Animations asks for less motion.
 */
export function ModeButton() {
  const mode = useMode()
  const choice = useModeChoice()
  const toast = useToast()
  const { prefs, reduced } = useMotion()
  const [pick, setPick] = useState(() => settledPick(mode))
  const key = modeIconKey(mode, pick)
  // A switch in progress: the icon leaving, and an id so each switch runs its own animation.
  const [anim, setAnim] = useState<{ from: ModeIconKey; id: number } | null>(null)
  const shown = useRef({ mode, key })
  const btn = useRef<HTMLButtonElement>(null)
  const exitEl = useRef<HTMLSpanElement>(null)
  const enterEl = useRef<HTMLSpanElement>(null)
  const solidEl = useRef<HTMLSpanElement>(null)
  const lineEl = useRef<HTMLSpanElement>(null)
  const dotsEl = useRef<HTMLSpanElement>(null)
  const washEl = useRef<HTMLDivElement>(null)

  // The mode changed (this button, Undo, Preferences, another device): settle the picture before
  // paint, then animate from the one that was showing.
  useLayoutEffect(() => {
    if (shown.current.mode === mode) return
    const from = shown.current.key
    const p = settledPick(mode)
    setPick(p)
    const to = modeIconKey(mode, p)
    shown.current = { mode, key: to }
    if (from !== to && modeSwitchMotion({ firstRender: false, reduced, motionOn: prefs.on }) === 'animate') {
      setAnim((a) => ({ from, id: (a?.id ?? 0) + 1 }))
    } else setAnim(null)
  }, [mode, reduced, prefs.on])

  useLayoutEffect(() => {
    if (!anim) return
    const all: Animation[] = []
    const run = (el: Element | null | undefined, k: Keyframe[], o: KeyframeAnimationOptions) => {
      if (el) all.push(el.animate(k, { fill: 'both', ...o }))
    }
    const at = (ms: number) => ms / T.total
    run(
      exitEl.current,
      [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(.6)' },
      ],
      { duration: T.exit, easing: 'ease-in' },
    )
    run(
      enterEl.current,
      [
        { offset: 0, opacity: 0, transform: 'scale(.35)' },
        { offset: at(T.enterAt), opacity: 0, transform: 'scale(.35)', easing: SPRING },
        { offset: at(T.overshootAt), opacity: 1, transform: 'scale(1.22)', easing: SPRING },
        { offset: at(T.settleAt), opacity: 1, transform: 'scale(1)' },
        { offset: 1, opacity: 1, transform: 'scale(1)' },
      ],
      { duration: T.total },
    )
    // Pops in filled, then cross-fades to the look the icon style draws.
    run(
      solidEl.current,
      [
        { offset: 0, opacity: 1 },
        { offset: at(T.fillUntil), opacity: 1 },
        { offset: at(T.lineAt), opacity: 0 },
        { offset: 1, opacity: 0 },
      ],
      { duration: T.total },
    )
    run(
      lineEl.current,
      [
        { offset: 0, opacity: 0 },
        { offset: at(T.fillUntil), opacity: 0 },
        { offset: at(T.lineAt), opacity: 1 },
        { offset: 1, opacity: 1 },
      ],
      { duration: T.total },
    )
    const dots = dotsEl.current?.children ?? []
    DOTS.forEach((d, i) => {
      run(
        dots[i],
        [
          { opacity: 0, transform: 'translate(0,0) scale(1)' },
          { opacity: 1, transform: 'translate(0,0) scale(1)', offset: 0.05 },
          { opacity: 0, transform: `translate(${d.dx}px,${d.dy}px) scale(.3)` },
        ],
        { duration: T.dotsFor, delay: T.dotsAt, easing: OUT, fill: 'none' },
      )
    })
    // The wash starts at the button's centre and spreads over the page.
    const w = washEl.current
    const b = btn.current?.getBoundingClientRect()
    if (w && b) {
      w.style.left = `${b.left + b.width / 2}px`
      w.style.top = `${b.top + b.height / 2}px`
      run(
        w,
        [
          { opacity: 0, transform: 'scale(0)' },
          { opacity: 1, transform: 'scale(1)', offset: 0.15 },
          { opacity: 0, transform: 'scale(28)' },
        ],
        { duration: T.washFor, delay: T.washAt, easing: 'cubic-bezier(.2,.6,.3,1)', fill: 'none' },
      )
    }
    try {
      navigator.vibrate?.(8)
    } catch {
      /* not allowed here */
    }
    const done = setTimeout(() => setAnim((a) => (a?.id === anim.id ? null : a)), T.total + 40)
    return () => {
      clearTimeout(done)
      for (const a of all) a.cancel()
    }
  }, [anim])

  const switchMode = () => {
    const next = otherMode(mode)
    const before = choice
    setModePref(next)
    toast(modeSwitchToast(next), 'ok', { action: { label: 'Undo', run: () => setModePref(before) } })
  }

  const Icon = iconFor(key)
  const From = anim ? iconFor(anim.from) : null
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={switchMode}
        className="relative flex h-11 w-11 items-center justify-center rounded-full text-brand-600 hover:bg-slate-200/60 dark:text-brand-300 dark:hover:bg-ink-800"
        aria-label={modeButtonLabel(mode)}
        data-testid="mode-button"
        data-mode={mode}
      >
        {From && (
          <span ref={exitEl} className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <From size={26} />
          </span>
        )}
        <span ref={enterEl} className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          {anim && (
            <span ref={solidEl} className="absolute inset-0 flex items-center justify-center">
              <Icon size={26} solid />
            </span>
          )}
          <span ref={lineEl} className="absolute inset-0 flex items-center justify-center">
            <Icon size={26} />
          </span>
        </span>
        {anim && (
          <span ref={dotsEl} className="pointer-events-none absolute inset-0" aria-hidden>
            {DOTS.map((d, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: a fixed set of ten dots
                key={i}
                className="absolute left-1/2 top-1/2 -ml-[2.5px] -mt-[2.5px] h-[5px] w-[5px] rounded-full opacity-0"
                style={{ background: d.tone === 'brand' ? 'var(--color-brand-500)' : 'var(--color-duo-500)' }}
              />
            ))}
          </span>
        )}
      </button>
      {/* Over the page and its header so it starts at the button (the body's own background would hide it
          underneath), but under the tab bar (z-40), sheets (z-50) and toasts; faint, and never in the way of a tap. */}
      {anim &&
        createPortal(
          <div
            ref={washEl}
            aria-hidden
            className="pointer-events-none fixed z-[35] -ml-5 -mt-5 h-10 w-10 rounded-full opacity-0"
            style={{
              background:
                'radial-gradient(circle, color-mix(in oklab, var(--color-brand-500) 22%, transparent), color-mix(in oklab, var(--color-duo-500) 10%, transparent) 60%, transparent 72%)',
            }}
          />,
          document.body,
        )}
    </>
  )
}
