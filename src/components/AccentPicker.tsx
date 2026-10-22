import { useEffect, useState, type KeyboardEvent } from 'react'
import { Check } from 'lucide-react'
import { ACCENTS, allInks, getAccent, getDuo, setAccent, setDuo, setInk, type AccentId, type Ink } from '@/lib/accent'
import { HintText, InfoTip, useShows, type Hint } from './Hint'
import { Segmented } from './Misc'
import { Switch } from './Switch'

const ACCENT_HINT: Hint = { full: 'The colour of buttons, links and the Home card', short: 'Buttons and the Home card', tier: 'help' }
const INK_HINT: Hint = {
  full: 'Kept for each accent. Black text comes with brighter colours so it stays easy to read.',
  short: 'Black text comes with brighter colours',
  tier: 'help',
}
const DUO_HINT: Hint = { full: 'Two-colour gradients on buttons and cards', tier: 'help' }

/**
 * Accent colour swatches, the "Text on accent" choice (white on deep
 * fills, or black on bright ones) for the selected accent. Each accent keeps its own ink, and each
 * swatch shows its accent in that ink; then a "Dual tone" switch. Applies and persists immediately.
 */
/** `simple`: Simple mode keeps Text on accent and leaves Dual tone out (its value stays as it was). */
export function AccentPicker({ onChange, simple = false }: { onChange?: () => void; simple?: boolean } = {}) {
  const fine = useShows(2)
  const showDuo = !simple
  const [accent, setAccentState] = useState<AccentId>(getAccent)
  const [duo, setDuoState] = useState<boolean>(getDuo)
  const [inks, setInks] = useState<Record<AccentId, Ink>>(allInks)
  const ink = inks[accent]
  // Settings may re-mount this while the stored value changed elsewhere (another tab).
  useEffect(() => {
    setAccentState(getAccent())
    setDuoState(getDuo())
    setInks(allInks())
  }, [])

  const pick = (id: AccentId) => {
    setAccentState(id)
    setAccent(id)
    onChange?.()
  }
  const pickInk = (v: Ink) => {
    setInks((m) => ({ ...m, [accent]: v }))
    setInk(v, accent)
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
        <div className="label flex items-center" id="accent-label">
          Accent
          <InfoTip hint={ACCENT_HINT} label="About accent" />
        </div>
        {/* One row that fills the width: a column per preset, so seven fit a 320px screen without
            wrapping. The whole 44px-tall cell is the touch target; the swatch inside has a fixed
            width and height per breakpoint (not aspect-ratio on a stretched button, which some
            WebKit builds drew as an oval), so it is always a circle. */}
        <div
          role="radiogroup"
          aria-label="Accent"
          onKeyDown={onKey}
          className="grid items-center sm:gap-2"
          style={{ gridTemplateColumns: `repeat(${ACCENTS.length}, minmax(0, 1fr))` }}
        >
          {ACCENTS.map((a) => {
            const on = a.id === accent
            // Each accent in its own ink: deep fills for white, bright fills for black.
            const [from, to] = a.swatch[inks[a.id]]
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
                  style={{ background: duo ? `linear-gradient(135deg, ${from}, ${to})` : from }}
                >
                  {on && <Check size={16} strokeWidth={3} className="drop-shadow-sm" />}
                </span>
              </button>
            )
          })}
        </div>
        <HintText hint={ACCENT_HINT} className="text-muted mt-1.5 text-xs" />
      </div>
      {/* Fine-tuning: hidden in Minimal, the swatches are enough there; Simple keeps Text on accent (owner). */}
      {(fine || simple) && (
        <>
          <div>
            <div className="label flex items-center" id="ink-label">
              Text on accent
              <InfoTip hint={INK_HINT} label="About text on accent" />
            </div>
            <Segmented<Ink>
              value={ink}
              onChange={pickInk}
              label="Text on accent"
              testId="accent-ink"
              options={[
                { value: 'light', label: 'White' },
                { value: 'dark', label: 'Black' },
              ]}
            />
            <HintText hint={INK_HINT} className="text-muted mt-1.5 text-xs" />
          </div>
          {/* Dual tone closes the section as its own row, below the two labelled pickers, so the
            Accent → Text on accent rhythm isn't broken by a switch between them. */}
          {showDuo && (
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-white/5">
              <div className="min-w-0">
                <div className="flex items-center text-sm font-semibold">
                  Dual tone
                  <InfoTip hint={DUO_HINT} label="About dual tone" />
                </div>
                <HintText hint={DUO_HINT} as="div" />
              </div>
              <Switch checked={duo} onChange={toggleDuo} label="Dual tone" testId="accent-duo" />
            </div>
          )}
        </>
      )}
    </div>
  )
}
