import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { repo } from '@/data'
import { useAiStatus } from '@/hooks/useAiStatus'
import { usePageTitle } from '@/lib/brand'
import { Loading, PageHeader } from '@/components/Misc'
import { AdminAi } from './admin/AdminAi'
import FlagsApp from './admin/FlagsApp'
import Limits from './admin/Limits'
import Overview from './admin/Overview'
import Users from './admin/Users'

const TABS = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/flags', label: 'Flags & app' },
  { to: '/admin/limits', label: 'Limits' },
  { to: '/admin/ai', label: 'AI' },
  { to: '/admin/users', label: 'Users' },
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
        <nav aria-label="Admin sections" className="scrollbar-none -mx-4 mt-3 overflow-x-auto px-4">
          <div className="flex w-max min-w-full gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-ink-800">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={'end' in t}
                className={({ isActive }) =>
                  `flex min-h-10 flex-1 items-center justify-center whitespace-nowrap rounded-xl px-3.5 text-sm font-semibold transition ${
                    isActive ? 'bg-white text-slate-900 shadow-sm dark:bg-ink-700 dark:text-white' : 'text-muted'
                  }`
                }
              >
                {t.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </PageHeader>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="flags" element={<FlagsApp />} />
        <Route path="limits" element={<Limits />} />
        <Route
          path="ai"
          element={
            // Room at the end so the last line clears the raised + button (as the other tabs do).
            <div className="mb-[calc(var(--lane)-var(--nav-h))] card p-4">
              <AdminAi status={status} />
            </div>
          }
        />
        <Route path="users" element={<Users />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </div>
  )
}
