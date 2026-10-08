import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DEFAULT_LIMITS, LIMIT_META, LIMIT_NAMES, resolveLimits, type Limits as LimitsDoc } from '../../../shared/limits'
import { errText } from '@/lib/errors'
import { Loading } from '@/components/Misc'
import { useToast } from '@/components/Toast'
import { limitsDoc, saveConfig } from './api'
import { ChangedBy, DirtyBar, IntField, useConfigDoc } from './common'

const same = (a: LimitsDoc, b: LimitsDoc) => LIMIT_NAMES.every((k) => a[k] === b[k])

/** /admin/limits: the rate limits the Cloud Functions read (config/limits). Defaults are what the code shipped with. */
export default function Limits() {
  const toast = useToast()
  const { raw, loading } = useConfigDoc('limits')
  const saved = useMemo(() => resolveLimits(raw), [raw])
  const audit = (raw && typeof raw === 'object' ? raw : {}) as { updatedAt?: number; updatedBy?: string }
  const [draft, setDraft] = useState<LimitsDoc | null>(null)
  const [saving, setSaving] = useState(false)
  if (loading) return <Loading />
  const cfg = draft ?? saved
  const dirty = !same(cfg, saved)
  const isDefault = same(cfg, DEFAULT_LIMITS)

  const save = async () => {
    setSaving(true)
    try {
      await saveConfig('limits', await limitsDoc(cfg))
      setDraft(null)
      toast('Limits saved. Functions pick them up within a minute')
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div data-testid="admin-limits">
      <div className="card divide-y divide-slate-100 p-4 dark:divide-white/5">
        {LIMIT_NAMES.map((k) => (
          <IntField
            key={k}
            id={`limit-${k}`}
            label={LIMIT_META[k].label}
            hint={LIMIT_META[k].hint || undefined}
            value={cfg[k]}
            min={LIMIT_META[k].min}
            max={LIMIT_META[k].max}
            onChange={(v) => setDraft({ ...cfg, [k]: v })}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 px-1">
        <p className="text-muted text-xs">Counted in fixed hourly and daily windows per key or person (rateLimits/*, server only).</p>
        <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => setDraft({ ...DEFAULT_LIMITS })} disabled={isDefault}>
          Reset to defaults
        </button>
      </div>
      <ChangedBy at={audit.updatedAt} by={audit.updatedBy} />
      <div className="card mt-4 p-4 text-sm">
        <b>Split Now’s shared AI key</b> has its own limits (per person per hour and day, and the daily budget for everyone) next to the key itself, in the{' '}
        <Link to="/admin/ai" className="font-semibold text-brand-600 dark:text-brand-300">
          AI tab
        </Link>
        .
      </div>
      <DirtyBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => setDraft(null)} testId="admin-limits-dirty" />
    </div>
  )
}
