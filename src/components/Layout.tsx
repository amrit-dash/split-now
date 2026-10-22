import { Suspense, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useFlag } from '@/hooks/useAppConfig'
import { useLongPress } from '@/hooks/useLongPress'
import { groupOfPath, plusTap } from '@/lib/plus-target'
import { useAllGroupData } from '@/hooks/data'
import { useInbox } from '@/hooks/useInbox'
import { applyIconTint } from '@/lib/accent'
import { setBadge } from '@/lib/push'
import { InstallBanner } from './InstallBanner'
import { Aurora } from './Aurora'
import { CaptureAlert } from './CaptureAlert'
import { CreateSheet } from './CreateSheet'
import { SyncPill } from './OfflinePill'
import { Loading } from './Misc'
import { useIconStyle } from './Icon'
import { InsightsIcon, HomeIcon, LiveTableIcon, ProfileIcon, GroupsIcon } from './icons'

// Live table has the slot Insights had (Insights is a row in Profile now); with live tables
// switched off for everyone, Insights takes its place back, so the bar never has a hole.
// MingCute icons (and our Live table / Insights drawings), solid on the current tab in either icon style.
const tabsFor = (liveTables: boolean) =>
  [
    { to: '/', icon: HomeIcon, label: 'Home', end: true },
    { to: '/groups', icon: GroupsIcon, label: 'Groups' },
    null,
    liveTables ? { to: '/split', icon: LiveTableIcon, label: 'Live table' } : { to: '/insights', icon: InsightsIcon, label: 'Insights' },
    { to: '/profile', icon: ProfileIcon, label: 'Profile' },
  ] as const

export function Layout() {
  const loc = useLocation()
  const nav = useNavigate()
  const groupId = groupOfPath(loc.pathname)
  const [creating, setCreating] = useState(false)
  const tabs = tabsFor(useFlag('liveTables'))
  const iconStyle = useIconStyle()
  // Inside a group a tap adds an expense to it; press and hold (or right click) opens the sheet.
  const plus = useLongPress({
    onTap: () => {
      const a = plusTap(loc.pathname)
      if (a.kind === 'add') nav(a.to)
      else setCreating(true)
    },
    onHold: () => setCreating(true),
  })
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
    // Room under the last card: it clears the raised + button by about 14px, on every screen with the tab bar.
    <div className="mx-auto min-h-dvh max-w-2xl px-4 pb-[calc(var(--nav-h)+2.25rem)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-fill focus:px-4 focus:py-2 focus:font-semibold focus:text-on-fill"
      >
        Skip to content
      </a>
      {/* The fallback sits inside the content area, so the tab bar never disappears while a screen loads. */}
      <main id="main" ref={main} tabIndex={-1} className="outline-none">
        <SyncPill className="mt-2" />
        <Suspense fallback={<Loading />}>
          <Outlet />
        </Suspense>
      </main>
      <AppBadge />
      <InstallBanner />
      <CaptureAlert />
      <nav className="fixed inset-x-0 bottom-0 z-40" aria-label="Main" data-icon-style={iconStyle}>
        {/* The + button's glow sits under the bar: muted where the bar covers it, bright in the
            notch, which gives the cut-out depth. A blurred copy of the button's moving gradient,
            centred on the button, faded towards the top and strongest below, filling the notch gap. */}
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-[0.5625rem] h-0 w-0">
          {/* a wide, soft glow radiating all round, lighter towards the top */}
          <div className="fab-halo-a absolute left-1/2 top-1/2 h-[6.75rem] w-[6.75rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-80 blur-[22px] saturate-150">
            <Aurora size="fab" />
          </div>
          {/* a stronger lower half, a bit wider than the notch, that fills the gap and fades out upwards */}
          <div className="fab-halo-b absolute left-1/2 top-1/2 h-[5.3rem] w-[5.3rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[8px] saturate-150">
            <Aurora size="fab" />
          </div>
        </div>
        {/* The bar, with a round notch cut out for the + button (mask in index.css). */}
        <div
          aria-hidden
          className="nav-notch absolute inset-0 border-t border-slate-200/70 bg-white/95 backdrop-blur-2xl backdrop-saturate-150 dark:border-white/5 dark:bg-ink-900/95"
        />
        {/* A faint wash of the accent across the bar, left to right, brighter towards the top: it
            ties the bar to the + button's glow without competing with it. Same notch mask. */}
        <div aria-hidden className="nav-notch nav-glow pointer-events-none absolute inset-0" />
        <div className="relative mx-auto flex max-w-2xl items-center justify-around px-2 pb-[var(--nav-pad)] pt-1.5">
          {tabs.map((t) =>
            t === null ? (
              <div key="create" className="relative w-16 self-stretch">
                <button
                  type="button"
                  {...plus}
                  data-testid="nav-create"
                  className="fab-ring absolute left-1/2 top-0 flex h-[3.75rem] w-[3.75rem] -translate-x-1/2 -translate-y-[45%] items-center justify-center overflow-hidden rounded-full text-on-fill transition active:scale-95"
                  aria-label={groupId ? 'Add expense to this group (press and hold for more)' : 'Create'}
                  aria-haspopup={groupId ? undefined : 'dialog'}
                >
                  <Aurora size="fab" />
                  {/* white outline round the lower half, fading out towards the top */}
                  <span aria-hidden className="fab-rim pointer-events-none absolute inset-0 rounded-full border border-white/55" />
                  <Plus size={28} strokeWidth={2.6} className="relative" aria-hidden />
                </button>
              </div>
            ) : (
              <NavLink
                key={t.to}
                to={t.to}
                end={'end' in t}
                className={({ isActive }) =>
                  `group flex w-16 flex-col items-center gap-0.5 py-1 text-[11px] transition-colors ${isActive ? 'font-bold text-brand-700 dark:text-brand-200' : 'font-semibold text-slate-500 dark:text-slate-400'}`
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Active: icon and label in a deeper shade of the accent, the solid icon and a slight lift
                        (no box behind the tab: owner's request 32); the swap is instant, a tab is tapped
                        too often to animate it. Inactive stays a readable grey. A press dips the icon. */}
                    <t.icon
                      size={24}
                      solid={isActive || undefined}
                      className={`transition-transform duration-150 ease-out motion-safe:group-active:scale-[0.96] ${isActive ? '-translate-y-px' : ''}`}
                      aria-hidden
                    />
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
