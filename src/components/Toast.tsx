import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'

export interface ToastOptions {
  /** e.g. { label: 'Undo', run: restore } — shown as a button; tapping it dismisses the toast */
  action?: { label: string; run: () => void }
  /** ms (default 3200, 5000 for errors, 6000 with an action) */
  duration?: number
}
type Toast = { id: number; text: string; tone: 'ok' | 'err'; action?: ToastOptions['action']; count: number; leaving?: boolean }
type Push = (text: string, tone?: Toast['tone'], opts?: ToastOptions) => void
const Ctx = createContext<Push>(() => {})

/** At most this many are kept; older ones drop off as new ones arrive. */
const MAX = 4
/** Collapsed, the newest sits in front and up to two older ones peek out behind it. */
const PEEK = 3

/**
 * Toasts stack in the floating lane above the tab bar (see .toast-stack in index.css). Collapsed,
 * the newest is in front with older ones peeking behind like a deck, so several never cover
 * the screen; tap the deck to fan them out. A repeat of a showing message bumps its count
 * instead of stacking a copy. Each can be closed, and an action (Undo) closes it too.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [open, setOpen] = useState(false)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const remove = useCallback((id: number) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    // Fade out, then drop.
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)))
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 200)
  }, [])

  const schedule = useCallback(
    (id: number, ms: number) => {
      clearTimeout(timers.current.get(id))
      timers.current.set(
        id,
        setTimeout(() => remove(id), ms),
      )
    },
    [remove],
  )

  const push = useCallback<Push>(
    (text, tone = 'ok', opts = {}) => {
      const ms = opts.duration ?? (opts.action ? 6000 : tone === 'err' ? 5000 : 3200)
      setToasts((list) => {
        const same = list.find((x) => !x.leaving && x.text === text && x.tone === tone && !x.action && !opts.action)
        if (same) {
          schedule(same.id, ms)
          return list.map((x) => (x === same ? { ...x, count: x.count + 1 } : x))
        }
        const id = Date.now() + Math.random()
        schedule(id, ms)
        const next = [...list, { id, text, tone, action: opts.action, count: 1 }]
        // Over the cap: the oldest goes now.
        for (const old of next.slice(0, Math.max(0, next.length - MAX))) {
          clearTimeout(timers.current.get(old.id))
          timers.current.delete(old.id)
        }
        return next.slice(-MAX)
      })
    },
    [schedule],
  )

  const live = toasts.filter((t) => !t.leaving)
  useEffect(() => {
    if (live.length < 2) setOpen(false)
  }, [live.length])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toast-stack pointer-events-none fixed inset-x-0 z-[100] mx-auto max-w-lg px-4" role="status" aria-live="polite" data-testid="toasts">
        {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: tapping to fan out the stack is a pointer convenience; every toast is announced by the live region and its buttons are keyboard operable. */}
        <div
          className={open ? 'flex flex-col items-center gap-2' : 'grid items-end justify-items-center'}
          onClick={() => live.length > 1 && setOpen((o) => !o)}
        >
          {toasts.map((t) => {
            const depth = live.length - 1 - live.indexOf(t) // 0 = newest
            const hidden = !open && (t.leaving || depth >= PEEK)
            const style =
              open || t.leaving
                ? undefined
                : {
                    transform: `translateY(${-depth * 9}px) scale(${1 - depth * 0.05})`,
                    opacity: depth >= PEEK ? 0 : 1 - depth * 0.28,
                    zIndex: 10 - depth,
                  }
            return (
              <div
                key={t.id}
                style={{ ...style, gridArea: open ? undefined : '1 / 1' }}
                aria-hidden={hidden || undefined}
                role={t.tone === 'err' ? 'alert' : undefined}
                className={`pointer-events-auto flex w-full max-w-md items-center gap-2.5 rounded-2xl py-2.5 pl-3.5 pr-1.5 text-sm font-medium text-white shadow-xl shadow-black/20 ring-1 ring-white/10 transition-[transform,opacity] duration-200 ${t.leaving ? 'opacity-0' : 'animate-toast'} ${t.tone === 'ok' ? 'bg-slate-900/95 dark:bg-ink-700/95' : 'bg-rose-600/95'} backdrop-blur ${hidden ? 'pointer-events-none' : ''}`}
              >
                {t.tone === 'ok' ? (
                  <CheckCircle2 size={18} className="shrink-0 text-emerald-400" aria-hidden />
                ) : (
                  <AlertCircle size={18} className="shrink-0 text-white" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  {t.text}
                  {t.count > 1 && <span className="ml-1.5 rounded-full bg-white/15 px-1.5 text-xs font-bold">×{t.count}</span>}
                </span>
                {!open && depth === 0 && live.length > 1 && <span className="shrink-0 text-xs font-semibold text-white/60">+{live.length - 1}</span>}
                {t.action && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      remove(t.id)
                      t.action!.run()
                    }}
                    className="shrink-0 rounded-xl px-2.5 py-1.5 font-bold text-brand-300 hover:bg-white/10"
                  >
                    {t.action.label}
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    remove(t.id)
                  }}
                  aria-label="Dismiss"
                  className="shrink-0 rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
                >
                  <X size={15} aria-hidden />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
