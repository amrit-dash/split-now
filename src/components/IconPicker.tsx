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
  pictureCost,
  aiWhy,
  pictureOff,
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
  pictureCost?: string
  /** why there's no AI here (iconAiWhy), said in the sheet */
  aiWhy?: string | null
  pictureOff?: string | null
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
        pictureCost={pictureCost}
        aiWhy={aiWhy}
        pictureOff={pictureOff}
        imageValue={iconImage}
        onPickImage={onPickImage}
        testId="group-icon-sheet"
      />
    </>
  )
}

/** One-tap "Looks like a trip ✈️ — use it" chip for a name-based guess the user can take or dismiss. */
/**
 * The suggestions under a group's name (a second AI icon, the type it looks like), in one row that
 * scrolls sideways: each pill keeps its whole text instead of cutting it short on a narrow phone.
 */
export function SuggestionRow({ children }: { children: ReactNode }) {
  // py-1 and the end spacer: overflow-x-auto clips the pills' edges otherwise.
  return (
    <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 py-1 after:block after:w-px after:shrink-0 after:content-['']" data-no-drag>
      {children}
    </div>
  )
}

/** One suggestion: tap to use it, ✕ to dismiss it. Never truncated, never wraps (SuggestionRow scrolls). */
export function SuggestionPill({
  children,
  onApply,
  onDismiss,
  dismissLabel,
  testId,
}: {
  children: ReactNode
  onApply: () => void
  onDismiss: () => void
  dismissLabel: string
  testId?: string
}) {
  return (
    <div
      className="animate-fade flex shrink-0 items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
      data-testid={testId}
    >
      <button type="button" onClick={onApply} className="flex min-h-9 items-center whitespace-nowrap py-1.5 pr-1 pl-3">
        {children}
      </button>
      <button type="button" onClick={onDismiss} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full opacity-70" aria-label={dismissLabel}>
        <X size={14} aria-hidden />
      </button>
    </div>
  )
}

export function TypeSuggestion({ guess, onApply, onDismiss }: { guess: GroupGuess; onApply: () => void; onDismiss: () => void }) {
  const label = groupTypeInfo(guess.type).label.toLowerCase()
  return (
    <SuggestionPill onApply={onApply} onDismiss={onDismiss} dismissLabel="Dismiss suggestion" testId="type-suggestion">
      Looks like {/^[aeiou]/.test(label) ? 'an' : 'a'} {label} {guess.emoji} · use it
    </SuggestionPill>
  )
}
