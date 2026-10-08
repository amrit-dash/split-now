import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Past this (px), or a quick flick, a downward drag closes the sheet. */
const CLOSE_AT = 110

// Sheets stack (a confirm on top of a form); the app root stays inert until the last one closes.
let openCount = 0
let savedOverflow = ''

/**
 * Bottom sheet (centred dialog on wider screens). Closes on the backdrop, Escape, the close
 * button, or by dragging it down (from the handle or header anywhere, or from the body while
 * it's scrolled to the top). Proper modal semantics: rendered in a portal, the app root is
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
  const drag = useRef<{ y: number; t: number; active: boolean; fromBody: boolean } | null>(null)
  const [dy, setDy] = useState(0)
  const [leaving, setLeaving] = useState(false)

  useLayoutEffect(() => {
    if (!open) return
    setDy(0)
    setLeaving(false)
    opener.current = document.activeElement
    const root = document.getElementById('root')
    if (openCount++ === 0) {
      savedOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      if (root) root.inert = true
    }
    // Focus the first control, else the panel itself, so screen readers announce the dialog.
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel.current)?.focus({ preventScroll: true })
    return () => {
      if (--openCount === 0) {
        document.body.style.overflow = savedOverflow
        if (root) root.inert = false
      }
      const back = opener.current
      if (back instanceof HTMLElement && back.isConnected) back.focus({ preventScroll: true })
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

  if (!open) return null

  const onStart = (e: TouchEvent) => {
    const el = e.target as HTMLElement
    // Leave fields, sliders and horizontal scrollers to themselves.
    if (el.closest('input, textarea, select, [contenteditable], .overflow-x-auto, [data-no-drag]')) return
    const fromBody = !el.closest('[data-sheet-grip]')
    drag.current = { y: e.touches[0].clientY, t: Date.now(), active: false, fromBody }
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
    setDy(Math.max(0, e.touches[0].clientY - d.y))
  }
  const onEnd = () => {
    const d = drag.current
    drag.current = null
    if (!d?.active) return
    const speed = dy / Math.max(1, Date.now() - d.t)
    if (dy > CLOSE_AT || speed > 0.6) {
      setLeaving(true)
      setTimeout(onClose, 180)
    } else setDy(0)
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" data-testid={testId}>
      <div
        className="animate-fade absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        style={dy || leaving ? { opacity: leaving ? 0 : Math.max(0.3, 1 - dy / 400) } : undefined}
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
        style={{ transform: `translateY(${leaving ? '100%' : `${dy}px`})`, transition: drag.current?.active ? 'none' : 'transform 0.18s ease-out' }}
        className="animate-sheet relative max-h-[90dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-[2rem] bg-white p-5 pb-8 shadow-2xl outline-none safe-bottom sm:rounded-[2rem] dark:bg-ink-900"
      >
        <div data-sheet-grip className="-mx-5 -mt-5 mb-1 flex justify-center pb-2 pt-3" aria-hidden>
          <div className="h-1.5 w-10 rounded-full bg-slate-200 dark:bg-ink-700" />
        </div>
        {title && (
          <div data-sheet-grip className="mb-4 flex items-center justify-between gap-3">
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
        {children}
      </div>
    </div>,
    document.body,
  )
}
