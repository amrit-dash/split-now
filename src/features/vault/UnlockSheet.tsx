import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { repo } from '@/data'
import { errText } from '@/lib/errors'
import { refusalWords, unlockMode, untilWords, vaultRefusal, type UnlockStarted, type VaultStatus } from '@/lib/vault-api'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { BlindPad } from './BlindPad'
import { finishUnlock, passkeyCancelled } from './passkey'

/**
 * Opening private groups (docs/VAULT.md). Without `groupId` (the Groups screen) the universal
 * pattern opens every private group the person is in; with it (inside one group) the universal
 * pattern or that group's own pattern opens only that group. The pattern goes in on the blind pad;
 * the passkey is asked for only after the server says the pattern is right.
 */
export function UnlockSheet({ open, onClose, groupId }: { open: boolean; onClose: () => void; groupId?: string }) {
  const toast = useToast()
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!open) return
    let live = true
    setStatus(null)
    setFailed(null)
    setNote(null)
    repo
      .vault<VaultStatus>(groupId ? { op: 'status', groupId } : { op: 'status' })
      .then((s) => live && setStatus(s))
      .catch((e) => live && setFailed(errText(e)))
    return () => {
      live = false
    }
  }, [open, groupId])
  // A lockout's countdown; the pad comes back by itself when it ends.
  useEffect(() => {
    if (!open || !status?.lockedUntil) return
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [open, status?.lockedUntil])

  const mode = unlockMode(status, now, !!failed)

  const tryPattern = async (pattern: string) => {
    setBusy(true)
    setNote(null)
    try {
      const started = await repo.vault<UnlockStarted>(groupId ? { op: 'unlockStart', pattern, groupId } : { op: 'unlockStart', pattern })
      const n = await finishUnlock(repo, started)
      toast(groupId ? 'Unlocked' : n === 0 ? 'No private groups to open' : `${n} private ${n === 1 ? 'group' : 'groups'} unlocked`)
      onClose()
    } catch (e) {
      if (passkeyCancelled(e)) setNote('Face ID or your passkey is needed to open it.')
      else {
        const r = vaultRefusal(e)
        if (r.lockedUntil) setStatus((s) => (s ? { ...s, triesLeft: 0, lockedUntil: r.lockedUntil } : s))
        else if (r.triesLeft !== undefined) setStatus((s) => (s ? { ...s, triesLeft: r.triesLeft as number } : s))
        setNow(Date.now())
        setNote(refusalWords(r, Date.now(), errText(e)))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={groupId ? 'Unlock this group' : 'Unlock private groups'} testId="vault-unlock">
      {mode === 'loading' && <p className="text-muted py-10 text-center text-sm">Checking…</p>}
      {mode === 'unavailable' && (
        <p className="text-muted py-6 text-center text-sm" role="status">
          {failed ?? 'Private groups aren’t set up on this server yet.'}
        </p>
      )}
      {mode === 'setup' && (
        <div className="py-4 text-center" data-testid="vault-setup-prompt">
          <p className="text-sm">
            {groupId
              ? 'Set your universal pattern to open private groups. Someone in the group can also give it its own pattern.'
              : 'Set your universal pattern first. It opens every private group you’re in.'}
          </p>
          <Link to="/settings/vault" className="btn-primary mt-4 w-full" onClick={onClose} data-testid="vault-setup-link">
            <KeyRound size={18} aria-hidden /> Set up encrypted groups
          </Link>
        </div>
      )}
      {mode === 'lockedOut' && status?.lockedUntil && (
        <p className="neg py-6 text-center text-sm" role="status">
          Too many wrong patterns. Try again {untilWords(status.lockedUntil, now)}.
        </p>
      )}
      {mode === 'unlock' && (
        <div className="pb-2">
          <p className="text-muted mb-5 text-center text-sm">
            {groupId
              ? status?.universal && status.group?.hasPattern
                ? 'Your universal pattern or this group’s own.'
                : status?.universal
                  ? 'Your universal pattern.'
                  : 'This group’s own pattern.'
              : 'Your universal pattern opens every private group you’re in.'}
          </p>
          <BlindPad onPattern={(p) => void tryPattern(p)} disabled={busy} />
          <p className="mt-4 min-h-5 text-center text-sm" role="status" data-testid="vault-note">
            {note}
          </p>
        </div>
      )}
    </Sheet>
  )
}
