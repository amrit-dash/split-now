import { useState } from 'react'
import { Lock } from 'lucide-react'
import type { Group } from '@/types'
import { PageHeader } from '@/components/Misc'
import { UnlockSheet } from './UnlockSheet'

/**
 * A private group that is locked on this device (docs/VAULT.md). The lock button opens it with the
 * person's universal pattern or the group's own one; either opens only this group from here.
 */
export function VaultLock({ group, back = '/groups' }: { group: Group; back?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <PageHeader title={group.name} back={back} />
      <div className="card flex flex-col items-center p-6 text-center" data-testid="vault-lock">
        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200" aria-hidden>
          <Lock size={26} />
        </div>
        <h2 className="mt-3 text-lg font-bold">Private group</h2>
        <p className="text-muted mt-1 text-sm">Locked on this phone. Unlock it with your pattern, then Face ID or your passkey.</p>
        <button type="button" className="btn-primary mt-5 w-full" onClick={() => setOpen(true)} data-testid="vault-unlock-open">
          <Lock size={18} aria-hidden /> Unlock
        </button>
      </div>
      <UnlockSheet open={open} onClose={() => setOpen(false)} groupId={group.id} />
    </>
  )
}
