import { type ReactNode, useRef, useState } from 'react'
import { repo } from '@/data'
import { errText } from '@/lib/errors'
import { PATTERN_MAX, PATTERN_PAUSE_MS, refusalKind, shouldSend, type Step, type UnlockStarted, type VaultStatus } from '@/lib/vault-api'
import { useToast } from '@/components/Toast'
import { finishUnlock } from './passkey'
import { SetupSheet } from './SetupSheet'
import { usePress } from './usePress'

/**
 * The lock button: an ordinary-looking icon button that is also where the pattern goes in
 * (docs/VAULT.md). Taps and long presses on it, nothing on screen changes and nothing buzzes, and
 * the pattern is sent after PATTERN_PAUSE_MS without a press. Without `groupId` (the Groups
 * screen, Balances) the universal pattern opens every private group; with it, the universal or
 * the group's own pattern opens only that group. A right one brings up Face ID or the passkey; a
 * wrong one does nothing at all. Fewer presses than any pattern could be are a
 * stray tap and go nowhere (shouldSend). Someone with no pattern set up yet gets the setup prompt,
 * except someone who stopped using private groups: for them a group with no own pattern does nothing.
 */
export function PatternLock({
  groupId,
  label,
  className,
  testId,
  children,
}: {
  groupId?: string
  label: string
  className: string
  testId?: string
  children: ReactNode
}) {
  const toast = useToast()
  const steps = useRef<Step[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const status = useRef<Promise<VaultStatus | null> | null>(null)
  const [busy, setBusy] = useState(false)
  const [setup, setSetup] = useState(false)

  // Asked once, on the first press: whether there is a pattern at all, and whether this group has its own.
  const statusOf = () => {
    status.current ??= repo.vault<VaultStatus>(groupId ? { op: 'status', groupId } : { op: 'status' }).catch(() => null)
    return status.current
  }

  const send = async (pattern: string) => {
    const s = await statusOf()
    if (s && !s.universal && !s.group?.hasPattern) return setSetup(!s.off)
    if (!shouldSend(pattern, { groupHasOwn: !!s?.group?.hasPattern })) return
    setBusy(true)
    try {
      const started = await repo.vault<UnlockStarted>(groupId ? { op: 'unlockStart', pattern, groupId } : { op: 'unlockStart', pattern })
      await finishUnlock(repo, started)
    } catch (e) {
      const kind = refusalKind(e)
      // A wrong pattern or a lockout shows nothing: the button simply stays a lock.
      if (kind === 'setup') setSetup(!s?.off)
      else if (kind === 'other') toast(errText(e), 'err')
      // A new pattern or a change on another phone shows on the next try.
      status.current = null
    } finally {
      setBusy(false)
    }
  }

  const add = (s: Step) => {
    if (busy) return
    void statusOf()
    if (steps.current.length < PATTERN_MAX) steps.current.push(s)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const p = steps.current.join('')
      steps.current = []
      void send(p)
    }, PATTERN_PAUSE_MS)
  }
  const { handlers } = usePress(add, busy)

  return (
    <>
      <button type="button" aria-label={label} title={label} className={`touch-none select-none ${className}`} data-testid={testId} {...handlers}>
        {children}
      </button>
      <SetupSheet open={setup} onClose={() => setSetup(false)} inGroup={!!groupId} />
    </>
  )
}
