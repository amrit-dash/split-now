import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { repo } from '@/data'
import { errText } from '@/lib/errors'
import { useToast } from './Toast'

const VERSION_RE = /^\d+(\.\d+){0,3}([-+][0-9A-Za-z.]{1,20})?$/

/** Admins only: the version shown in Profile (config/app.version). */
export function AdminApp() {
  const toast = useToast()
  const [saved, setSaved] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => repo.watchAppInfo((i) => {
    const v = i?.version ?? ''
    // Fill the field the first time; later updates leave what the admin is typing alone.
    setSaved((prev) => { if (prev === null) setDraft(v); return v })
  }), [])
  const value = draft.trim()
  const valid = VERSION_RE.test(value)
  const save = async () => {
    setBusy(true)
    try { await repo.saveAppVersion(value); toast(`Version set to ${value}`) } catch (e) { toast(errText(e), 'err') } finally { setBusy(false) }
  }
  return (
    <form className="space-y-2" data-testid="admin-app" onSubmit={(e) => { e.preventDefault(); if (valid && value !== saved) void save() }}>
      <label className="label" htmlFor="app-version">Version shown in Profile</label>
      <div className="flex gap-2">
        <input id="app-version" className="input font-mono" inputMode="decimal" placeholder={__APP_VERSION__} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn-primary !min-h-0 shrink-0 !px-4 text-sm" disabled={busy || !valid || value === saved}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save
        </button>
      </div>
      <p className="text-xs text-slate-500">{draft && !valid ? 'Use numbers like 2.1.1 (optionally -beta.1).' : `Everyone sees it right away. This build is ${__APP_VERSION__}.`}</p>
    </form>
  )
}
