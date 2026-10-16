import { Lock } from 'lucide-react'
import { animalsFor } from '@/lib/vault-scramble'

/** A locked private group's icon: a lock, whatever its emoji (src/lib/vault-scramble.ts). */
export function LockedTile({ size = 48 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-ink-800 dark:text-slate-300"
      style={{ width: size, height: size }}
    >
      <Lock size={Math.round(size * 0.45)} />
    </span>
  )
}

/** Its people, as animals: as many as it has, none of their faces or names. */
export function AnimalStack({ seed, count, size = 20, max = 4 }: { seed: string; count: number; size?: number; max?: number }) {
  const shown = animalsFor(seed, Math.min(count, max))
  return (
    <span className="flex items-center" aria-hidden>
      {shown.map((a, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: display only, and animals can repeat.
          key={i}
          className="flex items-center justify-center rounded-full bg-slate-100 ring-2 ring-white dark:bg-ink-800 dark:ring-ink-900"
          style={{ width: size, height: size, fontSize: size * 0.6, marginLeft: i ? -Math.round(size * 0.3) : 0, zIndex: shown.length - i }}
        >
          {a}
        </span>
      ))}
    </span>
  )
}
