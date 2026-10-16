import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Check, Fingerprint, KeyRound, Server, X } from 'lucide-react'
import { repo } from '@/data'
import { useFlag } from '@/hooks/useAppConfig'
import { errText } from '@/lib/errors'
import { setupLines, type VaultStatus } from '@/lib/vault-api'
import { useToast } from '@/components/Toast'
import { passkeyCancelled, passkeyProof, registerPasskey } from '@/features/vault/passkey'
import { SetPatternSheet } from '@/features/vault/SetPatternSheet'
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
 */
export default function Vault() {
  const on = useFlag('vaults')
  const toast = useToast()
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [setting, setSetting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [round, setRound] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: round reads the status again after a change.
  useEffect(() => {
    if (!on) return
    let live = true
    repo
      .vault<VaultStatus>({ op: 'status' })
      .then((s) => live && setStatus(s))
      .catch((e) => live && setFailed(errText(e)))
    return () => {
      live = false
    }
  }, [on, round])

  if (!on) return <Navigate to="/settings" replace />
  const lines = status && setupLines(status)

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
          <div className="card text-muted space-y-2 p-4 text-sm">
            <p>
              To open your private groups, tap and long-press your universal pattern on the lock button on the Groups screen, then pause. Face ID or your
              passkey comes up when it’s right. On a private group’s own lock it opens only that group.
            </p>
            <p>Nothing on screen shows the pattern going in, or that it was wrong. Phones that can buzz do, once per press and twice for a wrong one.</p>
            <p>Private groups lock again when you leave the app or after a few minutes without a tap.</p>
          </div>
        </div>
      )}
      <SetPatternSheet
        open={setting}
        onClose={() => setSetting(false)}
        kind="universal"
        ordered={status?.ordered !== false}
        save={async (pattern, ordered) => {
          const auth = await passkeyProof(repo)
          await repo.vault({ op: 'setUniversal', pattern, ordered, auth })
          setSetting(false)
          setRound((r) => r + 1)
          toast(status?.universal ? 'Universal pattern changed' : 'Universal pattern set')
        }}
      />
    </SettingsPage>
  )
}
