import { Link } from 'react-router-dom'
import { KeyIcon } from '@/components/icons'
import { Sheet } from '@/components/Sheet'
import { setupPrompt } from '@/lib/vault-api'

/** For someone with no pattern set up yet, who pressed a private group's lock: where to set one (and, while private groups are off for them, to turn them on). */
export function SetupSheet({ open, onClose, inGroup, privateOn = true }: { open: boolean; onClose: () => void; inGroup?: boolean; privateOn?: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title="Set up encrypted groups" testId="vault-setup-prompt">
      <p className="text-sm">{setupPrompt(!!inGroup, privateOn)}</p>
      <Link to="/settings/vault" className="btn-primary mt-4 w-full" onClick={onClose} data-testid="vault-setup-link">
        <KeyIcon size={18} aria-hidden /> {privateOn ? 'Set up encrypted groups' : 'Turn on private groups'}
      </Link>
    </Sheet>
  )
}
