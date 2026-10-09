import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ExternalLink, KeyRound, Loader2, RefreshCw, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { repo } from '@/data'
import { useAiState } from '@/hooks/data'
import type { AiModel, AiState, AppAiStatusValue } from '@/data/repo'
import { useMe } from '@/hooks/auth'
import { useAiStatus } from '@/hooks/useAiStatus'
import { useFlag } from '@/hooks/useAppConfig'
import { aiAvailability } from '@/lib/ai-copy'
import { errText } from '@/lib/errors'
import { setAiScan } from '@/lib/ai'
import { DEFAULT_MODEL, type AiSource } from '@/lib/ai-config'
import { DEFAULT_ALL_PREFS, savePrefs, watchPrefs, type AllPrefs } from '@/lib/push'
import { Collapsible } from './Collapsible'
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
  not_listed: { text: 'Not turned on for your account', ok: false },
  feature_off: { text: 'Off for this', ok: false },
}

const ERR: Record<NonNullable<AiState['lastError']>['kind'], string> = {
  bad_key: 'Google rejected this key',
  quota: 'Over its quota (try later, or check billing)',
  model: 'The chosen model isn’t available',
  server: 'Gemini didn’t answer last time',
  billing: 'This key needs billing set up on its Google project',
  blocked: 'Google blocked the last request (safety filter)',
  truncated: 'The last answer was cut off; try fewer screenshots',
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

const TONE = { ok: 'bg-emerald-500', muted: 'bg-slate-400', warn: 'bg-amber-500' } as const

/** Lite models think minimally and cost a fraction of a cent per bill; the others are a different bill. */
export const modelHint = (m: AiModel & { lite?: boolean }) => (m.lite === false ? `${m.id} · costs ~10× more per bill` : m.lite ? `${m.id} · cheapest` : m.id)

/**
 * Settings → AI features. One switch and one consent sentence for everyone; which features, which
 * key, the user's own Gemini key and its model live under Advanced (opened by itself only when
 * the user's own key is the only way AI can work for them).
 */
export function AiSettings() {
  const { user } = useMe()
  const toast = useToast()
  const [prefs, setPrefs] = useState<AllPrefs>(DEFAULT_ALL_PREFS)
  const state = useAiState()
  const status = useAiStatus()
  // The admin's switch (config/app flags.aiImages). The server answers "off" anyway, so this only swaps the switch for the reason.
  const aiImages = useFlag('aiImages')
  const [models, setModels] = useState<AiModel[] | null>(null)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | null>(null)
  const [advanced, setAdvanced] = useState<boolean | null>(null)

  useEffect(() => watchPrefs(user.uid, setPrefs), [user.uid])
  const hasKey = !!state?.hint
  // Model list for the user's key, once there is one.
  useEffect(() => {
    if (!hasKey || models) return
    repo
      .aiModels('own')
      .then(setModels)
      .catch(() => setModels([]))
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
      if (kind === 'remove') {
        setModels(null)
        toast('Key removed')
      } else {
        setModels(r.models)
        setDraft('')
        setEditing(false)
        toast(kind === 'save' ? 'Key saved and working' : 'Key works')
      }
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(null)
    }
  }

  const avail = aiAvailability({ status, hasOwnKey: hasKey, ownKeyBroken: !!state?.lastError, enabled: prefs.aiEnabled })
  // The shared key can't serve this person: their own key is the only route, so show it.
  const byokOnly = !!status && status.app.images !== 'available' && status.app.sms !== 'available'
  const advancedOpen = advanced ?? (prefs.aiEnabled && byokOnly && !hasKey)
  const appLine = (f: 'images' | 'sms') => (status ? APP_STATUS[status.app[f]] : null)
  const modelOptions = [
    { value: '', label: 'Recommended (cheapest)', hint: DEFAULT_MODEL },
    ...(models ?? []).map((m) => ({ value: m.id, label: m.label, hint: modelHint(m) })),
    ...(prefs.aiModel && !(models ?? []).some((m) => m.id === prefs.aiModel) ? [{ value: prefs.aiModel, label: prefs.aiModel }] : []),
  ]

  return (
    <div data-testid="ai-settings">
      <div className="card p-4">
        <Row
          title="Read bills and SMS with AI"
          testId="ai-enabled"
          checked={prefs.aiEnabled}
          onChange={(v) => set({ aiEnabled: v })}
          text={
            prefs.aiEnabled
              ? 'Reads amounts, items and dates that the phone can’t.'
              : 'Off: nothing is sent to any AI. Bills are read on this phone, less accurately.'
          }
        />
        <p className="text-muted mt-3 text-xs">
          Photos of bills and statement screenshots, and bank SMS the built-in reader can’t make sense of, are sent to Google Gemini to read them. Nothing else
          leaves your phone, and nothing is sent while this is off.
        </p>
        {prefs.aiEnabled && (
          <p className="mt-3 flex items-center gap-2 text-sm font-medium" data-testid="ai-status-line">
            <span className={`h-2 w-2 shrink-0 rounded-full ${TONE[avail.tone]}`} aria-hidden />
            {avail.text}
            {!avail.images && !avail.sms && status && !hasKey && <span className="text-muted font-normal">· your own key works too (Advanced)</span>}
          </p>
        )}
      </div>

      {prefs.aiEnabled && (
        <Collapsible
          title="Advanced"
          summary="Which features, which key, your own Gemini key"
          open={advancedOpen}
          onOpenChange={setAdvanced}
          testId="ai-advanced"
        >
          <div className="space-y-5">
            <div className="space-y-4 rounded-2xl bg-slate-50 p-3.5 dark:bg-ink-800/60">
              {aiImages ? (
                <Row
                  title="Bills & statements"
                  testId="ai-images"
                  checked={prefs.aiImages}
                  onChange={(v) => set({ aiImages: v })}
                  text={
                    prefs.aiImages
                      ? 'Photos go to Gemini to read items, taxes and transactions.'
                      : 'Read on this phone (less accurate). Statement import needs AI.'
                  }
                />
              ) : (
                <div data-testid="ai-images-off">
                  <div className="font-semibold">Bills & statements</div>
                  <div className="text-muted text-sm">Reading bills with AI is switched off for everyone right now</div>
                </div>
              )}
              <Row
                title="Bank SMS the app can’t read"
                testId="ai-sms"
                checked={prefs.aiSms}
                onChange={(v) => set({ aiSms: v })}
                text={prefs.aiSms ? 'Only messages the built-in reader misses go to Gemini, with account numbers masked.' : 'Unreadable messages are skipped.'}
              />
              {prefs.aiSms && (
                <Row
                  title="Also ask Gemini who was paid"
                  testId="ai-sms-merchant"
                  checked={prefs.aiSmsMerchant}
                  onChange={(v) => set({ aiSmsMerchant: v })}
                  text="When the app reads the amount but not the payee, the masked message is sent to Gemini for the name. Off: such payments are saved as “Payment”."
                />
              )}
            </div>

            <div>
              <div className="label">Which key</div>
              <Select aria-label="Which key" value={prefs.aiSource} onChange={(v) => set({ aiSource: v as AiSource })} options={SOURCE_OPTIONS} />
            </div>

            {/* Split Now's (project) key */}
            <div className="rounded-2xl ring-1 ring-slate-200 dark:ring-white/10" data-testid="ai-app-status">
              <div className="flex items-center gap-2 px-3.5 pt-3 font-semibold">
                <Sparkles size={16} className="text-brand-500" aria-hidden /> Split Now’s key
              </div>
              <div className="space-y-1 px-3.5 pb-3 pt-1.5 text-sm">
                {status === undefined ? (
                  <div className="text-muted">Checking…</div>
                ) : status === null ? (
                  <div className="text-muted">Can’t check right now (offline, or not set up yet)</div>
                ) : (
                  (['images', 'sms'] as const).map((f) => {
                    const l = appLine(f)!
                    return (
                      <div key={f} className="flex items-center justify-between gap-2">
                        <span className="text-muted">{f === 'images' ? 'Bills & statements' : 'SMS'}</span>
                        <span className={`flex items-center gap-1.5 font-medium ${l.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted'}`}>
                          <span className={`h-2 w-2 rounded-full ${l.ok ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden />
                          {l.text}
                        </span>
                      </div>
                    )
                  })
                )}
                {status && prefs.aiSource === 'own' && <p className="text-muted pt-1 text-xs">Not used: you chose “Only my key”.</p>}
              </div>
            </div>

            {/* The user's own key */}
            <div className="rounded-2xl ring-1 ring-slate-200 dark:ring-white/10" data-testid="ai-own-key">
              <div className="flex items-center gap-2 px-3.5 pt-3 font-semibold">
                <KeyRound size={16} className="text-brand-500" aria-hidden /> Your own Gemini key
                {hasKey && (
                  <span
                    className={`ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${state?.lastError ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'}`}
                    data-testid="ai-own-badge"
                  >
                    {state?.lastError ? (
                      'Needs attention'
                    ) : (
                      <>
                        <Check size={13} strokeWidth={3} aria-hidden /> Set up
                      </>
                    )}
                  </span>
                )}
              </div>
              <div className="space-y-3 px-3.5 pb-3.5 pt-1.5">
                {hasKey && !editing ? (
                  <>
                    <p className="text-muted flex items-center gap-1.5 text-xs" data-testid="ai-own-status">
                      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${state?.lastError ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                      {state?.lastError ? (
                        <span>
                          Key <span className="font-mono">{state.hint}</span> · {ERR[state.lastError.kind]} · {ago(state.lastError.at)}
                        </span>
                      ) : (
                        <span>
                          Key set up (<span className="font-mono">{state!.hint}</span>) · working{state?.lastOkAt ? `, checked ${ago(state.lastOkAt)}` : ''}
                        </span>
                      )}
                    </p>
                    <div className="flex gap-2">
                      <button type="button" className="btn-secondary btn-sm flex-1" disabled={!!busy} onClick={() => run('test')}>
                        {busy === 'test' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <RefreshCw size={16} aria-hidden />} Test
                      </button>
                      <button type="button" className="btn-secondary btn-sm flex-1" disabled={!!busy} onClick={() => setEditing(true)}>
                        <KeyRound size={16} aria-hidden /> Replace
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm !px-3 text-rose-700 dark:text-rose-400"
                        disabled={!!busy}
                        onClick={() => run('remove')}
                        aria-label="Remove key"
                      >
                        {busy === 'remove' ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
                    </div>
                  </>
                ) : (
                  <form
                    className="space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (draft.trim()) void run('save')
                    }}
                  >
                    <input
                      className="input font-mono"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="Paste your Gemini API key"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      aria-label="Gemini API key"
                    />
                    <div className="flex gap-2">
                      <button type="submit" className="btn-primary btn-sm flex-1" disabled={!draft.trim() || !!busy}>
                        {busy === 'save' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <ShieldCheck size={16} aria-hidden />} Save &amp; check
                      </button>
                      {editing && (
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => {
                            setEditing(false)
                            setDraft('')
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>
                )}
                <p className="text-muted text-xs">
                  Keys come from{' '}
                  <a
                    className="inline-flex items-center gap-0.5 font-semibold text-brand-600 dark:text-brand-300"
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    aistudio.google.com/apikey <ExternalLink size={11} aria-hidden />
                  </a>
                  . Google’s free tier may use what you send to improve its models and isn’t meant for personal data, so for bills and bank messages use a key
                  from a project with billing turned on (the paid tier). The key is checked with Google, then kept on Split Now’s server; the app only ever
                  shows its last 4 characters.
                </p>
                <div>
                  <div className="label">Model for your key</div>
                  <Select aria-label="Model" value={prefs.aiModel} onChange={(v) => set({ aiModel: v })} options={modelOptions} />
                  <p className="text-muted mt-1 text-xs">
                    {!hasKey
                      ? 'Add a key to see every model it can use.'
                      : models === null
                        ? 'Loading the models your key can use…'
                        : 'If a model is retired, the recommended one is used instead.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Collapsible>
      )}

      {status?.admin && (
        <p className="text-muted mt-3 flex items-center gap-1.5 px-1 text-xs">
          <ShieldCheck size={14} className="text-brand-500" aria-hidden /> You’re an admin: Split Now’s key is managed under{' '}
          <Link to="/settings/admin" className="font-semibold text-brand-600 dark:text-brand-300">
            Admin
          </Link>
          .
        </p>
      )}
    </div>
  )
}

function Row({ title, text, checked, onChange, testId }: { title: string; text: string; checked: boolean; onChange: (v: boolean) => void; testId: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        <div className="text-muted text-sm">{text}</div>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} testId={testId} />
    </div>
  )
}
