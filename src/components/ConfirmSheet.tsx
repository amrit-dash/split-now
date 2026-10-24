import { createContext, useCallback, useContext, useId, useRef, useState, type ReactNode } from 'react'
import { type Hint, useHint } from './Hint'
import { Sheet } from './Sheet'

export interface ConfirmOptions {
  title: string
  /**
   * one or two short sentences; say what is lost and whether it can be undone. Plain text always
   * shows; a Hint follows the detail level, so what is lost should be tier 'key'.
   */
  message?: ReactNode | Hint
  confirmLabel?: string
  cancelLabel?: string
  /** 'danger' paints the confirm button red (destructive, no undo) */
  tone?: 'default' | 'danger'
}

type Ask = (opts: ConfirmOptions) => Promise<boolean>
const Ctx = createContext<Ask>(() => Promise.resolve(false))

/** One of a few answers: "Which group?" when a Quick add line fits more than one. */
export interface ChooseOptions {
  title: string
  message?: string
  options: Array<{ value: string; label: string; sub?: string; icon?: ReactNode }>
}
type Choose = (opts: ChooseOptions) => Promise<string | null>
const ChooseCtx = createContext<Choose>(() => Promise.resolve(null))

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
  const [choice, setChoice] = useState<ChooseOptions | null>(null)
  const chosen = useRef<((v: string | null) => void) | null>(null)
  const choose = useCallback<Choose>((opts) => {
    chosen.current?.(null)
    return new Promise<string | null>((resolve) => {
      chosen.current = resolve
      setChoice(opts)
    })
  }, [])
  const pick = (v: string | null) => {
    chosen.current?.(v)
    chosen.current = null
    setChoice(null)
  }
  return (
    <Ctx.Provider value={ask}>
      <ChooseCtx.Provider value={choose}>
        {children}
        <Sheet open={!!choice} onClose={() => pick(null)} title={choice?.title ?? ''} testId="choose-sheet">
          {choice?.message && <p className="text-muted mb-3 text-sm">{choice.message}</p>}
          <div role="radiogroup" aria-label={choice?.title} className="space-y-1.5">
            {choice?.options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={false}
                onClick={() => pick(o.value)}
                className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-slate-100 px-3 py-2 text-left font-semibold transition active:scale-[.98] dark:bg-ink-800"
                data-testid="choose-option"
              >
                {o.icon && <span className="flex shrink-0">{o.icon}</span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}</span>
                  {o.sub && <span className="text-muted block truncate text-xs font-normal">{o.sub}</span>}
                </span>
              </button>
            ))}
          </div>
        </Sheet>
      </ChooseCtx.Provider>
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
/** `const id = await choose({ title, options })`: the value picked, or null when the sheet was closed. */
export const useChoose = () => useContext(ChooseCtx)

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
  // The sheet has no line to hang an (i) on, so a non-key Hint in the Tooltip look shows its full text here.
  const { text, tip } = useHint(message)
  const line = text ?? tip
  return (
    <Sheet open={open} onClose={onClose} title={title} describedBy={line ? descId : undefined} testId="confirm-sheet">
      {line && (
        <p id={descId} className="text-muted -mt-1 mb-5 text-sm">
          {line}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          type="button"
          data-testid="confirm-ok"
          className={`btn flex-1 ${tone === 'danger' ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/25' : 'bg-fill text-on-fill shadow-lg shadow-fill/25'}`}
          onClick={onConfirm}
          disabled={busy}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  )
}
