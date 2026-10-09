import { Check } from 'lucide-react'
import type { Group, MemberId } from '@/types'
import { shortNames } from '@/lib/shortNames'
import { Avatar } from './Avatar'

/**
 * Multi-select member chips (who shared an item). Labels default to short first names ("You" for
 * me). Selection is announced (aria-pressed) and shown with a check, not only by colour.
 */
export function MemberChips({
  group,
  order,
  selected,
  onToggle,
  me,
  labels,
}: {
  group: Group
  order: MemberId[]
  selected: MemberId[]
  onToggle: (id: MemberId) => void
  me?: MemberId
  labels?: Record<MemberId, string>
}) {
  const names = labels ?? shortNames(group.members, me)
  return (
    <div className="flex flex-wrap gap-1.5">
      {order.map((id) => {
        const m = group.members[id]
        const on = selected.includes(id)
        const name = names[id] ?? m?.name ?? '?'
        return (
          <button
            key={id}
            type="button"
            onClick={() => onToggle(id)}
            aria-pressed={on}
            title={id === me ? undefined : m?.name}
            className={`chip min-h-9 !py-1 !pl-1 ${on ? 'chip-on' : 'text-muted'}`}
          >
            <Avatar name={m?.name ?? '?'} color={m?.color ?? '#999'} photoURL={m?.photoURL} size={22} />
            {name}
            {on && <Check size={13} strokeWidth={3} aria-hidden />}
          </button>
        )
      })}
    </div>
  )
}
