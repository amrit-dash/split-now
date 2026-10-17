import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { useMotion } from '@/hooks/useMotion'
import { boldParts, clampStep, type HelpStep, nextStep, STEP_MS } from '@/lib/help'
import { SCENES } from '@/lib/help-scenes'
import { Scene } from './Scene'

/**
 * A main feature's steps beside its scene (src/features/help/Scene.tsx): it plays one step after
 * another, looping, and a tap on a step (or Back / Next) jumps there and pauses. With reduced
 * motion or animations off it starts paused and the scene stays still; the steps read the same.
 */
export function StepPlayer({ sectionId, steps }: { sectionId: string; steps: HelpStep[] }) {
  const motion = useMotion()
  const still = motion.reduced || !motion.prefs.on
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(!still)
  const step = clampStep(i, steps.length)
  // biome-ignore lint/correctness/useExhaustiveDependencies: each step waits its own time, so a jump restarts the wait
  useEffect(() => {
    if (!playing || still) return
    const t = setTimeout(() => {
      // A hidden tab doesn't play on: it waits on the step it was showing.
      if (document.visibilityState === 'visible') setI((x) => nextStep(x, steps.length))
    }, STEP_MS)
    return () => clearTimeout(t)
  }, [playing, still, step, steps.length])
  const go = (n: number) => {
    setPlaying(false)
    setI(((n % steps.length) + steps.length) % steps.length)
  }
  const scene = SCENES[sectionId]
  return (
    <div className="card overflow-hidden p-4" data-testid="help-player">
      {scene && (
        <div className="mb-4 rounded-3xl bg-gradient-to-br from-brand-50 to-duo-50 py-4 dark:from-brand-900/30 dark:to-duo-900/20">
          <Scene scene={scene} mark={steps[step]?.mark} step={step} still={still} />
        </div>
      )}
      <div className="mb-3 flex items-center gap-2">
        <button type="button" className="chip min-h-11" onClick={() => go(step - 1)} aria-label="Previous step" data-testid="help-prev">
          <ChevronLeft size={16} aria-hidden />
        </button>
        <button
          type="button"
          className="chip min-h-11 flex-1 justify-center"
          onClick={() => setPlaying((p) => !p)}
          aria-pressed={playing}
          disabled={still}
          data-testid="help-play"
        >
          {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />} {playing ? 'Pause' : 'Play'} · step {step + 1} of {steps.length}
        </button>
        <button type="button" className="chip min-h-11" onClick={() => go(step + 1)} aria-label="Next step" data-testid="help-next">
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
      <ol className="space-y-1">
        {steps.map((s, n) => (
          <li key={s.text}>
            <button
              type="button"
              onClick={() => go(n)}
              aria-current={n === step ? 'step' : undefined}
              className={`flex min-h-11 w-full items-start gap-3 rounded-2xl px-2 py-2 text-left text-sm transition ${n === step ? 'bg-brand-50 dark:bg-brand-900/30' : ''}`}
              data-testid="help-step"
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${n === step ? 'bg-fill text-on-fill' : 'bg-slate-100 text-slate-600 dark:bg-ink-800 dark:text-slate-300'}`}
              >
                {n + 1}
              </span>
              <StepText text={s.text} />
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** A step's text with the words on screen in bold. */
export function StepText({ text }: { text: string }) {
  return (
    <span className="min-w-0 flex-1">
      {boldParts(text).map((p, i) =>
        p.bold ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
          <strong key={i} className="font-semibold">
            {p.text}
          </strong>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  )
}
