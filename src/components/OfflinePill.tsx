import { WifiOff } from 'lucide-react'
import { useOnline } from '@/hooks/useOnline'

/**
 * A slim "Offline" notice for screens that write or fetch. Saves still work offline (they sync
 * later), so the default text says so; pass `text` where a screen really needs the network.
 */
export function OfflinePill({ text = 'Offline — changes will sync when you’re back', className = '' }: { text?: string; className?: string }) {
  const online = useOnline()
  if (online) return null
  return (
    <div role="status" data-testid="offline-pill" className={`mb-3 flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 dark:bg-amber-500/10 dark:text-amber-200 ${className}`}>
      <WifiOff size={14} aria-hidden className="shrink-0" /> {text}
    </div>
  )
}
