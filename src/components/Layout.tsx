import { useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, Home, Plus, User, Users } from 'lucide-react'
import { InstallBanner } from './InstallBanner'
import { Aurora } from './Aurora'
import { CaptureAlert } from './CaptureAlert'

const tabs = [
  { to: '/', icon: Home, label: 'Home', end: true },
  { to: '/groups', icon: Users, label: 'Groups' },
  null,
  { to: '/insights', icon: BarChart3, label: 'Insights' },
  { to: '/profile', icon: User, label: 'Profile' },
] as const

export function Layout() {
  const nav = useNavigate()
  const loc = useLocation()
  const groupMatch = loc.pathname.match(/^\/groups\/([^/]+)/)
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
        <div className="relative mx-auto flex max-w-2xl items-center justify-around px-2 pb-[var(--nav-pad)] pt-1.5">
          {tabs.map((t, i) =>
            t === null ? (
              <div key={i} className="relative w-16 self-stretch">
                <button
                  onClick={() => nav(groupMatch ? `/add?group=${groupMatch[1]}` : '/add')}
                  className="absolute left-1/2 top-0 flex h-[3.75rem] w-[3.75rem] -translate-x-1/2 -translate-y-[45%] items-center justify-center overflow-hidden rounded-full text-white shadow-xl shadow-brand-600/40 ring-1 ring-white/25 transition active:scale-95"
                  aria-label="Add expense"
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
                className={({ isActive }) => `flex w-16 flex-col items-center gap-0.5 rounded-2xl py-1 text-[11px] font-semibold transition ${isActive ? 'text-brand-600 dark:text-brand-300' : 'text-slate-400'}`}
              >
                <t.icon size={23} strokeWidth={2.2} />
                {t.label}
              </NavLink>
            ),
          )}
        </div>
      </nav>
    </div>
  )
}
