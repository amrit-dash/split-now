import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMe } from '@/hooks/auth'
import { errText } from '@/lib/errors'
import {
  compareSemver,
  FLAG_INFO,
  FLAG_NAMES,
  isSemver,
  MAX_MESSAGE,
  resolveAppConfig,
  semverOf,
  toAppConfigDoc,
  type AnnouncementLevel,
  type AppConfig,
  type Signups,
} from '@/lib/flags'
import { localISODate } from '@/lib/id'
import { Loading, Segmented } from '@/components/Misc'
import { Switch } from '@/components/Switch'
import { useToast } from '@/components/Toast'
import { AdminApp } from '@/components/AdminApp'
import { saveConfig } from './api'
import { ChangedBy, DirtyBar, SettingRow, useConfigDoc } from './common'

const CURRENT = semverOf(__APP_VERSION__)
/** Strip the audit fields before comparing, so a save by someone else doesn't read as "unsaved changes". */
const body = (c: AppConfig) => JSON.stringify({ ...c, updatedAt: undefined, updatedBy: undefined })
/** A yyyy-mm-dd from the date field → the end of that local day, in ms. */
const endOfDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
}

/** /admin/flags: maintenance mode, minimum version, announcement, feature flags, sign-up mode (config/app). */
export default function FlagsApp() {
  const { user } = useMe()
  const toast = useToast()
  const { raw, loading, error } = useConfigDoc('app')
  const saved = useMemo(() => resolveAppConfig(raw), [raw])
  const [draft, setDraft] = useState<AppConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [minVersionDraft, setMinVersionDraft] = useState<string | null>(null)
  if (loading) return <Loading />
  const cfg = draft ?? saved
  const set = (p: Partial<AppConfig>) => setDraft({ ...cfg, ...p })
  const minVersion = minVersionDraft ?? cfg.minVersion
  const minVersionBad = !isSemver(minVersion)
  const dirty = body(cfg) !== body(saved)
  const ann = cfg.announcement ?? { text: '', level: 'info' as AnnouncementLevel }

  const save = async () => {
    if (minVersionBad) return toast('Minimum version must look like 1.2.3', 'err')
    setSaving(true)
    try {
      await saveConfig('app', toAppConfigDoc(cfg, user.uid))
      setDraft(null)
      setMinVersionDraft(null)
      toast('App settings saved')
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setSaving(false)
    }
  }
  const discard = () => {
    setDraft(null)
    setMinVersionDraft(null)
  }

  return (
    <div data-testid="admin-flags">
      {error && (
        <div className="card mb-4 p-4 text-sm" role="alert">
          Couldn’t read config/app. You can still save; the rules decide.
        </div>
      )}

      <h3 className="mb-2 px-1 font-bold">Maintenance</h3>
      <div className="card divide-y divide-slate-100 p-4 dark:divide-white/5">
        <SettingRow
          title="Maintenance mode"
          hint="Everyone except admins sees a “back in a few minutes” screen and the rules refuse their writes. Saves they already queued offline are rejected when they sync, so keep it short."
          control={<Switch checked={cfg.maintenance} onChange={(v) => set({ maintenance: v })} label="Maintenance mode" testId="admin-maintenance" />}
        />
        <div className="pt-3">
          <label htmlFor="maint-msg" className="label">
            Message on the screen (optional)
          </label>
          <textarea
            id="maint-msg"
            className="input min-h-20"
            maxLength={MAX_MESSAGE}
            placeholder="We’re moving the database. Back by 10 pm."
            value={cfg.maintenanceMessage}
            onChange={(e) => set({ maintenanceMessage: e.target.value })}
          />
        </div>
      </div>

      <h3 className="mb-2 mt-5 px-1 font-bold">Update required</h3>
      <div className="card p-4">
        <label htmlFor="min-version" className="block font-medium">
          Minimum app version
        </label>
        <p className="text-muted mt-0.5 text-xs">
          Devices running an older build see “Update Split Now” and must reload. You are running {CURRENT}. Admins are never locked out.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <input
            id="min-version"
            className="input !w-36 !px-3 !py-2.5 font-mono"
            inputMode="decimal"
            placeholder="0.0.0"
            value={minVersion}
            aria-invalid={minVersionBad || undefined}
            onChange={(e) => {
              const v = e.target.value.trim()
              setMinVersionDraft(v)
              if (isSemver(v)) set({ minVersion: v })
            }}
          />
          {minVersionBad ? (
            <span className="text-xs text-rose-700 dark:text-rose-400" role="alert">
              Use three numbers, like 0.2.0
            </span>
          ) : (
            compareSemver(CURRENT, minVersion) < 0 && (
              <span className="text-xs text-amber-700 dark:text-amber-400" role="alert">
                Newer than this build: every non-admin will be asked to update. Make sure {minVersion} is deployed.
              </span>
            )
          )}
        </div>
      </div>

      {/* The displayed version (Profile, Settings → Data) saves on its own, separate from the switches above. */}
      <h3 className="mb-2 mt-5 px-1 font-bold">Version shown</h3>
      <div className="card p-4">
        <AdminApp />
      </div>

      <h3 className="mb-2 mt-5 px-1 font-bold">Announcement</h3>
      <div className="card space-y-3 p-4">
        <div>
          <label htmlFor="ann-text" className="label">
            Banner text
          </label>
          <textarea
            id="ann-text"
            className="input min-h-20"
            maxLength={MAX_MESSAGE}
            placeholder="Nudges are here: tap Remind → Nudge to send a push."
            value={ann.text}
            onChange={(e) => set({ announcement: e.target.value.trim() ? { ...ann, text: e.target.value } : null })}
          />
          <p className="text-muted mt-1 text-xs">Shown at the top of every screen until dismissed; a changed text comes back.</p>
        </div>
        <div>
          <div className="label" id="ann-level">
            Tone
          </div>
          <Segmented<AnnouncementLevel>
            label="Tone"
            value={ann.level}
            onChange={(level) => set({ announcement: ann.text.trim() ? { ...ann, level } : null })}
            options={[
              { value: 'info', label: 'Info' },
              { value: 'warn', label: 'Warning' },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="ann-until" className="label">
              Hide after (optional)
            </label>
            <input
              id="ann-until"
              type="date"
              className="input !w-44 !px-3 !py-2.5"
              value={ann.until ? localISODate(ann.until) : ''}
              onChange={(e) => {
                const until = e.target.value ? endOfDay(e.target.value) : undefined
                set({ announcement: ann.text.trim() ? { ...ann, ...(until ? { until } : {}), ...(until ? {} : { until: undefined }) } : null })
              }}
            />
          </div>
          {cfg.announcement && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => set({ announcement: null })}>
              Clear announcement
            </button>
          )}
        </div>
      </div>

      <h3 className="mb-2 mt-5 px-1 font-bold">Feature flags</h3>
      <div className="card divide-y divide-slate-100 p-4 dark:divide-white/5" data-testid="admin-flag-list">
        {FLAG_NAMES.map((f) => (
          <SettingRow
            key={f}
            title={FLAG_INFO[f].label}
            hint={FLAG_INFO[f].hint}
            control={
              <Switch checked={cfg.flags[f]} onChange={(v) => set({ flags: { ...cfg.flags, [f]: v } })} label={FLAG_INFO[f].label} testId={`flag-${f}`} />
            }
          />
        ))}
      </div>
      <p className="text-muted mt-2 px-1 text-xs">Off hides the feature in the app (and stops it on the server where noted). A missing switch means on.</p>

      <h3 className="mb-2 mt-5 px-1 font-bold">Sign-ups</h3>
      <div className="card p-4">
        <Segmented<Signups>
          label="Who can create an account"
          value={cfg.signups}
          onChange={(signups) => set({ signups })}
          options={[
            { value: 'open', label: 'Anyone' },
            { value: 'invite', label: 'Invite only' },
          ]}
        />
        <p className="text-muted mt-2 text-xs">
          Invite only hides “Create an account” on the sign-in screen unless the link is an invite (/join/CODE). It is a soft gate: a determined person can
          still call Firebase Auth directly. Hard enforcement needs an Identity Platform blocking function (docs/FIREBASE_SETUP.md).
        </p>
      </div>
      <ChangedBy at={saved.updatedAt} by={saved.updatedBy} />
      <p className="text-muted mt-3 px-1 text-xs">
        Shared-key AI limits live in the{' '}
        <Link to="/admin/ai" className="font-semibold text-brand-600 dark:text-brand-300">
          AI tab
        </Link>
        ; rate limits in{' '}
        <Link to="/admin/limits" className="font-semibold text-brand-600 dark:text-brand-300">
          Limits
        </Link>
        .
      </p>
      <DirtyBar dirty={dirty} saving={saving} onSave={save} onDiscard={discard} testId="admin-flags-dirty" />
    </div>
  )
}
