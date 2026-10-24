import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, LockOpen, RotateCcw } from 'lucide-react'
import { ArchiveIcon } from './icons'
import { ChequeIcon } from './ChequeIcon'
import { SwipeRow } from './SwipeRow'
import { useGroupArchive } from '@/hooks/useGroupArchive'
import { groupRowActions } from '@/lib/group-row-actions'
import { lockVault } from '@/lib/vault-keys'
import type { GroupData } from '@/hooks/data'
import { formatMoney } from '@/lib/money'
import { GroupIcon } from './GroupIcon'
import { AvatarStack } from './Avatar'
import { LiveBadge } from './Misc'
import { isLiveTrip } from '@/lib/capture'
import { todayISO } from '@/lib/id'
import { activeMembers, membersIn } from '@/lib/members'
import { spending } from '../../shared/received'
import { currencySymbol, lockedText, scrambledAmount } from '@/lib/vault-scramble'
import { AnimalStack, LockedTile } from '@/features/vault/Scrambled'
import { useMe } from '@/hooks/auth'
import { usePro } from '@/hooks/usePro'
import { badgeLabel, badgeTapTarget, friendBadge } from '@/lib/pro'
import { ProPill, ProTap } from './ProBadge'

/** One group in a list: icon, name, members (spend for a personal wallet, "Friend" for a 1:1) and your balance in words and numbers. */
/**
 * `swipe` (the Groups screen only, never Home): Settle up and Archive / Unarchive behind the row
 * (src/lib/group-row-actions.ts; only what can be done now is shown).
 */
export function GroupRow({ d, swipe = false }: { d: GroupData; swipe?: boolean }) {
  const row = <GroupRowBody d={d} />
  return swipe ? <SwipeGroupRow d={d}>{row}</SwipeGroupRow> : row
}

function SwipeGroupRow({ d, children }: { d: GroupData; children: ReactNode }) {
  const nav = useNavigate()
  const archive = useGroupArchive()
  const me = d.me
  const actions = groupRowActions({
    personal: d.group.type === 'personal',
    archived: !!d.group.archived,
    myBalance: me ? (d.net[me] ?? 0) : 0,
    waitingOnYou: me ? d.pending.filter((e) => membersIn([e]).has(me)).length + d.waiting.filter((s) => s.from === me || s.to === me).length : 0,
    locked: !!d.locked,
  })
  if (!actions.length) return <>{children}</>
  const name = d.group.name
  return (
    <SwipeRow
      as="div"
      contentClassName="flex [&>*]:min-w-0 [&>*]:flex-1"
      testId="group-swipe-row"
      menuTitle={name}
      actions={actions.map((a) =>
        a.kind === 'settle'
          ? {
              label: 'Settle up',
              ariaLabel: `Settle up in ${name}`,
              icon: <ChequeIcon size={20} />,
              tone: 'accent' as const,
              onClick: () => nav(`/groups/${d.group.id}/settle`),
              testId: 'group-swipe-settle',
            }
          : a.kind === 'archive'
            ? {
                label: 'Archive',
                ariaLabel: `Archive ${name} for you`,
                icon: <ArchiveIcon size={20} />,
                tone: 'neutral' as const,
                onClick: () => void archive(d.group, true),
                testId: 'group-swipe-archive',
              }
            : {
                label: 'Unarchive',
                ariaLabel: `Unarchive ${name}`,
                icon: <RotateCcw size={20} />,
                tone: 'neutral' as const,
                onClick: () => void archive(d.group, false),
                testId: 'group-swipe-unarchive',
              },
      )}
    >
      {children}
    </SwipeRow>
  )
}

function GroupRowBody({ d }: { d: GroupData }) {
  const { earned } = usePro()
  const bal = d.me ? (d.net[d.me] ?? 0) : 0
  const members = Object.values(activeMembers(d.group.members))
  const personal = d.group.type === 'personal'
  const spent = spending(d.expenses).reduce((s, e) => s + e.amount, 0)
  if (d.locked) return <LockedRow d={d} count={members.length} />
  // A 1:1 whose friend has a badge (src/lib/pro.ts): [PRO] · Friend. A plain PRO opens Help → Earn
  // Pro for a viewer who hasn't earned it, so then it's a link of its own.
  const badge = friendBadge(d.group)
  const proLink = !!badge && badgeTapTarget(badge, earned) !== null
  // An open private group has its own lock button in the row (like the Groups screen's for all of
  // them), and a Pro friend's pill its own link. A button or link can't sit inside a link, so then the
  // row's link is its background and they sit above it.
  const open = !!d.group.vault
  const overlay = open || proLink
  const row = 'relative flex min-h-16 items-center gap-3 px-4 py-3 transition active:bg-slate-50 dark:active:bg-ink-800'
  const body = (
    <>
      {overlay && <Link to={`/groups/${d.group.id}`} className="absolute inset-0" aria-label={open ? `${d.group.name}, private group, open` : d.group.name} />}
      <GroupIcon emoji={d.group.emoji} group={d.group} />
      <div className={`min-w-0 flex-1 ${overlay ? 'pointer-events-none' : ''}`}>
        {/* A long name takes two lines (360 px phones cut it to a few letters before). */}
        <div className="flex items-center gap-2">
          <span className="line-clamp-2 min-w-0 break-words font-semibold leading-snug">{d.group.name}</span>
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
            <span className="text-muted flex items-center gap-1 text-xs">
              {badge && (
                <>
                  {proLink ? (
                    <ProTap word={badge} className="pointer-events-auto relative z-10 -my-2 -ml-1 flex min-h-7 items-center px-1" testId="group-row-pro">
                      <ProPill h={7} word={badge} />
                    </ProTap>
                  ) : (
                    <span className="flex items-center">
                      <ProPill h={7} word={badge} />
                      <span className="sr-only">{badgeLabel(badge, false)}</span>
                    </span>
                  )}
                  <span aria-hidden>·</span>
                </>
              )}
              Friend
            </span>
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
  return overlay ? (
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
