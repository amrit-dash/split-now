import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Download, FileUp, Loader2, Smartphone } from 'lucide-react'
import { repo } from '@/data'
import { buildLabel } from '@/lib/flags'
import { useAllGroupData } from '@/hooks/data'
import { csvFilename, deliverCsv, groupCsv } from '@/lib/export'
import { errText } from '@/lib/errors'
import { todayISO } from '@/lib/id'
import { IOSInstallSteps, useInstall } from '@/components/InstallBanner'
import { GroupIcon } from '@/components/GroupIcon'
import { ListSkeleton } from '@/components/Skeleton'
import { Select } from '@/components/Select'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { SectionTitle, SettingsPage } from './common'

/** /settings/data: export a group as CSV, import from Splitwise, install the app, version. */
export default function Data() {
  const data = useAllGroupData()
  const toast = useToast()
  const install = useInstall()
  const [groupId, setGroupId] = useState('')
  const [busy, setBusy] = useState(false)
  const [iosOpen, setIosOpen] = useState(false)
  const groups = (data ?? []).filter((d) => !d.group.archived)
  const chosen = groups.find((d) => d.group.id === groupId) ?? groups[0]
  const canInstall = !install.installed && (install.canPrompt || install.ios)

  const exportCsv = async () => {
    if (!chosen) return
    setBusy(true)
    try {
      const r = await deliverCsv(csvFilename(chosen.group.name, todayISO()), groupCsv(chosen.group, chosen.expenses, chosen.settlements))
      if (r !== 'cancelled') toast(r === 'shared' ? 'CSV shared' : 'CSV downloaded')
    } catch (e) {
      toast(errText(e, 'Couldn’t export that group'), 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsPage title="Data">
      <SectionTitle>Export</SectionTitle>
      {data === null ? (
        <ListSkeleton rows={2} avatar={false} />
      ) : groups.length === 0 ? (
        <div className="card p-4">
          <p className="text-muted text-sm">Nothing to export yet. Groups you’re in appear here.</p>
        </div>
      ) : (
        <div className="card space-y-3 p-4">
          <div>
            <div className="label">Group</div>
            <Select
              aria-label="Group to export"
              value={chosen?.group.id ?? ''}
              onChange={setGroupId}
              options={groups.map((d) => ({
                value: d.group.id,
                text: d.group.name,
                label: d.group.name,
                icon: <GroupIcon emoji={d.group.emoji} size={28} />,
                hint: `${d.expenses.length} expense${d.expenses.length === 1 ? '' : 's'} · ${d.group.currency}`,
              }))}
            />
          </div>
          <button type="button" className="btn-secondary w-full" onClick={exportCsv} disabled={busy || !chosen} data-testid="export-csv">
            {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Download size={18} aria-hidden />} Export as CSV
          </button>
          <p className="text-muted text-xs">
            Every expense and payment in the group, with who paid and each person’s share. Opens in Excel or Google Sheets, and imports back into Split Now.
          </p>
        </div>
      )}

      <SectionTitle>Import</SectionTitle>
      <Link to="/groups/import" className="card flex items-center gap-3 p-4 font-medium transition active:scale-[0.99]" data-testid="settings-import">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300"
          aria-hidden
        >
          <FileUp size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block">Import from Splitwise</span>
          <span className="text-muted block text-xs font-normal">A group export (CSV), balances checked against Splitwise’s own totals</span>
        </span>
        <ChevronRight size={18} className="text-slate-400" aria-hidden />
      </Link>

      {canInstall && (
        <>
          <SectionTitle>App</SectionTitle>
          <button
            type="button"
            className="card flex w-full items-center gap-3 p-4 text-left font-medium transition active:scale-[0.99]"
            onClick={() => (install.canPrompt ? install.prompt() : setIosOpen(true))}
            data-testid="settings-install"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300"
              aria-hidden
            >
              <Smartphone size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">Install Split Now on this device</span>
              <span className="text-muted block text-xs font-normal">
                {install.ios ? 'Add to Home Screen for notifications and offline use' : 'Full-screen, faster, works offline'}
              </span>
            </span>
            <ChevronRight size={18} className="text-slate-400" aria-hidden />
          </button>
        </>
      )}

      <p className="text-muted mt-6 text-center text-xs" data-testid="app-version">
        Split Now v{buildLabel(__APP_VERSION__)} · {repo.mode === 'demo' ? 'Demo mode: data stays on this device' : 'Connected to Firebase'}
      </p>
      <Sheet open={iosOpen} onClose={() => setIosOpen(false)} title="Add to Home Screen">
        <IOSInstallSteps />
      </Sheet>
    </SettingsPage>
  )
}
