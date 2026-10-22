import { isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { useAppConfig } from '@/hooks/useAppConfig'
import { effectiveLook, hintView, showsAt, type HintSpec, type Look } from '@/lib/look'
import { getLookPref, subscribeLookPref } from '@/lib/look-pref'
import { hintLookForMode, lookForMode } from '@/lib/mode'
import { useMode } from '@/hooks/useMode'

/**
 * Subtexts that follow the admin's detail level (Admin → App → Detail level, src/lib/look.ts).
 * A subtext is written once as `{ full, short, tier }`; these components draw the right form:
 * the line under a title (HintText), or the (i) beside the title in the Tooltip look (InfoTip).
 * A title and its subtext usually come together through <Titled>.
 */
export type Hint = HintSpec<ReactNode>

/** A subtext prop may be plain text (always shown, as before) or a Hint. */
export const isHint = (x: unknown): x is Hint => typeof x === 'object' && x !== null && !isValidElement(x) && !Array.isArray(x) && 'full' in x

/** The look to draw: Minimal in Simple mode; else this person's own choice (Settings → Preferences), else the admin's. */
export function useLook(): Look {
  const admin = useAppConfig().look
  const mine = useSyncExternalStore(subscribeLookPref, getLookPref, getLookPref)
  return lookForMode(useMode(), effectiveLook(admin, mine))
}

/** True when the current look shows optional UI of this detail (2: hidden in Minimal; 3: Full and Tooltip only). */
export function useShows(minDetail: 1 | 2 | 3): boolean {
  return showsAt(useLook(), minDetail)
}

/** Draws its children only in looks that show this much detail. */
export function Detail({ min, children }: { min: 1 | 2 | 3; children: ReactNode }) {
  return useShows(min) ? <>{children}</> : null
}

/** The resolved parts of a subtext prop: plain text is always inline; a Hint follows the look. */
export function useHint(h: Hint | ReactNode | undefined): { text: ReactNode | null; tip: ReactNode | null } {
  // Subtext in Simple is Minimal (only lines that stop a mistake); sections follow useLook.
  const admin = useAppConfig().look
  const mine = useSyncExternalStore(subscribeLookPref, getLookPref, getLookPref)
  const look = hintLookForMode(useMode(), effectiveLook(admin, mine))
  if (h === undefined || h === null || h === false) return { text: null, tip: null }
  return isHint(h) ? hintView(look, h) : { text: h, tip: null }
}

/** The inline line of a subtext (nothing in the Tooltip look, or when this look drops it). */
export function HintText({
  hint,
  className = 'text-muted text-xs',
  id,
  as: Tag = 'p',
}: {
  hint: Hint | ReactNode
  className?: string
  id?: string
  as?: 'p' | 'span' | 'div'
}) {
  const { text } = useHint(hint)
  if (text === null || text === undefined || text === '') return null
  return (
    <Tag className={className} id={id}>
      {text}
    </Tag>
  )
}

/**
 * The (i) beside a title in the Tooltip look; nothing in the others. Tap (or Enter) opens the
 * full text in a small bubble under it; tapping anywhere else, or Escape, closes it. A click,
 * not a hover: phones have no hover. Safe inside a <label>: it never toggles the label's control.
 * `always` shows the (i) in every look (for a few places with no room for a line at all).
 */
export function InfoTip({ hint, label = 'More about this', always = false }: { hint: Hint | ReactNode; label?: string; always?: boolean }) {
  const { tip } = useHint(hint)
  const content = always ? (isHint(hint) ? hint.full : hint) : tip
  if (content === null || content === undefined || content === '') return null
  return <TipButton label={label}>{content}</TipButton>
}

function TipButton({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const id = useId()

  // Placed under the button and kept inside the screen with the usual 16px gutter.
  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const width = Math.min(288, window.innerWidth - 32)
    const left = Math.max(16, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - 16 - width))
    setPos({ top: r.bottom + 6, left, width })
  }, [open])

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (btn.current?.contains(e.target as Node) || pop.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btn.current?.focus()
      }
    }
    // Scrolling moves the button away from a fixed bubble; close rather than float in the wrong place.
    const scroll = () => setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    window.addEventListener('scroll', scroll, { capture: true, passive: true })
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
      window.removeEventListener('scroll', scroll, { capture: true })
    }
  }, [open])

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(e) => {
          // Inside a <label> or a row link the tap is for the (i) only.
          e.preventDefault()
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className="-my-1 ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full align-middle text-slate-400 transition hover:text-brand-600 focus-visible:outline-2 dark:hover:text-brand-300"
        data-testid="info-tip"
      >
        <Info size={15} aria-hidden />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={pop}
            id={id}
            role="note"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            className="animate-pop fixed z-[60] rounded-xl bg-slate-900 px-3 py-2 text-left text-xs font-normal leading-relaxed text-white shadow-lg dark:bg-ink-700"
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  )
}

/**
 * A title with its subtext: the (i) rides beside the title in the Tooltip look, the line goes
 * under it in the others. `title` keeps whatever element the caller wraps it in (a label, a heading).
 */
export function Titled({
  title,
  hint,
  className,
  hintClassName = 'text-muted mt-0.5 text-xs',
  hintId,
  tipLabel,
}: {
  title: ReactNode
  hint?: Hint | ReactNode
  className?: string
  hintClassName?: string
  hintId?: string
  tipLabel?: string
}) {
  return (
    <div className={className}>
      <div className="flex items-center">
        <div className="min-w-0">{title}</div>
        <InfoTip hint={hint} label={tipLabel ?? (typeof title === 'string' ? `About ${title}` : undefined)} />
      </div>
      <HintText hint={hint} className={hintClassName} id={hintId} as="div" />
    </div>
  )
}
