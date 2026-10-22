import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { HelpIcon, LockIcon } from '@/components/icons'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { useFlag } from '@/hooks/useAppConfig'
import { useGroups } from '@/hooks/data'
import { forgetPrivateStatus } from '@/hooks/usePrivateGroups'
import { errText } from '@/lib/errors'
import { stopPlan, vaultStatusFromCache, vaultStatusToCache, vaultView, type VaultStatus } from '@/lib/vault-api'
import { lockVault } from '@/lib/vault-keys'
import { useConfirm } from '@/components/ConfirmSheet'
import { useToast } from '@/components/Toast'
import { passkeyCancelled, passkeyProof, registerPasskey } from '@/features/vault/passkey'
import { SetPatternSheet } from '@/features/vault/SetPatternSheet'
import { AllGroupsLockTime } from '@/features/vault/LockTime'
import { LockSetup } from '@/features/vault/LockSetup'
import { SettingsPage } from './common'

/**
 * /settings/vault: private groups for this person (docs/VAULT.md). They start off: this screen
 * says so and turns them on (vault op `start`), after which the app offers to make them. On, it
 * shows what opens them: a passkey (Face ID, a fingerprint, the screen lock) and a universal
 * pattern of taps and long presses, which opens every private group they're in from the Groups
 * screen. "Stop using private groups" deletes both and turns them off again, once none they made
 * is left. Off or on, a private group someone else added them to opens with its own pattern.
 * Shown only while the `vaults` flag is on.
 */
export default function Vault() {
  const on = useFlag('vaults')
  const toast = useToast()
  const confirm = useConfirm()
  const { user } = useMe()
  const cacheKey = `sn-vault-status:${user.uid}`
  // The last answer, at once; the server's arrives a moment later and replaces it (vaultStatusFromCache).
  const [status, setStatus] = useState<VaultStatus | null>(() => {
    try {
      return vaultStatusFromCache(localStorage.getItem(cacheKey))
    } catch {
      return null
    }
  })
  const [failed, setFailed] = useState<string | null>(null)
  const [setting, setSetting] = useState(false)
  // the current pattern, asked before stopping
  const [stopping, setStopping] = useState(false)
  const [busy, setBusy] = useState(false)
  const [round, setRound] = useState(0)
  const inPrivate = !!useGroups()?.some((g) => g.vault)

  // biome-ignore lint/correctness/useExhaustiveDependencies: round reads the status again after a change.
  useEffect(() => {
    if (!on) return
    let live = true
    repo
      .vault<VaultStatus>({ op: 'status' })
      .then((s) => {
        if (!live) return
        setStatus(s)
        try {
          localStorage.setItem(cacheKey, vaultStatusToCache(s))
        } catch {
          /* private window: asked fresh next time */
        }
      })
      // A cached answer stays on screen when the refresh fails; only with nothing to show is it an error.
      .catch((e) => live && !status && setFailed(errText(e)))
    return () => {
      live = false
    }
  }, [on, round, cacheKey])

  if (!on) return <Navigate to="/settings" replace />

  const view = status ? vaultView(status) : null

  const stop = async (current?: string) => {
    const auth = current === undefined ? undefined : await passkeyProof(repo)
    await repo.vault({ op: 'stop', current, auth })
    lockVault()
    forgetPrivateStatus()
    setStopping(false)
    setRound((r) => r + 1)
    toast('You’ve stopped using private groups')
  }
  const askStop = async () => {
    if (!status) return
    // How many private groups they made: counted only here, where it matters (it reads every group they're in).
    let made: VaultStatus
    setBusy(true)
    try {
      made = await repo.vault<VaultStatus>({ op: 'status', made: true })
    } catch (e) {
      return toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
    if (stopPlan(made) === 'made') {
      const n = made.made ?? 0
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

  const turnOn = async () => {
    setBusy(true)
    try {
      await repo.vault({ op: 'start' })
      forgetPrivateStatus()
      setRound((r) => r + 1)
      toast('Private groups are on')
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
    <SettingsPage
      title="Encrypted groups"
      subtitle={{ full: 'What opens your private groups', short: 'Passkey and pattern', tier: 'help' }}
      right={
        // How private groups work lives in Help; its back button returns here.
        <Link
          to="/help/private-groups"
          className="flex h-11 w-11 items-center justify-center rounded-full text-slate-700 hover:bg-slate-200/60 dark:text-slate-200 dark:hover:bg-ink-800"
          aria-label="How private groups work"
          data-testid="vault-help"
        >
          <HelpIcon size={22} />
        </Link>
      }
    >
      {failed ? (
        <p className="card text-muted p-4 text-sm" role="status">
          {failed}
        </p>
      ) : !status ? (
        <p className="card text-muted p-4 text-sm">Checking…</p>
      ) : view !== 'on' ? (
        <div className="space-y-4" data-testid="vault-off" data-view={view}>
          <div className="card space-y-2 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <LockIcon size={16} aria-hidden /> Private groups are off
            </p>
            {view === 'stopped' ? (
              <p className="text-muted" data-testid="vault-stopped">
                You stopped using private groups, so the app doesn’t offer to make one.
              </p>
            ) : (
              <p className="text-muted">Turn them on to make a group whose words and photos are encrypted.</p>
            )}
          </div>
          <button type="button" className="btn-primary w-full" disabled={busy || !status.serverReady} onClick={() => void turnOn()} data-testid="vault-turn-on">
            <LockIcon size={18} aria-hidden /> Turn on private groups
          </button>
          {!status.serverReady && (
            <p className="text-muted px-1 text-xs" role="status">
              The server isn’t set up for private groups yet.
            </p>
          )}
          {/* When private groups someone else made lock again: only for someone in one. */}
          {inPrivate && <AllGroupsLockTime />}
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
          toast(status?.universal ? 'Universal pattern changed' : 'Universal pattern set')
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
