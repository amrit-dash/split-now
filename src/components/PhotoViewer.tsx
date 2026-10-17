import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from 'lucide-react'
import { nextZoom, stepPhoto, type ViewerZoom } from '@/lib/receipt-photo'

export interface ViewerPhoto {
  /** what the <img> shows (null while a private group's photo is still opening) */
  src: string | null
  alt: string
  /** shown above the photo when there are several ("Scanned receipt", "Attached photo 2") */
  label: string
}

/**
 * Photos full screen (an expense's receipt and attached photos, a payment screenshot): fitted to
 * the screen, and a tap (or the size button) shows one at full size to read small print, scrolling
 * in both directions. With several, the arrows (and ← →, or a swipe) move between them. Escape or
 * the close button goes back; focus returns to what opened it. `actions` sit at the bottom for the
 * photo shown (Replace, Remove). Above sheets and the tab bar, below toasts (z-[100]).
 */
export function PhotoViewer({
  photos,
  index,
  onIndex,
  onClose,
  actions,
}: {
  photos: ViewerPhoto[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  actions?: (i: number) => ReactNode
}) {
  const [zoom, setZoom] = useState<ViewerZoom>('fit')
  const closeRef = useRef<HTMLButtonElement>(null)
  const swipe = useRef<number | null>(null)
  const count = photos.length
  // A photo removed while open: stay in range.
  const i = Math.min(Math.max(0, index), Math.max(0, count - 1))
  const go = (by: -1 | 1) => {
    setZoom('fit')
    onIndex(stepPhoto(i, by, count))
  }
  const goRef = useRef(go)
  goRef.current = go
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') goRef.current(-1)
      else if (e.key === 'ArrowRight') goRef.current(1)
    }
    document.addEventListener('keydown', key)
    // The page behind doesn't scroll while the photo is open.
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', key)
      document.body.style.overflow = overflow
      back?.focus?.()
    }
  }, [onClose])
  const photo = photos[i]
  if (!photo) return null
  const full = zoom === 'full'
  const several = count > 1
  const arrow = 'flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-white/20 disabled:opacity-30'
  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={photo.alt} data-testid="photo-viewer">
      <div className="flex items-center gap-1 p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1 px-2 text-sm font-semibold" aria-live="polite" data-testid="photo-viewer-label">
          {several ? `${photo.label} · ${i + 1} of ${count}` : ''}
        </div>
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"
          onClick={() => setZoom(nextZoom)}
          aria-label={full ? 'Fit to screen' : 'Full size'}
          aria-pressed={full}
          data-testid="photo-viewer-zoom"
        >
          {full ? <Minimize2 size={20} aria-hidden /> : <Maximize2 size={20} aria-hidden />}
        </button>
        <button
          ref={closeRef}
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"
          onClick={onClose}
          aria-label="Close"
          data-testid="photo-viewer-close"
        >
          <X size={22} aria-hidden />
        </button>
      </div>
      <div
        className={`relative min-h-0 flex-1 ${full ? 'overflow-auto' : 'flex items-center justify-center overflow-hidden p-2'}`}
        // A sideways swipe moves to the next or previous photo (only while fitted: at full size it scrolls).
        onPointerDown={(e) => {
          swipe.current = full || !several ? null : e.clientX
        }}
        onPointerUp={(e) => {
          const from = swipe.current
          swipe.current = null
          if (from === null) return
          const dx = e.clientX - from
          if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1)
        }}
      >
        {/* A tap switches the size too: the quickest way to read a long bill on a phone. */}
        {photo.src ? (
          <button
            type="button"
            className={full ? 'block' : 'flex h-full w-full items-center justify-center'}
            onClick={() => setZoom(nextZoom)}
            aria-label={full ? 'Fit to screen' : 'Full size'}
          >
            <img src={photo.src} alt={photo.alt} className={full ? 'max-w-none' : 'max-h-full max-w-full object-contain'} draggable={false} />
          </button>
        ) : (
          <p className="text-sm text-white/70">Opening the photo…</p>
        )}
        {several && !full && (
          <>
            <button
              type="button"
              className={`${arrow} absolute left-2 top-1/2 -translate-y-1/2`}
              onClick={() => go(-1)}
              disabled={i === 0}
              aria-label="Previous photo"
              data-testid="photo-viewer-prev"
            >
              <ChevronLeft size={22} aria-hidden />
            </button>
            <button
              type="button"
              className={`${arrow} absolute right-2 top-1/2 -translate-y-1/2`}
              onClick={() => go(1)}
              disabled={i === count - 1}
              aria-label="Next photo"
              data-testid="photo-viewer-next"
            >
              <ChevronRight size={22} aria-hidden />
            </button>
          </>
        )}
      </div>
      {actions && <div className="flex justify-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{actions(i)}</div>}
    </div>,
    document.body,
  )
}
