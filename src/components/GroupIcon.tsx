import { useId } from 'react'
import type { Group } from '@/types'
import { Avatar } from './Avatar'
import { IconFace } from './IconFace'
import { HandshakeIcon } from './icons'
import { drawsHandshake } from '@/lib/groupTypes'

/**
 * The 1:1 handshake (owner, 22 Oct 2026; it replaced the 🤝 emoji): Fluent's handshake in the
 * accent gradient, the way Help's pictures are painted (`.feature-art`). Light theme: the
 * duotone (line over its fill at .42); dark theme: the fill alone. `onAccent`: inside an accent
 * button it takes the button's text colour instead.
 */
export function HandshakeArt({ size, onAccent = false }: { size: number; onAccent?: boolean }) {
  // One gradient per drawing: ids must be unique on the page, and useId's punctuation isn't valid in url(#…).
  const id = `hs${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  if (onAccent)
    return (
      <span className="inline-flex" aria-hidden>
        <HandshakeIcon size={size} solid={false} className="dark:hidden" />
        <HandshakeIcon size={size} solid className="hidden dark:block" />
      </span>
    )
  return (
    <span className="feature-art inline-flex" style={{ '--art': `url(#${id})` } as React.CSSProperties} aria-hidden>
      <svg width="0" height="0" className="absolute" focusable="false">
        <defs>
          <linearGradient id={id} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
            <stop offset="0" style={{ stopColor: 'var(--art-from)' }} />
            <stop offset="1" style={{ stopColor: 'var(--art-to)' }} />
          </linearGradient>
        </defs>
      </svg>
      <HandshakeIcon size={size} solid={false} className="dark:hidden" />
      <HandshakeIcon size={size} solid className="hidden dark:block" />
    </span>
  )
}

/**
 * A group's face. Most groups: their emoji on a soft tile. A 1:1: the friend's photo (or initials)
 * on the same rounded tile, with a small handshake on its corner, so it reads as a person and as "a 1:1, not a group" at once, the
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
          className="absolute -bottom-1.5 -right-1.5 flex items-center justify-center rounded-full bg-white ring-2 ring-white dark:bg-ink-800 dark:ring-ink-900"
          style={{ width: badge, height: badge }}
          data-testid="direct-badge"
        >
          <HandshakeArt size={Math.round(badge * 0.74)} />
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
      {drawsHandshake(group, emoji) ? (
        // a 1:1 whose friend isn't known here: the handshake on its own
        <HandshakeArt size={Math.round(size * 0.55)} />
      ) : (
        <IconFace iconSvg={group?.iconSvg} iconImage={group?.iconImage} emoji={emoji} vault={!!group?.vault} />
      )}
    </div>
  )
}
