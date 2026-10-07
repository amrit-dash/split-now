import type { Group, MemberId } from '@/types'
import { Avatar } from './Avatar'

export function MemberChips({ group, order, selected, onToggle, me }: { group: Group; order: MemberId[]; selected: MemberId[]; onToggle: (id: MemberId) => void; me?: MemberId }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {order.map((id) => {
        const m = group.members[id]
        const on = selected.includes(id)
        return (
          <button key={id} type="button" onClick={() => onToggle(id)} className={`chip !py-1 !pl-1 ${on ? 'chip-on' : 'opacity-70'}`}>
            <Avatar name={m.name} color={m.color} size={22} />
            {id === me ? 'You' : m.name.split(' ')[0]}
          </button>
        )
      })}
    </div>
  )
}
