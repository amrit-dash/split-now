import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Cpu, ImageIcon, KeyRound, Loader2, RefreshCw, RotateCcw, Save, ShieldCheck, ToggleRight, UsersRound, Wallet } from 'lucide-react'
import { repo } from '@/data'
import type { AiModel, AiStatusResult } from '@/data/repo'
import { refreshAiStatus } from '@/hooks/useAiStatus'
import { useAppConfig } from '@/hooks/useAppConfig'
import { FLAG_SECTIONS, onCount } from '@/lib/admin-sections'
import { DEFAULT_MODEL, MAX_ALLOW_EMAILS, normaliseEmail, resolveAppAi, type AppAiConfig, type AppAiEngine, type AppAiMode } from '@/lib/ai-config'
import { errText } from '@/lib/errors'
import { modelHint } from '@/components/AiSettings'
import { todayISO } from '@/lib/id'
import { pictureModelOptions } from '@/lib/icon-ai'
import { pictureCost } from '../../../shared/icon-ai'
import { PictureTest } from '@/components/PictureTest'
import { SettingsSection } from '@/components/SettingsSection'
import { Select } from '@/components/Select'
import { Switch } from '@/components/Switch'
import { useToast } from '@/components/Toast'
import { RemoveKeyButton, TranscribeKey } from './TranscribeKey'
import { useConfirm } from '@/components/ConfirmSheet'

const MODES: Array<{ value: AppAiMode; label: string; hint: string }> = [
  { value: 'off', label: 'Off', hint: 'Only people’s own keys work' },
  { value: 'everyone', label: 'Everyone', hint: 'Every signed-in user' },
  { value: 'allowlist', label: 'Only these emails', hint: 'Listed below' },
]

const ENGINES: Array<{ value: AppAiEngine; label: string; hint: string }> = [
  { value: 'gemini', label: 'Gemini on this key', hint: 'Fast, paid per bill on the key’s Google project' },
  { value: 'gemma', label: 'Gemma (free)', hint: 'Google’s open model, free on any key, slower' },
]

const same = (a: AppAiConfig, b: AppAiConfig) => JSON.stringify(a) === JSON.stringify(b)
const AI_FLAGS = FLAG_SECTIONS.find((s) => s.id === 'ai')?.keys ?? []

/**
 * Admins only: Split Now's (project) Gemini key. The key itself (Secret Manager's GEMINI_API_KEY,
 * or one set here, which wins), who may use it, for what, which model, limits. Edits collect
 * locally; a small Save / Discard bar shows only while something has changed.
 */
export function AdminAi({ status }: { status: AiStatusResult }) {
  const toast = useToast()
  const confirm = useConfirm()
  const { flags } = useAppConfig()
  const [saved, setSaved] = useState<AppAiConfig | null>(null)
  const [cfg, setCfg] = useState<AppAiConfig | null>(null)
  const [emails, setEmails] = useState('')
  const [models, setModels] = useState<AiModel[] | null>(null)
  const [gemma, setGemma] = useState<AiModel[] | null>(null)
  const [usage, setUsage] = useState<Record<string, number> | null>(null)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState('')
  const [editingKey, setEditingKey] = useState(false)
  const [keyBusy, setKeyBusy] = useState<'set' | 'test' | 'remove' | null>(null)
  const configured = status.app.configured !== false
  const source = status.app.source ?? (configured ? 'secret' : null)

  useEffect(
    () =>
      repo.watchAppAi((raw) => {
        const r = resolveAppAi(raw)
        setSaved(r)
        setCfg((c) => {
          if (c) return c // keep unsaved edits
          setEmails(r.allowEmails.join('\n'))
          return r
        })
      }),
    [],
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: status.app.hint is the trigger; a changed key (new hint) means the model list must be fetched again.
  useEffect(() => {
    if (configured)
      repo
        .aiModels('app')
        .then(setModels)
        .catch(() => setModels([]))
  }, [configured, status.app.hint])
  // The Gemma models the key can use, newest first: "Latest" follows Google's releases on its own.
  const onGemma = cfg?.engine === 'gemma'
  // biome-ignore lint/correctness/useExhaustiveDependencies: a changed key (new hint) means the list must be fetched again.
  useEffect(() => {
    if (configured && onGemma)
      repo
        .aiModels('gemma')
        .then(setGemma)
        .catch(() => setGemma([]))
  }, [configured, onGemma, status.app.hint])
  // The image models the key can draw with, once pictures are on.
  const [pictureModels, setPictureModels] = useState<AiModel[] | null>(null)
  const picturesOn = !!cfg?.pictures
  // biome-ignore lint/correctness/useExhaustiveDependencies: a changed key (new hint) means the list must be fetched again.
  useEffect(() => {
    if (configured && picturesOn)
      repo
        .aiModels('app', 'pictures')
        .then(setPictureModels)
        .catch(() => setPictureModels([]))
  }, [configured, picturesOn, status.app.hint])
  useEffect(() => {
    repo
      .aiUsage(todayISO())
      .then(setUsage)
      .catch(() => {})
  }, [])

  if (!cfg || !saved) return <div className="text-muted text-sm">Loading…</div>
  const set = (p: Partial<AppAiConfig>) => setCfg({ ...cfg, ...p })
  const list = [
    ...new Set(
      emails
        .split(/[\s,;]+/)
        .filter((e) => e.includes('@'))
        .map(normaliseEmail),
    ),
  ]
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
  const discard = () => {
    setCfg(saved)
    setEmails(saved.allowEmails.join('\n'))
  }

  const keyAction = async (action: 'set' | 'test' | 'remove') => {
    setKeyBusy(action)
    try {
      const r = await repo.aiKey(action, action === 'set' ? draft : undefined, 'app')
      if (action !== 'remove') setModels(r.models)
      setDraft('')
      setEditingKey(false)
      toast(
        action === 'set'
          ? 'Project key saved and working'
          : action === 'test'
            ? 'Project key works'
            : r.source
              ? 'Back to GEMINI_API_KEY'
              : 'Project key removed',
      )
      await refreshAiStatus()
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setKeyBusy(null)
    }
  }

  const n = (k: string) => usage?.[k] ?? 0
  return (
    <div data-testid="admin-ai">
      <SettingsSection icon={<ToggleRight size={16} aria-hidden />} title="Feature switches" testId="admin-ai-section-flags">
        {/* The AI switches live with the other feature flags (one save per document); this row says where, and how many are on. */}
        <Link
          to="/admin/flags"
          className="flex min-h-11 items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3.5 py-2.5 text-sm dark:bg-ink-800/60"
          data-testid="admin-ai-flags"
        >
          <span className="min-w-0">
            <span className="block font-semibold">AI feature switches</span>
            <span className="text-muted block text-xs">Bills, SMS, Quick add, chat, payment screenshots and transcription, in Flags → AI</span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-brand-600 dark:text-brand-300">{onCount(flags, AI_FLAGS)}</span>
        </Link>
      </SettingsSection>
      <SettingsSection
        icon={<KeyRound size={16} aria-hidden />}
        title="Project key"
        testId="admin-ai-section-key"
        // Only a key pasted here can go: removing it falls back to the GEMINI_API_KEY secret, which lives on the server.
        action={
          configured && source === 'admin' && !editingKey ? (
            <RemoveKeyButton
              busy={keyBusy === 'remove'}
              disabled={!!keyBusy}
              label="Remove this key and go back to GEMINI_API_KEY"
              onClick={async () => {
                const ok = await confirm({
                  title: 'Remove this project key?',
                  message: 'Split Now goes back to the GEMINI_API_KEY secret. This key can’t be shown again.',
                  confirmLabel: 'Remove',
                  tone: 'danger',
                })
                if (ok) void keyAction('remove')
              }}
            />
          ) : null
        }
      >
        {/* The project key: where it comes from, and a way to use a different one. */}
        <div>
          {editingKey || !configured ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (draft.trim()) void keyAction('set')
              }}
            >
              <input
                className="input font-mono"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste a Gemini API key"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="Project Gemini API key"
              />
              <div className="flex gap-2">
                <button type="submit" className="btn-primary !min-h-0 flex-1 !py-2.5 text-sm" disabled={!draft.trim() || !!keyBusy}>
                  {keyBusy === 'set' ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Save &amp; check
                </button>
                {configured && (
                  <button
                    type="button"
                    className="btn-ghost !min-h-0 !py-2.5 text-sm"
                    onClick={() => {
                      setEditingKey(false)
                      setDraft('')
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Used instead of {source === 'admin' ? 'the current key' : 'GEMINI_API_KEY'}; stored on the server, never shown again.
              </p>
            </form>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary !min-h-0 flex-1 whitespace-nowrap !px-3 !py-2 text-sm"
                disabled={!!keyBusy}
                onClick={() => keyAction('test')}
              >
                {keyBusy === 'test' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Test
              </button>
              <button
                type="button"
                className="btn-secondary !min-h-0 flex-1 whitespace-nowrap !px-3 !py-2 text-sm"
                disabled={!!keyBusy}
                onClick={() => setEditingKey(true)}
              >
                <KeyRound size={16} /> Replace key
              </button>
            </div>
          )}
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500" data-testid="admin-ai-key-status">
            <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {!configured
              ? 'No project key (GEMINI_API_KEY isn’t set)'
              : source === 'admin'
                ? `Project key set up (set in the app${status.app.hint ? ` · ${status.app.hint}` : ''})`
                : 'Project key set up (GEMINI_API_KEY)'}
          </p>
        </div>
      </SettingsSection>
      {/* A third key, for voice only: separate from the project key, always billed (TranscribeKey, its own section). */}
      <TranscribeKey status={status} model={cfg.transcribeModel} onModel={(m) => set({ transcribeModel: m })} usedToday={usage?.transcribe_app ?? 0} />
      <SettingsSection icon={<Cpu size={16} aria-hidden />} title="Engine and model" testId="admin-ai-section-engine">
        <div>
          <div className="label">Split Now’s AI runs on</div>
          <Select
            aria-label="Split Now’s AI runs on"
            value={cfg.engine}
            onChange={(v) => set({ engine: v as AppAiEngine, ...(v === 'gemma' && cfg.mode === 'allowlist' ? { mode: 'everyone' as const } : {}) })}
            options={ENGINES}
          />
          <p className="mt-1 text-xs text-slate-500" data-testid="admin-ai-engine-note">
            {cfg.engine === 'gemma'
              ? 'Free on any key and reads everything Gemini does, but slower (up to a minute a bill). Google’s free-service terms apply: Google may use what is sent to improve its products. It is for everyone, and each person turns on “Use free AI” in their AI settings first, where they see this.'
              : 'People are told their bills go through Google’s paid Gemini API, which doesn’t train on them: keep billing on for this key’s Google project.'}
          </p>
        </div>

        {cfg.engine === 'gemma' ? (
          <div>
            <div className="label">Gemma model</div>
            <Select
              aria-label="Gemma model"
              value={cfg.gemmaModel}
              onChange={(v) => set({ gemmaModel: v })}
              options={[
                { value: '', label: 'Latest Gemma (automatic)', hint: gemma?.[0]?.id ?? 'the newest the key can use' },
                ...(gemma ?? []).map((m) => ({ value: m.id, label: m.label, hint: m.id })),
                ...(cfg.gemmaModel && !(gemma ?? []).some((m) => m.id === cfg.gemmaModel) ? [{ value: cfg.gemmaModel, label: cfg.gemmaModel }] : []),
              ]}
            />
            <p className="mt-1 text-xs text-slate-500">
              {!configured
                ? 'Add a key to list its Gemma models.'
                : gemma === null
                  ? 'Loading Gemma models…'
                  : 'Automatic moves to a newer Gemma when Google releases one. A retired pick falls back to the latest.'}
            </p>
          </div>
        ) : (
          <div>
            <div className="label">Model</div>
            <Select
              aria-label="Project model"
              value={cfg.model}
              onChange={(v) => set({ model: v })}
              options={[
                { value: DEFAULT_MODEL, label: 'Recommended (cheapest)', hint: DEFAULT_MODEL },
                ...(models ?? []).filter((m) => m.id !== DEFAULT_MODEL).map((m) => ({ value: m.id, label: m.label, hint: modelHint(m) })),
                ...(cfg.model !== DEFAULT_MODEL && !(models ?? []).some((m) => m.id === cfg.model) ? [{ value: cfg.model, label: cfg.model }] : []),
              ]}
            />
            <p className="mt-1 text-xs text-slate-500">
              {!configured ? 'Add a key to list its models.' : models === null ? 'Loading models…' : 'A retired model falls back to the recommended one.'}
            </p>
          </div>
        )}
      </SettingsSection>
      <SettingsSection icon={<UsersRound size={16} aria-hidden />} title="Who can use it, and how much" testId="admin-ai-section-who">
        <div>
          <div className="label">Who can use Split Now’s key</div>
          <Select
            aria-label="Who can use Split Now’s key"
            value={cfg.mode}
            onChange={(v) => set({ mode: v as AppAiMode })}
            options={cfg.engine === 'gemma' ? MODES.filter((m) => m.value !== 'allowlist') : MODES}
          />
        </div>
        {cfg.mode === 'allowlist' && (
          <div>
            <label className="label" htmlFor="ai-allow">
              Allowed emails
            </label>
            <textarea
              id="ai-allow"
              className="input min-h-24 font-mono"
              placeholder={'one@example.com\ntwo@example.com'}
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              {list.length} email{list.length === 1 ? '' : 's'} · the account’s sign-in email must match.
            </p>
          </div>
        )}
        {cfg.mode !== 'off' && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="label">Person / day</span>
                <input
                  className="input !px-3"
                  inputMode="numeric"
                  value={cfg.perDay}
                  onChange={(e) => set({ perDay: Math.max(1, Math.min(5000, parseInt(e.target.value, 10) || 1)) })}
                />
              </label>
              <label className="block">
                <span className="label">Person / hour</span>
                <input
                  className="input !px-3"
                  inputMode="numeric"
                  value={cfg.perHour}
                  onChange={(e) => set({ perHour: Math.max(1, Math.min(1000, parseInt(e.target.value, 10) || 1)) })}
                />
              </label>
              <label className="block">
                <span className="label">Everyone / day</span>
                <input
                  className="input !px-3"
                  inputMode="numeric"
                  value={cfg.globalPerDay}
                  onChange={(e) => set({ globalPerDay: Math.max(1, Math.min(100_000, parseInt(e.target.value, 10) || 1)) })}
                />
              </label>
            </div>
            <p className="text-muted -mt-1 text-xs">
              “Everyone / day” is the hard budget for Split Now’s key across all users; past it, AI reading waits until tomorrow.
            </p>
          </>
        )}
      </SettingsSection>
      {cfg.mode !== 'off' && (
        <>
          {/* What the shared key may be spent on (config/ai images, sms). Not the same as the AI feature flags:
              these only stop Split Now paying; people's own keys keep working (appKeyAllowed, shared/ai-config.ts). */}
          <SettingsSection icon={<Wallet size={16} aria-hidden />} title="What Split Now’s key pays for" testId="admin-ai-pays-for">
            {/* Not the Flags (owner asked, 22 Oct 2026): these are spending on Split Now's key, kept with the
                key and its limits; Flags switch a feature off for everyone. Each says which it is. */}
            <Toggle
              title="Bills, statements, Quick add and chat"
              sub="On Split Now’s key. Off: only people with their own key get AI for these."
              checked={cfg.images}
              onChange={(v) => set({ images: v })}
            />
            <Toggle
              title="Bank SMS"
              sub="On Split Now’s key. Off: only people with their own key get AI for SMS."
              checked={cfg.sms}
              onChange={(v) => set({ sms: v })}
            />
            <p className="text-muted text-xs" data-testid="admin-ai-quick-add">
              Payment screenshot checks count under the first one too, with its limits under Who can use it. Off here, people with their own key still use AI.
              To turn a feature off for everyone, own keys included, use{' '}
              <Link to="/admin/flags" className="font-semibold text-brand-600 dark:text-brand-300">
                Flags → AI
              </Link>
              .
            </p>
          </SettingsSection>
          <SettingsSection icon={<ImageIcon size={16} aria-hidden />} title="Pictures for icons" testId="admin-ai-section-pictures">
            {/* Image models have no free tier: each picture is billed to the project, whichever engine reads bills (the key needs billing). */}
            <div className="space-y-2" data-testid="admin-ai-pictures">
              <Toggle
                title={`Draw a picture (${pictureCost(cfg.pictureModel || undefined)} each)`}
                checked={cfg.pictures}
                onChange={(v) => set({ pictures: v })}
              />
              {cfg.pictures && (
                <div data-testid="admin-ai-picture-model">
                  <div className="label">Model for pictures</div>
                  <PictureTest which="app" model={cfg.pictureModel}>
                    <Select
                      aria-label="Model for pictures"
                      value={cfg.pictureModel}
                      onChange={(v) => set({ pictureModel: v })}
                      options={pictureModelOptions(pictureModels, cfg.pictureModel)}
                    />
                  </PictureTest>
                  <p className="text-muted mt-1 text-xs">
                    {pictureModels === null
                      ? 'Loading the image models the key can use…'
                      : 'Image models have no free tier: the key needs billing, also when Gemma reads bills. A failed model falls back to the recommended one.'}
                  </p>
                </div>
              )}
              {cfg.pictures && (
                <label className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 text-sm">Pictures per person, per day</span>
                  <input
                    className="input !w-20 !px-3"
                    inputMode="numeric"
                    aria-label="Pictures per person, per day"
                    value={cfg.picturesPerDay}
                    onChange={(e) => set({ picturesPerDay: Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)) })}
                  />
                </label>
              )}
            </div>
          </SettingsSection>
        </>
      )}
      <SettingsSection icon={<BarChart3 size={16} aria-hidden />} title="Today" testId="admin-ai-section-today">
        <div className="text-sm">
          <div className="mb-1 font-semibold">Today</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat n={n('app')} label="Split Now key" />
            <Stat n={n('own')} label="Own keys" />
            <Stat n={n('errors')} label="Failed" />
          </div>
          {n('app_gemma') > 0 && <p className="text-muted mt-1.5 text-xs">Free AI (Gemma): {n('app_gemma')} of the Split Now key’s calls</p>}
          {n('app_quickAdd') + n('own_quickAdd') > 0 && (
            <p className="text-muted mt-1.5 text-xs">
              Quick add with AI: {n('app_quickAdd') + n('own_quickAdd')} of these ({n('app_quickAdd')} on Split Now’s key)
            </p>
          )}
          {n('app_chat') + n('own_chat') > 0 && (
            <p className="text-muted mt-1.5 text-xs">
              Chat suggestions with AI: {n('app_chat') + n('own_chat')} of these ({n('app_chat')} on Split Now’s key)
            </p>
          )}
        </div>
      </SettingsSection>
      {dirty && (
        <div
          className="animate-pop sticky bottom-[var(--lane)] z-10 flex items-center gap-2 rounded-2xl bg-brand-50 p-2 pl-3.5 shadow-lg ring-1 ring-brand-500/20 dark:bg-ink-800 dark:ring-brand-400/30"
          data-testid="admin-ai-dirty"
        >
          <span className="min-w-0 flex-1 text-sm font-medium text-brand-800 dark:text-brand-200">Unsaved changes</span>
          <button type="button" className="btn-ghost !min-h-0 !px-3 !py-2 text-sm" onClick={discard} disabled={saving}>
            <RotateCcw size={16} /> Discard
          </button>
          <button type="button" className="btn-primary !min-h-0 !px-4 !py-2 text-sm" onClick={save} disabled={saving} data-testid="admin-ai-save">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save
          </button>
        </div>
      )}
    </div>
  )
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="text-lg font-bold tabular-nums">{n}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  )
}

function Toggle({ title, sub, checked, onChange }: { title: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        {sub && <span className="text-muted block text-xs">{sub}</span>}
      </span>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  )
}
