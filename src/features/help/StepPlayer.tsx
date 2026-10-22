import { useEffect, useState } from 'react'
import { Camera, Check, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { Collapsible } from '@/components/Collapsible'
import { useMotion } from '@/hooks/useMotion'
import { boldParts, clampStep, type HelpShot, type HelpStep, nextStep, stepMs } from '@/lib/help'
import SHOTS from '@/lib/help-shots.json'
import { SCENES } from '@/lib/help-scenes'
import { HelpShotView } from './HelpShot'
import { Scene } from './Scene'

/**
 * A section's steps beside its scene (src/features/help/Scene.tsx): it plays one step after
 * another, looping, ticking off each step it has shown, and a tap on a step (or Back / Next) jumps
 * there and pauses. Each step stays as long as its words take to read (stepMs). With reduced motion
 * or animations off it starts paused, and playing only crossfades; the steps read the same. A
 * screenshot of the real screen, when there is one, waits closed underneath.
 */
export function StepPlayer({ sectionId, steps }: { sectionId: string; steps: HelpStep[] }) {
  const p = usePlayer(steps.map((s) => stepMs(s.text)))
  const { step, still } = p
  const scene = SCENES[sectionId]
  const shot = (SHOTS as Record<string, HelpShot>)[sectionId]
  return (
    <div className="card overflow-hidden p-4" data-testid="help-player">
      {scene && (
        <div className="mb-4 rounded-3xl bg-gradient-to-br from-brand-50 to-duo-50 px-3 pb-4 pt-4 dark:from-brand-900/30 dark:to-duo-900/20">
          <Scene scene={scene} mark={steps[step]?.mark} step={step} still={still} />
          {/* The step being shown, under the picture, so it reads without scrolling to the list on a small phone. The list says it to screen readers. */}
          <p
            key={step}
            className="mx-auto mt-3 min-h-10 max-w-xs text-center text-sm leading-5 animate-[fade-in_200ms_ease-out]"
            aria-hidden
            data-testid="help-caption"
          >
            <StepText text={steps[step]?.text ?? ''} />
          </p>
        </div>
      )}
      <PlayControls p={p} count={steps.length} noun="step" />
      <ol className="space-y-1">
        {steps.map((s, n) => (
          <li key={s.text}>
            <button
              type="button"
              onClick={() => p.go(n)}
              aria-current={n === step ? 'step' : undefined}
              className={`flex min-h-11 w-full items-start gap-3 rounded-2xl px-2 py-2 text-left text-sm leading-6 transition-colors duration-200 ${n === step ? 'bg-brand-50 dark:bg-brand-900/30' : ''}`}
              data-testid="help-step"
            >
              {/* 24 px, the text's line height: the number sits level with the first line. */}
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-200 ${n === step ? 'bg-fill text-on-fill' : n < step ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-ink-800 dark:text-slate-300'}`}
              >
                {/* Steps already shown get a tick (it pops in as the player moves on); the number stays for screen readers. */}
                {n < step ? (
                  <>
                    <Check size={14} strokeWidth={3} className={still ? '' : 'animate-[pop_220ms_cubic-bezier(0.23,1,0.32,1)]'} aria-hidden />
                    <span className="sr-only">{n + 1}, done</span>
                  </>
                ) : (
                  n + 1
                )}
              </span>
              <StepText text={s.text} />
            </button>
          </li>
        ))}
      </ol>
      {shot && (
        <Collapsible
          className="mt-4 !shadow-none ring-1 ring-slate-100 dark:ring-white/5"
          icon={<Camera size={16} aria-hidden />}
          title="See a screenshot"
          summary="The real screen, with each step lit"
          testId="help-shot-panel"
        >
          <HelpShotView id={sectionId} shot={shot} active={step + 1} still={still} />
        </Collapsible>
      )}
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

/**
 * Playing a list of steps (or an explainer's beats): one after another, looping, each for its own
 * time (`times`, ms); a jump (a tap on one, Back, Next) pauses. With reduced motion or animations
 * off it starts paused; Play still works, and the pictures only crossfade.
 */
export function usePlayer(times: number[]) {
  const count = times.length
  const motion = useMotion()
  const still = motion.reduced || !motion.prefs.on
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(!still)
  const step = clampStep(i, count)
  const wait = times[step] ?? 4000
  // biome-ignore lint/correctness/useExhaustiveDependencies: each step waits its own time, so a jump restarts the wait
  useEffect(() => {
    if (!playing) return
    const t = setTimeout(() => {
      // A hidden tab doesn't play on: it waits on the step it was showing.
      if (document.visibilityState === 'visible') setI((x) => nextStep(x, count))
    }, wait)
    return () => clearTimeout(t)
  }, [playing, step, count, wait])
  const go = (n: number) => {
    setPlaying(false)
    setI(((n % count) + count) % count)
  }
  return { step, still, playing, setPlaying, go }
}

/** Back, Play or Pause with where it is ("step 2 of 4"), and Next. */
export function PlayControls({ p, count, noun }: { p: ReturnType<typeof usePlayer>; count: number; noun: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <button type="button" className="chip min-h-11" onClick={() => p.go(p.step - 1)} aria-label={`Previous ${noun}`} data-testid="help-prev">
        <ChevronLeft size={16} aria-hidden />
      </button>
      <button
        type="button"
        className="chip min-h-11 flex-1 justify-center"
        onClick={() => p.setPlaying((x) => !x)}
        aria-pressed={p.playing}
        data-testid="help-play"
      >
        {p.playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />} {p.playing ? 'Pause' : 'Play'} · {noun} {p.step + 1} of {count}
      </button>
      <button type="button" className="chip min-h-11" onClick={() => p.go(p.step + 1)} aria-label={`Next ${noun}`} data-testid="help-next">
        <ChevronRight size={16} aria-hidden />
      </button>
    </div>
  )
}
