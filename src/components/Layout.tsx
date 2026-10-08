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
        {/* Inside the notch: the bar's own frosted fill, fading out, with the button's glow in it
            (so it reads as a soft cradle, not a hole), and the notch's outline incl. its rounded shoulders. */}
        <div aria-hidden className="nav-notch-glass absolute left-1/2 top-0 h-12 w-28 -translate-x-1/2 backdrop-blur-md" />
        <svg aria-hidden viewBox="0 0 112 48" className="absolute left-1/2 top-0 h-12 w-28 -translate-x-1/2 overflow-visible text-slate-200/70 dark:text-white/5">
          <path d="M0 0.5H10.41A8 8 0 0 1 18.41 8.14A37.6 37.6 0 1 0 93.59 8.14A8 8 0 0 1 101.59 0.5H112" fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="relative mx-auto flex max-w-2xl items-center justify-around px-2 pb-[var(--nav-pad)] pt-1.5">
          {tabs.map((t, i) =>
            t === null ? (
              <div key={i} className="relative w-16 self-stretch">
                {/* Halo: a blurred copy of the button's moving gradient, all round it, so the glow
                    shifts colour with the button and never ends at the bar's edge. */}
                <div aria-hidden className="pointer-events-none absolute left-1/2 top-[0.19rem] h-[4.75rem] w-[4.75rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-75 blur-[14px] dark:opacity-90">
                  <Aurora size="fab" />
                </div>
                <button
                  onClick={() => setCreating(true)}
                  data-testid="nav-create"
                  className="fab-3d absolute left-1/2 top-0 flex h-[3.75rem] w-[3.75rem] -translate-x-1/2 -translate-y-[45%] items-center justify-center overflow-hidden rounded-full text-white transition active:translate-y-[-42%] active:scale-95"
                  aria-label="Create" aria-haspopup="dialog"
                >
                  <Aurora size="fab" />
                  {/* light from above: a soft top highlight and a darker rim below, for depth */}
                  <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(120%_80%_at_50%_0%,rgb(255_255_255/0.38),transparent_55%),radial-gradient(120%_70%_at_50%_110%,rgb(0_0_0/0.22),transparent_60%)]" />
                  <Plus size={28} strokeWidth={2.6} className="relative drop-shadow-[0_1px_1px_rgb(0_0_0/0.25)]" />
                </button>
              </div>
            ) : (
              <NavLink
                key={t.to}
                to={t.to}
                end={'end' in t}
                className={({ isActive }) => `flex w-16 flex-col items-center gap-0.5 py-1 text-[11px] transition-colors ${isActive ? 'font-bold text-brand-600 dark:text-brand-300' : 'font-semibold text-slate-400 dark:text-slate-500'}`}
              >
                {({ isActive }) => (
                  <>
                    {/* Active: icon and label in the accent, a heavier stroke and a slight lift. */}
                    <t.icon size={23} strokeWidth={isActive ? 2.6 : 2.1} className={`transition-transform ${isActive ? '-translate-y-px' : ''}`} />
                    {t.label}
                  </>
                )}
              </NavLink>
            ),
          )}
        </div>
      </nav>
      <CreateSheet open={creating} onClose={() => setCreating(false)} groupId={groupId} />
    </div>
  )
}
