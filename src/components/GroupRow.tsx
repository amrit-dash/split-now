import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { GroupData } from '@/hooks/data'
import { formatMoney } from '@/lib/money'
import { GroupIcon } from './GroupIcon'
import { AvatarStack } from './Avatar'
import { LiveBadge } from './Misc'
import { isLiveTrip } from '@/lib/capture'
import { todayISO } from '@/lib/id'

export function GroupRow({ d }: { d: GroupData }) {
  const bal = d.me ? d.net[d.me] ?? 0 : 0
  const members = Object.values(d.group.members)
  const personal = d.group.type === 'personal'
  const spent = d.expenses.reduce((s, e) => s + e.amount, 0)
  return (
    <Link to={`/groups/${d.group.id}`} className="flex items-center gap-3 px-4 py-3.5 transition active:bg-slate-50 dark:active:bg-ink-800">
      <GroupIcon emoji={d.group.emoji} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">{d.group.name}</span>
          {isLiveTrip(d.group, todayISO()) && <LiveBadge />}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          {personal ? (
            <span className="text-xs text-slate-500">{formatMoney(spent, d.group.currency)} spent</span>
          ) : (
            <AvatarStack people={members} size={20} />
          )}
        </div>
      </div>
      {!personal && (
        <div className="text-right">
          {bal === 0 ? (
            <div className="text-sm text-slate-400">settled up</div>
          ) : (
            <>
              <div className={`text-[11px] font-medium ${bal > 0 ? 'pos' : 'neg'}`}>{bal > 0 ? 'you are owed' : 'you owe'}</div>
              <div className={`font-bold tabular-nums ${bal > 0 ? 'pos' : 'neg'}`}>{formatMoney(Math.abs(bal), d.group.currency)}</div>
            </>
          )}
        </div>
      )}
      <ChevronRight size={18} className="text-slate-300 dark:text-slate-600" />
    </Link>
  )
}
