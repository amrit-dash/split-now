import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DEFAULT_LIMITS, LIMIT_META, LIMIT_NAMES, resolveLimits, type Limits as LimitsDoc } from '../../../shared/limits'
import { DEFAULT_TUNING, TUNING_META, TUNING_NAMES, type AppTuning } from '../../../shared/app-tuning'
import { useMe } from '@/hooks/auth'
import { errText } from '@/lib/errors'
import { resolveAppConfig, toAppConfigDoc } from '@/lib/flags'
import { Loading } from '@/components/Misc'
import { useToast } from '@/components/Toast'
import { LIMIT_SECTIONS } from '@/lib/admin-sections'
import { limitsDoc, saveConfig } from './api'
import { ChangedBy, DirtyBar, IntField, useConfigDoc } from './common'

const same = (a: LimitsDoc, b: LimitsDoc) => LIMIT_NAMES.every((k) => a[k] === b[k])
const sameTuning = (a: AppTuning, b: AppTuning) => TUNING_NAMES.every((k) => a[k] === b[k])

/**
 * /admin/limits: the rate limits the Cloud Functions read (config/limits), and the app's tunable
 * numbers (config/app `tuning`: Updates paging, Recently deleted days), which every client reads.
 * Defaults are what the code shipped with.
 */
export default function Limits() {
  const toast = useToast()
  const { user } = useMe()
  const { raw, loading } = useConfigDoc('limits')
  const app = useConfigDoc('app')
  const savedApp = useMemo(() => resolveAppConfig(app.raw), [app.raw])
  const [tDraft, setTDraft] = useState<AppTuning | null>(null)
  const saved = useMemo(() => resolveLimits(raw), [raw])
  const audit = (raw && typeof raw === 'object' ? raw : {}) as { updatedAt?: number; updatedBy?: string }
  const [draft, setDraft] = useState<LimitsDoc | null>(null)
  const [saving, setSaving] = useState(false)
  if (loading || app.loading) return <Loading />
  const cfg = draft ?? saved
  const tun = tDraft ?? savedApp.tuning
  const limitsDirty = !same(cfg, saved)
  const tuningDirty = !sameTuning(tun, savedApp.tuning)
  const dirty = limitsDirty || tuningDirty
  const isDefault = same(cfg, DEFAULT_LIMITS)

  const save = async () => {
    setSaving(true)
    try {
      if (limitsDirty) await saveConfig('limits', await limitsDoc(cfg))
      // The whole config/app document is replaced: keep its flags and settings as they are.
      if (tuningDirty) await saveConfig('app', toAppConfigDoc({ ...savedApp, tuning: tun }, user.uid))
      setDraft(null)
      setTDraft(null)
      toast('Saved. Functions pick it up within a minute, the app on its next config read')
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pb-[calc(var(--lane)-var(--nav-h))]" data-testid="admin-limits">
      <h2 className="px-1 text-lg font-extrabold">Rate limits</h2>
      {LIMIT_SECTIONS.map((s) => (
        <section key={s.id} aria-labelledby={`limits-${s.id}-title`} data-testid={`limit-section-${s.id}`}>
          <h3 id={`limits-${s.id}-title`} className="mb-0.5 mt-4 px-1 font-bold">
            {s.title}
          </h3>
          <p className="text-muted mb-2 px-1 text-xs">{s.hint}</p>
          <div className="card divide-y divide-slate-100 p-4 dark:divide-white/5">
            {s.keys.map((k) => (
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
        </section>
      ))}
      <div className="mt-3 flex items-center justify-between gap-3 px-1">
        <p className="text-muted text-xs">Counted in fixed hourly and daily windows per key or person (rateLimits/*, server only).</p>
        <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => setDraft({ ...DEFAULT_LIMITS })} disabled={isDefault}>
          Reset to defaults
        </button>
      </div>
      <ChangedBy at={audit.updatedAt} by={audit.updatedBy} />
      <h2 className="mt-6 mb-2 px-1 text-lg font-extrabold">App</h2>
      <div className="card divide-y divide-slate-100 p-4 dark:divide-white/5" data-testid="admin-tuning">
        {TUNING_NAMES.map((k) => (
          <IntField
            key={k}
            id={`tuning-${k}`}
            label={TUNING_META[k].label}
            hint={TUNING_META[k].hint}
            value={tun[k]}
            min={TUNING_META[k].min}
            max={TUNING_META[k].max}
            onChange={(v) => setTDraft({ ...tun, [k]: v })}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 px-1">
        <p className="text-muted text-xs">Stored in config/app with the flags; every signed-in device reads it.</p>
        <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => setTDraft({ ...DEFAULT_TUNING })} disabled={sameTuning(tun, DEFAULT_TUNING)}>
          Reset to defaults
        </button>
      </div>
      <div className="card mt-4 p-4 text-sm">
        <b>Split Now’s shared AI key</b> has its own limits (per person per hour and day, and the daily budget for everyone) next to the key itself, in the{' '}
        <Link to="/admin/ai" className="font-semibold text-brand-600 dark:text-brand-300">
          AI tab
        </Link>
        .
      </div>
      <DirtyBar
        dirty={dirty}
        saving={saving}
        onSave={save}
        onDiscard={() => {
          setDraft(null)
          setTDraft(null)
        }}
        testId="admin-limits-dirty"
      />
    </div>
  )
}
