import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Lock, LockOpen } from 'lucide-react'
import { repo } from '@/data'
import type { Group } from '@/types'
import { usePrivateGroups } from '@/hooks/usePrivateGroups'
import { errText } from '@/lib/errors'
import { suggestTurningOn, type VaultStatus } from '@/lib/vault-api'
import { type OpensWith, defaultOpensWith, privateBlocker } from '@/lib/vault-setup'
import { Sheet } from '@/components/Sheet'
import { useConfirm } from '@/components/ConfirmSheet'
import { useToast } from '@/components/Toast'
import { vaultKey } from '@/lib/vault-crypto'
import { lockVault, setVaultKey } from '@/lib/vault-keys'
import { passkeyCancelled, passkeyProof, registerPasskey } from './passkey'
import { GroupLockTime } from './LockTime'
import { LockSetup } from './LockSetup'
import { SetPatternSheet } from './SetPatternSheet'

/**
 * Group ⋯ → Private group, with the same setup card as Settings → Encrypted groups (LockSetup):
 * the passkey, what it opens with (everyone's universal pattern, or its own, shared in person) and
 * its key. Not private yet, its creator chooses those here and makes it private (vault op
 * `convert`, which seals everything in it on the server and tells everyone): it can't be made
 * private without a pattern to open it. Private, anyone in it can give it its own pattern, change
 * it or remove it, after their passkey; its creator can also turn private off.
 */
export function PrivateGroupSheet({ group, open, onClose, isCreator }: { group: Group; open: boolean; onClose: () => void; isCreator: boolean }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  // the server's own-pattern sheet (private groups): setting or changing it, or removing it
  const [setting, setSetting] = useState<'set' | 'remove' | null>(null)
  // making it private: what it will open with, and its own pattern chosen here (sent with `convert`)
  const [opensWith, setOpensWith] = useState<OpensWith>('universal')
  const [draftOwn, setDraftOwn] = useState<{ pattern: string; ordered: boolean } | null>(null)
  const [choosingOwn, setChoosingOwn] = useState(false)
  const [settingUniversal, setSettingUniversal] = useState(false)
  const [busy, setBusy] = useState<'passkey' | 'convert' | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [round, setRound] = useState(0)
  // In a private group someone else added them to, with private groups off: a quiet way to turn them on.
  const vaults = usePrivateGroups()

  // biome-ignore lint/correctness/useExhaustiveDependencies: round reads the status again after a change.
  useEffect(() => {
    if (!open) return
    let live = true
    setFailed(null)
    setNote(null)
    repo
      .vault<VaultStatus>(group.vault ? { op: 'status', groupId: group.id } : { op: 'status' })
      .then((s) => {
        if (!live) return
        setStatus(s)
        if (!group.vault && round === 0) setOpensWith(defaultOpensWith(s, { set: false }))
      })
      .catch((e) => live && setFailed(errText(e)))
    return () => {
      live = false
    }
  }, [open, group.id, round])

  const demo = repo.mode === 'demo'
  const own = status?.group
  // A private group opens with its own pattern while it has one; else with everyone's universal one.
  const current: OpensWith = group.vault ? (own?.hasPattern ? 'own' : 'universal') : opensWith
  const ownState = group.vault ? { set: !!own?.hasPattern, ordered: own?.ordered } : { set: !!draftOwn, ordered: draftOwn?.ordered }

  const saveOwn = async (pattern: string | null, ordered: boolean, currentPattern = '') => {
    const auth = await passkeyProof(repo)
    await repo.vault({ op: 'groupPattern', groupId: group.id, pattern, ordered, current: currentPattern, auth })
    setRound((r) => r + 1)
  }
  const askRemove = async () => {
    // Without its own pattern it opens with universal patterns only (the server refuses this too).
    if (!status?.universal) return setNote('Set your universal pattern first: without its own pattern, that’s what opens it.')
    const ok = await confirm({
      title: 'Remove this group’s own pattern?',
      message: 'People in it open it with their universal pattern instead.',
      confirmLabel: 'Remove',
    })
    if (ok) setSetting('remove')
  }
  const addPasskey = async () => {
    setBusy('passkey')
    try {
      await registerPasskey(repo)
      toast('Passkey added')
      setRound((r) => r + 1)
    } catch (e) {
      if (!passkeyCancelled(e)) toast(errText(e), 'err')
    } finally {
      setBusy(null)
    }
  }

  const convert = async (on: boolean) => {
    if (on && status) {
      const blocked = privateBlocker(status, { opensWith, own: { set: !!draftOwn }, demo })
      if (blocked) return setNote(blocked)
    }
    const ok = await confirm(
      on
        ? {
            title: 'Make this group private?',
            message:
              opensWith === 'own'
                ? 'Its name, people’s names, expenses, notes, comments and chat are encrypted. It opens with its own pattern: tell it to people in person. Everyone in it is told.'
                : 'Its name, people’s names, expenses, notes, comments and chat are encrypted, and it opens with each person’s universal pattern. Everyone in it is told.',
            confirmLabel: 'Make private',
          }
        : {
            title: 'Turn off private?',
            message: 'Everything in it is decrypted and stored readable again, and it no longer needs a pattern. Everyone in it is told.',
            confirmLabel: 'Turn off',
            tone: 'danger',
          },
    )
    if (!ok) return
    setBusy('convert')
    try {
      const auth = await passkeyProof(repo)
      const withOwn = on && opensWith === 'own' && draftOwn ? { pattern: draftOwn.pattern, ordered: draftOwn.ordered } : {}
      const r = await repo.vault<{ dek?: string }>({ op: 'convert', groupId: group.id, on, ...withOwn, auth })
      if (on && r.dek) setVaultKey(await vaultKey(group.id, r.dek))
      if (!on) lockVault(group.id)
      toast(
        on
          ? withOwn.pattern
            ? 'This group is private now. Tell people its pattern in person.'
            : 'This group is private now'
          : 'Private is off for this group',
      )
      setDraftOwn(null)
      onClose()
    } catch (e) {
      if (!passkeyCancelled(e)) toast(errText(e), 'err')
    } finally {
      setBusy(null)
    }
  }

  const onAction = (row: 'passkey' | 'universal' | 'own' | 'server', action: 'add' | 'set' | 'change' | 'remove') => {
    setNote(null)
    if (row === 'passkey') return void addPasskey()
    if (row === 'universal') return setSettingUniversal(true)
    if (row !== 'own') return
    if (group.vault) return action === 'remove' ? void askRemove() : setSetting('set')
    return action === 'remove' ? setDraftOwn(null) : setChoosingOwn(true)
  }
  // Switching what a private group opens with is setting or removing its own pattern.
  const onOpensWith = (v: OpensWith) => {
    setNote(null)
    if (!group.vault) return setOpensWith(v)
    if (v === current) return
    if (v === 'own') setSetting('set')
    else void askRemove()
  }
  const blocked = !group.vault && status ? privateBlocker(status, { opensWith, own: { set: !!draftOwn }, demo }) : null

  return (
    <>
      <Sheet open={open && !setting && !choosingOwn && !settingUniversal} onClose={onClose} title="Private group" testId="vault-group-sheet">
        {failed ? (
          <p className="text-muted py-6 text-center text-sm" role="status">
            {failed}
          </p>
        ) : !status ? (
          <p className="text-muted py-6 text-center text-sm">Checking…</p>
        ) : (
          <div className="space-y-4" data-testid={group.vault ? 'vault-group-status' : 'vault-convert-setup'}>
            {!group.vault && (
              <p className="text-sm">
                Encrypt this group: its name, people’s names, expenses, notes, comments and chat. While it’s locked, no one sees what’s in it, here or on the
                server. Choose what opens it first.
              </p>
            )}
            <LockSetup
              status={status}
              scope="group"
              opensWith={current}
              onOpensWith={onOpensWith}
              own={ownState}
              keyReady={own?.keyReady}
              demo={demo}
              busy={busy === 'passkey' ? 'passkey' : null}
              onAction={onAction}
            />
            {group.vault && (
              <div className="card p-4">
                <GroupLockTime groupId={group.id} />
              </div>
            )}
            {suggestTurningOn(!!group.vault, vaults.on, vaults.stopped) && (
              <div className="card text-muted space-y-3 p-4 text-sm" data-testid="vault-suggest-on">
                <p>
                  Private groups are off for you, so the app doesn’t offer to make your own. A private group you’re added to opens with its own pattern and your
                  passkey. Turn them on to set a universal pattern that opens them all.
                </p>
                <Link to="/settings/vault" className="btn w-full" onClick={onClose} data-testid="vault-suggest-on-link">
                  <Lock size={18} aria-hidden /> Turn on private groups
                </Link>
              </div>
            )}
            {(note ?? blocked) && (
              <p className="px-1 text-sm" role="status" data-testid="vault-convert-note">
                {note ?? blocked}
              </p>
            )}
            {!group.vault ? (
              <button
                type="button"
                className="btn-primary w-full"
                disabled={!!busy || !!blocked}
                onClick={() => void convert(true)}
                data-testid="vault-convert-on"
              >
                <Lock size={18} aria-hidden /> {busy === 'convert' ? 'Encrypting…' : 'Make this group private'}
              </button>
            ) : (
              isCreator && (
                <button type="button" className="btn w-full" disabled={!!busy} onClick={() => void convert(false)} data-testid="vault-convert-off">
                  <LockOpen size={18} aria-hidden /> {busy === 'convert' ? 'Decrypting…' : 'Turn off private'}
                </button>
              )
            )}
          </div>
        )}
      </Sheet>
      {/* A private group's own pattern, on the server (it asks a pattern that opens it first). */}
      <SetPatternSheet
        open={!!setting}
        onClose={() => setSetting(null)}
        kind="group"
        remove={setting === 'remove'}
        ordered={own?.ordered !== false}
        save={async (p, o, cur) => {
          await saveOwn(p, o, cur)
          setSetting(null)
          toast(p === null ? 'Group pattern removed' : 'Group pattern saved. Tell the group in person.')
        }}
      />
      {/* Its own pattern for making it private: kept here until `convert` sends it. */}
      <SetPatternSheet
        open={choosingOwn}
        onClose={() => setChoosingOwn(false)}
        kind="group"
        fresh
        save={async (p, o) => {
          if (p !== null) setDraftOwn({ pattern: p, ordered: o })
          setChoosingOwn(false)
        }}
      />
      <SetPatternSheet
        open={settingUniversal}
        onClose={() => setSettingUniversal(false)}
        kind="universal"
        hasCurrent={!!status?.universal}
        ordered={status?.ordered !== false}
        save={async (p, o, cur) => {
          if (p === null) return
          const auth = await passkeyProof(repo)
          await repo.vault({ op: 'setUniversal', pattern: p, ordered: o, current: cur, auth })
          setSettingUniversal(false)
          setRound((r) => r + 1)
          toast(status?.universal ? 'Universal pattern changed' : 'Universal pattern set')
        }}
      />
    </>
  )
}
