import { useEffect, useState } from 'react'
import { KeyRound, Lock, Server } from 'lucide-react'
import { repo } from '@/data'
import type { Group } from '@/types'
import { errText } from '@/lib/errors'
import type { VaultStatus } from '@/lib/vault-api'
import { Sheet } from '@/components/Sheet'
import { useConfirm } from '@/components/ConfirmSheet'
import { useToast } from '@/components/Toast'
import { passkeyCancelled, passkeyProof } from './passkey'
import { SetPatternSheet } from './SetPatternSheet'

/**
 * Group ⋯ → Private group: whether its key is made, and its own pattern (optional: it opens only
 * this group, for anyone in it who knows it, even without a universal pattern). Anyone in the
 * group can set, change or remove it, after their passkey.
 */
export function PrivateGroupSheet({ group, open, onClose }: { group: Group; open: boolean; onClose: () => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [setting, setSetting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [round, setRound] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: round reads the status again after a change.
  useEffect(() => {
    if (!open) return
    let live = true
    setFailed(null)
    repo
      .vault<VaultStatus>({ op: 'status', groupId: group.id })
      .then((s) => live && setStatus(s))
      .catch((e) => live && setFailed(errText(e)))
    return () => {
      live = false
    }
  }, [open, group.id, round])

  const own = status?.group
  const save = async (pattern: string | null, ordered: boolean) => {
    const auth = await passkeyProof(repo)
    await repo.vault({ op: 'groupPattern', groupId: group.id, pattern, ordered, auth })
    setRound((r) => r + 1)
  }
  const remove = async () => {
    const ok = await confirm({
      title: 'Remove this group’s own pattern?',
      message: 'People in it open it with their universal pattern instead.',
      confirmLabel: 'Remove',
    })
    if (!ok) return
    setBusy(true)
    try {
      await save(null, true)
      toast('Group pattern removed')
    } catch (e) {
      if (!passkeyCancelled(e)) toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Sheet open={open && !setting} onClose={onClose} title="Private group" testId="vault-group-sheet">
        {failed ? (
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
            <button type="button" className="btn-primary mt-4 w-full" disabled={busy} onClick={() => setSetting(true)} data-testid="vault-group-pattern-set">
              <Lock size={18} aria-hidden /> {own?.hasPattern ? 'Change its pattern' : 'Give it its own pattern'}
            </button>
            {own?.hasPattern && (
              <button type="button" className="btn mt-2 w-full" disabled={busy} onClick={() => void remove()} data-testid="vault-group-pattern-remove">
                Remove its pattern
              </button>
            )}
          </>
        )}
      </Sheet>
      <SetPatternSheet
        open={setting}
        onClose={() => setSetting(false)}
        kind="group"
        ordered={own?.ordered !== false}
        save={async (p, o) => {
          await save(p, o)
          setSetting(false)
          toast('Group pattern saved. Tell the group in person.')
        }}
      />
    </>
  )
}
