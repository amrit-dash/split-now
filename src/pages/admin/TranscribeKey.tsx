import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, KeyRound, Loader2, Mic, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { repo } from '@/data'
import type { AiStatusResult } from '@/data/repo'
import { refreshAiStatus } from '@/hooks/useAiStatus'
import { errText } from '@/lib/errors'
import { useConfirm } from '@/components/ConfirmSheet'
import { Select } from '@/components/Select'
import { SettingsSection } from '@/components/SettingsSection'
import { useToast } from '@/components/Toast'
import { DEFAULT_TRANSCRIBE_MODEL, TRANSCRIBE_MODELS, type TranscribeTestResult } from '../../../shared/transcribe'

const BILLING: Record<string, { text: string; tone: string }> = {
  billed: { text: 'Billed', tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
  unknown: { text: 'Billing not confirmed', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200' },
}

/**
 * Remove a key, at the right of its section's heading (owner, 24 Oct 2026): rarely needed (a leaked
 * key, or to stop paying for it), so it stays out of the Test / Replace key row.
 */
export function RemoveKeyButton({ busy, disabled, onClick, label }: { busy: boolean; disabled: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      className="-my-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-rose-700 transition hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Trash2 size={16} aria-hidden />}
    </button>
  )
}

/**
 * Admin → AI → Transcription key: a separate Gemini key that only hears voice (transcribeAi), for
 * people who choose AI transcription. Its own model (Flash-Lite 3.5 recommended, 3.1 allowed, saved
 * with the rest of config/ai), a Test that has the model hear a moment of silence, and a billing
 * check: Google's free tier may use what is sent, and voice is personal, so a free-tier key is refused.
 */
export function TranscribeKey({
  status,
  model,
  onModel,
  usedToday,
}: {
  status: AiStatusResult
  model: string
  onModel: (m: string) => void
  usedToday: number
}) {
  const toast = useToast()
  const confirm = useConfirm()
  // What the last Save / Remove answered wins over the status until the status agrees: aiStatus can
  // lag the save by a moment, and the screen must show the key just saved (with Test), not the paste box again.
  const [saved, setSaved] = useState<{ configured: boolean; hint?: string; billing?: string } | null>(null)
  const t = saved && saved.configured !== !!status.transcribe?.configured ? { ...status.transcribe, ...saved } : status.transcribe
  const configured = !!t?.configured
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<'set' | 'test' | 'remove' | null>(null)
  const [result, setResult] = useState<TranscribeTestResult | null>(null)
  const billing = result?.billing ?? t?.billing ?? 'unknown'

  const act = async (action: 'set' | 'test' | 'remove') => {
    setBusy(action)
    try {
      const r = await repo.transcribeKey(action, action === 'set' ? draft : undefined)
      setResult(action === 'remove' ? null : r)
      if (action === 'set') setSaved({ configured: true, hint: r.hint ?? undefined, billing: r.billing })
      if (action === 'remove') setSaved({ configured: false })
      setDraft('')
      setEditing(false)
      toast(
        action === 'set'
          ? 'Transcription key saved'
          : action === 'test'
            ? `Transcription key works${r.ms ? ` (${(r.ms / 1000).toFixed(1)} s)` : ''}`
            : 'Transcription key removed',
      )
      await refreshAiStatus()
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    const ok = await confirm({
      title: 'Remove the transcription key?',
      message: 'AI transcription stops until a key is added again. The key can’t be shown again.',
      confirmLabel: 'Remove',
      tone: 'danger',
    })
    if (ok) void act('remove')
  }

  return (
    <SettingsSection
      icon={<Mic size={16} aria-hidden />}
      title="Transcription key"
      testId="admin-ai-section-transcribe"
      action={
        configured && !editing ? <RemoveKeyButton busy={busy === 'remove'} disabled={!!busy} onClick={remove} label="Remove the transcription key" /> : null
      }
    >
      <div className="space-y-3" data-testid="admin-ai-transcribe">
        {editing || !configured ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (draft.trim()) void act('set')
            }}
          >
            <input
              className="input font-mono"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste a billed Gemini API key"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Transcription Gemini API key"
            />
            <div className="flex gap-2">
              <button type="submit" className="btn-primary !min-h-0 flex-1 !py-2.5 text-sm" disabled={!draft.trim() || !!busy}>
                {busy === 'set' ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Save &amp; check
              </button>
              {configured && (
                <button
                  type="button"
                  className="btn-ghost !min-h-0 !py-2.5 text-sm"
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
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary !min-h-0 flex-1 whitespace-nowrap !px-3 !py-2 text-sm"
              disabled={!!busy}
              onClick={() => act('test')}
              data-testid="admin-ai-transcribe-test"
            >
              {busy === 'test' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Test
            </button>
            <button
              type="button"
              className="btn-secondary !min-h-0 flex-1 whitespace-nowrap !px-3 !py-2 text-sm"
              disabled={!!busy}
              onClick={() => setEditing(true)}
            >
              <KeyRound size={16} /> Replace key
            </button>
          </div>
        )}
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500" data-testid="admin-ai-transcribe-status">
          <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {configured ? `Transcription key set up${t?.hint ? ` · ${t.hint}` : ''}` : 'No transcription key'}
          {configured && (
            <span className={`rounded-full px-2 py-0.5 font-semibold ${(BILLING[billing] ?? BILLING.unknown).tone}`} data-testid="admin-ai-transcribe-billing">
              {(BILLING[billing] ?? BILLING.unknown).text}
            </span>
          )}
        </p>
        {result?.ms !== undefined && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 size={14} aria-hidden /> {result.model} heard a test clip in {(result.ms / 1000).toFixed(1)} s
          </p>
        )}
        <div>
          <div className="label">Model for transcription</div>
          <Select
            aria-label="Model for transcription"
            value={model}
            onChange={onModel}
            options={[
              { value: '', label: 'Recommended', hint: DEFAULT_TRANSCRIBE_MODEL },
              ...TRANSCRIBE_MODELS.map((m) => ({ value: m, label: m, hint: m === DEFAULT_TRANSCRIBE_MODEL ? 'Flash-Lite, newest' : 'Flash-Lite, older' })),
            ]}
          />
          <p className="text-muted mt-1 text-xs">
            Only the phone’s own recognition is free; this key pays for people who pick AI. A free-tier key is refused: Google may use what is sent on it, and
            voice is personal.
          </p>
        </div>
        <p className="text-muted text-xs">
          Who may use it: Transcription with AI and Everyone may use Split Now’s transcription key, in{' '}
          <Link to="/admin/flags" className="font-semibold text-brand-600 dark:text-brand-300">
            Flags → AI
          </Link>
          . How much: Limits → Voice. Today: {usedToday} recording{usedToday === 1 ? '' : 's'} on this key.
        </p>
      </div>
    </SettingsSection>
  )
}
