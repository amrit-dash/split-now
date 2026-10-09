import { useCallback, useEffect, useId, useRef, useState, type ElementType, type PointerEvent, type ReactNode } from 'react'
import { dragOffset, isTap, lockAxis, settleOpen, velocityOf, type SwipeAxis } from '@/lib/swipe'

export interface SwipeAction {
  /** Visible text and the button's accessible name, e.g. "Delete" or "Remove". */
  label: string
  /** A fuller name for screen readers when the label alone is ambiguous ("Delete payment"). */
  ariaLabel?: string
  icon?: ReactNode
  onClick: () => void
  /** 'danger' (default) is the red destructive action; 'neutral' a plain one; 'muted' one that only explains why it can't be done yet. */
  tone?: 'danger' | 'neutral' | 'muted'
  testId?: string
}

/** Each action's width in px (well above the 44px touch minimum). */
const ACTION_W = 84
/** Only one row is open at a time: opening one tells the others to close. */
const OPEN_EVENT = 'swiperow:open'

/**
 * A list row whose actions (a red Delete, Remove, …) sit behind it and show when it is swiped
 * left, instead of a button beside every row. The drag decisions live in src/lib/swipe.ts.
 *
 * Never gesture-only: the action is a normal labelled button in the row, so a screen reader
 * reads it, and tabbing to it opens the row (focus-within) so a keyboard user sees what they
 * press. Mouse drags work too (pointer events). Vertical scrolling is untouched: touch-action
 * pan-y leaves it to the browser, and a drag that starts vertical is ignored. An open row closes
 * on a tap outside it, on scroll, or when another row opens.
 */
export function SwipeRow({
  as: Tag = 'li',
  actions,
  children,
  className = '',
  contentClassName = '',
  surface = 'bg-white dark:bg-ink-900',
  testId,
}: {
  as?: ElementType
  actions: SwipeAction[]
  children: ReactNode
  /** Classes for the outer element (the list item). */
  className?: string
  /** Classes for the sliding content (usually the row's flex layout and padding). */
  contentClassName?: string
  /** The content's background, which hides the actions while closed: match the card or sheet it sits on. */
  surface?: string
  testId?: string
}) {
  const id = useId()
  const rootRef = useRef<HTMLElement>(null)
  const [open, setOpenState] = useState(false)
  const [drag, setDrag] = useState<number | null>(null)
  const g = useRef<{ x: number; y: number; px: number; pt: number; v: number; axis?: SwipeAxis; base: number; pid: number } | null>(null)
  // A drag (or the tap that closes an open row) must not also click the row's link.
  const swallowClick = useRef(false)
  const width = actions.length * ACTION_W

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

  if (!actions.length)
    return (
      <Tag className={className} data-testid={testId}>
        <div className={contentClassName}>{children}</div>
      </Tag>
    )

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    swallowClick.current = false
    g.current = { x: e.clientX, y: e.clientY, px: e.clientX, pt: e.timeStamp, v: 0, base: open ? -width : 0, pid: e.pointerId }
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const s = g.current
    if (!s || s.pid !== e.pointerId) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
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
    g.current = null
    setDrag(null)
  }

  const offset = drag ?? (open ? -width : 0)
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
      <div className="absolute inset-y-0 right-0 flex" data-swipe-actions>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => {
              setOpenState(false)
              a.onClick()
            }}
            aria-label={a.ariaLabel}
            data-testid={a.testId}
            className={`flex h-full min-h-11 flex-col items-center justify-center gap-0.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white ${a.tone === 'neutral' ? 'bg-slate-600 text-white dark:bg-slate-500' : a.tone === 'muted' ? 'bg-slate-200 text-slate-700 dark:bg-ink-700 dark:text-slate-200' : 'bg-rose-600 text-white'}`}
            style={{ width: ACTION_W }}
          >
            {a.icon && <span aria-hidden>{a.icon}</span>}
            {a.label}
          </button>
        ))}
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the swipe is a pointer shortcut; the actions are real buttons, revealed on keyboard focus. */}
      <div
        className={`relative touch-pan-y select-none ${drag === null ? 'transition-transform duration-200 ease-out' : ''} ${surface} ${contentClassName}`}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
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
    </Tag>
  )
}
