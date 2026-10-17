import { Link, useLocation } from 'react-router-dom'
import { Sparkles, X } from 'lucide-react'
import { useWhatsNew } from '@/hooks/useWhatsNew'

/**
 * "Updated to 8.3.4 · See what's new", once after an update on this device (src/lib/whats-new.ts
 * updateBanner; the admin's flags.whatsNew turns it off). It sits at the top of Home, so it never
 * covers a form; See what's new opens Help → What's new, and either closes it for good.
 */
export function WhatsNewBanner() {
  const { banner, closeBanner } = useWhatsNew()
  const { pathname } = useLocation()
  if (!banner || pathname !== '/') return null
  return (
    <div
      className="animate-pop mb-3 flex items-center gap-2 rounded-2xl bg-gradient-to-r from-fill to-fill-to p-2 pl-3 text-on-fill shadow-lg"
      role="status"
      data-testid="whats-new-banner"
    >
      <Sparkles size={16} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm font-bold">Updated to {banner.version}</span>
      <Link
        to="/help?tab=new"
        onClick={closeBanner}
        className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-bold text-brand-700 shadow"
        data-testid="whats-new-open"
      >
        See what’s new
      </Link>
      <button
        type="button"
        onClick={closeBanner}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-on-fill/85"
        aria-label="Close"
        data-testid="whats-new-close"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  )
}
