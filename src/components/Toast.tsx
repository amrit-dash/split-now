import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

export interface ToastOptions {
  /** e.g. { label: 'Undo', run: restore } — shown as a button; tapping it dismisses the toast */
  action?: { label: string; run: () => void }
  /** ms (default 3200, or 6000 with an action) */
  duration?: number
}
type Toast = { id: number; text: string; tone: 'ok' | 'err'; action?: ToastOptions['action'] }
type Push = (text: string, tone?: Toast['tone'], opts?: ToastOptions) => void
const Ctx = createContext<Push>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback<Push>((text, tone = 'ok', opts = {}) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, tone, action: opts.action }])
    setTimeout(() => dismiss(id), opts.duration ?? (opts.action ? 6000 : 3200))
  }, [dismiss])
  return (
    <Ctx.Provider value={push}>
      {children}
      {/* Bottom of the screen, just above the tab bar where there is one (see .toast-stack). */}
      <div className="toast-stack pointer-events-none fixed inset-x-0 z-[100] mx-auto flex max-w-lg flex-col items-center gap-2 px-4" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`animate-toast pointer-events-auto flex max-w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-xl ${t.tone === 'ok' ? 'bg-slate-900 dark:bg-ink-700' : 'bg-rose-600'}`}>
            <span className="min-w-0">{t.text}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => { dismiss(t.id); t.action!.run() }}
                className="-my-1 shrink-0 rounded-xl px-2 py-1 font-bold text-brand-300 hover:bg-white/10"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
