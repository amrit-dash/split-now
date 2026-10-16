import { useState } from 'react'
import { repo } from '@/data'
import type { Group } from '@/types'
import { errText } from '@/lib/errors'
import { patternProblem, vaultRefusal, type Step } from '@/lib/vault-api'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { PatternPad } from './PatternPad'
import { passkeyCancelled, passkeyProof } from './passkey'

type Stage = 'old' | 'new' | 'again'

/** A new pattern for everyone in a private group: the current one first, then the new one twice, then a passkey. */
export function ChangePattern({ group, open, onClose }: { group: Group; open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [stage, setStage] = useState<Stage>('old')
  const [steps, setSteps] = useState<Step[]>([])
  const [old, setOld] = useState('')
  const [next, setNext] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const reset = () => {
    setStage('old')
    setSteps([])
    setOld('')
    setNext('')
    setNote(null)
  }
  const close = () => {
    reset()
    onClose()
  }
  const pattern = steps.join('')
  const go = async () => {
    setNote(null)
    if (stage === 'old') {
      setOld(pattern)
      setSteps([])
      setStage('new')
      return
    }
    if (stage === 'new') {
      const problem = patternProblem(pattern)
      if (problem) return setNote(problem)
      setNext(pattern)
      setSteps([])
      setStage('again')
      return
    }
    if (pattern !== next) {
      setSteps([])
      setStage('new')
      return setNote('Those didn’t match. Enter the new pattern again.')
    }
    setBusy(true)
    try {
      const auth = await passkeyProof(repo)
      await repo.vault({ op: 'changePattern', groupId: group.id, pattern: old, next, auth })
      toast('Pattern changed. Tell the group the new one in person.')
      close()
    } catch (e) {
      const r = vaultRefusal(e)
      reset()
      setNote(
        passkeyCancelled(e)
          ? 'Face ID or your passkey is needed to change it.'
          : r.triesLeft !== undefined && !r.lockedUntil
            ? `The current pattern wasn’t right. ${r.triesLeft} ${r.triesLeft === 1 ? 'try' : 'tries'} left.`
            : errText(e),
      )
    } finally {
      setBusy(false)
    }
  }
  const title = stage === 'old' ? 'Current pattern' : stage === 'new' ? 'New pattern' : 'New pattern again'
  return (
    <Sheet open={open} onClose={close} title="Change pattern" testId="vault-change">
      <p className="mb-4 text-center font-semibold">{title}</p>
      <PatternPad steps={steps} onChange={setSteps} disabled={busy} />
      {note && (
        <p className="mt-4 text-center text-sm" role="status">
          {note}
        </p>
      )}
      <button type="button" className="btn-primary mt-5 w-full" disabled={busy || steps.length === 0} onClick={() => void go()} data-testid="vault-change-next">
        {busy ? 'Checking…' : stage === 'again' ? 'Change pattern' : 'Next'}
      </button>
    </Sheet>
  )
}
