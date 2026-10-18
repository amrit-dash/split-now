import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, FileUp, Lock, LockOpen, Plus, Trash2 } from 'lucide-react'
import { useAllGroupData, useDeletedGroups } from '@/hooks/data'
import { usePrivateGroups } from '@/hooks/usePrivateGroups'
import { useVaultVersion } from '@/hooks/useVault'
import { lockButton } from '@/lib/vault-api'
import { isUnlocked, lockVault } from '@/lib/vault-keys'
import { PatternLock } from '@/features/vault/PatternLock'
import { LockedTile } from '@/features/vault/Scrambled'
import { lockedText } from '@/lib/vault-scramble'
import { GroupRow } from '@/components/GroupRow'
import { PageHeader } from '@/components/Misc'
import { Collapsible } from '@/components/Collapsible'
import { ListSkeleton } from '@/components/Skeleton'
import { usePageTitle } from '@/lib/brand'
import { useMe } from '@/hooks/auth'
import type { Group } from '@/types'
import { daysLeft } from '../../shared/group-trash'
import { EmptyGroups, FirstRun, Section } from './Home'
import { labelForUid, memberIdOfUid } from '@/lib/shortNames'
import { settledAWhile, showSettledStored, storeShowSettled } from '@/lib/settled-groups'

export default function Groups() {
  usePageTitle('Groups')
  const data = useAllGroupData()
  const deleted = useDeletedGroups()
  const [showSettled, setShowSettledState] = useState(showSettledStored)
  const setShowSettled = (on: boolean) => {
    setShowSettledState(on)
    storeShowSettled(on)
  }
  const vaults = usePrivateGroups()
  useVaultVersion()
  // The universal pattern's lock: every private group at once (src/lib/vault-api.ts lockButton).
  // With private groups off there's no universal pattern: each one they were added to opens inside.
  const vaultButton = vaults.flagOn
    ? lockButton(
        (data ?? []).filter((d) => d.group.vault).map((d) => d.group.id),
        isUnlocked,
        !vaults.on,
      )
    : 'none'
  const now = Date.now()
  const quiet = (data ?? []).filter((d) => !d.group.archived && settledAWhile(d, now))
  const header = (
    <PageHeader
      title="Groups"
      right={
        <div className="flex gap-2">
          {vaultButton === 'lock' && (
            <button
              type="button"
              onClick={() => lockVault()}
              aria-label="Lock private groups"
              title="Lock private groups"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
              data-testid="groups-vault"
            >
              <LockOpen size={20} aria-hidden />
            </button>
          )}
          {vaultButton === 'unlock' && (
            // The pattern goes in on this button itself; nothing on screen says so (PatternLock).
            <PatternLock
              label="Private groups"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200/70 dark:bg-ink-800"
              testId="groups-vault"
            >
              <Lock size={20} aria-hidden />
            </PatternLock>
          )}
          {quiet.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSettled(!showSettled)}
              aria-pressed={showSettled}
              aria-label={showSettled ? 'Hide groups settled over a week ago' : `Show ${quiet.length} settled ${quiet.length === 1 ? 'group' : 'groups'}`}
              title={showSettled ? 'Hide settled' : 'Show settled'}
              className={`flex h-11 w-11 items-center justify-center rounded-full ${showSettled ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200' : 'bg-slate-200/70 dark:bg-ink-800'}`}
              data-testid="groups-show-settled"
            >
              {showSettled ? <Eye size={20} aria-hidden /> : <EyeOff size={20} aria-hidden />}
            </button>
          )}
          <Link
            to="/groups/import"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200/70 dark:bg-ink-800"
            aria-label="Import from Splitwise"
          >
            <FileUp size={20} aria-hidden />
          </Link>
          <Link
            to="/groups/new"
            className="accent-live flex h-11 w-11 items-center justify-center rounded-full bg-fill text-on-fill"
            aria-label="New group"
            data-testid="groups-new"
          >
            <Plus size={20} aria-hidden />
          </Link>
        </div>
      }
    />
  )
  if (!data)
    return (
      <div>
        {header}
        <ListSkeleton rows={4} />
      </div>
    )
  // Square for over a week: out of the way unless the eye is on (src/lib/settled-groups.ts).
  const hidden = new Set(showSettled ? [] : quiet.map((d) => d.group.id))
  const live = data.filter((d) => !d.group.archived && !hidden.has(d.group.id))
  const shared = live.filter((d) => d.group.type !== 'personal' && d.group.type !== 'direct')
  const direct = live.filter((d) => d.group.type === 'direct')
  const personal = live.filter((d) => d.group.type === 'personal')
  const archived = data.filter((d) => d.group.archived)
  const list = (rows: typeof data) => (
    <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
      {rows.map((d) => (
        <GroupRow key={d.group.id} d={d} />
      ))}
    </div>
  )
  return (
    <div>
      {header}
      {data.length === 0 ? (
        <FirstRun />
      ) : shared.length > 0 ? (
        list(shared)
      ) : (
        // Every shared group is only hidden as settled: the hint below brings them back, so no "make a group" nudge.
        !quiet.some((d) => d.group.type !== 'direct') && <EmptyGroups />
      )}
      {direct.length > 0 && <Section title="1:1 with friends">{list(direct)}</Section>}
      {hidden.size > 0 && (
        <button
          type="button"
          onClick={() => setShowSettled(true)}
          className="text-muted mt-3 flex min-h-11 w-full items-center justify-center gap-2 text-sm"
          data-testid="groups-settled-hint"
        >
          <EyeOff size={16} aria-hidden /> {hidden.size} settled {hidden.size === 1 ? 'group' : 'groups'} hidden · Show
        </button>
      )}
      <Section title="Personal">
        {personal.length ? (
          <>
            {list(personal)}
            <Link to="/groups/new?type=personal" className="text-muted mt-2 flex min-h-11 items-center gap-2 px-1 text-sm" data-testid="wallet-new">
              <Plus size={18} aria-hidden /> New wallet, e.g. Fuel or Groceries
            </Link>
          </>
        ) : (
          <Link to="/groups/new?type=personal" className="card text-muted flex min-h-14 items-center gap-2 px-4 py-3 text-sm">
            <Plus size={18} aria-hidden /> Track your own spending in a personal wallet
          </Link>
        )}
      </Section>
      {archived.length > 0 && (
        <Collapsible
          title="Archived"
          summary={`${archived.length} ${archived.length === 1 ? 'group' : 'groups'} · not counted in your balances`}
          className="!mt-7"
          testId="archived-groups"
        >
          <div className="-mx-4 -mb-4 divide-y divide-slate-100 dark:divide-white/5">
            {archived.map((d) => (
              <GroupRow key={d.group.id} d={d} />
            ))}
          </div>
        </Collapsible>
      )}
      {/* Shown at every detail level: a group someone else deleted must be easy to find and restore. */}
      {deleted && deleted.length > 0 && <RecentlyDeletedGroups groups={deleted} />}
    </div>
  )
}

/**
 * Groups someone deleted, kept 30 days (shared/group-trash.ts): who deleted each and how long is
 * left. Opening one shows Restore (any member) and, for its creator, Delete forever.
 */
function RecentlyDeletedGroups({ groups }: { groups: Group[] }) {
  const { user } = useMe()
  const now = Date.now()
  useVaultVersion()
  // A locked private group keeps its look here too (src/lib/vault-scramble.ts).
  const hide = (g: Group) => !!g.vault && !isUnlocked(g.id)
  return (
    <Collapsible
      title="Recently deleted"
      summary={`${groups.length} ${groups.length === 1 ? 'group' : 'groups'} · anyone in it can restore it`}
      className="!mt-3"
      testId="deleted-groups"
    >
      <ul className="-mx-4 -mb-4 divide-y divide-slate-100 dark:divide-white/5">
        {groups.map((g) => {
          const by = g.deletedBy === user.uid ? 'you' : (labelForUid(g.members, g.deletedBy, memberIdOfUid(g.members, user.uid)) ?? 'someone')
          const left = daysLeft(g.deletedAt ?? now, now)
          return (
            <li key={g.id}>
              <Link to={`/groups/${g.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3" data-testid="deleted-group-row">
                {hide(g) ? (
                  <LockedTile size={40} />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-xl dark:bg-ink-800" aria-hidden>
                    {g.emoji}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{hide(g) ? lockedText(g.name, g.id) : g.name}</span>
                  <span className="text-muted block truncate text-xs">
                    Deleted by {by} · {left <= 1 ? 'last day to restore' : `${left} days left to restore`}
                  </span>
                </span>
                <Trash2 size={16} className="text-muted shrink-0" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
    </Collapsible>
  )
}
