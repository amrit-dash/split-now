import { createContext, useCallback, useContext, useId, useRef, useState, type ReactNode } from 'react'
import { Sheet } from './Sheet'

export interface ConfirmOptions {
  title: string
  /** one or two short sentences; say what is lost and whether it can be undone */
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** 'danger' paints the confirm button red (destructive, no undo) */
  tone?: 'default' | 'danger'
}

type Ask = (opts: ConfirmOptions) => Promise<boolean>
const Ctx = createContext<Ask>(() => Promise.resolve(false))

/**
 * In-app replacement for window.confirm(): `const ok = await confirm({ title, message, tone: 'danger' })`.
 * Use it only for actions that cannot be undone; anything restorable gets an Undo toast instead.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { id: number }) | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)
  const ask = useCallback<Ask>((opts) => {
    resolver.current?.(false)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
      setState({ ...opts, id: Date.now() })
    })
  }, [])
  const settle = (v: boolean) => {
    resolver.current?.(v)
    resolver.current = null
    setState(null)
  }
  return (
    <Ctx.Provider value={ask}>
      {children}
      <ConfirmSheet
        open={!!state}
        title={state?.title ?? ''}
        message={state?.message}
        confirmLabel={state?.confirmLabel}
        cancelLabel={state?.cancelLabel}
        tone={state?.tone}
        onConfirm={() => settle(true)}
        onClose={() => settle(false)}
      />
    </Ctx.Provider>
  )
}

export const useConfirm = () => useContext(Ctx)

/** The sheet itself, for screens that prefer to control it directly. */
export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onClose,
  busy,
}: ConfirmOptions & {
  open: boolean
  onConfirm: () => void
  onClose: () => void
  busy?: boolean
}) {
  const descId = useId()
  return (
    <Sheet open={open} onClose={onClose} title={title} describedBy={message ? descId : undefined} testId="confirm-sheet">
      {message && (
        <p id={descId} className="text-muted -mt-1 mb-5 text-sm">
          {message}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          type="button"
          data-testid="confirm-ok"
          className={`btn flex-1 text-white ${tone === 'danger' ? 'bg-rose-600 shadow-lg shadow-rose-600/25' : 'bg-brand-600 shadow-lg shadow-brand-600/25'}`}
          onClick={onConfirm}
          disabled={busy}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  )
}
