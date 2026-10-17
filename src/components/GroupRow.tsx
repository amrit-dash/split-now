import { Link } from 'react-router-dom'
import { ChevronRight, LockOpen } from 'lucide-react'
import { lockVault } from '@/lib/vault-keys'
import type { GroupData } from '@/hooks/data'
import { formatMoney } from '@/lib/money'
import { GroupIcon } from './GroupIcon'
import { AvatarStack } from './Avatar'
import { LiveBadge } from './Misc'
import { isLiveTrip } from '@/lib/capture'
import { todayISO } from '@/lib/id'
import { activeMembers } from '@/lib/members'
import { spending } from '../../shared/received'
import { currencySymbol, lockedText, scrambledAmount } from '@/lib/vault-scramble'
import { AnimalStack, LockedTile } from '@/features/vault/Scrambled'
import { useMe } from '@/hooks/auth'

/** One group in a list: icon, name, members (spend for a personal wallet, "Friend" for a 1:1) and your balance in words and numbers. */
export function GroupRow({ d }: { d: GroupData }) {
  const bal = d.me ? (d.net[d.me] ?? 0) : 0
  const members = Object.values(activeMembers(d.group.members))
  const personal = d.group.type === 'personal'
  const spent = spending(d.expenses).reduce((s, e) => s + e.amount, 0)
  if (d.locked) return <LockedRow d={d} count={members.length} />
  // An open private group has its own lock button in the row (like the Groups screen's for all of
  // them). A button can't sit inside a link, so the link is the row's background and the button sits above it.
  const open = !!d.group.vault
  const row = 'relative flex min-h-16 items-center gap-3 px-4 py-3 transition active:bg-slate-50 dark:active:bg-ink-800'
  const body = (
    <>
      {open && <Link to={`/groups/${d.group.id}`} className="absolute inset-0" aria-label={`${d.group.name}, private group, open`} />}
      <GroupIcon emoji={d.group.emoji} group={d.group} />
      <div className={`min-w-0 flex-1 ${open ? 'pointer-events-none' : ''}`}>
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">{d.group.name}</span>
          {open && (
            <button
              type="button"
              onClick={() => lockVault(d.group.id)}
              className="pointer-events-auto relative z-10 -my-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 transition active:scale-90 dark:bg-brand-900/40 dark:text-brand-200"
              aria-label={`Lock ${d.group.name}`}
              title="Open: tap to lock"
              data-testid="group-row-lock"
            >
              <LockOpen size={15} aria-hidden />
            </button>
          )}
          {isLiveTrip(d.group, todayISO()) && <LiveBadge type={d.group.type} />}
          {d.group.archived && (
            <span className="text-muted shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[0.6875rem] font-semibold dark:bg-ink-800">Archived</span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          {personal ? (
            <span className="text-muted text-xs">{formatMoney(spent, d.group.currency)} spent</span>
          ) : d.group.type === 'direct' ? (
            // A 1:1 is just the two of you: no faces to stack (the friend is the icon).
            <span className="text-muted text-xs">Friend</span>
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
    </>
  )
  return open ? (
    <div className={`${row} has-[a:active]:bg-slate-50 dark:has-[a:active]:bg-ink-800`}>{body}</div>
  ) : (
    <Link to={`/groups/${d.group.id}`} className={row}>
      {body}
    </Link>
  )
}

/**
 * A private group that is locked on this device (docs/VAULT.md): a lock for its icon, scrambled
 * characters for its name and its balance, animals for its people, so a glance at the list shows
 * only that it is there.
 */
function LockedRow({ d, count }: { d: GroupData; count: number }) {
  const id = d.group.id
  // The viewer's own currency symbol: the group's would say something about it.
  const { profile } = useMe()
  return (
    <Link
      to={`/groups/${id}`}
      className="flex min-h-16 items-center gap-3 px-4 py-3 transition active:bg-slate-50 dark:active:bg-ink-800"
      aria-label="Private group, locked"
      data-testid="group-row-locked"
    >
      <LockedTile />
      <div className="min-w-0 flex-1" aria-hidden>
        <span className="block truncate font-semibold">{lockedText(d.group.name, id)}</span>
        <div className="mt-0.5 flex items-center gap-2">
          <AnimalStack seed={id} count={count} />
        </div>
      </div>
      <div className="text-right font-bold tabular-nums" aria-hidden>
        {scrambledAmount(id, currencySymbol(profile.currency))}
      </div>
      <ChevronRight size={18} className="text-slate-300 dark:text-slate-600" aria-hidden />
    </Link>
  )
}
