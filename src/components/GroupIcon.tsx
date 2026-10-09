/** A group's emoji on a soft tile. Decorative: the group's name is always next to it. */
export function GroupIcon({ emoji, size = 48 }: { emoji: string; size?: number }) {
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-duo-100 dark:from-brand-900/50 dark:to-duo-900/30"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {emoji}
    </div>
  )
}
