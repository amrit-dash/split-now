import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, Home, Plus, User, Users } from 'lucide-react'
import { InstallBanner } from './InstallBanner'
import { Aurora } from './Aurora'
import { CaptureAlert } from './CaptureAlert'
import { CreateSheet } from './CreateSheet'

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
  // Lets fixed banners (UpdatePrompt) sit above the tab bar only on screens that have one.
  useEffect(() => {
    document.documentElement.setAttribute('data-nav', '')
    return () => document.documentElement.removeAttribute('data-nav')
  }, [])
  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-4 pb-[calc(var(--nav-h)+1.5rem)]">
      <Outlet />
      <InstallBanner />
      <CaptureAlert />
      <nav className="fixed inset-x-0 bottom-0 z-40">
        {/* The bar, with a round notch cut out for the + button (mask in index.css). */}
        <div aria-hidden className="nav-notch absolute inset-0 border-t border-slate-200/70 bg-white/85 backdrop-blur-xl dark:border-white/5 dark:bg-ink-900/85" />
        <div aria-hidden className="nav-notch-glass absolute left-1/2 top-0 h-12 w-28 -translate-x-1/2 bg-white/30 backdrop-blur-md dark:bg-ink-900/30" />
        <div className="relative mx-auto flex max-w-2xl items-center justify-around px-2 pb-[var(--nav-pad)] pt-1.5">
          {tabs.map((t, i) =>
            t === null ? (
              <div key={i} className="relative w-16 self-stretch">
                <button
                  onClick={() => setCreating(true)}
                  data-testid="nav-create"
                  className="absolute left-1/2 top-0 flex h-[3.75rem] w-[3.75rem] -translate-x-1/2 -translate-y-[45%] items-center justify-center overflow-hidden rounded-full text-white shadow-xl shadow-brand-600/40 ring-1 ring-white/25 transition active:scale-95"
                  aria-label="Create" aria-haspopup="dialog"
                >
                  <Aurora size="fab" />
                  <Plus size={28} strokeWidth={2.6} className="relative" />
                </button>
              </div>
            ) : (
              <NavLink
                key={t.to}
                to={t.to}
                end={'end' in t}
                className={({ isActive }) => `group flex w-16 flex-col items-center gap-0.5 py-0.5 text-[11px] font-semibold transition ${isActive ? 'text-brand-800 dark:text-brand-200' : 'text-slate-400'}`}
              >
                {/* Active tab: icon on a pill in a deeper theme shade. */}
                <span className="flex h-7 w-12 items-center justify-center rounded-full transition-colors group-aria-[current=page]:bg-brand-100 group-aria-[current=page]:text-brand-700 dark:group-aria-[current=page]:bg-brand-500/25 dark:group-aria-[current=page]:text-brand-200">
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
