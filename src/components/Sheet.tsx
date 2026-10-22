import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { type DragSample, pushSample, releaseVelocity, sheetExit, shouldCloseSheet } from '@/lib/sheet-drag'
import { haptic } from '@/lib/haptics'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

// Sheets stack (a confirm on top of a form); the app root stays inert until the last one closes.
let openCount = 0
let savedOverflow = ''

/**
 * Bottom sheet (centred dialog on wider screens). Closes on the backdrop, Escape, the close
 * button, or by dragging it down (from the handle or header anywhere, or from the body while
 * it's scrolled to the top). However it closes (✕, Escape, the backdrop, a drag, or the caller
 * setting `open` to false from a Done button), it leaves the same way: it slides down while the
 * backdrop fades (a short fade with reduced motion), showing what it last showed. Proper modal semantics: rendered in a portal, the app root is
 * `inert` while it is open, focus moves inside and is trapped, and returns to the opener on close.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  testId,
  describedBy,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  testId?: string
  /** id of an element inside that describes the dialog (aria-describedby) */
  describedBy?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(null)
  const titleId = useId()
  const drag = useRef<{ y: number; active: boolean; fromBody: boolean; samples: DragSample[] } | null>(null)
  const [dy, setDy] = useState(0)
  // Still on screen after `open` turned false, while it slides out.
  const [leaving, setLeaving] = useState(false)
  const wasOpen = useRef(open)
  const lastChildren = useRef(children)
  if (open) lastChildren.current = children
  const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const exit = sheetExit(reduce)

  useLayoutEffect(() => {
    if (open) {
      wasOpen.current = true
      setLeaving(false)
      return
    }
    if (!wasOpen.current) return
    wasOpen.current = false
    setLeaving(true)
    const t = setTimeout(() => {
      setLeaving(false)
      setDy(0)
    }, exit.ms)
    return () => clearTimeout(t)
  }, [open, exit.ms])

  useLayoutEffect(() => {
    if (!open) return
    setDy(0)
    opener.current = document.activeElement
    const root = document.getElementById('root')
    if (openCount++ === 0) {
      savedOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      if (root) root.inert = true
    }
    // Focus the panel itself (screen readers announce the dialog; Tab then reaches the first
    // control). Not the first control: on a phone that put a focus ring on the close button every
    // time a sheet opened. A field the sheet autofocuses on purpose (autoFocus) keeps its focus.
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus({ preventScroll: true })
    return () => {
      if (--openCount === 0) {
        document.body.style.overflow = savedOverflow
        if (root) root.inert = false
      }
      const back = opener.current
      // focusVisible: false keeps the opener (the + button) from lighting up with a ring when
      // the sheet was closed by touch; browsers without the option just ignore it.
      if (back instanceof HTMLElement && back.isConnected) back.focus({ preventScroll: true, focusVisible: false } as FocusOptions)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panel.current) return
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (!items.length) {
        e.preventDefault()
        panel.current.focus()
        return
      }
      const first = items[0],
        last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open && !leaving) return null

  const onStart = (e: TouchEvent) => {
    const el = e.target as HTMLElement
    // Leave fields, sliders and horizontal scrollers to themselves.
    if (!open || el.closest('input, textarea, select, [contenteditable], .overflow-x-auto, [data-no-drag]')) return
    const fromBody = !el.closest('[data-sheet-grip]')
    const y = e.touches[0].clientY
    drag.current = { y, active: false, fromBody, samples: [{ y, t: e.timeStamp }] }
  }
  const onMove = (e: TouchEvent) => {
    const d = drag.current
    if (!d) return
    const delta = e.touches[0].clientY - d.y
    if (!d.active) {
      // From the body, only once it's scrolled to the top and the finger moves down.
      if (delta < 8 || (d.fromBody && (panel.current?.scrollTop ?? 0) > 0)) {
        if (delta < -8) drag.current = null
        return
      }
      d.active = true
      d.y += 8
    }
    d.samples = pushSample(d.samples, { y: e.touches[0].clientY, t: e.timeStamp })
    setDy(Math.max(0, e.touches[0].clientY - d.y))
  }
  const onEnd = () => {
    const d = drag.current
    drag.current = null
    if (!d?.active) return
    // The speed of the last few moves: a slow pull that ends in a flick closes it.
    if (shouldCloseSheet(dy, releaseVelocity(d.samples))) {
      haptic('sheetClose')
      onClose()
    } else setDy(0)
  }
  const dragging = !!drag.current?.active
  // Leaving: slide out from wherever it is (the drag position included), or fade with reduced motion.
  const panelStyle = leaving
    ? reduce
      ? { transform: `translateY(${dy}px)`, ...exit.panel }
      : exit.panel
    : { transform: `translateY(${dy}px)`, transition: dragging ? 'none' : 'transform 200ms cubic-bezier(0.32, 0.72, 0, 1)' }

  return createPortal(
    // While it slides out it takes no taps and is out of the accessibility tree: the screen behind is live again.
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center sm:items-center ${leaving ? 'pointer-events-none' : ''}`}
      data-testid={testId}
      data-leaving={leaving || undefined}
      aria-hidden={leaving || undefined}
      inert={leaving || undefined}
    >
      <div
        className="animate-fade absolute inset-0 bg-black/50 backdrop-blur-sm"
        style={
          dy || leaving ? { opacity: leaving ? 0 : Math.max(0.3, 1 - dy / 400), transition: dragging ? 'none' : `opacity ${exit.ms}ms ease-out` } : undefined
        }
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={describedBy}
        tabIndex={-1}
        onTouchStart={onStart}
        onTouchMove={onMove}
        onTouchEnd={onEnd}
        onTouchCancel={onEnd}
        style={panelStyle}
        className="animate-sheet relative max-h-[90dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-[2rem] bg-white p-5 pb-[max(2rem,calc(env(safe-area-inset-bottom)+1rem))] shadow-2xl outline-none sm:mx-4 sm:pb-6 sm:max-h-[85dvh] sm:animate-pop sm:rounded-[1.75rem] sm:p-6 sm:ring-1 sm:ring-slate-900/5 dark:bg-ink-900 sm:dark:ring-white/10"
      >
        <div data-sheet-grip className="-mx-5 -mt-5 mb-1 flex justify-center pb-2 pt-3 sm:hidden" aria-hidden>
          <div className="h-1.5 w-10 rounded-full bg-slate-200 dark:bg-ink-700" />
        </div>
        {title && (
          // Sticky: in a sheet taller than the screen the title and ✕ stay in view while the body scrolls under them.
          <div
            data-sheet-grip
            className="sticky -top-5 z-10 -mx-5 -mt-2 mb-4 flex items-center justify-between gap-3 bg-white px-5 pb-1 pt-3 sm:-top-6 sm:-mx-6 sm:px-6 dark:bg-ink-900"
          >
            <h2 id={titleId} className="text-lg font-bold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-800 active:scale-90 dark:bg-ink-800 dark:text-slate-300 dark:hover:bg-ink-700"
              aria-label="Close"
            >
              <X size={17} strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        )}
        {open ? children : lastChildren.current}
      </div>
    </div>,
    document.body,
  )
}
