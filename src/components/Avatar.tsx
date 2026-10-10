import { useEffect, useState } from 'react'
import { initials } from '@/lib/colors'

export function Avatar({ name, color, size = 40, ring, photoURL }: { name: string; color: string; size?: number; ring?: boolean; photoURL?: string }) {
  const [failed, setFailed] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: photoURL is the trigger, so a new photo gets a fresh try after an earlier one failed.
  useEffect(() => setFailed(false), [photoURL])
  const ringCls = ring ? 'ring-2 ring-white dark:ring-ink-900' : ''
  if (photoURL && !failed) {
    return (
      <img
        src={photoURL}
        alt=""
        aria-hidden
        width={size}
        height={size}
        // Google profile photos refuse requests that carry our referrer.
        referrerPolicy="no-referrer"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full bg-slate-200 object-cover dark:bg-ink-700 ${ringCls}`}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${color === 'accent' ? 'text-on-fill' : 'text-white'} ${ringCls}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background:
          color === 'accent' ? 'linear-gradient(135deg, var(--color-fill-500), var(--color-fill-to))' : `linear-gradient(135deg, ${color}, ${color}bb)`,
      }}
      aria-hidden
    >
      {initials(name)}
    </div>
  )
}

export function AvatarStack({
  people,
  max = 4,
  size = 28,
}: {
  people: Array<{ name: string; color: string; photoURL?: string }>
  max?: number
  size?: number
}) {
  const shown = people.slice(0, max)
  return (
    // Each avatar is stacked explicitly, the first in front: a photo and an initials circle would
    // otherwise paint in different orders, and one face could disappear behind its neighbours.
    // The overlap scales with the size (about 30%), so even 20px avatars keep their initials in view.
    <div className="flex">
      {shown.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: callers pass display-only people without an id, and names can repeat.
        <span key={i} className="relative rounded-full" style={{ zIndex: shown.length - i + 1, marginLeft: i ? -Math.round(size * 0.3) : 0 }}>
          <Avatar name={p.name} color={p.color} photoURL={p.photoURL} size={size} ring />
        </span>
      ))}
      {people.length > max && (
        <div
          className="relative z-0 flex items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600 ring-2 ring-white dark:bg-ink-700 dark:text-slate-300 dark:ring-ink-900"
          style={{ width: size, height: size, marginLeft: -Math.round(size * 0.3) }}
        >
          +{people.length - max}
        </div>
      )}
    </div>
  )
}
