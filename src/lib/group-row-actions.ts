/*
 * The Groups screen's swipe actions on a group row (owner, 24 Oct 2026): Settle up when you owe or
 * are owed, and Archive / Unarchive (personal, undoable) by the same rule as the group's menu
 * (src/lib/archive.ts), shown only when it can be done. Never Delete: that affects everyone and is in the group's menu. Not on Home,
 * where a swipe is easy to make by mistake. A locked private group has none. Pure.
 */
import { archiveRow } from './archive'

export type GroupRowAction = { kind: 'settle' | 'archive' | 'unarchive' }

export function groupRowActions(o: { personal: boolean; archived: boolean; myBalance: number; waitingOnYou: number; locked: boolean }): GroupRowAction[] {
  if (o.locked) return []
  const out: GroupRowAction[] = []
  if (!o.personal && !o.archived && o.myBalance !== 0) out.push({ kind: 'settle' })
  const a = archiveRow({ archived: o.archived, personal: o.personal, myBalance: o.myBalance, waitingOnYou: o.waitingOnYou })
  // An action that can't be done now isn't shown at all (owner, 24 Oct 2026): no greyed-out buttons.
  if (o.archived) out.push({ kind: 'unarchive' })
  else if (!a.disabled) out.push({ kind: 'archive' })
  return out
}
