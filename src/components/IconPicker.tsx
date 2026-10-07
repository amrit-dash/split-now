import { useState, type ReactNode } from 'react'
import { Pencil } from 'lucide-react'

export const GROUP_EMOJIS = ['🏝️', '✈️', '🏠', '🍕', '🎉', '💞', '🏔️', '🚗', '🎿', '🏕️', '⚽', '🍻', '🎓', '💼', '👛', '🤝', '🌏', '🎵', '🏖️', '🛕', '🎂', '🍛']

/**
 * Group icon button that sits beside a labelled input (same height as `.input`), plus a hidden
 * horizontal picker that opens on tap. `children` is the field next to the button.
 */
export function IconPickerField({ emoji, onChange, emojis = GROUP_EMOJIS, children, idPrefix = 'icon' }: {
  emoji: string
  onChange: (e: string) => void
  emojis?: string[]
  children: ReactNode
  idPrefix?: string
}) {
  const [open, setOpen] = useState(false)
  const pickerId = `${idPrefix}-picker`
  const list = emojis.includes(emoji) ? emojis : [emoji, ...emojis]
  return (
    <>
      <div className="flex items-end gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={pickerId}
          aria-label={`Group icon ${emoji}. Change icon`}
          className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-fuchsia-100 text-2xl transition active:scale-95 dark:from-brand-900/50 dark:to-fuchsia-900/30 ${open ? 'ring-2 ring-brand-500' : ''}`}
        >
          {emoji}
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white shadow ring-2 ring-white dark:ring-ink-900">
            <Pencil size={10} strokeWidth={3} />
          </span>
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {open && (
        <div id={pickerId} role="radiogroup" aria-label="Group icon" className="animate-fade scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 py-1.5">
          {list.map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={emoji === e}
              onClick={() => { onChange(e); setOpen(false) }}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl transition ${emoji === e ? 'bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-900/40' : 'bg-slate-100 dark:bg-ink-800'}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
