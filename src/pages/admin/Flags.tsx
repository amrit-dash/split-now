import { Link } from 'react-router-dom'
import { FLAG_SECTIONS, onCount } from '@/lib/admin-sections'
import { FLAG_INFO } from '@/lib/flags'
import { Loading } from '@/components/Misc'
import { Switch } from '@/components/Switch'
import { ChangedBy, DirtyBar, SettingRow, useAppConfigDraft } from './common'
import { useEdgeFade } from '@/hooks/useEdgeFade'

/**
 * /admin/flags: the feature switches (config/app `flags`), one card per part of the app, so it is
 * clear what a switch belongs to. The section chips jump to a card; each card says how many of its
 * switches are on. Maintenance, the announcement and the rest of config/app are /admin/app.
 */
export default function Flags() {
  const fade = useEdgeFade()
  const { saved, cfg, set, dirty, saving, save, discard, loading, error } = useAppConfigDraft()
  if (loading) return <Loading />
  return (
    <div className="pb-[calc(var(--lane)-var(--nav-h))]" data-testid="admin-flags">
      {error && (
        <div className="card mb-4 p-4 text-sm" role="alert">
          Couldn’t read config/app. You can still save; the rules decide.
        </div>
      )}
      <h2 className="px-1 text-lg font-extrabold">Feature flags</h2>
      <p className="text-muted mb-3 px-1 text-xs">Off hides the feature in the app (and stops it on the server where noted). A missing switch means on.</p>
      <nav ref={fade} aria-label="Flag sections" className="scrollbar-none -mx-4 mb-1 overflow-x-auto px-4">
        <div className="flex w-max gap-2">
          {FLAG_SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#flags-${s.id}`}
              className="flex min-h-9 items-center rounded-full bg-slate-100 px-3.5 text-sm font-semibold dark:bg-ink-800"
              onClick={(e) => {
                // The router owns the hash; scroll by hand.
                e.preventDefault()
                document.getElementById(`flags-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            >
              {s.title}
            </a>
          ))}
        </div>
      </nav>
      {FLAG_SECTIONS.map((s) => (
        <section key={s.id} id={`flags-${s.id}`} aria-labelledby={`flags-${s.id}-title`} className="scroll-mt-40" data-testid={`flag-section-${s.id}`}>
          <div className="mb-2 mt-5 flex items-baseline justify-between gap-3 px-1">
            <h3 id={`flags-${s.id}-title`} className="font-bold">
              {s.title}
            </h3>
            <span className="text-muted shrink-0 text-xs font-semibold">{onCount(cfg.flags, s.keys)}</span>
          </div>
          <p className="text-muted -mt-1 mb-2 px-1 text-xs">
            {s.hint}
            {s.id === 'ai' && (
              <>
                {' '}
                <Link to="/admin/ai" className="font-semibold text-brand-600 dark:text-brand-300">
                  Open AI
                </Link>
              </>
            )}
          </p>
          <div className="card divide-y divide-slate-100 p-4 dark:divide-white/5">
            {s.keys.map((f) => (
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
        </section>
      ))}
      <ChangedBy at={saved.updatedAt} by={saved.updatedBy} />
      <DirtyBar dirty={dirty} saving={saving} onSave={save} onDiscard={discard} testId="admin-flags-dirty" />
    </div>
  )
}
