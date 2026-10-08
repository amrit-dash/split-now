import { useEffect, useState, type KeyboardEvent } from 'react'
import { Check } from 'lucide-react'
import { ACCENTS, getAccent, getDuo, setAccent, setDuo, type AccentId } from '@/lib/accent'
import { Switch } from './Switch'

/** Accent colour swatches plus a "Dual tone" switch. Applies and persists immediately. */
export function AccentPicker({ onChange }: { onChange?: () => void } = {}) {
  const [accent, setAccentState] = useState<AccentId>(getAccent)
  const [duo, setDuoState] = useState<boolean>(getDuo)
  // Settings may re-mount this while the stored value changed elsewhere (another tab).
  useEffect(() => {
    setAccentState(getAccent())
    setDuoState(getDuo())
  }, [])

  const pick = (id: AccentId) => {
    setAccentState(id)
    setAccent(id)
    onChange?.()
  }
  const toggleDuo = (on: boolean) => {
    setDuoState(on)
    setDuo(on)
    onChange?.()
  }

  // Arrow keys move the selection, as in a native radio group.
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const i = ACCENTS.findIndex((a) => a.id === accent)
    const next = ACCENTS[(i + step + ACCENTS.length) % ACCENTS.length]
    pick(next.id)
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-id="${next.id}"]`)?.focus()
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="label" id="accent-label">
          Accent
        </div>
        <div role="radiogroup" aria-labelledby="accent-label" onKeyDown={onKey} className="flex flex-wrap items-center gap-3">
          {ACCENTS.map((a) => {
            const on = a.id === accent
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={a.label}
                title={a.label}
                data-id={a.id}
                tabIndex={on ? 0 : -1}
                onClick={() => pick(a.id)}
                className={`flex h-11 w-11 items-center justify-center rounded-full text-white transition active:scale-95 ${on ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-ink-900' : ''}`}
                style={{ background: duo ? `linear-gradient(135deg, ${a.from}, ${a.to})` : a.from }}
              >
                {on && <Check size={16} strokeWidth={3} aria-hidden />}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span id="duo-label" className="text-sm font-medium">
          Dual tone
          <span className="text-muted block text-xs font-normal">Two-colour gradients on buttons and cards</span>
        </span>
        <Switch checked={duo} onChange={toggleDuo} label="Dual tone" testId="accent-duo" />
      </div>
    </div>
  )
}
