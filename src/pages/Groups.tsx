import { Link } from 'react-router-dom'
import { FileUp, Plus, Scale, Trash2 } from 'lucide-react'
import { useAllGroupData, useDeletedGroups } from '@/hooks/data'
import { GroupRow } from '@/components/GroupRow'
import { PageHeader } from '@/components/Misc'
import { Collapsible } from '@/components/Collapsible'
import { ListSkeleton } from '@/components/Skeleton'
import { usePageTitle } from '@/lib/brand'
import { useMe } from '@/hooks/auth'
import type { Group } from '@/types'
import { daysLeft } from '../../shared/group-trash'
import { EmptyGroups, FirstRun, Section } from './Home'

export default function Groups() {
  usePageTitle('Groups')
  const data = useAllGroupData()
  const deleted = useDeletedGroups()
  const header = (
    <PageHeader
      title="Groups"
      right={
        <div className="flex gap-2">
          <Link
            to="/groups/import"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200/70 dark:bg-ink-800"
            aria-label="Import from Splitwise"
          >
            <FileUp size={20} aria-hidden />
          </Link>
          <Link to="/settle" className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200/70 dark:bg-ink-800" aria-label="Balances">
            <Scale size={20} aria-hidden />
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
  const live = data.filter((d) => !d.group.archived)
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
      {data.length === 0 ? <FirstRun /> : shared.length === 0 ? <EmptyGroups /> : list(shared)}
      {direct.length > 0 && <Section title="1:1 friends">{list(direct)}</Section>}
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
  return (
    <Collapsible
      title="Recently deleted"
      summary={`${groups.length} ${groups.length === 1 ? 'group' : 'groups'} · anyone in it can restore it`}
      className="!mt-3"
      testId="deleted-groups"
    >
      <ul className="-mx-4 -mb-4 divide-y divide-slate-100 dark:divide-white/5">
        {groups.map((g) => {
          const by = g.deletedBy === user.uid ? 'you' : (Object.values(g.members).find((m) => m.uid === g.deletedBy)?.name ?? 'someone')
          const left = daysLeft(g.deletedAt ?? now, now)
          return (
            <li key={g.id}>
              <Link to={`/groups/${g.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3" data-testid="deleted-group-row">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-xl dark:bg-ink-800" aria-hidden>
                  {g.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{g.name}</span>
                  <span className="text-muted block truncate text-xs">
                    Deleted by {by} · {left === 1 ? '1 day' : `${left} days`} left to restore
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
