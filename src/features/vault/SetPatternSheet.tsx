import { useEffect, useState } from 'react'
import { errText } from '@/lib/errors'
import { firstPhase, groupPatternProblem, type PatternPhase, patternProblem, phasePrompt, refusalKind, type Step, vaultRefusal } from '@/lib/vault-api'
import { Sheet } from '@/components/Sheet'
import { Switch } from '@/components/Switch'
import { PatternPad } from './PatternPad'
import { passkeyCancelled } from './passkey'

/**
 * Setting a pattern: the universal one (at least 6, mixed) or a group's own (any length). Entered
 * twice to be sure, with "Follow the sequence": off, only how many taps and long presses count.
 * Changing one starts with a pattern that already opens it (`hasCurrent` for the universal one; a
 * group's own always asks, since the universal pattern or its own will do), and `remove` asks only
 * that. `save` does the passkey and the server step; its refusal shows here.
 */
export function SetPatternSheet({
  open,
  onClose,
  kind,
  hasCurrent = false,
  remove = false,
  ordered: startOrdered = true,
  save,
}: {
  open: boolean
  onClose: () => void
  kind: 'universal' | 'group'
  hasCurrent?: boolean
  remove?: boolean
  ordered?: boolean
  save: (pattern: string | null, ordered: boolean, current?: string) => Promise<void>
}) {
  const start = remove ? 'current' : firstPhase({ kind, hasCurrent })
  const [phase, setPhase] = useState<PatternPhase>(start)
  const [steps, setSteps] = useState<Step[]>([])
  const [current, setCurrent] = useState<string | undefined>()
  const [first, setFirst] = useState<string | null>(null)
  const [ordered, setOrdered] = useState(startOrdered)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const reset = (to: PatternPhase = start) => {
    setPhase(to)
    setSteps([])
    setFirst(null)
    if (to === 'current') setCurrent(undefined)
  }
  // Each opening starts at its first step (whether a pattern is set may have changed while it was closed).
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on opening.
  useEffect(() => {
    if (open) reset()
  }, [open, start])
  const close = () => {
    reset()
    setNote(null)
    onClose()
  }
  const pattern = steps.join('')
  const send = async (next: string | null, cur: string | undefined) => {
    setBusy(true)
    try {
      await save(next, ordered, cur)
      reset()
      setNote(null)
    } catch (e) {
      // A wrong current pattern goes back to that step; anything else starts over.
      const why = refusalKind(e)
      const left = vaultRefusal(e).triesLeft
      reset(why === 'wrong' || why === 'locked' ? 'current' : start)
      setNote(
        passkeyCancelled(e)
          ? 'Face ID or your passkey is needed to save it.'
          : why === 'wrong'
            ? `That’s not it.${left !== undefined ? ` ${left} ${left === 1 ? 'try' : 'tries'} left.` : ''}`
            : errText(e),
      )
    } finally {
      setBusy(false)
    }
  }
  const next = async () => {
    setNote(null)
    if (phase === 'current') {
      if (remove) return send(null, pattern)
      setCurrent(pattern)
      setSteps([])
      return setPhase('new')
    }
    if (phase === 'new') {
      const problem = kind === 'universal' ? patternProblem(pattern) : groupPatternProblem(pattern)
      if (problem) return setNote(problem)
      setFirst(pattern)
      setSteps([])
      return setPhase('again')
    }
    if (first !== pattern) {
      reset('new')
      return setNote('Those didn’t match. Enter the new pattern again.')
    }
    await send(pattern, current)
  }
  const title = remove ? 'Remove its own pattern' : kind === 'universal' ? 'Universal pattern' : 'This group’s own pattern'
  const hint =
    phase === 'current'
      ? kind === 'universal'
        ? 'The one you use on the lock button.'
        : 'Your universal pattern, or the group’s own.'
      : kind === 'universal'
        ? 'At least 6 taps and long presses, mixed.'
        : 'Any number of taps and long presses.'
  return (
    <Sheet open={open} onClose={close} title={title} testId="vault-set-pattern">
      <p className="mb-1 text-center font-semibold" data-testid="vault-set-prompt">
        {phasePrompt(phase, kind)}
      </p>
      <p className="text-muted mb-4 text-center text-xs">{hint}</p>
      <PatternPad steps={steps} onChange={setSteps} disabled={busy} />
      {phase === 'new' && (
        <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
          <div>
            <div className="text-sm font-semibold">Follow the sequence</div>
            <div className="text-muted text-xs">{ordered ? 'The order of taps and long presses matters.' : 'Only how many of each counts.'}</div>
          </div>
          <Switch checked={ordered} onChange={setOrdered} label="Follow the sequence" disabled={busy} testId="vault-ordered" />
        </div>
      )}
      {note && (
        <p className="mt-4 text-center text-sm" role="status" data-testid="vault-set-note">
          {note}
        </p>
      )}
      <button type="button" className="btn-primary mt-5 w-full" disabled={busy || steps.length === 0} onClick={() => void next()} data-testid="vault-set-next">
        {busy ? 'Saving…' : phase === 'again' ? 'Save pattern' : remove ? 'Remove pattern' : 'Next'}
      </button>
    </Sheet>
  )
}
