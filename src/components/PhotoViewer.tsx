import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Minimize2, X } from 'lucide-react'
import { nextZoom, type ViewerZoom } from '@/lib/receipt-photo'

/**
 * A photo full screen (a receipt, a payment screenshot): fitted to the screen, and a tap (or the
 * size button) shows it at full size to read small print, scrolling in both directions. Escape or
 * the close button goes back; focus returns to what opened it. `actions` sit at the bottom (Replace).
 * The image is whatever URL the caller has: a private group's is a blob opened on this phone.
 * Above sheets and the tab bar, below toasts (z-[100]) so "Replacing the photo…" still shows.
 */
export function PhotoViewer({ src, alt, onClose, actions }: { src: string; alt: string; onClose: () => void; actions?: ReactNode }) {
  const [zoom, setZoom] = useState<ViewerZoom>('fit')
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
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
  const full = zoom === 'full'
  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={alt} data-testid="photo-viewer">
      <div className="flex items-center justify-end gap-1 p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
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
      <div className={`min-h-0 flex-1 ${full ? 'overflow-auto' : 'flex items-center justify-center overflow-hidden p-2'}`}>
        {/* A tap switches the size too: the quickest way to read a long bill on a phone. */}
        <button
          type="button"
          className={full ? 'block' : 'flex h-full w-full items-center justify-center'}
          onClick={() => setZoom(nextZoom)}
          aria-label={full ? 'Fit to screen' : 'Full size'}
        >
          <img src={src} alt={alt} className={full ? 'max-w-none' : 'max-h-full max-w-full object-contain'} />
        </button>
      </div>
      {actions && <div className="flex justify-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{actions}</div>}
    </div>,
    document.body,
  )
}
