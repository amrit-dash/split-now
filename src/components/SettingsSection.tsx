import type { ReactNode } from 'react'
import { RowTile } from '@/components/RowTile'

/**
 * One titled card of a settings screen (Settings → AI features, Admin → AI): an icon, a heading
 * that names what the section is for, and its controls, so a long screen reads as a few short ones.
 */
export function SettingsSection({
  icon,
  title,
  testId,
  action,
  children,
}: {
  icon: ReactNode
  title: string
  testId: string
  /** a small control at the right of the heading (Admin → AI: removing a key), out of the way of the section's own buttons */
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="card mt-3 p-4" aria-labelledby={`${testId}-title`} data-testid={testId}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id={`${testId}-title`} className="flex items-center gap-2 text-sm font-bold">
          <RowTile size="sm">{icon}</RowTile>
          {title}
        </h2>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}
