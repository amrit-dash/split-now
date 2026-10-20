import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Sparkles, X } from 'lucide-react'
import { useWhatsNew } from '@/hooks/useWhatsNew'
import { useSwipeDismiss } from '@/hooks/useSwipeDismiss'

/** Home shows itself first; the banner rises a moment later, so it reads as news, not as part of the page. */
const RISE_DELAY_MS = 1000

/**
 * "Updated to 8.7.3 · What's new", once after an update on this device (src/lib/whats-new.ts
 * updateBanner; the admin's flags.whatsNew turns it off). On Home only, it rises from behind the
 * tab bar into the floating lane above it, where the New version banner shows, a second after the
 * page has loaded; it never covers a form. It waits while the New version, install or capture
 * banner holds that spot (index.css). What's new opens Help → What's new; that, ✕ or a
 * sideways swipe closes it for good.
 */
export function WhatsNewBanner() {
  const { banner, closeBanner } = useWhatsNew()
  const { pathname } = useLocation()
  const [ready, setReady] = useState(false)
  const swipe = useSwipeDismiss(closeBanner)
  const home = pathname === '/'
  useEffect(() => {
    if (!banner || !home) return
    const t = setTimeout(() => setReady(true), RISE_DELAY_MS)
    return () => clearTimeout(t)
  }, [banner, home])
  if (!banner || !home || !ready) return null
  return (
    <div
      className="whats-new-banner animate-[rise_0.45s_cubic-bezier(0.2,0.9,0.3,1)] fixed inset-x-3 bottom-[var(--lane)] z-30 mx-auto max-w-md"
      role="status"
      data-testid="whats-new-banner"
    >
      <div
        {...swipe.bind}
        className="accent-live flex items-center gap-2.5 rounded-3xl bg-gradient-to-r from-fill to-fill-to py-2 pl-3 pr-1 text-on-fill shadow-xl shadow-brand-900/30 ring-1 ring-on-fill/20"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-on-fill/15">
          <Sparkles size={16} aria-hidden />
        </span>
        {/* Two short lines, so the version is never cut off on a narrow phone. */}
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-sm font-bold">Updated</span>
          <span className="block text-xs text-on-fill/85">to {banner.version}</span>
        </span>
        <Link
          to="/help?tab=new"
          onClick={closeBanner}
          className="flex min-h-10 shrink-0 items-center rounded-2xl bg-white px-3 text-sm font-bold text-brand-700 shadow"
          data-testid="whats-new-open"
        >
          What’s new
        </Link>
        <button
          type="button"
          onClick={closeBanner}
          className="-ml-2 flex h-10 w-8 shrink-0 items-center justify-center rounded-2xl text-on-fill/85"
          aria-label="Close"
          data-testid="whats-new-close"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
    </div>
  )
}
