import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

// Sheets stack (a confirm on top of a form); the app root stays inert until the last one closes.
let openCount = 0
let savedOverflow = ''

/**
 * A bottom sheet (centred dialog on wider screens) with proper modal semantics: rendered in a
 * portal, the app root is `inert` while it is open, focus moves inside and is trapped, Escape
 * and the backdrop close it, and focus returns to the opener on close.
 */
export function Sheet({ open, onClose, title, children, testId, describedBy }: {
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

  useLayoutEffect(() => {
    if (!open) return
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
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (e.key !== 'Tab' || !panel.current) return
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (!items.length) { e.preventDefault(); panel.current.focus(); return }
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" data-testid={testId}>
      <div className="animate-fade absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={describedBy}
        tabIndex={-1}
        className="animate-sheet relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-white p-5 pb-8 shadow-2xl outline-none safe-bottom sm:rounded-[2rem] dark:bg-ink-900"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden dark:bg-ink-700" aria-hidden />
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 id={titleId} className="text-lg font-bold">{title}</h2>
            <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-ink-800" aria-label="Close"><X size={20} aria-hidden /></button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}
