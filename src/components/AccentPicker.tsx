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
        {/* One row that fills the width: a column per preset, so seven fit a 320px screen without
            wrapping. The whole 44px-tall cell is the touch target; the swatch inside has a fixed
            width and height per breakpoint (not aspect-ratio on a stretched button, which some
            WebKit builds drew as an oval), so it is always a circle. */}
        <div
          role="radiogroup"
          aria-labelledby="accent-label"
          onKeyDown={onKey}
          className="grid items-center sm:gap-2"
          style={{ gridTemplateColumns: `repeat(${ACCENTS.length}, minmax(0, 1fr))` }}
        >
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
                data-testid={`accent-${a.id}`}
                tabIndex={on ? 0 : -1}
                onClick={() => pick(a.id)}
                className="flex h-11 w-full items-center justify-center rounded-full transition active:scale-95"
              >
                <span
                  aria-hidden
                  className={`flex size-[30px] shrink-0 items-center justify-center rounded-full text-on-fill shadow-sm min-[360px]:size-9 sm:size-10 ${on ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-ink-900' : ''}`}
                  style={{ background: duo ? `linear-gradient(135deg, ${a.from}, ${a.to})` : a.from }}
                >
                  {on && <Check size={16} strokeWidth={3} className="drop-shadow-sm" />}
                </span>
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
