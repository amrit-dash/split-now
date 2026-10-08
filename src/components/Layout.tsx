import { Suspense, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, Home, Plus, User, Users } from 'lucide-react'
import { useAllGroupData } from '@/hooks/data'
import { useInbox } from '@/hooks/useInbox'
import { applyIconTint } from '@/lib/accent'
import { setBadge } from '@/lib/push'
import { InstallBanner } from './InstallBanner'
import { Aurora } from './Aurora'
import { CaptureAlert } from './CaptureAlert'
import { CreateSheet } from './CreateSheet'
import { OfflinePill } from './OfflinePill'
import { Loading } from './Misc'

const tabs = [
  { to: '/', icon: Home, label: 'Home', end: true },
  { to: '/groups', icon: Users, label: 'Groups' },
  null,
  { to: '/insights', icon: BarChart3, label: 'Insights' },
  { to: '/profile', icon: User, label: 'Profile' },
] as const

export function Layout() {
  const loc = useLocation()
  const groupMatch = loc.pathname.match(/^\/groups\/([^/]+)/)
  const groupId = groupMatch && groupMatch[1] !== 'new' && groupMatch[1] !== 'import' ? groupMatch[1] : undefined
  const [creating, setCreating] = useState(false)
  const main = useRef<HTMLElement>(null)
  // Lets fixed banners (UpdatePrompt) and the toast stack sit above the tab bar only on screens that have one.
  useEffect(() => {
    document.documentElement.setAttribute('data-nav', '')
    return () => document.documentElement.removeAttribute('data-nav')
  }, [])
  // The browser-tab icon follows the accent (desktop); a no-op on phones.
  useEffect(() => {
    void applyIconTint()
  }, [])
  // Route change: move focus to the new screen's content unless the screen already placed it
  // (an autofocused field), so screen readers start at the top instead of on a gone element.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on every route change by design
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = main.current,
        active = document.activeElement
      if (!el || (active && active !== document.body && el.contains(active))) return
      el.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(id)
  }, [loc.pathname])
  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-4 pb-[calc(var(--nav-h)+1.5rem)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-brand-600 focus:px-4 focus:py-2 focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      {/* The fallback sits inside the content area, so the tab bar never disappears while a screen loads. */}
      <main id="main" ref={main} tabIndex={-1} className="outline-none">
        <OfflinePill className="mt-2" />
        <Suspense fallback={<Loading />}>
          <Outlet />
        </Suspense>
      </main>
      <AppBadge />
      <InstallBanner />
      <CaptureAlert />
      <nav className="fixed inset-x-0 bottom-0 z-40" aria-label="Main">
        {/* The bar, with a round notch cut out for the + button (mask in index.css). */}
        <div
          aria-hidden
          className="nav-notch absolute inset-0 border-t border-slate-200/70 bg-white/85 backdrop-blur-xl dark:border-white/5 dark:bg-ink-900/85"
        />
        <div aria-hidden className="nav-notch-glass absolute left-1/2 top-0 h-12 w-28 -translate-x-1/2 bg-white/30 backdrop-blur-md dark:bg-ink-900/30" />
        <div className="relative mx-auto flex max-w-2xl items-center justify-around px-2 pb-[var(--nav-pad)] pt-1.5">
          {tabs.map((t) =>
            t === null ? (
              <div key="create" className="relative w-16 self-stretch">
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  data-testid="nav-create"
                  className="absolute left-1/2 top-0 flex h-[3.75rem] w-[3.75rem] -translate-x-1/2 -translate-y-[45%] items-center justify-center overflow-hidden rounded-full text-white shadow-xl shadow-brand-600/40 ring-1 ring-white/25 transition active:scale-95"
                  aria-label="Create"
                  aria-haspopup="dialog"
                >
                  <Aurora size="fab" />
                  <Plus size={28} strokeWidth={2.6} className="relative" aria-hidden />
                </button>
              </div>
            ) : (
              <NavLink
                key={t.to}
                to={t.to}
                end={'end' in t}
                className={({ isActive }) =>
                  `group flex w-16 flex-col items-center gap-0.5 py-0.5 text-xs font-semibold transition ${isActive ? 'text-brand-800 dark:text-brand-200' : 'text-muted'}`
                }
              >
                {/* Active tab: icon on a pill in a deeper theme shade. */}
                <span
                  className="flex h-7 w-12 items-center justify-center rounded-full transition-colors group-aria-[current=page]:bg-brand-100 group-aria-[current=page]:text-brand-700 dark:group-aria-[current=page]:bg-brand-500/25 dark:group-aria-[current=page]:text-brand-200"
                  aria-hidden
                >
                  <t.icon size={22} strokeWidth={2.2} />
                </span>
                {t.label}
              </NavLink>
            ),
          )}
        </div>
      </nav>
      <CreateSheet open={creating} onClose={() => setCreating(false)} groupId={groupId} />
    </div>
  )
}

/**
 * The installed app's icon badge = things that need you (captured payments to sort + expenses
 * waiting for your OK), never unread activity, so the number stays honest. One subscription for
 * the whole app; the group store is shared with Home, so this costs no extra listeners.
 */
function AppBadge() {
  const data = useAllGroupData()
  const box = useInbox(data)
  useEffect(() => {
    if (!box.loading) setBadge(box.toSort)
  }, [box.loading, box.toSort])
  return null
}
