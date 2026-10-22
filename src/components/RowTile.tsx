import type { ReactNode } from 'react'

/*
 * The tile beside a Profile or Settings row (and a Settings section's title): the accent's
 * gradient, the + button's colours, with the row's Solar duotone icon drawn in the text-on-accent
 * colour. Solid colour makes the rows read as heavy as Help's pictures instead of thin lines on a
 * pale square (owner, 22 Oct). `tone` 'danger' for the row that deletes the account.
 */
export function RowTile({ children, size = 'md', tone = 'accent' }: { children: ReactNode; size?: 'md' | 'sm'; tone?: 'accent' | 'danger' }) {
  const box = size === 'sm' ? 'h-7 w-7 rounded-lg' : 'h-9 w-9 rounded-xl'
  const colour =
    tone === 'danger'
      ? 'bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-[0_4px_10px_-4px_rgb(225_29_72_/_0.6)]'
      : 'bg-gradient-to-br from-fill to-fill-to text-on-fill shadow-[0_4px_10px_-4px_color-mix(in_oklab,var(--color-fill)_70%,transparent)]'
  return (
    <span className={`flex shrink-0 items-center justify-center ${box} ${colour}`} aria-hidden>
      {children}
    </span>
  )
}
