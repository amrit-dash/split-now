import { useState, type ReactNode } from 'react'
import { Pencil, X } from 'lucide-react'
import { ALL_GROUP_ICONS, groupTypeInfo, type GroupGuess } from '@/lib/groupTypes'
import { IconSheet } from './IconSheet'
import { IconFace } from './IconFace'
import type { IconRequest } from '../../shared/icon-ai'

/**
 * Group icon button that sits beside a labelled input (same height as `.input`): a tap opens
 * every icon in the icon sheet, with its search and, where offered, AI for the searched words
 * (src/components/IconSheet.tsx). `children` is the field next to the button.
 */
export function IconPickerField({
  emoji,
  onChange,
  emojis = ALL_GROUP_ICONS,
  children,
  iconSvg,
  onPickSvg,
  iconImage,
  onPickImage,
  picture,
  ai,
}: {
  emoji: string
  onChange: (e: string) => void
  /** an AI-drawn icon, shown over the emoji */
  iconSvg?: string
  onPickSvg?: (svg: string) => void
  /** a picture (Draw a picture), shown over both */
  iconImage?: string
  onPickImage?: (image: string) => void
  picture?: 'own' | 'app' | null
  /** what the sheet's AI is told besides the searched words (src/hooks/useIconAi.ts); absent: no AI */
  ai?: Omit<IconRequest, 'title'>
  /** icons offered first (the group type's) */
  emojis?: string[]
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const list = emojis.includes(emoji) ? emojis : [emoji, ...emojis]
  return (
    <>
      <div className="flex items-end gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={`Group icon ${emoji}. Change icon`}
          data-testid="group-icon"
          className="press-hold relative flex h-12 w-12 shrink-0 select-none items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-duo-100 text-2xl transition active:scale-95 dark:from-brand-900/50 dark:to-duo-900/30"
        >
          <IconFace iconSvg={iconSvg} iconImage={iconImage} emoji={emoji} />
          <span
            className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-fill text-on-fill shadow ring-2 ring-white dark:ring-ink-900"
            aria-hidden
          >
            <Pencil size={10} strokeWidth={3} />
          </span>
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <IconSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Group icon"
        value={emoji}
        first={list}
        onPick={(e) => e && onChange(e)}
        ai={ai}
        svgValue={iconSvg}
        onPickSvg={onPickSvg}
        picture={picture}
        imageValue={iconImage}
        onPickImage={onPickImage}
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
