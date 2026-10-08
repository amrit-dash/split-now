import { Check } from 'lucide-react'
import type { Group, MemberId } from '@/types'
import { Avatar } from './Avatar'

/** Multi-select member chips (who shared an item). Selection is announced (aria-pressed) and shown with a check, not only by colour. */
export function MemberChips({ group, order, selected, onToggle, me }: { group: Group; order: MemberId[]; selected: MemberId[]; onToggle: (id: MemberId) => void; me?: MemberId }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {order.map((id) => {
        const m = group.members[id]
        const on = selected.includes(id)
        const name = id === me ? 'You' : (m?.name ?? '?').split(' ')[0]
        return (
          <button key={id} type="button" onClick={() => onToggle(id)} aria-pressed={on} aria-label={id === me ? 'You' : m?.name ?? '?'} className={`chip min-h-9 !py-1 !pl-1 ${on ? 'chip-on' : 'text-muted'}`}>
            <Avatar name={m?.name ?? '?'} color={m?.color ?? '#999'} size={22} />
            {name}
            {on && <Check size={13} strokeWidth={3} aria-hidden />}
          </button>
        )
      })}
    </div>
  )
}
