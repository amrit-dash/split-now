import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { GroupData } from '@/hooks/data'
import { formatMoney } from '@/lib/money'
import { GroupIcon } from './GroupIcon'
import { AvatarStack } from './Avatar'
import { LiveBadge } from './Misc'
import { isLiveTrip } from '@/lib/capture'
import { todayISO } from '@/lib/id'

/** One group in a list: icon, name, members (or spend for a personal wallet) and your balance in words and numbers. */
export function GroupRow({ d }: { d: GroupData }) {
  const bal = d.me ? (d.net[d.me] ?? 0) : 0
  const members = Object.values(d.group.members)
  const personal = d.group.type === 'personal'
  const spent = d.expenses.reduce((s, e) => s + e.amount, 0)
  return (
    <Link to={`/groups/${d.group.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition active:bg-slate-50 dark:active:bg-ink-800">
      <GroupIcon emoji={d.group.emoji} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">{d.group.name}</span>
          {isLiveTrip(d.group, todayISO()) && <LiveBadge type={d.group.type} />}
          {d.group.archived && (
            <span className="text-muted shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[0.6875rem] font-semibold dark:bg-ink-800">Archived</span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          {personal ? (
            <span className="text-muted text-xs">{formatMoney(spent, d.group.currency)} spent</span>
          ) : (
            <>
              <AvatarStack people={members} size={20} />
              <span className="sr-only">{members.length} members</span>
            </>
          )}
        </div>
      </div>
      {!personal && (
        <div className="text-right">
          {bal === 0 ? (
            <div className="text-muted text-sm">settled up</div>
          ) : (
            <>
              <div className={`text-xs font-medium ${bal > 0 ? 'pos' : 'neg'}`}>{bal > 0 ? 'you are owed' : 'you owe'}</div>
              <div className={`font-bold ${bal > 0 ? 'pos' : 'neg'}`}>{formatMoney(Math.abs(bal), d.group.currency)}</div>
            </>
          )}
        </div>
      )}
      <ChevronRight size={18} className="text-slate-300 dark:text-slate-600" aria-hidden />
    </Link>
  )
}
