import { useEffect, useState, type ReactNode } from 'react'
import { Loader2, RotateCcw, Save } from 'lucide-react'
import { formatDateTime } from '@/lib/locale'
import { watchConfig } from './api'

/** A config document, live: `undefined` until the first server answer, `null` when it doesn't exist yet. */
export function useConfigDoc(id: 'app' | 'limits'): { raw: unknown; loading: boolean; error: boolean } {
  const [state, setState] = useState<{ raw: unknown; loading: boolean; error: boolean }>({ raw: undefined, loading: true, error: false })
  useEffect(
    () =>
      watchConfig(id, (raw, meta) => {
        // A cached "missing" document says nothing yet; a cached copy is fine to show.
        if (raw === null && meta.fromCache && !meta.error) return
        setState({ raw, loading: false, error: !!meta.error })
      }),
    [id],
  )
  return state
}

/**
 * The compact Save / Discard bar the AI tab already uses: shows only while something changed,
 * sticks just above the tab bar. Admin changes are deliberate (maintenance mode, limits), so
 * nothing here autosaves.
 */
export function DirtyBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  testId = 'admin-dirty',
}: {
  dirty: boolean
  saving: boolean
  onSave: () => void
  onDiscard: () => void
  testId?: string
}) {
  if (!dirty) return null
  return (
    <div
      className="animate-pop sticky bottom-[var(--lane)] z-10 mt-4 flex items-center gap-2 rounded-2xl bg-brand-50 p-2 pl-3.5 shadow-lg ring-1 ring-brand-500/20 dark:bg-ink-800 dark:ring-brand-400/30"
      data-testid={testId}
    >
      <span className="min-w-0 flex-1 text-sm font-medium text-brand-800 dark:text-brand-200">Unsaved changes</span>
      <button type="button" className="btn-ghost !min-h-0 !px-3 !py-2 text-sm" onClick={onDiscard} disabled={saving}>
        <RotateCcw size={16} /> Discard
      </button>
      <button type="button" className="btn-primary !min-h-0 !px-4 !py-2 text-sm" onClick={onSave} disabled={saving} data-testid={`${testId}-save`}>
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save
      </button>
    </div>
  )
}

/** "Changed by 3f9a… · 8 Oct, 14:32" under a card, from the document's audit fields. */
export function ChangedBy({ at, by }: { at?: number; by?: string }) {
  if (!at) return null
  return (
    <p className="text-muted mt-2 px-1 text-xs">
      Changed {formatDateTime(at)}
      {by ? ` by ${by.slice(0, 6)}…` : ''}
    </p>
  )
}

/** A labelled row with a switch or control on the right and an explanation underneath. */
export function SettingRow({ title, hint, control, htmlFor }: { title: ReactNode; hint?: ReactNode; control: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="block font-medium">
            {title}
          </label>
        ) : (
          <div className="font-medium">{title}</div>
        )}
        {hint && <div className="text-muted mt-0.5 text-xs">{hint}</div>}
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  )
}

/** A whole number field with its range shown; the value is clamped on blur, not on every keystroke. */
export function IntField({
  id,
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    const n = Number.parseInt(draft, 10)
    const next = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value
    setDraft(String(next))
    if (next !== value) onChange(next)
  }
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      {hint && <div className="text-muted mt-0.5 text-xs">{hint}</div>}
      <div className="mt-2 flex items-center gap-3">
        <input
          id={id}
          className="input !w-32 !px-3 !py-2.5 tabular-nums"
          inputMode="numeric"
          pattern="[0-9]*"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />
        <span className="text-muted text-xs">
          {min.toLocaleString()} – {max.toLocaleString()}
        </span>
      </div>
    </div>
  )
}

/** A big number with a small label, for the Overview. */
export function Stat({ n, label, hint, testId }: { n: ReactNode; label: string; hint?: string; testId?: string }) {
  return (
    <div className="card p-3.5" data-testid={testId}>
      <div className="text-2xl font-extrabold tabular-nums tracking-tight">{n}</div>
      <div className="text-muted text-xs">{label}</div>
      {hint && <div className="text-muted mt-0.5 text-[11px]">{hint}</div>}
    </div>
  )
}
