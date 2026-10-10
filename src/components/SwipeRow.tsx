import { useCallback, useEffect, useId, useRef, useState, type ElementType, type PointerEvent, type ReactNode } from 'react'
import { dragOffset, isLongPress, isTap, LONG_PRESS_MS, lockAxis, settleOpen, trayWidth, velocityOf, wheelStep, type SwipeAxis } from '@/lib/swipe'
import { Sheet } from './Sheet'

export interface SwipeAction {
  /** Short name: the icon button's tooltip and accessible name, e.g. "Delete" or "Remove". */
  label: string
  /** A fuller name for screen readers, also the text in the press-and-hold menu ("Delete payment"). */
  ariaLabel?: string
  /** The icon the tray shows (lucide, ~20px). The label is never drawn in the tray, only the icon. */
  icon: ReactNode
  onClick: () => void
  /**
   * 'danger' (default) is the red destructive action; 'accent' the row's main positive action
   * (Settle up); 'neutral' a plain one; 'muted' one that only explains why it can't be done yet.
   */
  tone?: 'danger' | 'accent' | 'neutral' | 'muted'
  testId?: string
}

/** Only one row is open at a time: opening one tells the others to close. */
const OPEN_EVENT = 'swiperow:open'
/** The soft edge (px) where the tray fades into the row it covers. */
const FADE = 24

const TONE: Record<NonNullable<SwipeAction['tone']>, string> = {
  danger: 'bg-rose-600 text-white',
  accent: 'bg-fill text-on-fill',
  neutral: 'bg-slate-600 text-white dark:bg-slate-500',
  muted: 'bg-slate-200 text-slate-600 dark:bg-ink-700 dark:text-slate-300',
}

/**
 * A list row with actions (Delete, Remove, Settle up, …) behind it, instead of a button beside
 * every row. The drag, press and trackpad decisions live in src/lib/swipe.ts.
 *
 * The row never slides away: a tray of round icon buttons slides in over its trailing end (where
 * the amount sits) while the avatar and name on the left stay in view, so you still see whose row
 * it is while you choose. Ways in, all showing the same actions:
 *   - swipe left (touch, or a mouse drag); swipe right or tap the row to close it
 *   - two-finger swipe left on a trackpad
 *   - press and hold (touch), right-click, or the keyboard's menu key: a sheet listing the actions
 *     with their full names, for when the icons alone aren't enough
 *   - Tab: focusing an action opens the tray, so a keyboard user sees what they press
 * Never gesture-only: the actions are real labelled buttons a screen reader reads. Vertical
 * scrolling is untouched (touch-action pan-y; a drag that starts vertical is ignored). An open row
 * closes on a tap outside it, on scroll, or when another row opens.
 */
export function SwipeRow({
  as: Tag = 'li',
  actions,
  children,
  className = '',
  contentClassName = '',
  surface = 'bg-white dark:bg-ink-900',
  menuTitle,
  testId,
}: {
  as?: ElementType
  actions: SwipeAction[]
  children: ReactNode
  /** Classes for the outer element (the list item). */
  className?: string
  /** Classes for the row's content (usually its flex layout and padding). */
  contentClassName?: string
  /** The tray's background, so it hides what it covers: match the card or sheet the row sits on. */
  surface?: string
  /** Title of the press-and-hold menu, usually the row's name ("Zoe", "Dinner at Thalassa"). */
  menuTitle?: string
  testId?: string
}) {
  const id = useId()
  const rootRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [open, setOpenState] = useState(false)
  const [menu, setMenu] = useState(false)
  const [drag, setDrag] = useState<number | null>(null)
  const g = useRef<{ x: number; y: number; px: number; pt: number; t0: number; v: number; axis?: SwipeAxis; base: number; pid: number } | null>(null)
  const press = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // A drag, a long press (or the tap that closes an open row) must not also click the row's link.
  const swallowClick = useRef(false)
  const width = trayWidth(actions.length)

  const setOpen = useCallback(
    (v: boolean) => {
      setOpenState(v)
      if (v) window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }))
    },
    [id],
  )

  useEffect(() => {
    const other = (e: Event) => (e as CustomEvent).detail !== id && setOpenState(false)
    window.addEventListener(OPEN_EVENT, other)
    return () => window.removeEventListener(OPEN_EVENT, other)
  }, [id])

  useEffect(() => {
    if (!open) return
    const outside = (e: Event) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenState(false)
    }
    // Keyboard focus can scroll the page to show the action; that scroll must not close it again.
    const scrolled = () => {
      if (!rootRef.current?.contains(document.activeElement)) setOpenState(false)
    }
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('scroll', scrolled, { capture: true, passive: true })
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('scroll', scrolled, true)
    }
  }, [open])

  // Two-finger swipe on a trackpad. Non-passive so a handled (horizontal) swipe can be kept from
  // turning into the browser's back / forward gesture; vertical scrolling passes through.
  const hasActions = actions.length > 0
  useEffect(() => {
    const el = contentRef.current
    if (!el || !hasActions) return
    let acc = 0
    let idle: ReturnType<typeof setTimeout> | undefined
    const wheel = (e: WheelEvent) => {
      const s = wheelStep(acc, e.deltaX, e.deltaY)
      if (!s.handled) return
      e.preventDefault()
      acc = s.acc
      clearTimeout(idle)
      idle = setTimeout(() => {
        acc = 0
      }, 250)
      if (s.open !== undefined) setOpen(s.open)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', wheel)
      clearTimeout(idle)
    }
  }, [hasActions, setOpen])

  useEffect(() => () => clearTimeout(press.current), [])

  if (!hasActions)
    return (
      <Tag className={className} data-testid={testId}>
        <div className={contentClassName}>{children}</div>
      </Tag>
    )

  const openMenu = () => {
    clearTimeout(press.current)
    g.current = null
    setDrag(null)
    setOpenState(false)
    swallowClick.current = true
    setMenu(true)
  }

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    swallowClick.current = false
    g.current = { x: e.clientX, y: e.clientY, px: e.clientX, pt: e.timeStamp, t0: e.timeStamp, v: 0, base: open ? -width : 0, pid: e.pointerId }
    // Press and hold (touch and pen; a mouse right-clicks instead). Android also fires contextmenu
    // on a long press; whichever comes first opens the menu, the other finds it open.
    if (e.pointerType !== 'mouse') {
      clearTimeout(press.current)
      press.current = setTimeout(() => {
        const s = g.current
        if (s && isLongPress(LONG_PRESS_MS, s.px - s.x, 0)) {
          navigator.vibrate?.(10)
          openMenu()
        }
      }, LONG_PRESS_MS)
    }
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const s = g.current
    if (!s || s.pid !== e.pointerId) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (!isTap(dx, dy)) clearTimeout(press.current)
    if (!s.axis) {
      s.axis = lockAxis(dx, dy)
      if (!s.axis) return
      if (s.axis === 'y') {
        g.current = null
        return
      }
      e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    s.v = velocityOf(s.px, s.pt, e.clientX, e.timeStamp)
    s.px = e.clientX
    s.pt = e.timeStamp
    setDrag(dragOffset(s.base, dx, width))
  }
  const up = (e: PointerEvent<HTMLDivElement>) => {
    clearTimeout(press.current)
    const s = g.current
    g.current = null
    if (!s || s.pid !== e.pointerId) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (s.axis === 'x') {
      swallowClick.current = true
      setOpen(settleOpen(dragOffset(s.base, dx, width), width, s.v, s.base !== 0))
    } else if (open && isTap(dx, dy)) {
      // A tap on an open row's content closes it rather than opening the row's link.
      swallowClick.current = true
      setOpenState(false)
    }
    setDrag(null)
  }
  const cancel = () => {
    clearTimeout(press.current)
    g.current = null
    setDrag(null)
  }

  const offset = drag ?? (open ? -width : 0)
  // The tray (plus its fade) slides in from the right edge as the row is dragged.
  const shown = width ? Math.min(1, Math.max(0, -offset / width)) : 0
  const trayX = (width + FADE) * (1 - shown)
  return (
    <Tag
      ref={rootRef}
      className={`relative overflow-hidden ${className}`}
      data-testid={testId}
      data-swipe={open ? 'open' : 'closed'}
      onFocus={(e: React.FocusEvent) => {
        // Keyboard and screen-reader path: focusing an action shows it.
        if ((e.target as HTMLElement).closest('[data-swipe-actions]')) setOpen(true)
      }}
      onBlur={(e: React.FocusEvent) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null) && open && drag === null) setOpenState(false)
      }}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the swipe, hold and right-click are pointer shortcuts; the actions are real buttons, revealed on keyboard focus. */}
      <div
        ref={contentRef}
        className={`relative touch-pan-y select-none [-webkit-touch-callout:none] ${contentClassName}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onContextMenu={(e) => {
          e.preventDefault()
          openMenu()
        }}
        onDragStart={(e) => e.preventDefault()}
        onClickCapture={(e) => {
          if (!swallowClick.current) return
          swallowClick.current = false
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        {children}
      </div>
      <div
        className={`absolute inset-y-0 right-0 flex items-center justify-end ${surface} ${drag === null ? 'transition-transform duration-200 ease-out' : ''}`}
        style={{
          width: width + FADE,
          paddingLeft: FADE,
          paddingRight: 8,
          gap: 8,
          transform: `translateX(${trayX}px)`,
          maskImage: `linear-gradient(to right, transparent, #000 ${FADE}px)`,
          WebkitMaskImage: `linear-gradient(to right, transparent, #000 ${FADE}px)`,
        }}
        data-swipe-actions
      >
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => {
              setOpenState(false)
              a.onClick()
            }}
            aria-label={a.ariaLabel ?? a.label}
            title={a.label}
            data-testid={a.testId}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-ink-900 ${TONE[a.tone ?? 'danger']}`}
          >
            <span aria-hidden>{a.icon}</span>
          </button>
        ))}
      </div>
      <Sheet open={menu} onClose={() => setMenu(false)} title={menuTitle ?? 'Options'} testId="row-menu">
        <div className="space-y-2 pb-2">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left font-medium hover:bg-slate-50 dark:hover:bg-ink-800"
              data-testid={a.testId && `${a.testId}-menu`}
              onClick={() => {
                setMenu(false)
                // After the menu has closed and handed focus back, so a confirm sheet can open.
                requestAnimationFrame(() => a.onClick())
              }}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${TONE[a.tone ?? 'danger']}`} aria-hidden>
                {a.icon}
              </span>
              <span className={a.tone === 'danger' ? 'text-rose-700 dark:text-rose-400' : ''}>{a.ariaLabel ?? a.label}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </Tag>
  )
}
