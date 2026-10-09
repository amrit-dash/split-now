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
        {/* The + button's glow sits under the bar: muted where the bar covers it, bright in the
            notch, which gives the cut-out depth. A blurred copy of the button's moving gradient,
            centred on the button, faded towards the top and strongest below, filling the notch gap. */}
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-[0.5625rem] h-0 w-0">
          {/* a wide, soft glow radiating all round, lighter towards the top */}
          <div className="fab-halo-a absolute left-1/2 top-1/2 h-[6.75rem] w-[6.75rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-80 blur-[22px] saturate-150"><Aurora size="fab" /></div>
          {/* a stronger lower half, a bit wider than the notch, that fills the gap and fades out upwards */}
          <div className="fab-halo-b absolute left-1/2 top-1/2 h-[5.3rem] w-[5.3rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[8px] saturate-150"><Aurora size="fab" /></div>
        </div>
        {/* The bar, with a round notch cut out for the + button (mask in index.css). */}
        <div aria-hidden className="nav-notch absolute inset-0 border-t border-slate-200/70 bg-white/95 backdrop-blur-xl dark:border-white/5 dark:bg-ink-900/95" />
        <div className="relative mx-auto flex max-w-2xl items-center justify-around px-2 pb-[var(--nav-pad)] pt-1.5">
          {tabs.map((t, i) =>
            t === null ? (
              <div key={i} className="relative w-16 self-stretch">
                <button
                  onClick={() => setCreating(true)}
                  data-testid="nav-create"
                  className="fab-ring absolute left-1/2 top-0 flex h-[3.75rem] w-[3.75rem] -translate-x-1/2 -translate-y-[45%] items-center justify-center overflow-hidden rounded-full text-white transition active:scale-95"
                  aria-label="Create" aria-haspopup="dialog"
                >
                  <Aurora size="fab" />
                  {/* white outline round the lower half, fading out towards the top */}
                  <span aria-hidden className="fab-rim pointer-events-none absolute inset-0 rounded-full border border-white/55" />
                  <Plus size={28} strokeWidth={2.6} className="relative" />
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
