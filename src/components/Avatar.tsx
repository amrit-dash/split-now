import { initials } from '@/lib/colors'

export function Avatar({ name, color, size = 40, ring }: { name: string; color: string; size?: number; ring?: boolean }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${ring ? 'ring-2 ring-white dark:ring-ink-900' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, ${color}, ${color}bb)` }}
      aria-hidden
    >
      {initials(name)}
    </div>
  )
}

export function AvatarStack({ people, max = 4, size = 28 }: { people: Array<{ name: string; color: string }>; max?: number; size?: number }) {
  return (
    <div className="flex -space-x-2">
      {people.slice(0, max).map((p, i) => <Avatar key={i} name={p.name} color={p.color} size={size} ring />)}
      {people.length > max && (
        <div className="flex items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600 ring-2 ring-white dark:bg-ink-700 dark:text-slate-300 dark:ring-ink-900" style={{ width: size, height: size }}>
          +{people.length - max}
        </div>
      )}
    </div>
  )
}
