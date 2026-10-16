import { useState } from 'react'
import { Search, Sparkles } from 'lucide-react'
import { firstEmoji } from '@/lib/emoji'
import { searchIcons } from '@/lib/icons'
import { Sheet } from './Sheet'

/**
 * Every icon in one sheet, opened by pressing and holding an icon (or from the category sheet):
 * a search over the icon catalogue's words ("ferry", "ice cream"), or any emoji typed from the
 * keyboard, picked as soon as it is typed. `auto` is the automatic icon an expense goes back to
 * (absent for a group, which always has one). `first` lists the icons that fit best up front.
 */
export function IconSheet({
  open,
  onClose,
  title,
  value,
  auto,
  first = [],
  onPick,
  testId = 'icon-sheet',
}: {
  open: boolean
  onClose: () => void
  title: string
  /** the chosen icon (absent: automatic) */
  value?: string
  auto?: string
  first?: string[]
  onPick: (icon: string | undefined) => void
  testId?: string
}) {
  const [q, setQ] = useState('')
  const pick = (icon: string | undefined) => {
    onPick(icon)
    setQ('')
    onClose()
  }
  const list = searchIcons(q, first)
  return (
    <Sheet open={open} onClose={onClose} title={title} testId={testId}>
      <div className="space-y-3">
        {auto !== undefined && (
          <button
            type="button"
            aria-pressed={value === undefined}
            onClick={() => pick(undefined)}
            className={`flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm font-semibold ${value === undefined ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-900/40' : 'bg-slate-100 dark:bg-ink-800'}`}
            data-testid="icon-auto"
          >
            <span className="text-2xl" aria-hidden>
              {auto}
            </span>
            <span className="min-w-0 flex-1">
              Automatic
              <span className="text-muted block text-xs font-normal">Follows what it’s for and its category</span>
            </span>
            <Sparkles size={16} className="text-muted shrink-0" aria-hidden />
          </button>
        )}
        <div className="relative">
          <Search size={16} className="text-muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          {/* 16px so iOS doesn't zoom; an emoji typed here is picked straight away. */}
          <input
            className="input !pl-9"
            aria-label="Search icons or type an emoji"
            placeholder="Search, e.g. ferry, or type an emoji"
            enterKeyHint="search"
            autoComplete="off"
            value={q}
            onChange={(ev) => {
              const e = firstEmoji(ev.target.value)
              if (e) pick(e)
              else setQ(ev.target.value.slice(0, 40))
            }}
            data-testid="icon-search"
          />
        </div>
        {list.length ? (
          <div role="radiogroup" aria-label={title} className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
            {list.map((e) => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={value === e}
                aria-label={`Icon ${e}`}
                onClick={() => pick(e)}
                className={`flex aspect-square min-h-11 items-center justify-center rounded-xl text-2xl transition active:scale-95 ${value === e ? 'bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-900/40' : 'bg-slate-100 dark:bg-ink-800'}`}
              >
                {e}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-muted py-4 text-center text-sm" data-testid="icon-none">
            No icon for “{q.trim()}”. Try another word, or type any emoji.
          </p>
        )}
      </div>
    </Sheet>
  )
}
