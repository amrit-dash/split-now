import { beatMs, type StoryKind } from '@/lib/help'
import { PlayControls, StepText, usePlayer } from './StepPlayer'
import { Story } from './Story'

/**
 * An explainer in Help: its picture (src/features/help/Story.tsx) above its captions, played one
 * caption after another like the steps of a feature. The captions are the explanation; the
 * picture only shows it, so a tap on a caption jumps the picture there. A beat stays until its
 * caption is read and its motion has played out (beatMs).
 */
export function StoryPlayer({ kind, beats, onLast }: { kind: StoryKind; beats: string[]; onLast?: () => void }) {
  const p = usePlayer(
    beats.map((b, n) => beatMs(kind, n, b)),
    onLast,
  )
  return (
    <div className="card overflow-hidden p-4" data-testid="help-explainer">
      <div className="mb-4">
        <Story kind={kind} beat={p.step} still={p.still} />
      </div>
      <PlayControls p={p} count={beats.length} noun="part" />
      <ol className="space-y-1">
        {beats.map((b, n) => (
          <li key={b}>
            <button
              type="button"
              onClick={() => p.go(n)}
              aria-current={n === p.step ? 'step' : undefined}
              className={`flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm leading-5 transition-colors duration-200 ${n === p.step ? 'bg-brand-50 dark:bg-brand-900/30' : 'text-muted'}`}
              data-testid="help-beat"
            >
              {/* The dot centred on the row, with room before it. */}
              <span
                className={`ml-0.5 h-2 w-2 shrink-0 rounded-full transition-colors duration-200 ${n === p.step ? 'bg-fill' : 'bg-slate-300 dark:bg-ink-700'}`}
                aria-hidden
              />
              <StepText text={b} />
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
