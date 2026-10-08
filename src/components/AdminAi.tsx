import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { repo } from '@/data'
import type { AiModel, AiStatusResult } from '@/data/repo'
import { DEFAULT_MODEL, MAX_ALLOW_EMAILS, normaliseEmail, resolveAppAi, type AppAiConfig, type AppAiMode } from '@/lib/ai-config'
import { todayISO } from '@/lib/id'
import { Select } from './Select'
import { Switch } from './Switch'
import { useToast } from './Toast'

const MODES: Array<{ value: AppAiMode; label: string; hint: string }> = [
  { value: 'off', label: 'Off', hint: 'Only people’s own keys work' },
  { value: 'everyone', label: 'Everyone', hint: 'Every signed-in user' },
  { value: 'allowlist', label: 'Only these emails', hint: 'Listed below' },
]

/** Admins only: Split Now's (project) Gemini key — who may use it, for what, which model, limits. */
export function AdminAi({ status }: { status: AiStatusResult }) {
  const toast = useToast()
  const [cfg, setCfg] = useState<AppAiConfig | null>(null)
  const [emails, setEmails] = useState('')
  const [models, setModels] = useState<AiModel[] | null>(null)
  const [usage, setUsage] = useState<Record<string, number> | null>(null)
  const [saving, setSaving] = useState(false)
  const configured = status.app.configured !== false

  useEffect(() => repo.watchAppAi((raw) => setCfg((c) => {
    if (c) return c // keep unsaved edits
    const r = resolveAppAi(raw)
    setEmails(r.allowEmails.join('\n'))
    return r
  })), [])
  useEffect(() => { if (configured) repo.aiModels('app').then(setModels).catch(() => setModels([])) }, [configured])
  useEffect(() => { repo.aiUsage(todayISO()).then(setUsage).catch(() => {}) }, [])

  if (!cfg) return <div className="text-sm text-slate-500">Loading…</div>
  const set = (p: Partial<AppAiConfig>) => setCfg({ ...cfg, ...p })
  const list = [...new Set(emails.split(/[\s,;]+/).filter((e) => e.includes('@')).map(normaliseEmail))]

  const save = async () => {
    if (list.length > MAX_ALLOW_EMAILS) return toast(`At most ${MAX_ALLOW_EMAILS} emails`, 'err')
    setSaving(true)
    try {
      await repo.saveAppAi({ ...cfg, allowEmails: list })
      toast('AI settings saved')
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setSaving(false)
    }
  }

  const n = (k: string) => usage?.[k] ?? 0
  return (
    <div className="space-y-4" data-testid="admin-ai">
      <div className={`rounded-2xl p-3 text-sm ${configured ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'}`}>
        {configured ? 'Project key is set up (Secret Manager: GEMINI_API_KEY).' : 'No project key yet: add GEMINI_API_KEY in Google Cloud Secret Manager, then redeploy the functions.'}
      </div>
      <div>
        <div className="label">Who can use Split Now’s key</div>
        <Select aria-label="Who can use Split Now’s key" value={cfg.mode} onChange={(v) => set({ mode: v as AppAiMode })} options={MODES} />
      </div>
      {cfg.mode === 'allowlist' && (
        <div>
          <label className="label" htmlFor="ai-allow">Allowed emails</label>
          <textarea id="ai-allow" className="input min-h-24 font-mono text-sm" placeholder={'one@example.com\ntwo@example.com'} value={emails} onChange={(e) => setEmails(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">{list.length} email{list.length === 1 ? '' : 's'} · the account’s sign-in email must match.</p>
        </div>
      )}
      {cfg.mode !== 'off' && (
        <>
          <div className="space-y-3 rounded-2xl bg-slate-50 p-3.5 dark:bg-ink-800/60">
            <Toggle title="Bills & statements" checked={cfg.images} onChange={(v) => set({ images: v })} />
            <Toggle title="SMS fallback" checked={cfg.sms} onChange={(v) => set({ sms: v })} />
          </div>
          <div>
            <div className="label">Model</div>
            <Select aria-label="Project model" value={cfg.model} onChange={(v) => set({ model: v })} options={[
              { value: DEFAULT_MODEL, label: 'Recommended', hint: DEFAULT_MODEL },
              ...(models ?? []).filter((m) => m.id !== DEFAULT_MODEL).map((m) => ({ value: m.id, label: m.label, hint: m.id })),
              ...(cfg.model !== DEFAULT_MODEL && !(models ?? []).some((m) => m.id === cfg.model) ? [{ value: cfg.model, label: cfg.model }] : []),
            ]} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Per person / day</span>
              <input className="input" inputMode="numeric" value={cfg.perDay} onChange={(e) => set({ perDay: Math.max(1, Math.min(5000, parseInt(e.target.value) || 1)) })} />
            </label>
            <label className="block">
              <span className="label">Per person / hour</span>
              <input className="input" inputMode="numeric" value={cfg.perHour} onChange={(e) => set({ perHour: Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)) })} />
            </label>
          </div>
        </>
      )}
      <div className="rounded-2xl bg-slate-50 p-3 text-sm dark:bg-ink-800/60">
        <div className="mb-1 font-semibold">Today</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat n={n('app')} label="Split Now key" />
          <Stat n={n('own')} label="Own keys" />
          <Stat n={n('errors')} label="Failed" />
        </div>
      </div>
      <button className="btn-primary w-full" onClick={save} disabled={saving} data-testid="admin-ai-save">
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Save AI settings
      </button>
    </div>
  )
}

function Stat({ n, label }: { n: number; label: string }) {
  return <div><div className="text-lg font-bold tabular-nums">{n}</div><div className="text-[11px] text-slate-500">{label}</div></div>
}

function Toggle({ title, checked, onChange }: { title: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="min-w-0 flex-1 font-medium">{title}</span>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  )
}
