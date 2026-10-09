import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { X } from 'lucide-react'

/** Past this (px), or a quick flick, a downward drag closes the sheet. */
const CLOSE_AT = 110

/**
 * Bottom sheet. Closes on the backdrop, Escape, the close button, or by dragging it down (from
 * the handle or header anywhere, or from the body while it's scrolled to the top).
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; t: number; active: boolean; fromBody: boolean } | null>(null)
  const [dy, setDy] = useState(0)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setDy(0); setLeaving(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
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
      if (delta < 8 || (d.fromBody && (panel.current?.scrollTop ?? 0) > 0)) { if (delta < -8) drag.current = null; return }
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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal>
      <div className="animate-fade absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" style={dy || leaving ? { opacity: leaving ? 0 : Math.max(0.3, 1 - dy / 400) } : undefined} onClick={onClose} />
      <div
        ref={panel}
        onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}
        style={{ transform: `translateY(${leaving ? '100%' : `${dy}px`})`, transition: drag.current?.active ? 'none' : 'transform 0.18s ease-out' }}
        className="animate-sheet relative max-h-[90dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-[2rem] bg-white p-5 pb-8 shadow-2xl safe-bottom sm:mx-4 sm:max-h-[85dvh] sm:animate-pop sm:rounded-[1.75rem] sm:p-6 sm:ring-1 sm:ring-slate-900/5 dark:bg-ink-900 sm:dark:ring-white/10"
      >
        <div data-sheet-grip className="-mx-5 -mt-5 mb-1 flex justify-center pb-2 pt-3 sm:hidden">
          <div className="h-1.5 w-10 rounded-full bg-slate-200 dark:bg-ink-700" />
        </div>
        {title && (
          <div data-sheet-grip className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">{title}</h2>
            <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 active:scale-90 dark:bg-ink-800 dark:text-slate-400 dark:hover:bg-ink-700" aria-label="Close">
              <X size={17} strokeWidth={2.5} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
