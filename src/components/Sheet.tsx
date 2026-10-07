import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal>
      <div className="animate-fade absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-sheet relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-white p-5 pb-8 shadow-2xl safe-bottom sm:rounded-[2rem] dark:bg-ink-900">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden dark:bg-ink-700" />
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">{title}</h2>
            <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-ink-800" aria-label="Close"><X size={20} /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
