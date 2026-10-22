import { useState, useSyncExternalStore } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { RowUpdateIcon } from '@/components/icons'
import { applyUpdate, getUpdate, profileRowShown, subscribeUpdate } from '@/lib/app-update'
import { RowTile } from '@/components/RowTile'

/**
 * Profile's "New version ready" row: while a new version is downloaded and waiting, even after
 * Later on the banner. Tapping it reloads into the new version (the banner's own handshake).
 */
export function UpdateRow() {
  const s = useSyncExternalStore(subscribeUpdate, getUpdate, getUpdate)
  const [updating, setUpdating] = useState(false)
  if (!profileRowShown(s)) return null
  return (
    <button
      type="button"
      disabled={updating}
      onClick={() => {
        setUpdating(true)
        applyUpdate()
      }}
      className="flex w-full items-center gap-3 p-4 text-left font-medium transition active:bg-slate-50 dark:active:bg-ink-800"
      data-testid="profile-update"
    >
      <RowTile>{updating ? <Loader2 size={19} className="animate-spin" /> : <RowUpdateIcon size={22} />}</RowTile>
      <span className="min-w-0 flex-1">
        <span className="block">New version ready</span>
        <span className="text-muted block text-xs font-normal">Tap to update now. It also updates the next time the app opens.</span>
      </span>
      <ChevronRight size={18} className="text-slate-400" aria-hidden />
    </button>
  )
}
