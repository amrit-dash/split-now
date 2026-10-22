import { type ReactNode, useId } from 'react'

/*
 * The tile beside a Profile or Settings row (and a Settings section's title): a soft, translucent
 * square of the accent, with the row's Solar duotone icon painted in the accent's own gradient
 * (brand → duo), as Help's pictures are (owner, 22 Oct: keep the drawings, drop the solid tile).
 * `tone` 'danger' for the row that deletes the account.
 */
export function RowTile({ children, size = 'md', tone = 'accent' }: { children: ReactNode; size?: 'md' | 'sm'; tone?: 'accent' | 'danger' }) {
  // One gradient per tile: ids must be unique on the page, and useId's punctuation isn't valid in url(#…).
  const id = `row${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const box = size === 'sm' ? 'h-7 w-7 rounded-lg' : 'h-9 w-9 rounded-xl'
  if (tone === 'danger')
    return (
      <span className={`flex shrink-0 items-center justify-center bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300 ${box}`} aria-hidden>
        {children}
      </span>
    )
  return (
    <span
      className={`feature-art flex shrink-0 items-center justify-center bg-brand-50 ring-1 ring-brand-500/10 dark:bg-brand-500/15 dark:ring-white/5 ${box}`}
      style={{ '--art': `url(#${id})` } as React.CSSProperties}
      aria-hidden
    >
      <svg width="0" height="0" className="absolute" focusable="false">
        <defs>
          <linearGradient id={id} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
            <stop offset="0" style={{ stopColor: 'var(--art-from)' }} />
            <stop offset="1" style={{ stopColor: 'var(--art-to)' }} />
          </linearGradient>
        </defs>
      </svg>
      {children}
    </span>
  )
}
