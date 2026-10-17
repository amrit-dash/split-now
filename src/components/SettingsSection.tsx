import type { ReactNode } from 'react'

/**
 * One titled card of a settings screen (Settings → AI features, Admin → AI): an icon, a heading
 * that names what the section is for, and its controls, so a long screen reads as a few short ones.
 */
export function SettingsSection({ icon, title, testId, children }: { icon: ReactNode; title: string; testId: string; children: ReactNode }) {
  return (
    <section className="card mt-3 p-4" aria-labelledby={`${testId}-title`} data-testid={testId}>
      <h2 id={`${testId}-title`} className="mb-3 flex items-center gap-2 text-sm font-bold">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300" aria-hidden>
          {icon}
        </span>
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}
