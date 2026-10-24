import { useState } from 'react'
import { ChevronRight, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AddIcon, EyeIcon, EyeSlashIcon, FileUploadIcon, LockIcon, LockOpenIcon, TrashIcon } from '@/components/icons'
import { useAllGroupData, useDeletedGroups } from '@/hooks/data'
import { usePrivateGroups } from '@/hooks/usePrivateGroups'
import { useVaultVersion } from '@/hooks/useVault'
import { lockButton } from '@/lib/vault-api'
import { isUnlocked, lockVault } from '@/lib/vault-keys'
import { PatternLock } from '@/features/vault/PatternLock'
import { LockedTile } from '@/features/vault/Scrambled'
import { lockedText } from '@/lib/vault-scramble'
import { GroupRow } from '@/components/GroupRow'
import { SwipeRow } from '@/components/SwipeRow'
import { useGroupTrash } from '@/components/DeleteGroup'
import { useToast } from '@/components/Toast'
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
import { useFeature } from '@/hooks/useMode'

export default function Groups() {
  usePageTitle('Groups')
  const data = useAllGroupData()
  const deleted = useDeletedGroups()
  const showWallets = useFeature('wallets')
  const showImport = useFeature('importGroup')
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
              <LockOpenIcon size={20} aria-hidden />
            </button>
          )}
          {vaultButton === 'unlock' && (
            // The pattern goes in on this button itself; nothing on screen says so (PatternLock).
            <PatternLock
              label="Private groups"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200/70 dark:bg-ink-800"
              testId="groups-vault"
            >
              <LockIcon size={20} aria-hidden />
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
              {showSettled ? <EyeIcon size={20} aria-hidden /> : <EyeSlashIcon size={20} aria-hidden />}
            </button>
          )}
          {showImport && (
            <Link
              to="/groups/import"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200/70 dark:bg-ink-800"
              aria-label="Import from Splitwise"
            >
              <FileUploadIcon size={20} aria-hidden />
            </Link>
          )}
          {/* A labelled secondary chip, not a filled round +: that read as a second copy of the tab bar's + button. */}
          <Link
            to="/groups/new"
            className="flex h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-brand-100 pl-2.5 pr-3.5 text-sm font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
            data-testid="groups-new"
          >
            <AddIcon size={18} aria-hidden /> New group
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
          <EyeSlashIcon size={16} aria-hidden /> {hidden.size} settled {hidden.size === 1 ? 'group' : 'groups'} hidden · Show
        </button>
      )}
      {/* Simple has no personal wallets (docs/SIMPLE_MODE.md); they stay, out of sight. */}
      {showWallets && (
        <Section title="Personal">
          {personal.length ? (
            <>
              {list(personal)}
              <Link to="/groups/new?type=personal" className="text-muted mt-2 flex min-h-11 items-center gap-2 px-1 text-sm" data-testid="wallet-new">
                <AddIcon size={18} aria-hidden /> New wallet, e.g. Fuel or Groceries
              </Link>
            </>
          ) : (
            <Link to="/groups/new?type=personal" className="card text-muted flex min-h-14 items-center gap-2 px-4 py-3 text-sm">
              <AddIcon size={18} aria-hidden /> Track your own spending in a personal wallet
            </Link>
          )}
        </Section>
      )}
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
        {groups.map((g) => (
          <DeletedGroupRow key={g.id} g={g} hidden={hide(g)} now={now} />
        ))}
      </ul>
    </Collapsible>
  )
}

/**
 * One group in Recently deleted. Tapping opens it (read-only, with Restore); swiping left, a long
 * press or right-click shows Restore and Delete forever. Delete forever is for its creator after
 * the week others get to restore it (no wait where nobody else has an account); otherwise the
 * action says why it can't yet.
 */
function DeletedGroupRow({ g, hidden, now }: { g: Group; hidden: boolean; now: number }) {
  const { user } = useMe()
  const toast = useToast()
  const { restore, purge, purgeState } = useGroupTrash(g)
  const by = g.deletedBy === user.uid ? 'you' : (labelForUid(g.members, g.deletedBy, memberIdOfUid(g.members, user.uid)) ?? 'someone')
  const left = daysLeft(g.deletedAt ?? now, now)
  const name = hidden ? lockedText(g.name, g.id) : g.name
  return (
    <SwipeRow
      contentClassName="flex"
      testId="deleted-group-row"
      menuTitle={name}
      actions={[
        {
          label: 'Restore',
          ariaLabel: `Restore “${name}”`,
          icon: <RotateCcw size={20} />,
          tone: 'accent',
          onClick: () => void restore(),
          testId: 'deleted-group-restore',
        },
        // Its creator (or an admin) only; a member sees Restore alone (owner, 24 Oct 2026).
        ...(purgeState === null
          ? []
          : [
              purgeState
                ? {
                    label: 'Delete forever',
                    ariaLabel: `Why “${name}” can’t be deleted forever yet`,
                    icon: <TrashIcon size={20} />,
                    tone: 'muted' as const,
                    onClick: () => toast(purgeState, 'err'),
                    testId: 'deleted-group-purge',
                  }
                : {
                    label: 'Delete forever',
                    ariaLabel: `Delete “${name}” forever`,
                    icon: <TrashIcon size={20} />,
                    onClick: () => void purge(),
                    testId: 'deleted-group-purge',
                  },
            ]),
      ]}
    >
      <Link to={`/groups/${g.id}`} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-3" data-testid="deleted-group-open">
        {hidden ? (
          <LockedTile size={40} />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-xl dark:bg-ink-800" aria-hidden>
            {g.emoji}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{name}</span>
          <span className="text-muted block truncate text-xs">
            Deleted by {by} · {left <= 1 ? 'last day to restore' : `${left} days left to restore`}
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-slate-300 dark:text-slate-600" aria-hidden />
      </Link>
    </SwipeRow>
  )
}
