import { useEffect, useState } from 'react'
import { initials } from '@/lib/colors'

/**
 * A person's photo, or their initials on their colour. `shape: 'tile'` is the rounded square the
 * group icons use (a 1:1's face in a list of groups); people elsewhere are circles.
 */
export function Avatar({
  name,
  color,
  size = 40,
  ring,
  photoURL,
  shape = 'circle',
}: {
  name: string
  color: string
  size?: number
  ring?: boolean
  photoURL?: string
  shape?: 'circle' | 'tile'
}) {
  const [failed, setFailed] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: photoURL is the trigger, so a new photo gets a fresh try after an earlier one failed.
  useEffect(() => setFailed(false), [photoURL])
  const ringCls = ring ? 'ring-2 ring-white dark:ring-ink-900' : ''
  const round = shape === 'tile' ? 'rounded-2xl' : 'rounded-full'
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
        className={`shrink-0 ${round} bg-slate-200 object-cover dark:bg-ink-700 ${ringCls}`}
        style={{ width: size, height: size }}
      />
    )
  }
  // The gradient ends at 95% of the colour (not 73%): stacked avatars overlap, and a see-through
  // circle let the one behind show through.
  return (
    <div
      className={`flex shrink-0 items-center justify-center ${round} font-bold ${color === 'accent' ? 'text-on-fill' : 'text-white'} ${ringCls}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background:
          color === 'accent' ? 'linear-gradient(135deg, var(--color-fill-500), var(--color-fill-to))' : `linear-gradient(135deg, ${color}, ${color}f2)`,
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
    <div className="flex items-center">
      {shown.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: callers pass display-only people without an id, and names can repeat.
        <span key={i} className="relative rounded-full" style={{ zIndex: shown.length - i + 1, marginLeft: i ? -Math.round(size * 0.3) : 0 }}>
          <Avatar name={p.name} color={p.color} photoURL={p.photoURL} size={size} ring />
        </span>
      ))}
      {/* The rest as plain text beside the faces: a "+1" in its own circle hid behind the overlap. */}
      {people.length > max && (
        <span className="text-muted ml-1 self-center text-xs font-semibold tabular-nums">
          +{people.length - max}
          <span className="sr-only"> more</span>
        </span>
      )}
    </div>
  )
}
