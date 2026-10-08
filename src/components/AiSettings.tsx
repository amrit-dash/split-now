import { useEffect, useState } from 'react'
import { Check, ExternalLink, KeyRound, Loader2, RefreshCw, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { repo } from '@/data'
import type { AiModel, AiState, AiStatusResult, AppAiStatusValue } from '@/data/repo'
import { useMe } from '@/hooks/auth'
import { setAiScan } from '@/lib/ai'
import { DEFAULT_MODEL, type AiSource } from '@/lib/ai-config'
import { DEFAULT_ALL_PREFS, savePrefs, watchPrefs, type AllPrefs } from '@/lib/push'
import { Select } from './Select'
import { Switch } from './Switch'
import { useToast } from './Toast'

const SOURCE_OPTIONS: Array<{ value: AiSource; label: string; hint: string }> = [
  { value: 'auto', label: 'Automatic', hint: 'Your key first, then Split Now’s' },
  { value: 'own', label: 'Only my key', hint: 'Never use Split Now’s key' },
  { value: 'app', label: 'Only Split Now’s key', hint: 'Ignore my key' },
]

const APP_STATUS: Record<AppAiStatusValue, { text: string; ok: boolean }> = {
  available: { text: 'Available to you', ok: true },
  off: { text: 'Turned off', ok: false },
  not_listed: { text: 'Not enabled for your account', ok: false },
  feature_off: { text: 'Off for this', ok: false },
}

const ERR: Record<NonNullable<AiState['lastError']>['kind'], string> = {
  bad_key: 'Google rejected this key',
  quota: 'Over its quota (try later, or check billing)',
  model: 'The chosen model isn’t available',
  server: 'Gemini didn’t answer last time',
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

/** Profile → AI reading: master switch, features, which key, the user's own Gemini key and model. */
export function AiSettings({ onStatus }: { onStatus?: (s: AiStatusResult | null) => void }) {
  const { user } = useMe()
  const toast = useToast()
  const [prefs, setPrefs] = useState<AllPrefs>(DEFAULT_ALL_PREFS)
  const [state, setState] = useState<AiState | null>(null)
  const [status, setStatus] = useState<AiStatusResult | null | undefined>(undefined)
  const [models, setModels] = useState<AiModel[] | null>(null)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | null>(null)

  useEffect(() => watchPrefs(user.uid, setPrefs), [user.uid])
  useEffect(() => repo.watchAiState(user.uid, setState), [user.uid])
  useEffect(() => { repo.aiStatus().then((s) => { setStatus(s); onStatus?.(s) }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const hasKey = !!state?.hint
  // Model list for the user's key, once there is one.
  useEffect(() => {
    if (!hasKey || models) return
    repo.aiModels('own').then(setModels).catch(() => setModels([]))
  }, [hasKey, models])

  const set = (patch: Partial<AllPrefs>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    setAiScan(next.aiEnabled && next.aiImages)
    void savePrefs(user.uid, patch)
  }

  const run = async (kind: 'save' | 'test' | 'remove') => {
    setBusy(kind)
    try {
      const r = await repo.aiKey(kind === 'save' ? 'set' : kind, kind === 'save' ? draft.trim() : undefined)
      if (kind === 'remove') { setModels(null); toast('Key removed') }
      else { setModels(r.models); setDraft(''); setEditing(false); toast(kind === 'save' ? 'Key saved and working' : 'Key works') }
    } catch (e) {
      toast((e as Error).message.replace(/^.*?: /, '') || 'Something went wrong', 'err')
    } finally {
      setBusy(null)
    }
  }

  const appLine = (f: 'images' | 'sms') => (status ? APP_STATUS[status.app[f]] : null)
  const modelOptions = [
    { value: '', label: 'Recommended', hint: DEFAULT_MODEL },
    ...(models ?? []).map((m) => ({ value: m.id, label: m.label, hint: m.id })),
    ...(prefs.aiModel && !(models ?? []).some((m) => m.id === prefs.aiModel) ? [{ value: prefs.aiModel, label: prefs.aiModel }] : []),
  ]

  return (
    <div className="space-y-5" data-testid="ai-settings">
      <Row title="Use AI reading" testId="ai-enabled" checked={prefs.aiEnabled} onChange={(v) => set({ aiEnabled: v })}
        text={prefs.aiEnabled ? 'Gemini reads bills, statements and SMS the app can’t.' : 'Off: nothing is sent to any AI. Bills are read on this phone.'} />

      {prefs.aiEnabled && (
        <>
          <div className="space-y-4 rounded-2xl bg-slate-50 p-3.5 dark:bg-ink-800/60">
            <Row title="Bills & statements" testId="ai-images" checked={prefs.aiImages} onChange={(v) => set({ aiImages: v })}
              text={prefs.aiImages ? 'Photos go to Gemini to read items, taxes and transactions.' : 'Read on this phone (less accurate). Statement import needs AI.'} />
            <Row title="Bank SMS the app can’t read" testId="ai-sms" checked={prefs.aiSms} onChange={(v) => set({ aiSms: v })}
              text={prefs.aiSms ? 'Only messages the built-in reader misses go to Gemini.' : 'Unreadable messages are skipped.'} />
          </div>

          <div>
            <div className="label">Which key</div>
            <Select aria-label="Which key" value={prefs.aiSource} onChange={(v) => set({ aiSource: v as AiSource })} options={SOURCE_OPTIONS} />
          </div>

          {/* Split Now's (project) key */}
          <div className="rounded-2xl ring-1 ring-slate-200 dark:ring-white/10" data-testid="ai-app-status">
            <div className="flex items-center gap-2 px-3.5 pt-3 font-semibold"><Sparkles size={16} className="text-brand-500" /> Split Now’s key</div>
            <div className="space-y-1 px-3.5 pb-3 pt-1.5 text-sm">
              {status === undefined ? <div className="text-slate-500">Checking…</div> : status === null ? <div className="text-slate-500">Can’t check right now (offline, or not set up yet)</div> : (['images', 'sms'] as const).map((f) => {
                const l = appLine(f)!
                return (
                  <div key={f} className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">{f === 'images' ? 'Bills & statements' : 'SMS'}</span>
                    <span className={`flex items-center gap-1.5 font-medium ${l.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                      <span className={`h-2 w-2 rounded-full ${l.ok ? 'bg-emerald-500' : 'bg-slate-400'}`} />{l.text}
                    </span>
                  </div>
                )
              })}
              {status && prefs.aiSource === 'own' && <p className="pt-1 text-xs text-slate-500">Not used: you chose “Only my key”.</p>}
            </div>
          </div>

          {/* The user's own key */}
          <div className="rounded-2xl ring-1 ring-slate-200 dark:ring-white/10" data-testid="ai-own-key">
            <div className="flex items-center gap-2 px-3.5 pt-3 font-semibold"><KeyRound size={16} className="text-brand-500" /> Your Gemini key</div>
            <div className="space-y-3 px-3.5 pb-3.5 pt-1.5">
              {hasKey && !editing ? (
                <>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-mono text-slate-600 dark:text-slate-300">Saved · {state!.hint}</span>
                    {state?.lastError
                      ? <span className="text-right text-xs font-medium text-rose-600 dark:text-rose-400">{ERR[state.lastError.kind]} · {ago(state.lastError.at)}</span>
                      : <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Check size={14} /> Working{state?.lastOkAt ? ` · ${ago(state.lastOkAt)}` : ''}</span>}
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-secondary !min-h-0 flex-1 !py-2 text-sm" disabled={!!busy} onClick={() => run('test')}>
                      {busy === 'test' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Test
                    </button>
                    <button className="btn-secondary !min-h-0 flex-1 !py-2 text-sm" disabled={!!busy} onClick={() => setEditing(true)}><KeyRound size={16} /> Replace</button>
                    <button className="btn-secondary !min-h-0 !px-3 !py-2 text-sm text-rose-600" disabled={!!busy} onClick={() => run('remove')} aria-label="Remove key">
                      {busy === 'remove' ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                  </div>
                  <div>
                    <div className="label">Model</div>
                    <Select aria-label="Model" value={prefs.aiModel} onChange={(v) => set({ aiModel: v })} options={modelOptions} />
                    <p className="mt-1 text-xs text-slate-500">{models === null ? 'Loading the models your key can use…' : 'If a model is retired, the recommended one is used instead.'}</p>
                  </div>
                </>
              ) : (
                <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) void run('save') }}>
                  <input className="input font-mono text-sm" type="password" autoComplete="off" spellCheck={false} placeholder="Paste your Gemini API key" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Gemini API key" />
                  <div className="flex gap-2">
                    <button className="btn-primary !min-h-0 flex-1 !py-2.5 text-sm" disabled={!draft.trim() || !!busy}>
                      {busy === 'save' ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Save &amp; check
                    </button>
                    {editing && <button type="button" className="btn-ghost !min-h-0 !py-2.5 text-sm" onClick={() => { setEditing(false); setDraft('') }}>Cancel</button>}
                  </div>
                  <p className="text-xs text-slate-500">
                    Free at <a className="inline-flex items-center gap-0.5 font-semibold text-brand-600 dark:text-brand-300" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey <ExternalLink size={11} /></a>.
                    It’s checked with Google, then stored on Split Now’s server; the app only ever shows its last 4 characters.
                  </p>
                </form>
              )}
            </div>
          </div>
        </>
      )}

      {status?.admin && <p className="flex items-center gap-1.5 text-xs text-slate-500"><ShieldCheck size={14} className="text-brand-500" /> You’re an admin: Split Now’s key is managed in Admin · AI below.</p>}
    </div>
  )
}

function Row({ title, text, checked, onChange, testId }: { title: string; text: string; checked: boolean; onChange: (v: boolean) => void; testId: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-slate-500">{text}</div>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} testId={testId} />
    </div>
  )
}
