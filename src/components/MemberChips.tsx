import type { Group, MemberId } from '@/types'
import { shortNames } from '@/lib/shortNames'
import { Avatar } from './Avatar'

/** Toggle chips for members. Labels default to short first names ("You" for me). */
export function MemberChips({ group, order, selected, onToggle, me, labels }: {
  group: Group; order: MemberId[]; selected: MemberId[]; onToggle: (id: MemberId) => void; me?: MemberId; labels?: Record<MemberId, string>
}) {
  const names = labels ?? shortNames(group.members, me)
  return (
    <div className="flex flex-wrap gap-1.5">
      {order.map((id) => {
        const m = group.members[id]
        const on = selected.includes(id)
        return (
          <button key={id} type="button" onClick={() => onToggle(id)} className={`chip !py-1 !pl-1 ${on ? 'chip-on' : 'opacity-70'}`}>
            <Avatar name={m.name} color={m.color} photoURL={m.photoURL} size={22} />
            {names[id] ?? m.name}
          </button>
        )
      })}
    </div>
  )
}
