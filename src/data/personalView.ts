import type { Group } from '@/types'
import { isArchivedFor } from '../../shared/archive'
import { directPeer, groupNameFor } from '../../shared/names'

/**
 * A group as the signed-in person sees it (both repos apply it on every read): `archived` is
 * theirs alone (shared/archive.ts), and a 1:1 is named after the other person, with `peer` set to
 * them (shared/names.ts). None of this is ever written back.
 */
export function personalView(g: Group, uid: string | undefined): Group {
  const out: Group = { ...g, archived: isArchivedFor(g, uid) }
  if (g.type !== 'direct') return out
  const peer = directPeer(g.members, uid)
  return peer ? { ...out, peer, name: groupNameFor(g, uid) } : out
}
