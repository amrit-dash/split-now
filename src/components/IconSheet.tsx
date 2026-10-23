import { useEffect, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { ImageIcon, MagicIcon, SparkleIcon } from '@/components/icons'
import { repo } from '@/data'
import { firstEmoji } from '@/lib/emoji'
import { Link } from 'react-router-dom'
import { AI_IDLE_MS, aiRowShown, drawnByLine, iconAiProblem, pictureNote, pictureProblem } from '@/lib/icon-ai'
import { shrinkPicture } from '@/lib/icon-picture'
import { searchIcons } from '@/lib/icons'
import { type IconRequest, type IconSuggestions, pictureCost as costOf } from '../../shared/icon-ai'
import { svgDataUrl } from '../../shared/svg-icon'
import { Spinner } from './Misc'
import { Sheet } from './Sheet'

/**
 * Every icon in one sheet, opened by tapping a group's icon or holding an expense's (or from the
 * category sheet). Search first: the icon catalogue's words ("ferry", "ice cream"), or any emoji
 * typed from the keyboard, picked as soon as it is typed. `auto` is the automatic icon an expense
 * goes back to, always offered first (absent for a group). `first` lists the icons that fit best.
 *
 * With `ai` (src/hooks/useIconAi.ts; never in a private group), once words are typed and nothing
 * matches them, or the person waits AI_IDLE_MS without picking (aiRowShown), the sheet offers
 * "Suggest with AI" for those words (three emoji and drawn icons, on the free AI too), and
 * "Draw a picture" when a key that can pay for it is in use (`picture`). AI is asked about the
 * search words only; the title has its own automatic pick (src/hooks/useAutoIconPick.ts).
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
  picture,
  pictureCost = costOf(),
  imageValue,
  onPickImage,
  aiWhy,
  pictureOff,
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
  /** what the AI is told besides the search words; absent: no AI here */
  ai?: Omit<IconRequest, 'title'>
  /** the AI-drawn icon chosen now */
  svgValue?: string
  onPickSvg?: (svg: string) => void
  /** "Draw a picture" (a paid image model): whose key pays; absent or null: not shown */
  picture?: 'own' | 'app' | null
  /** what one picture costs on the model that key draws with (src/hooks/useIconAi.ts) */
  pictureCost?: string
  /** the picture chosen now */
  imageValue?: string
  onPickImage?: (image: string) => void
  /** why the AI rows aren't here (src/lib/icon-ai.ts iconAiWhy), said under the search with a link to fix it */
  aiWhy?: string | null
  /** why Draw a picture isn't offered beside Suggest with AI (src/lib/icon-ai.ts pictureWhy) */
  pictureOff?: string | null
  testId?: string
}) {
  const [q, setQ] = useState('')
  const [idle, setIdle] = useState(false)
  const [asking, setAsking] = useState(false)
  const [found, setFound] = useState<IconSuggestions | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [drawn, setDrawn] = useState<string | null>(null)
  // Which model drew it, and what that cost: said under the picture.
  const [drawnBy, setDrawnBy] = useState<string | null>(null)
  const [pictureWhy, setPictureWhy] = useState<string | null>(null)
  const words = q.replace(/\s+/g, ' ').trim().slice(0, 80)
  // Each opening starts with an empty search.
  useEffect(() => {
    if (!open) setQ('')
  }, [open])
  // New words: what AI said before was for other words, and the wait starts over.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the words change
  useEffect(() => {
    setFound(null)
    setProblem(null)
    setDrawn(null)
    setPictureWhy(null)
    setIdle(false)
    if (!words) return
    const t = setTimeout(() => setIdle(true), AI_IDLE_MS)
    return () => clearTimeout(t)
  }, [words])
  const asked: IconRequest | undefined = ai && words ? { ...ai, title: words } : undefined
  const pick = (icon: string | undefined) => {
    onPick(icon)
    onClose()
  }
  const pickSvg = (svg: string) => {
    onPickSvg?.(svg)
    onClose()
  }
  const suggest = async () => {
    if (!asked || asking) return
    setAsking(true)
    setProblem(null)
    try {
      const r = await repo.iconsAi(asked)
      const why = iconAiProblem(r)
      if (why || !r || 'unavailable' in r) setProblem(why)
      else setFound(r)
    } finally {
      setAsking(false)
    }
  }
  const draw = async () => {
    if (!asked || drawing) return
    setDrawing(true)
    setPictureWhy(null)
    try {
      const r = await repo.iconPictureAi(asked)
      const small = r && 'image' in r ? await shrinkPicture(r.image, r.mimeType) : null
      const why = pictureProblem(r, !!small, picture ?? 'own')
      if (why || !small) setPictureWhy(why)
      else {
        setDrawn(small)
        setDrawnBy(r && 'image' in r ? drawnByLine(r.model) : null)
      }
    } finally {
      setDrawing(false)
    }
  }
  const list = searchIcons(q, first)
  const showAi = !!asked && !!onPickSvg && aiRowShown({ query: words, results: words ? list.length : 1, idle })
  const chosen = (e: string) => value === e && !svgValue && !imageValue
  const tile = 'flex aspect-square min-h-11 items-center justify-center rounded-xl'
  return (
    <Sheet open={open} onClose={onClose} title={title} testId={testId}>
      <div className="space-y-3">
        {auto !== undefined && (
          <button
            type="button"
            aria-pressed={value === undefined && !svgValue && !imageValue}
            onClick={() => pick(undefined)}
            className={`flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm font-semibold ${value === undefined && !svgValue && !imageValue ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-900/40' : 'bg-slate-100 dark:bg-ink-800'}`}
            data-testid="icon-auto"
          >
            <span className="text-2xl" aria-hidden>
              {auto}
            </span>
            <span className="min-w-0 flex-1">
              Automatic
              <span className="text-muted block text-xs font-normal">Picked from what it’s for and its category</span>
            </span>
            <SparkleIcon size={16} className="text-muted shrink-0" aria-hidden />
          </button>
        )}
        {/* A form, so the keyboard's search key searches here and never reaches the page's own form. */}
        <form
          className="relative"
          role="search"
          onSubmit={(ev) => {
            ev.preventDefault()
            ev.stopPropagation()
            // Enter on words with no icon: straight to AI; with icons, the first one.
            if (words && !list.length && asked) void suggest()
            else if (words && list[0]) pick(list[0])
          }}
        >
          <Search size={16} className="text-muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          {/* 16px so iOS doesn't zoom; an emoji typed here is picked straight away. */}
          <input
            className="input !pl-9"
            type="search"
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
        </form>
        {!asked && aiWhy && (
          <p className="text-muted px-1 text-xs" role="note" data-testid="icon-ai-why">
            {aiWhy}{' '}
            <Link to="/settings/ai" onClick={onClose} className="font-semibold text-brand-600 underline underline-offset-2 dark:text-brand-300">
              AI features
            </Link>
          </p>
        )}
        {showAi && (
          <div
            className="animate-pop rounded-2xl bg-gradient-to-br from-brand-50 to-duo-50 p-3 dark:from-brand-900/30 dark:to-duo-900/20"
            data-testid="icon-ai"
          >
            {found ? (
              <div className="space-y-2.5">
                {/* One pattern for both AI rows (owner, 23 Oct 2026): what it is on the left, a round redo on the right. */}
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="truncate font-semibold">Suggested for “{words}”</div>
                    <div className="text-muted text-xs">Tap one to use it</div>
                  </div>
                  <RoundRedo busy={asking} onClick={suggest} label="Suggest again" busyLabel="Asking AI" testId="icon-ai-again" />
                </div>
                <div role="radiogroup" aria-label="Suggested icons" className="grid grid-cols-6 gap-1.5">
                  {found.emoji.map((e) => (
                    <button
                      key={e}
                      type="button"
                      role="radio"
                      aria-checked={chosen(e)}
                      aria-label={`Icon ${e}`}
                      onClick={() => pick(e)}
                      className={`${tile} animate-pop bg-white text-2xl dark:bg-ink-800`}
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
                      className={`${tile} animate-pop bg-white dark:bg-ink-800 ${svgValue === svg ? 'ring-2 ring-brand-500' : ''}`}
                      data-testid="icon-ai-svg"
                    >
                      <img src={svgDataUrl(svg)} alt="" aria-hidden className="h-8 w-8" draggable={false} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={suggest}
                disabled={asking}
                className="flex min-h-11 w-full items-center gap-3 text-left text-sm font-semibold"
                data-testid="icon-ai-suggest"
              >
                {asking ? (
                  <Spinner className="!h-5 !w-5" label="Asking AI" />
                ) : (
                  <MagicIcon size={20} className="text-brand-600 dark:text-brand-300" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  {asking ? 'Drawing icons… this can take a minute on the free AI' : `Suggest with AI for “${words}”`}
                  <span className="text-muted block text-xs font-normal" data-testid="icon-ai-from">
                    Three emoji and a few drawn icons
                  </span>
                </span>
              </button>
            )}
            {problem && (
              <p className="text-muted mt-2 text-xs" role="status" data-testid="icon-ai-problem">
                {problem}
              </p>
            )}
            {!picture && onPickImage && pictureOff && (
              <p className="text-muted mt-3 border-t border-brand-100 pt-3 text-xs dark:border-white/5" role="note" data-testid="icon-picture-why">
                {pictureOff}{' '}
                <Link to="/settings/ai" onClick={onClose} className="font-semibold text-brand-600 underline underline-offset-2 dark:text-brand-300">
                  AI features
                </Link>
              </p>
            )}
            {picture && onPickImage && (
              <div className="mt-3 border-t border-brand-100 pt-3 dark:border-white/5" data-testid="icon-picture">
                {drawn ? (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        onPickImage(drawn)
                        onClose()
                      }}
                      aria-label="Use this picture"
                      aria-pressed={imageValue === drawn}
                      className={`animate-pop h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-white dark:bg-ink-800 ${imageValue === drawn ? 'ring-2 ring-brand-500' : ''}`}
                      data-testid="icon-picture-use"
                    >
                      <img src={drawn} alt="" aria-hidden className="h-full w-full object-contain p-0.5" draggable={false} />
                    </button>
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="font-semibold">Tap it to use it</div>
                      {drawnBy && (
                        <div className="text-muted text-xs" data-testid="icon-picture-by">
                          {drawnBy}
                        </div>
                      )}
                    </div>
                    <RoundRedo busy={drawing} onClick={draw} label="Draw another" busyLabel="Drawing" testId="icon-picture-again" />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={draw}
                    disabled={drawing}
                    className="flex min-h-11 w-full items-center gap-3 text-left text-sm font-semibold"
                    data-testid="icon-picture-draw"
                  >
                    {drawing ? (
                      <Spinner className="!h-5 !w-5" label="Drawing" />
                    ) : (
                      <ImageIcon size={20} className="text-brand-600 dark:text-brand-300" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">
                      {drawing ? 'Drawing a picture… this can take half a minute' : `Draw a picture of “${words}”`}
                      <span className="text-muted block text-xs font-normal" data-testid="icon-picture-note">
                        {pictureNote(picture, pictureCost)}
                      </span>
                    </span>
                  </button>
                )}
                {pictureWhy && (
                  <p className="text-muted mt-2 text-xs" role="status" data-testid="icon-picture-problem">
                    {pictureWhy}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {list.length ? (
          <div role="radiogroup" aria-label={title} className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
            {list.map((e) => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={chosen(e)}
                aria-label={`Icon ${e}`}
                onClick={() => pick(e)}
                className={`${tile} text-2xl transition active:scale-95 ${chosen(e) ? 'bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-900/40' : 'bg-slate-100 dark:bg-ink-800'}`}
              >
                {e}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-muted py-4 text-center text-sm" data-testid="icon-none">
            No icon for “{words}”. {asked ? 'Ask AI above, or try another word.' : 'Try another word, or type any emoji.'}
          </p>
        )}
      </div>
    </Sheet>
  )
}

/** The round redo button at the end of an AI row: Suggest again, Draw another. */
function RoundRedo({ busy, onClick, label, busyLabel, testId }: { busy: boolean; onClick: () => void; label: string; busyLabel: string; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-brand-700 shadow-sm ring-1 ring-brand-100 transition active:scale-95 disabled:opacity-60 dark:bg-ink-800 dark:text-brand-200 dark:ring-white/10"
      data-testid={testId}
    >
      {busy ? <Spinner className="!h-4 !w-4" label={busyLabel} /> : <RefreshCw size={18} aria-hidden />}
    </button>
  )
}
