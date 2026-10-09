import { useState, type ReactNode } from 'react'
import { Pencil, Sparkles, X } from 'lucide-react'
import { ALL_GROUP_ICONS, GROUP_TYPES, firstEmoji, type GroupGuess } from '@/lib/groupTypes'

export const GROUP_EMOJIS = ALL_GROUP_ICONS

/**
 * Group icon button that sits beside a labelled input (same height as `.input`), plus a hidden
 * horizontal picker that opens on tap, with a field for any other emoji. `children` is the field
 * next to the button.
 */
export function IconPickerField({ emoji, onChange, emojis = GROUP_EMOJIS, children, idPrefix = 'icon' }: {
  emoji: string
  onChange: (e: string) => void
  emojis?: string[]
  children: ReactNode
  idPrefix?: string
}) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const pickerId = `${idPrefix}-picker`
  const list = emojis.includes(emoji) ? emojis : [emoji, ...emojis]
  const choose = (e: string) => { onChange(e); setOpen(false); setCustom('') }
  return (
    <>
      <div className="flex items-end gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={pickerId}
          aria-label={`Group icon ${emoji}. Change icon`}
          className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-duo-100 text-2xl transition active:scale-95 dark:from-brand-900/50 dark:to-duo-900/30 ${open ? 'ring-2 ring-brand-500' : ''}`}
        >
          {emoji}
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white shadow ring-2 ring-white dark:ring-ink-900">
            <Pencil size={10} strokeWidth={3} />
          </span>
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {open && (
        <div id={pickerId} className="animate-fade space-y-1.5">
          <div role="radiogroup" aria-label="Group icon" className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 py-1.5">
            {list.map((e) => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={emoji === e}
                onClick={() => choose(e)}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl transition ${emoji === e ? 'bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-900/40' : 'bg-slate-100 dark:bg-ink-800'}`}
              >
                {e}
              </button>
            ))}
          </div>
          {/* Any emoji from the keyboard: picked as soon as one is typed. */}
          <input
            className="input !py-2 text-sm"
            aria-label="Type any emoji"
            placeholder="Or type any emoji 🙂"
            enterKeyHint="done"
            value={custom}
            onChange={(ev) => {
              const e = firstEmoji(ev.target.value)
              if (e) choose(e)
              else setCustom(ev.target.value.slice(0, 8))
            }}
          />
        </div>
      )}
    </>
  )
}

/** One-tap "Looks like a trip ✈️ — use it" chip for a name-based guess the user can take or dismiss. */
export function TypeSuggestion({ guess, onApply, onDismiss }: { guess: GroupGuess; onApply: () => void; onDismiss: () => void }) {
  const label = GROUP_TYPES[guess.type].label.toLowerCase()
  return (
    <div className="animate-fade flex items-center gap-1" data-testid="type-suggestion">
      <button type="button" onClick={onApply} className="flex min-w-0 items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-left text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
        <Sparkles size={13} className="shrink-0" />
        <span className="truncate">Looks like {/^[aeiou]/.test(label) ? 'an' : 'a'} {label} {guess.emoji} · use it</span>
      </button>
      <button type="button" onClick={onDismiss} className="shrink-0 rounded-full p-1.5 text-slate-400" aria-label="Dismiss suggestion"><X size={14} /></button>
    </div>
  )
}
