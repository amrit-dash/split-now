import { useState, type KeyboardEvent } from 'react'
import { Check } from 'lucide-react'
import { ACCENTS, getAccent, getDuo, setAccent, setDuo, type AccentId } from '@/lib/accent'

/** Accent colour swatches plus a "Dual tone" switch. Applies and persists immediately. */
export function AccentPicker() {
  const [accent, setAccentState] = useState<AccentId>(getAccent)
  const [duo, setDuoState] = useState<boolean>(getDuo)

  const pick = (id: AccentId) => { setAccentState(id); setAccent(id) }
  const toggleDuo = () => { setDuoState(!duo); setDuo(!duo) }

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
    <div>
      <div role="radiogroup" aria-label="Accent colour" onKeyDown={onKey} className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
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
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white transition active:scale-95 ${on ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-ink-900' : ''}`}
              style={{ background: duo ? `linear-gradient(135deg, ${a.from}, ${a.to})` : a.from }}
            >
              {on && <Check size={15} strokeWidth={3} aria-hidden />}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={duo}
        onClick={toggleDuo}
        className="mt-3 flex w-full items-center justify-between gap-3 text-left text-sm font-medium"
      >
        <span>
          Dual tone
          <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">Two-colour gradients on buttons and cards</span>
        </span>
        <span className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition ${duo ? 'bg-gradient-to-r from-brand-600 to-duo-600' : 'bg-slate-300 dark:bg-ink-700'}`} aria-hidden>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${duo ? 'left-[1.125rem]' : 'left-0.5'}`} />
        </span>
      </button>
    </div>
  )
}
