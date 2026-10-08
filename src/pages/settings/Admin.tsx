import { Navigate } from 'react-router-dom'
import { LayoutDashboard } from 'lucide-react'
import { useAiStatus } from '@/hooks/useAiStatus'
import { AdminAi } from '@/components/AdminAi'
import { Loading } from '@/components/Misc'
import { SectionTitle, SettingsPage } from './common'

/** /settings/admin: Split Now's AI key and limits. Admins only (aiStatus().admin); a fuller console comes at /admin. */
export default function Admin() {
  const status = useAiStatus()
  if (status === undefined)
    return (
      <SettingsPage title="Admin">
        <Loading />
      </SettingsPage>
    )
  if (!status?.admin) return <Navigate to="/settings" replace />
  return (
    <SettingsPage title="Admin">
      <SectionTitle>AI features</SectionTitle>
      <div className="card p-4">
        <AdminAi status={status} />
      </div>
      <SectionTitle>Admin console</SectionTitle>
      <div className="card flex items-center gap-3 p-4 opacity-70" aria-disabled="true" data-testid="admin-console-placeholder">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-ink-800 dark:text-slate-400"
          aria-hidden
        >
          <LayoutDashboard size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Flags, limits, stats and users</span>
          <span className="text-muted block text-xs">Coming at /admin</span>
        </span>
      </div>
    </SettingsPage>
  )
}
