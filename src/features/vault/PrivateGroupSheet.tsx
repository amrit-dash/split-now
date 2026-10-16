import { useEffect, useState } from 'react'
import { KeyRound, Lock, LockOpen, Server } from 'lucide-react'
import { Link } from 'react-router-dom'
import { repo } from '@/data'
import type { Group } from '@/types'
import { errText } from '@/lib/errors'
import type { VaultStatus } from '@/lib/vault-api'
import { Sheet } from '@/components/Sheet'
import { useConfirm } from '@/components/ConfirmSheet'
import { useToast } from '@/components/Toast'
import { vaultKey } from '@/lib/vault-crypto'
import { lockVault, setVaultKey } from '@/lib/vault-keys'
import { passkeyCancelled, passkeyProof } from './passkey'
import { GroupLockTime } from './LockTime'
import { SetPatternSheet } from './SetPatternSheet'

/**
 * Group ⋯ → Private group: whether its key is made, and its own pattern (optional: it opens only
 * this group, for anyone in it who knows it, even without a universal pattern). Anyone in the
 * group can set, change or remove it, after their passkey. Its creator also turns private on for
 * an existing group, or off again (vault op `convert`, which seals or opens everything in it on
 * the server and tells everyone).
 */
export function PrivateGroupSheet({ group, open, onClose, isCreator }: { group: Group; open: boolean; onClose: () => void; isCreator: boolean }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  // the pattern sheet: setting or changing its own pattern, or removing it
  const [setting, setSetting] = useState<'set' | 'remove' | null>(null)
  const [busy, setBusy] = useState(false)
  const [round, setRound] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: round reads the status again after a change.
  useEffect(() => {
    if (!open) return
    let live = true
    setFailed(null)
    repo
      .vault<VaultStatus>(group.vault ? { op: 'status', groupId: group.id } : { op: 'status' })
      .then((s) => live && setStatus(s))
      .catch((e) => live && setFailed(errText(e)))
    return () => {
      live = false
    }
  }, [open, group.id, round])

  const own = status?.group
  const save = async (pattern: string | null, ordered: boolean, current = '') => {
    const auth = await passkeyProof(repo)
    await repo.vault({ op: 'groupPattern', groupId: group.id, pattern, ordered, current, auth })
    setRound((r) => r + 1)
  }
  const remove = async () => {
    const ok = await confirm({
      title: 'Remove this group’s own pattern?',
      message: 'People in it open it with their universal pattern instead.',
      confirmLabel: 'Remove',
    })
    if (ok) setSetting('remove')
  }

  const convert = async (on: boolean) => {
    const ok = await confirm(
      on
        ? {
            title: 'Make this group private?',
            message:
              'Its name, people’s names, expenses, notes, comments and chat are encrypted, and it opens with each person’s pattern. Everyone in it is told.',
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
    setBusy(true)
    try {
      const auth = await passkeyProof(repo)
      const r = await repo.vault<{ dek?: string }>({ op: 'convert', groupId: group.id, on, auth })
      if (on && r.dek) setVaultKey(await vaultKey(group.id, r.dek))
      if (!on) lockVault(group.id)
      toast(on ? 'This group is private now' : 'Private is off for this group')
      onClose()
    } catch (e) {
      if (!passkeyCancelled(e)) toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Sheet open={open && !setting} onClose={onClose} title="Private group" testId="vault-group-sheet">
        {!group.vault ? (
          // Not private yet: only its creator gets here (GroupDetail's menu).
          !status && !failed ? (
            <p className="text-muted py-6 text-center text-sm">Checking…</p>
          ) : !status?.universal ? (
            <div className="py-2 text-sm" data-testid="vault-convert-setup">
              <p>Set your universal pattern first: it opens the group once it’s private.</p>
              <Link to="/settings/vault" className="btn-primary mt-4 w-full" onClick={onClose}>
                <KeyRound size={18} aria-hidden /> Set up encrypted groups
              </Link>
            </div>
          ) : (
            <div className="text-sm">
              <p>
                Encrypt this group: its name, people’s names, expenses, notes, comments and chat. While it’s locked, no one sees what’s in it, here or on the
                server.
              </p>
              <button type="button" className="btn-primary mt-4 w-full" disabled={busy} onClick={() => void convert(true)} data-testid="vault-convert-on">
                <Lock size={18} aria-hidden /> {busy ? 'Encrypting…' : 'Make this group private'}
              </button>
            </div>
          )
        ) : failed ? (
          <p className="text-muted py-6 text-center text-sm" role="status">
            {failed}
          </p>
        ) : !status ? (
          <p className="text-muted py-6 text-center text-sm">Checking…</p>
        ) : (
          <>
            <ul className="card divide-y divide-slate-100 overflow-hidden text-sm dark:divide-white/5" data-testid="vault-group-status">
              <li className="flex min-h-12 items-center gap-3 px-4 py-2">
                <Server size={18} className="text-muted shrink-0" aria-hidden />
                <span>{own?.keyReady ? 'Encryption key ready on the server' : 'Its key is made the first time it’s opened'}</span>
              </li>
              <li className="flex min-h-12 items-center gap-3 px-4 py-2">
                <KeyRound size={18} className="text-muted shrink-0" aria-hidden />
                <span data-testid="vault-group-pattern-line">
                  {own?.hasPattern
                    ? `Own pattern set · ${own.ordered === false ? 'any order' : 'in order'}`
                    : 'No own pattern: opens with each person’s universal pattern'}
                </span>
              </li>
            </ul>
            <p className="text-muted mt-3 px-1 text-xs">A group’s own pattern opens only this group, for anyone in it who knows it. Tell people in person.</p>
            <div className="card mt-3 p-4">
              <GroupLockTime groupId={group.id} />
            </div>
            <button type="button" className="btn-primary mt-4 w-full" disabled={busy} onClick={() => setSetting('set')} data-testid="vault-group-pattern-set">
              <Lock size={18} aria-hidden /> {own?.hasPattern ? 'Change its pattern' : 'Give it its own pattern'}
            </button>
            {own?.hasPattern && (
              <button type="button" className="btn mt-2 w-full" disabled={busy} onClick={() => void remove()} data-testid="vault-group-pattern-remove">
                Remove its pattern
              </button>
            )}
            {isCreator && (
              <button type="button" className="btn mt-2 w-full" disabled={busy} onClick={() => void convert(false)} data-testid="vault-convert-off">
                <LockOpen size={18} aria-hidden /> {busy ? 'Decrypting…' : 'Turn off private'}
              </button>
            )}
          </>
        )}
      </Sheet>
      <SetPatternSheet
        open={!!setting}
        onClose={() => setSetting(null)}
        kind="group"
        remove={setting === 'remove'}
        ordered={own?.ordered !== false}
        save={async (p, o, current) => {
          await save(p, o, current)
          setSetting(null)
          toast(p === null ? 'Group pattern removed' : 'Group pattern saved. Tell the group in person.')
        }}
      />
    </>
  )
}
