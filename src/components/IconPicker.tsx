import { useState, type ReactNode } from 'react'
import { MoreHorizontal, Pencil, X } from 'lucide-react'
import { ALL_GROUP_ICONS, firstEmoji, groupTypeInfo, type GroupGuess } from '@/lib/groupTypes'
import { useLongPress } from '@/hooks/useLongPress'
import { IconSheet } from './IconSheet'
import { IconFace } from './IconFace'
import type { IconRequest } from '../../shared/icon-ai'

/**
 * Group icon button that sits beside a labelled input (same height as `.input`), plus a hidden
 * horizontal picker that opens on tap, with a field for any other emoji. Press and hold (or the
 * row's last tile) opens every icon, with a search (src/components/IconSheet.tsx). `children` is
 * the field next to the button.
 */
export function IconPickerField({
  emoji,
  onChange,
  emojis = ALL_GROUP_ICONS,
  children,
  idPrefix = 'icon',
  iconSvg,
  onPickSvg,
  ai,
}: {
  emoji: string
  onChange: (e: string) => void
  /** an AI-drawn icon, shown over the emoji */
  iconSvg?: string
  onPickSvg?: (svg: string) => void
  /** what "Suggest with AI" asks for (src/hooks/useIconAi.ts); absent hides it */
  ai?: IconRequest
  emojis?: string[]
  children: ReactNode
  idPrefix?: string
}) {
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState(false)
  const [custom, setCustom] = useState('')
  const press = useLongPress({ onTap: () => setOpen((o) => !o), onHold: () => setAll(true) })
  const pickerId = `${idPrefix}-picker`
  const list = emojis.includes(emoji) ? emojis : [emoji, ...emojis]
  const choose = (e: string) => {
    onChange(e)
    setOpen(false)
    setCustom('')
  }
  return (
    <>
      <div className="flex items-end gap-3">
        <button
          type="button"
          {...press}
          aria-expanded={open}
          aria-controls={pickerId}
          aria-label={`Group icon ${emoji}. Change icon. Press and hold for every icon`}
          data-testid="group-icon"
          className={`flex h-12 w-12 shrink-0 press-hold select-none items-center justify-center rounded-2xl [-webkit-touch-callout:none] bg-gradient-to-br from-brand-100 to-duo-100 text-2xl transition active:scale-95 dark:from-brand-900/50 dark:to-duo-900/30 ${open ? 'ring-2 ring-brand-500' : ''}`}
        >
          <IconFace iconSvg={iconSvg} emoji={emoji} />
          <span
            className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-fill text-on-fill shadow ring-2 ring-white dark:ring-ink-900"
            aria-hidden
          >
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
                aria-label={`Icon ${e}`}
                onClick={() => choose(e)}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl transition ${emoji === e ? 'bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-900/40' : 'bg-slate-100 dark:bg-ink-800'}`}
              >
                {e}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAll(true)}
              aria-label="Every icon"
              aria-haspopup="dialog"
              className="text-muted flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-ink-800"
              data-testid="group-icon-more"
            >
              <MoreHorizontal size={20} aria-hidden />
            </button>
          </div>
          {/* Any emoji from the keyboard: picked as soon as one is typed. Stays 16px so iOS doesn't zoom. */}
          <input
            className="input !py-2"
            aria-label="Type any emoji"
            placeholder="Or type any emoji"
            enterKeyHint="done"
            autoComplete="off"
            value={custom}
            onChange={(ev) => {
              const e = firstEmoji(ev.target.value)
              if (e) choose(e)
              else setCustom(ev.target.value.slice(0, 8))
            }}
          />
        </div>
      )}
      <IconSheet
        open={all}
        onClose={() => setAll(false)}
        title="Group icon"
        value={emoji}
        first={list}
        onPick={(e) => e && choose(e)}
        ai={ai}
        svgValue={iconSvg}
        onPickSvg={onPickSvg}
        testId="group-icon-sheet"
      />
    </>
  )
}

/** One-tap "Looks like a trip ✈️ — use it" chip for a name-based guess the user can take or dismiss. */
export function TypeSuggestion({ guess, onApply, onDismiss }: { guess: GroupGuess; onApply: () => void; onDismiss: () => void }) {
  const label = groupTypeInfo(guess.type).label.toLowerCase()
  return (
    <div className="animate-fade flex items-center gap-1" data-testid="type-suggestion">
      <button
        type="button"
        onClick={onApply}
        className="flex min-h-9 min-w-0 items-center rounded-full bg-brand-50 px-3 py-1.5 text-left text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
      >
        <span className="truncate">
          Looks like {/^[aeiou]/.test(label) ? 'an' : 'a'} {label} {guess.emoji} · use it
        </span>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="text-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        aria-label="Dismiss suggestion"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  )
}
