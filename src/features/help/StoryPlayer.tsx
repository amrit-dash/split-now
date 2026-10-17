import type { StoryKind } from '@/lib/help'
import { PlayControls, StepText, usePlayer } from './StepPlayer'
import { Story } from './Story'

/**
 * An explainer in Help: its picture (src/features/help/Story.tsx) above its captions, played one
 * caption after another like the steps of a feature. The captions are the explanation; the
 * picture only shows it, so a tap on a caption jumps the picture there.
 */
export function StoryPlayer({ kind, beats }: { kind: StoryKind; beats: string[] }) {
  const p = usePlayer(beats.length)
  return (
    <div className="card overflow-hidden p-4" data-testid="help-explainer">
      <div className="mb-4 rounded-3xl bg-gradient-to-br from-brand-50 to-duo-50 px-2 py-3 dark:from-brand-900/30 dark:to-duo-900/20">
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
              className={`flex min-h-11 w-full items-start gap-3 rounded-2xl px-2 py-2 text-left text-sm transition ${n === p.step ? 'bg-brand-50 dark:bg-brand-900/30' : 'text-muted'}`}
              data-testid="help-beat"
            >
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full transition ${n === p.step ? 'bg-fill' : 'bg-slate-300 dark:bg-ink-700'}`} aria-hidden />
              <StepText text={b} />
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
