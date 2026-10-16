import { useEffect, useState } from 'react'
import { Lock, ShieldCheck } from 'lucide-react'
import { repo } from '@/data'
import type { Group } from '@/types'
import { errText } from '@/lib/errors'
import { lockMode, patternProblem, untilWords, vaultRefusal, type Step, type VaultStatus } from '@/lib/vault-api'
import { vaultKey } from '@/lib/vault-crypto'
import { setVaultKey } from '@/lib/vault-keys'
import { PageHeader } from '@/components/Misc'
import { useToast } from '@/components/Toast'
import { HintText } from '@/components/Hint'
import { PatternPad } from './PatternPad'
import { passkeyCancelled, passkeyProof } from './passkey'

/**
 * A private group that is locked on this device (docs/VAULT.md). The first person in sets its
 * pattern (twice, to be sure); after that everyone opens it with the pattern and their passkey.
 * Wrong patterns count down to a lockout, which the server keeps.
 */
export function VaultLock({ group, back = '/groups' }: { group: Group; back?: string }) {
  const toast = useToast()
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [failed, setFailed] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])
  const [first, setFirst] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let live = true
    repo
      .vault<VaultStatus>({ op: 'status', groupId: group.id })
      .then((s) => live && setStatus(s))
      .catch((e) => {
        if (!live) return
        setFailed(true)
        setNote(errText(e))
      })
    return () => {
      live = false
    }
  }, [group.id])
  // A lockout's countdown, and the screen comes back by itself when it ends.
  useEffect(() => {
    if (!status?.lockedUntil) return
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [status?.lockedUntil])

  const mode = lockMode(status, now, failed)
  const pattern = steps.join('')
  const open = async (dek: string) => setVaultKey(await vaultKey(group.id, dek))

  const submit = async () => {
    if (mode === 'setup' && first === null) {
      const problem = patternProblem(pattern)
      if (problem) return setNote(problem)
      setFirst(pattern)
      setSteps([])
      setNote('Enter it once more to be sure.')
      return
    }
    if (mode === 'setup' && first !== pattern) {
      setFirst(null)
      setSteps([])
      setNote('Those didn’t match. Start again.')
      return
    }
    setBusy(true)
    setNote(null)
    try {
      const auth = await passkeyProof(repo)
      const { dek } = await repo.vault<{ dek: string }>(mode === 'setup' ? { op: 'setup', groupId: group.id, pattern, auth } : { op: 'unlock', groupId: group.id, pattern, auth })
      await open(dek)
      if (mode === 'setup') toast('Pattern set. Share it with the group in person.')
    } catch (e) {
      setSteps([])
      if (passkeyCancelled(e)) setNote('Face ID or your passkey is needed to open it.')
      else {
        const r = vaultRefusal(e)
        if (r.lockedUntil) setStatus((s) => (s ? { ...s, triesLeft: 0, lockedUntil: r.lockedUntil } : s))
        else if (r.triesLeft !== undefined) setStatus((s) => (s ? { ...s, triesLeft: r.triesLeft as number } : s))
        setNote(r.triesLeft !== undefined && !r.lockedUntil ? `That’s not the pattern. ${r.triesLeft} ${r.triesLeft === 1 ? 'try' : 'tries'} left.` : errText(e))
      }
    } finally {
      setBusy(false)
    }
  }

  const title = mode === 'setup' ? (first === null ? 'Set the group’s pattern' : 'Confirm the pattern') : 'Unlock private group'
  return (
    <>
      <PageHeader title={group.name} back={back} />
      <div className="card flex flex-col items-center p-6 text-center" data-testid="vault-lock">
        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200" aria-hidden>
          <Lock size={26} />
        </div>
        <h2 className="mt-3 text-lg font-bold">{mode === 'loading' ? 'Private group' : title}</h2>
        {mode === 'setup' && (
          <HintText
            hint={{ full: 'At least 6 taps and long presses, in an order you’ll remember. Everyone in the group uses the same one, so tell them in person. Anyone can change it later.', tier: 'key' }}
            as="p"
            className="text-muted mt-1 text-sm"
          />
        )}
        {mode === 'unlock' && <p className="text-muted mt-1 text-sm">Enter the group’s pattern, then confirm with Face ID or your passkey.</p>}
        {mode === 'lockedOut' && status?.lockedUntil && (
          <p className="neg mt-2 text-sm" role="status">
            Too many wrong patterns. Try again {untilWords(status.lockedUntil, now)}.
          </p>
        )}
        {mode === 'unavailable' && (
          <p className="text-muted mt-2 text-sm" role="status">
            {note ?? 'Couldn’t reach the server. Check your connection and try again.'}
          </p>
        )}
        {(mode === 'setup' || mode === 'unlock') && (
          <>
            <div className="mt-6">
              <PatternPad steps={steps} onChange={setSteps} disabled={busy} />
            </div>
            {note && (
              <p className="mt-4 text-sm" role="status" data-testid="vault-note">
                {note}
              </p>
            )}
            <button type="button" className="btn-primary mt-5 w-full" disabled={busy || steps.length === 0} onClick={() => void submit()} data-testid="vault-submit">
              <ShieldCheck size={18} aria-hidden />
              {busy ? 'Checking…' : mode === 'setup' ? (first === null ? 'Next' : 'Set pattern') : 'Unlock'}
            </button>
          </>
        )}
      </div>
    </>
  )
}
