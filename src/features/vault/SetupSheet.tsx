import { Link } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { Sheet } from '@/components/Sheet'

/** For someone with no pattern set up yet, who pressed a private group's lock: where to set one. */
export function SetupSheet({ open, onClose, inGroup }: { open: boolean; onClose: () => void; inGroup?: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title="Set up encrypted groups" testId="vault-setup-prompt">
      <p className="text-sm">
        {inGroup
          ? 'Set your universal pattern to open private groups. Someone in the group can also give it its own pattern.'
          : 'Set your universal pattern first. It opens every private group you’re in.'}
      </p>
      <Link to="/settings/vault" className="btn-primary mt-4 w-full" onClick={onClose} data-testid="vault-setup-link">
        <KeyRound size={18} aria-hidden /> Set up encrypted groups
      </Link>
    </Sheet>
  )
}
