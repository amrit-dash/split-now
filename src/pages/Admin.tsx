import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { BarChart3, Gauge, ScrollText, Smartphone, Sparkles, ToggleRight, Users as UsersIcon } from 'lucide-react'
import { repo } from '@/data'
import { useAiStatus } from '@/hooks/useAiStatus'
import { usePageTitle } from '@/lib/brand'
import { Loading, PageHeader } from '@/components/Misc'
import { AdminAi } from './admin/AdminAi'
import AppSettings from './admin/AppSettings'
import Flags from './admin/Flags'
import Limits from './admin/Limits'
import Logs from './admin/Logs'
import Overview from './admin/Overview'
import Users from './admin/Users'

// Insights (the usage numbers) comes last and opens only when asked: it reads the most, so Admin opens on App.
const TABS = [
  { to: '/admin/app', label: 'App', Icon: Smartphone },
  { to: '/admin/flags', label: 'Flags', Icon: ToggleRight },
  { to: '/admin/limits', label: 'Limits', Icon: Gauge },
  { to: '/admin/ai', label: 'AI', Icon: Sparkles },
  { to: '/admin/users', label: 'Users', Icon: UsersIcon },
  { to: '/admin/logs', label: 'Logs', Icon: ScrollText },
  { to: '/admin/insights', label: 'Insights', Icon: BarChart3 },
] as const

/**
 * /admin: the operator's console. Visible only to accounts with an admins/{uid} document
 * (aiStatus().admin, the same check the rules make); everyone else lands back on Settings.
 * Firebase only: there is nothing to administer in the demo.
 */
export default function Admin() {
  usePageTitle('Admin')
  const status = useAiStatus()
  if (repo.mode !== 'firebase')
    return (
      <div>
        <PageHeader title="Admin" back="/settings" />
        <div className="card p-4 text-sm" data-testid="admin-demo">
          The admin console works against a Firebase project. In the demo there is nothing to switch, limit or block.
        </div>
      </div>
    )
  if (status === undefined)
    return (
      <div>
        <PageHeader title="Admin" back="/settings" />
        <Loading />
      </div>
    )
  if (!status?.admin) return <Navigate to="/settings" replace />
  return (
    <div data-testid="admin-console">
      {/* The section tabs ride in the sticky header, so they stay in reach on long tabs. */}
      <PageHeader title="Admin" back="/settings" subtitle="Switches, limits, usage and accounts. Changes apply within a minute.">
        {/* Seven tabs in one even row: an icon over a short label, as the bottom bar does (two rows of words looked lopsided; a row that scrolled hid Logs and Insights off the edge). */}
        <nav aria-label="Admin sections" className="mt-3">
          <div className="grid grid-cols-7 gap-0.5 rounded-2xl bg-slate-100 p-1 dark:bg-ink-800">
            {TABS.map(({ to, label, Icon }) => (
              // Switching tabs replaces the history entry: Back leaves Admin instead of walking the tabs.
              <NavLink
                key={to}
                to={to}
                replace
                className={({ isActive }) =>
                  `flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0 py-1.5 text-[0.625rem] font-semibold leading-tight tracking-tight transition min-[360px]:text-[0.6875rem] ${
                    isActive ? 'bg-white text-slate-900 shadow-sm dark:bg-ink-700 dark:text-white' : 'text-muted'
                  }`
                }
              >
                <Icon size={18} aria-hidden />
                <span className="max-w-full truncate">{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </PageHeader>
      <Routes>
        <Route index element={<Navigate to="/admin/app" replace />} />
        <Route path="app" element={<AppSettings />} />
        <Route path="flags" element={<Flags />} />
        <Route path="limits" element={<Limits />} />
        <Route
          path="ai"
          element={
            // Room at the end so the last line clears the raised + button (as the other tabs do).
            <div className="mb-[calc(var(--lane)-var(--nav-h))]">
              <AdminAi status={status} />
            </div>
          }
        />
        <Route path="users" element={<Users />} />
        <Route path="logs" element={<Logs />} />
        <Route path="insights" element={<Overview />} />
        <Route path="*" element={<Navigate to="/admin/app" replace />} />
      </Routes>
    </div>
  )
}
