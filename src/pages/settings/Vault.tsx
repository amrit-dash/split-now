import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { repo } from '@/data'
import { useFlag } from '@/hooks/useAppConfig'
import { errText } from '@/lib/errors'
import { stopPlan, type VaultStatus } from '@/lib/vault-api'
import { lockVault } from '@/lib/vault-keys'
import { useConfirm } from '@/components/ConfirmSheet'
import { useToast } from '@/components/Toast'
import { passkeyCancelled, passkeyProof, registerPasskey } from '@/features/vault/passkey'
import { SetPatternSheet } from '@/features/vault/SetPatternSheet'
import { AllGroupsLockTime } from '@/features/vault/LockTime'
import { LockSetup } from '@/features/vault/LockSetup'
import { Detail } from '@/components/Hint'
import { SettingsPage } from './common'

/**
 * /settings/vault: what opens this person's private groups (docs/VAULT.md). A passkey (Face ID, a
 * fingerprint, the screen lock) and a universal pattern of taps and long presses, which opens
 * every private group they're in from the Groups screen. Shown only while the `vaults` flag is on.
 * "Stop using private groups" deletes both and stops the app offering private groups, once none
 * they made is left; setting a universal pattern again starts them again.
 */
export default function Vault() {
  const on = useFlag('vaults')
  const toast = useToast()
  const confirm = useConfirm()
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [setting, setSetting] = useState(false)
  // the current pattern, asked before stopping
  const [stopping, setStopping] = useState(false)
  const [busy, setBusy] = useState(false)
  const [round, setRound] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: round reads the status again after a change.
  useEffect(() => {
    if (!on) return
    let live = true
    repo
      .vault<VaultStatus>({ op: 'status', made: true })
      .then((s) => live && setStatus(s))
      .catch((e) => live && setFailed(errText(e)))
    return () => {
      live = false
    }
  }, [on, round])

  if (!on) return <Navigate to="/settings" replace />

  const stop = async (current?: string) => {
    const auth = current === undefined ? undefined : await passkeyProof(repo)
    await repo.vault({ op: 'stop', current, auth })
    lockVault()
    setStopping(false)
    setRound((r) => r + 1)
    toast('You’ve stopped using private groups')
  }
  const askStop = async () => {
    if (!status) return
    if (stopPlan(status) === 'made') {
      const n = status.made ?? 0
      return toast(`First turn off private, or delete, the ${n === 1 ? 'private group' : `${n} private groups`} you made.`, 'err')
    }
    const ok = await confirm({
      title: 'Stop using private groups?',
      message:
        'Your universal pattern and passkeys are deleted, and the app stops offering to make private groups. Private groups other people made still open with their own pattern, if they have one.',
      confirmLabel: 'Stop',
      tone: 'danger',
    })
    if (!ok) return
    if (status.universal) return setStopping(true)
    setBusy(true)
    try {
      await stop()
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }

  const addPasskey = async () => {
    setBusy(true)
    try {
      await registerPasskey(repo)
      toast('Passkey added')
      setRound((r) => r + 1)
    } catch (e) {
      if (!passkeyCancelled(e)) toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsPage title="Encrypted groups" subtitle={{ full: 'What opens your private groups', short: 'Passkey and pattern', tier: 'help' }}>
      {failed ? (
        <p className="card text-muted p-4 text-sm" role="status">
          {failed}
        </p>
      ) : !status ? (
        <p className="card text-muted p-4 text-sm">Checking…</p>
      ) : status.off ? (
        <div className="space-y-4" data-testid="vault-stopped">
          <div className="card text-muted space-y-2 p-4 text-sm">
            <p>You’ve stopped using private groups, so the app doesn’t offer to make one.</p>
            <p>A private group someone else made still opens with its own pattern, on its lock button, if it has one.</p>
          </div>
          <AllGroupsLockTime />
          <button
            type="button"
            className="btn-primary w-full"
            disabled={busy || !status.serverReady}
            onClick={() => setSetting(true)}
            data-testid="vault-start"
          >
            <KeyRound size={18} aria-hidden /> Start using private groups
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <LockSetup
            status={status}
            scope="all"
            demo={repo.mode === 'demo'}
            busy={busy ? 'passkey' : null}
            testId="vault-setup-status"
            onAction={(row) => {
              if (row === 'passkey') void addPasskey()
              else if (row === 'universal' && status.serverReady) setSetting(true)
            }}
          />
          {/* How the lock button works: background, so the Minimal look leaves it out. */}
          <Detail min={2}>
            <div className="card text-muted space-y-2 p-4 text-sm">
              <p>
                To open your private groups, tap and long-press your universal pattern on the lock button on the Groups screen, then pause. Face ID or your
                passkey comes up when it’s right. On a private group’s own lock it opens only that group.
              </p>
              <p>Nothing on screen shows the pattern going in, or that it was wrong.</p>
            </div>
          </Detail>
          <AllGroupsLockTime />
          <button type="button" className="btn w-full text-rose-700 dark:text-rose-300" disabled={busy} onClick={() => void askStop()} data-testid="vault-stop">
            Stop using private groups
          </button>
        </div>
      )}
      <SetPatternSheet
        open={setting}
        onClose={() => setSetting(false)}
        kind="universal"
        hasCurrent={!!status?.universal}
        ordered={status?.ordered !== false}
        save={async (pattern, ordered, current) => {
          if (pattern === null) return
          const auth = await passkeyProof(repo)
          await repo.vault({ op: 'setUniversal', pattern, ordered, current, auth })
          setSetting(false)
          setRound((r) => r + 1)
          toast(status?.off ? 'Private groups are on again' : status?.universal ? 'Universal pattern changed' : 'Universal pattern set')
        }}
      />
      <SetPatternSheet
        open={stopping}
        onClose={() => setStopping(false)}
        kind="universal"
        remove
        title="Stop using private groups"
        action="Stop"
        save={async (_p, _o, current) => stop(current)}
      />
    </SettingsPage>
  )
}
