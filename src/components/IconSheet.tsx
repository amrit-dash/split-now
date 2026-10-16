import { useEffect, useState } from 'react'
import { RefreshCw, Search, Sparkles, Wand2 } from 'lucide-react'
import { repo } from '@/data'
import { firstEmoji } from '@/lib/emoji'
import { iconAiProblem } from '@/lib/icon-ai'
import { searchIcons } from '@/lib/icons'
import type { IconRequest, IconSuggestions } from '../../shared/icon-ai'
import { svgDataUrl } from '../../shared/svg-icon'
import { Spinner } from './Misc'
import { Sheet } from './Sheet'

/**
 * Every icon in one sheet, opened by pressing and holding an icon (or from the category sheet):
 * a search over the icon catalogue's words ("ferry", "ice cream"), or any emoji typed from the
 * keyboard, picked as soon as it is typed. `auto` is the automatic icon an expense goes back to
 * (absent for a group, which always has one). `first` lists the icons that fit best up front.
 * With `ai` (src/hooks/useIconAi.ts; never in a private group), "Suggest with AI" asks for three
 * emoji and up to three drawn icons from the title; a drawn one comes back through `onPickSvg`.
 */
export function IconSheet({
  open,
  onClose,
  title,
  value,
  auto,
  first = [],
  onPick,
  ai,
  svgValue,
  onPickSvg,
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
  /** what to ask AI for; absent hides "Suggest with AI" */
  ai?: IconRequest
  /** the AI-drawn icon chosen now */
  svgValue?: string
  onPickSvg?: (svg: string) => void
  testId?: string
}) {
  const [q, setQ] = useState('')
  const [asking, setAsking] = useState(false)
  const [found, setFound] = useState<IconSuggestions | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // A new title asks afresh.
  const aiTitle = ai?.title
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the title changes
  useEffect(() => {
    setFound(null)
    setProblem(null)
  }, [aiTitle])
  const pick = (icon: string | undefined) => {
    onPick(icon)
    setQ('')
    onClose()
  }
  const pickSvg = (svg: string) => {
    onPickSvg?.(svg)
    onClose()
  }
  const suggest = async () => {
    if (!ai || asking) return
    setAsking(true)
    setProblem(null)
    try {
      const r = await repo.iconsAi(ai)
      const why = iconAiProblem(r)
      if (why || !r || 'unavailable' in r) setProblem(why)
      else setFound(r)
    } finally {
      setAsking(false)
    }
  }
  const list = searchIcons(q, first)
  return (
    <Sheet open={open} onClose={onClose} title={title} testId={testId}>
      <div className="space-y-3">
        {auto !== undefined && (
          <button
            type="button"
            aria-pressed={value === undefined && !svgValue}
            onClick={() => pick(undefined)}
            className={`flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm font-semibold ${value === undefined && !svgValue ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-900/40' : 'bg-slate-100 dark:bg-ink-800'}`}
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
        {ai && onPickSvg && (
          <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-duo-50 p-3 dark:from-brand-900/30 dark:to-duo-900/20" data-testid="icon-ai">
            {found ? (
              <div className="space-y-2">
                <div role="radiogroup" aria-label="Suggested icons" className="grid grid-cols-6 gap-1.5">
                  {found.emoji.map((e) => (
                    <button
                      key={e}
                      type="button"
                      role="radio"
                      aria-checked={value === e && !svgValue}
                      aria-label={`Icon ${e}`}
                      onClick={() => pick(e)}
                      className="flex aspect-square min-h-11 items-center justify-center rounded-xl bg-white text-2xl dark:bg-ink-800"
                      data-testid="icon-ai-emoji"
                    >
                      {e}
                    </button>
                  ))}
                  {found.svgs.map((svg, i) => (
                    <button
                      key={svg}
                      type="button"
                      role="radio"
                      aria-checked={svgValue === svg}
                      aria-label={`Drawn icon ${i + 1}`}
                      onClick={() => pickSvg(svg)}
                      className={`flex aspect-square min-h-11 items-center justify-center rounded-xl bg-white dark:bg-ink-800 ${svgValue === svg ? 'ring-2 ring-brand-500' : ''}`}
                      data-testid="icon-ai-svg"
                    >
                      <img src={svgDataUrl(svg)} alt="" aria-hidden className="h-8 w-8" draggable={false} />
                    </button>
                  ))}
                </div>
                <button type="button" onClick={suggest} disabled={asking} className="chip min-h-11" data-testid="icon-ai-again">
                  {asking ? <Spinner className="!h-4 !w-4" label="Asking AI" /> : <RefreshCw size={14} aria-hidden />} Try again
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={suggest}
                disabled={asking}
                className="flex min-h-11 w-full items-center gap-3 text-left text-sm font-semibold"
                data-testid="icon-ai-suggest"
              >
                {asking ? <Spinner className="!h-5 !w-5" label="Asking AI" /> : <Wand2 size={20} className="text-brand-600 dark:text-brand-300" aria-hidden />}
                <span className="min-w-0 flex-1">
                  {asking ? 'Drawing icons…' : 'Suggest with AI'}
                  <span className="text-muted block text-xs font-normal">Three emoji and a few drawn icons, from “{ai.title}”</span>
                </span>
              </button>
            )}
            {problem && (
              <p className="text-muted mt-2 text-xs" role="status" data-testid="icon-ai-problem">
                {problem}
              </p>
            )}
          </div>
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
                aria-checked={value === e && !svgValue}
                aria-label={`Icon ${e}`}
                onClick={() => pick(e)}
                className={`flex aspect-square min-h-11 items-center justify-center rounded-xl text-2xl transition active:scale-95 ${value === e && !svgValue ? 'bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-900/40' : 'bg-slate-100 dark:bg-ink-800'}`}
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
