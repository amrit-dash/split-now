import type { Group } from '@/types'
import { Avatar } from './Avatar'
import { IconFace } from './IconFace'

/**
 * A group's face. Most groups: their emoji on a soft tile. A 1:1: the friend's photo (or initials)
 * on the same rounded tile, with a small 🤝 on its corner, so it reads as a person and as "a 1:1, not a group" at once, the
 * same on every screen. Decorative: the group's name is always next to it.
 */
export function GroupIcon({
  emoji,
  size = 48,
  group,
}: {
  emoji: string
  size?: number
  /** with its AI-drawn icon (Group.iconSvg) when it has one */
  group?: Pick<Group, 'type' | 'peer' | 'members'> & Partial<Pick<Group, 'iconSvg' | 'iconImage' | 'vault'>>
}) {
  const peer = group?.type === 'direct' && group.peer ? group.members[group.peer] : undefined
  if (peer) {
    const badge = Math.max(14, Math.round(size * 0.42))
    return (
      <div aria-hidden className="relative shrink-0" style={{ width: size, height: size }}>
        <Avatar name={peer.name} color={peer.color} photoURL={peer.photoURL} size={size} shape="tile" />
        <span
          className="absolute -bottom-1 -right-1 flex items-center justify-center rounded-full bg-white ring-2 ring-white dark:bg-ink-800 dark:ring-ink-900"
          style={{ width: badge, height: badge, fontSize: badge * 0.62 }}
        >
          🤝
        </span>
      </div>
    )
  }
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-duo-100 dark:from-brand-900/50 dark:to-duo-900/30"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      <IconFace iconSvg={group?.iconSvg} iconImage={group?.iconImage} emoji={emoji} vault={!!group?.vault} />
    </div>
  )
}
