import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, Home, Plus, User, Users } from 'lucide-react'
import { InstallBanner } from './InstallBanner'

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
  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-4 pb-32">
      <Outlet />
      <InstallBanner />
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/70 bg-white/85 backdrop-blur-xl safe-bottom dark:border-white/5 dark:bg-ink-900/85">
        <div className="mx-auto flex max-w-2xl items-end justify-around px-2 pt-2 pb-2">
          {tabs.map((t, i) =>
            t === null ? (
              <button
                key={i}
                onClick={() => nav(groupMatch ? `/add?group=${groupMatch[1]}` : '/add')}
                className="-mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-fuchsia-600 text-white shadow-xl shadow-brand-600/40 transition active:scale-95"
                aria-label="Add expense"
              >
                <Plus size={30} strokeWidth={2.5} />
              </button>
            ) : (
              <NavLink
                key={t.to}
                to={t.to}
                end={'end' in t}
                className={({ isActive }) => `flex w-16 flex-col items-center gap-1 rounded-2xl py-1 text-[11px] font-semibold transition ${isActive ? 'text-brand-600 dark:text-brand-300' : 'text-slate-400'}`}
              >
                <t.icon size={24} strokeWidth={2.2} />
                {t.label}
              </NavLink>
            ),
          )}
        </div>
      </nav>
    </div>
  )
}
