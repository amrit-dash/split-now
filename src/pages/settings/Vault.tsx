import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Check, Fingerprint, KeyRound, Server, X } from 'lucide-react'
import { repo } from '@/data'
import { useFlag } from '@/hooks/useAppConfig'
import { errText } from '@/lib/errors'
import { setupLines, stopPlan, type VaultStatus } from '@/lib/vault-api'
import { lockVault } from '@/lib/vault-keys'
import { useConfirm } from '@/components/ConfirmSheet'
import { useToast } from '@/components/Toast'
import { passkeyCancelled, passkeyProof, registerPasskey } from '@/features/vault/passkey'
import { SetPatternSheet } from '@/features/vault/SetPatternSheet'
import { AllGroupsLockTime } from '@/features/vault/LockTime'
import { Detail } from '@/components/Hint'
import { SettingsPage } from './common'

function Line({ ok, icon, text, testId }: { ok: boolean; icon: React.ReactNode; text: string; testId: string }) {
  return (
    <li className="flex min-h-12 items-center gap-3 px-4 py-2" data-testid={testId}>
      <span className="text-muted shrink-0" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-sm">{text}</span>
      {ok ? <Check size={18} className="pos shrink-0" aria-label="Done" /> : <X size={18} className="text-muted shrink-0" aria-label="Not yet" />}
    </li>
  )
}

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
  const lines = status && setupLines(status)

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
      ) : !status || !lines ? (
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
          <ul className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5" data-testid="vault-setup-status">
            <Line
              ok={status.hasPasskey}
              icon={<Fingerprint size={18} />}
              text={repo.mode === 'demo' ? 'Passkey: not needed in the demo' : lines.passkey}
              testId="vault-line-passkey"
            />
            <Line ok={status.universal} icon={<KeyRound size={18} />} text={lines.pattern} testId="vault-line-pattern" />
            <Line ok={status.serverReady} icon={<Server size={18} />} text={lines.server} testId="vault-line-server" />
          </ul>
          {!status.hasPasskey && (
            <button type="button" className="btn w-full" disabled={busy} onClick={() => void addPasskey()} data-testid="vault-add-passkey">
              <Fingerprint size={18} aria-hidden /> Add a passkey
            </button>
          )}
          <button
            type="button"
            className="btn-primary w-full"
            disabled={busy || !status.serverReady}
            onClick={() => setSetting(true)}
            data-testid="vault-universal-open"
          >
            <KeyRound size={18} aria-hidden /> {status.universal ? 'Change universal pattern' : 'Set universal pattern'}
          </button>
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
