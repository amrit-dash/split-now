import { useEffect, useState } from 'react'
import { KeyRound, Loader2, RefreshCw, RotateCcw, Save, ShieldCheck, Trash2 } from 'lucide-react'
import { repo } from '@/data'
import type { AiModel, AiStatusResult } from '@/data/repo'
import { refreshAiStatus } from '@/hooks/useAiStatus'
import { DEFAULT_MODEL, MAX_ALLOW_EMAILS, normaliseEmail, resolveAppAi, type AppAiConfig, type AppAiMode } from '@/lib/ai-config'
import { errText } from '@/lib/errors'
import { todayISO } from '@/lib/id'
import { Select } from './Select'
import { Switch } from './Switch'
import { useToast } from './Toast'

const MODES: Array<{ value: AppAiMode; label: string; hint: string }> = [
  { value: 'off', label: 'Off', hint: 'Only people’s own keys work' },
  { value: 'everyone', label: 'Everyone', hint: 'Every signed-in user' },
  { value: 'allowlist', label: 'Only these emails', hint: 'Listed below' },
]

const same = (a: AppAiConfig, b: AppAiConfig) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Admins only: Split Now's (project) Gemini key. The key itself (Secret Manager's GEMINI_API_KEY,
 * or one set here, which wins), who may use it, for what, which model, limits. Edits collect
 * locally; a small Save / Discard bar shows only while something has changed.
 */
export function AdminAi({ status }: { status: AiStatusResult }) {
  const toast = useToast()
  const [saved, setSaved] = useState<AppAiConfig | null>(null)
  const [cfg, setCfg] = useState<AppAiConfig | null>(null)
  const [emails, setEmails] = useState('')
  const [models, setModels] = useState<AiModel[] | null>(null)
  const [usage, setUsage] = useState<Record<string, number> | null>(null)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState('')
  const [editingKey, setEditingKey] = useState(false)
  const [keyBusy, setKeyBusy] = useState<'set' | 'test' | 'remove' | null>(null)
  const configured = status.app.configured !== false
  const source = status.app.source ?? (configured ? 'secret' : null)

  useEffect(() => repo.watchAppAi((raw) => {
    const r = resolveAppAi(raw)
    setSaved(r)
    setCfg((c) => {
      if (c) return c // keep unsaved edits
      setEmails(r.allowEmails.join('\n'))
      return r
    })
  }), [])
  useEffect(() => { if (configured) repo.aiModels('app').then(setModels).catch(() => setModels([])) }, [configured, status.app.hint])
  useEffect(() => { repo.aiUsage(todayISO()).then(setUsage).catch(() => {}) }, [])

  if (!cfg || !saved) return <div className="text-sm text-slate-500">Loading…</div>
  const set = (p: Partial<AppAiConfig>) => setCfg({ ...cfg, ...p })
  const list = [...new Set(emails.split(/[\s,;]+/).filter((e) => e.includes('@')).map(normaliseEmail))]
  const next = { ...cfg, allowEmails: cfg.mode === 'allowlist' ? list : saved.allowEmails }
  const dirty = !same(next, saved)

  const save = async () => {
    if (list.length > MAX_ALLOW_EMAILS) return toast(`At most ${MAX_ALLOW_EMAILS} emails`, 'err')
    setSaving(true)
    try {
      await repo.saveAppAi(next)
      setSaved(next)
      toast('AI settings saved')
      void refreshAiStatus()
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setSaving(false)
    }
  }
  const discard = () => { setCfg(saved); setEmails(saved.allowEmails.join('\n')) }

  const keyAction = async (action: 'set' | 'test' | 'remove') => {
    setKeyBusy(action)
    try {
      const r = await repo.aiKey(action, action === 'set' ? draft : undefined, 'app')
      if (action !== 'remove') setModels(r.models)
      setDraft(''); setEditingKey(false)
      toast(action === 'set' ? 'Project key saved and working' : action === 'test' ? 'Project key works' : r.source ? 'Back to GEMINI_API_KEY' : 'Project key removed')
      await refreshAiStatus()
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setKeyBusy(null)
    }
  }

  const n = (k: string) => usage?.[k] ?? 0
  return (
    <div className="space-y-4" data-testid="admin-ai">
      {/* The project key: where it comes from, and a way to use a different one. */}
      <div>
        <div className="label">Project key</div>
        {editingKey || !configured ? (
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) void keyAction('set') }}>
            <input className="input font-mono" type="password" autoComplete="off" spellCheck={false} placeholder="Paste a Gemini API key" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Project Gemini API key" />
            <div className="flex gap-2">
              <button className="btn-primary !min-h-0 flex-1 !py-2.5 text-sm" disabled={!draft.trim() || !!keyBusy}>
                {keyBusy === 'set' ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Save &amp; check
              </button>
              {configured && <button type="button" className="btn-ghost !min-h-0 !py-2.5 text-sm" onClick={() => { setEditingKey(false); setDraft('') }}>Cancel</button>}
            </div>
            <p className="text-xs text-slate-500">Used instead of {source === 'admin' ? 'the current key' : 'GEMINI_API_KEY'}; stored on the server, never shown again.</p>
          </form>
        ) : (
          <div className="flex gap-2">
            <button className="btn-secondary !min-h-0 flex-1 !py-2 text-sm" disabled={!!keyBusy} onClick={() => keyAction('test')}>
              {keyBusy === 'test' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Test
            </button>
            <button className="btn-secondary !min-h-0 flex-1 !py-2 text-sm" disabled={!!keyBusy} onClick={() => setEditingKey(true)}><KeyRound size={16} /> Use another key</button>
            {source === 'admin' && (
              <button className="btn-secondary !min-h-0 !px-3 !py-2 text-sm text-rose-600" disabled={!!keyBusy} onClick={() => keyAction('remove')} aria-label="Remove this key and go back to GEMINI_API_KEY" title="Back to GEMINI_API_KEY">
                {keyBusy === 'remove' ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              </button>
            )}
          </div>
        )}
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500" data-testid="admin-ai-key-status">
          <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {!configured ? 'No project key (GEMINI_API_KEY isn’t set)'
            : source === 'admin' ? `Project key set up (set in the app${status.app.hint ? ` · ${status.app.hint}` : ''})`
            : 'Project key set up (GEMINI_API_KEY)'}
        </p>
      </div>

      <div>
        <div className="label">Model</div>
        <Select aria-label="Project model" value={cfg.model} onChange={(v) => set({ model: v })} options={[
          { value: DEFAULT_MODEL, label: 'Recommended', hint: DEFAULT_MODEL },
          ...(models ?? []).filter((m) => m.id !== DEFAULT_MODEL).map((m) => ({ value: m.id, label: m.label, hint: m.id })),
          ...(cfg.model !== DEFAULT_MODEL && !(models ?? []).some((m) => m.id === cfg.model) ? [{ value: cfg.model, label: cfg.model }] : []),
        ]} />
        <p className="mt-1 text-xs text-slate-500">{!configured ? 'Add a key to list its models.' : models === null ? 'Loading models…' : 'A retired model falls back to the recommended one.'}</p>
      </div>

      <div>
        <div className="label">Who can use Split Now’s key</div>
        <Select aria-label="Who can use Split Now’s key" value={cfg.mode} onChange={(v) => set({ mode: v as AppAiMode })} options={MODES} />
      </div>
      {cfg.mode === 'allowlist' && (
        <div>
          <label className="label" htmlFor="ai-allow">Allowed emails</label>
          <textarea id="ai-allow" className="input min-h-24 font-mono" placeholder={'one@example.com\ntwo@example.com'} value={emails} onChange={(e) => setEmails(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">{list.length} email{list.length === 1 ? '' : 's'} · the account’s sign-in email must match.</p>
        </div>
      )}
      {cfg.mode !== 'off' && (
        <>
          <div className="space-y-3 rounded-2xl bg-slate-50 p-3.5 dark:bg-ink-800/60">
            <Toggle title="Bills & statements" checked={cfg.images} onChange={(v) => set({ images: v })} />
            <Toggle title="SMS fallback" checked={cfg.sms} onChange={(v) => set({ sms: v })} />
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
      {dirty && (
        <div className="animate-pop sticky bottom-[var(--lane)] z-10 flex items-center gap-2 rounded-2xl bg-brand-50 p-2 pl-3.5 shadow-lg ring-1 ring-brand-500/20 dark:bg-ink-800 dark:ring-brand-400/30" data-testid="admin-ai-dirty">
          <span className="min-w-0 flex-1 text-sm font-medium text-brand-800 dark:text-brand-200">Unsaved changes</span>
          <button className="btn-ghost !min-h-0 !px-3 !py-2 text-sm" onClick={discard} disabled={saving}><RotateCcw size={16} /> Discard</button>
          <button className="btn-primary !min-h-0 !px-4 !py-2 text-sm" onClick={save} disabled={saving} data-testid="admin-ai-save">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save
          </button>
        </div>
      )}
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
