import { useState } from 'react'
import { Link } from 'react-router-dom'
import { compareSemver, isSemver, MAINTENANCE_FALLBACK, MAX_MESSAGE, semverOf, type AnnouncementLevel, type Signups } from '@/lib/flags'
import { localISODate } from '@/lib/id'
import { LOOK_INFO, LOOKS, type Look } from '@/lib/look'
import { Collapsible } from '@/components/Collapsible'
import { Loading, Segmented } from '@/components/Misc'
import { Select } from '@/components/Select'
import { Switch } from '@/components/Switch'
import { MaintenanceScreen } from '@/components/GateScreen'
import { ChangedBy, DirtyBar, SettingRow, useAppConfigDraft } from './common'

const CURRENT = semverOf(__APP_VERSION__)
/** A yyyy-mm-dd from the date field → the end of that local day, in ms. */
const endOfDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
}

/**
 * The action beside a field (Use this build, Stop announcement): a clear tinted button as tall as
 * the field. When both don't fit on one line (a phone), each takes the full width on its own.
 */
const ACTION =
  'btn grow whitespace-nowrap sm:grow-0 bg-brand-50 px-4 text-sm text-brand-700 ring-1 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-500/30'
/** Stop announcement takes something down: red all round, outline included. */
const STOP = `${ACTION} !bg-rose-50 !text-rose-700 !ring-rose-300 dark:!bg-rose-500/15 dark:!text-rose-300 dark:!ring-rose-500/40`

/** /admin/app: maintenance mode, minimum version, announcement, sign-up mode and the detail level (config/app). Feature flags are /admin/flags. */
export default function AppSettings() {
  const [minVersionDraft, setMinVersionDraft] = useState<string | null>(null)
  const { saved, cfg, set, dirty, saving, save, discard, loading, error } = useAppConfigDraft((c) =>
    isSemver(c.minVersion) && (minVersionDraft === null || isSemver(minVersionDraft)) ? null : 'Minimum version must look like 1.2.3',
  )
  if (loading) return <Loading />
  const minVersion = minVersionDraft ?? cfg.minVersion
  const minVersionBad = !isSemver(minVersion)
  const ann = cfg.announcement ?? { text: '', level: 'info' as AnnouncementLevel }
  const onSave = async () => {
    await save()
    setMinVersionDraft(null)
  }
  const onDiscard = () => {
    discard()
    setMinVersionDraft(null)
  }

  return (
    <div className="pb-[calc(var(--lane)-var(--nav-h))]" data-testid="admin-app">
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
          <p className="text-muted mt-1 text-xs">Left empty, it says “{MAINTENANCE_FALLBACK}”</p>
        </div>
        {/* The real screen, drawn small and inert, with the message as typed (before saving).
            Folded by default: it is tall, and only needed while writing the message. */}
        <Collapsible
          title="Preview"
          summary={cfg.maintenance ? 'What everyone except admins sees' : 'What people will see when it is on'}
          className="!bg-slate-50 !shadow-none !ring-0 dark:!bg-ink-800"
          testId="maint-preview"
        >
          <div
            className="mx-auto max-w-[17rem]"
            role="img"
            aria-label={cfg.maintenance ? 'What everyone except admins sees' : 'What people will see when it is on'}
          >
            <MaintenanceScreen message={cfg.maintenanceMessage} preview />
          </div>
        </Collapsible>
      </div>

      <h3 className="mb-2 mt-5 px-1 font-bold">Update required</h3>
      <div className="card p-4">
        <label htmlFor="min-version" className="block font-medium">
          Minimum app version
        </label>
        <p className="text-muted mt-0.5 text-xs">
          Devices running an older build see “Update Split Now” and must reload. Leave it alone unless a release must replace every older one (a breaking
          change). You are running {CURRENT}. Admins are never locked out.
        </p>
        {/* One row for every "value + action" field on this page: the field fills the width, the action sits beside it at the same height. */}
        <div className="mt-3 flex flex-wrap items-stretch gap-2">
          <input
            id="min-version"
            className="input min-w-[8rem] flex-1 font-mono"
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
          {/* Raising the minimum is for a breaking release; this fills in the running build so it can't be mistyped. */}
          <button
            type="button"
            className={ACTION}
            disabled={minVersion === CURRENT}
            onClick={() => {
              setMinVersionDraft(CURRENT)
              set({ minVersion: CURRENT })
            }}
            data-testid="admin-use-build"
          >
            {minVersion === CURRENT ? `This build (${CURRENT})` : `Use this build (${CURRENT})`}
          </button>
        </div>
        {minVersionBad ? (
          <p className="mt-2 text-xs text-rose-700 dark:text-rose-400" role="alert">
            Use three numbers, like 0.2.0
          </p>
        ) : (
          compareSemver(CURRENT, minVersion) < 0 && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400" role="alert">
              Newer than this build: every non-admin will be asked to update. Make sure {minVersion} is deployed.
            </p>
          )
        )}
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
        <div>
          <label htmlFor="ann-until" className="label">
            Hide after (optional)
          </label>
          <div className="flex flex-wrap items-stretch gap-2">
            <input
              id="ann-until"
              type="date"
              className="input min-w-[11rem] flex-1"
              value={ann.until ? localISODate(ann.until) : ''}
              onChange={(e) => {
                const until = e.target.value ? endOfDay(e.target.value) : undefined
                set({ announcement: ann.text.trim() ? { ...ann, ...(until ? { until } : {}), ...(until ? {} : { until: undefined }) } : null })
              }}
            />
            <button
              type="button"
              className={STOP}
              disabled={!cfg.announcement}
              onClick={() => set({ announcement: null })}
              data-testid="admin-stop-announcement"
            >
              Stop announcement
            </button>
          </div>
        </div>
      </div>

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
      <h3 className="mb-2 mt-5 px-1 font-bold">Detail level</h3>
      <div className="card p-4" data-testid="admin-look">
        {/* A dropdown like Settings → Preferences: four choices didn't fit one row on a phone. */}
        <Select<Look>
          id="admin-look-choice"
          aria-label="How much the app explains"
          value={cfg.look}
          onChange={(look) => set({ look })}
          options={LOOKS.map((l) => ({ value: l, label: LOOK_INFO[l].label, hint: LOOK_INFO[l].hint }))}
        />
        <p className="text-muted mt-2 text-xs" aria-live="polite">
          {LOOK_INFO[cfg.look].hint} The default for everyone; each person can pick their own in Settings → Preferences. The admin console always shows
          everything.
        </p>
      </div>
      <ChangedBy at={saved.updatedAt} by={saved.updatedBy} />
      <p className="text-muted mt-3 px-1 text-xs">
        Feature switches are in{' '}
        <Link to="/admin/flags" className="font-semibold text-brand-600 dark:text-brand-300">
          Flags
        </Link>
        ; rate limits in{' '}
        <Link to="/admin/limits" className="font-semibold text-brand-600 dark:text-brand-300">
          Limits
        </Link>
        .
      </p>
      <DirtyBar dirty={dirty} saving={saving} onSave={onSave} onDiscard={onDiscard} testId="admin-app-dirty" />
    </div>
  )
}
