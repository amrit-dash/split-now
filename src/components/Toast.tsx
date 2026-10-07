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
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 p-4 pt-[calc(env(safe-area-inset-top)+1rem)]" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`animate-pop pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-xl ${t.tone === 'ok' ? 'bg-slate-900 dark:bg-ink-700' : 'bg-rose-600'}`}>
            <span>{t.text}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => { dismiss(t.id); t.action!.run() }}
                className="-my-1 rounded-xl px-2 py-1 font-bold text-brand-300 hover:bg-white/10"
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
