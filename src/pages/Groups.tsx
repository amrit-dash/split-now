import { Link } from 'react-router-dom'
import { FileUp, Plus, Scale } from 'lucide-react'
import { useAllGroupData } from '@/hooks/data'
import { GroupRow } from '@/components/GroupRow'
import { PageHeader } from '@/components/Misc'
import { Collapsible } from '@/components/Collapsible'
import { ListSkeleton } from '@/components/Skeleton'
import { usePageTitle } from '@/lib/brand'
import { EmptyGroups, FirstRun, Section } from './Home'

export default function Groups() {
  usePageTitle('Groups')
  const data = useAllGroupData()
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
            className="accent-live flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-white"
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
          list(personal)
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
    </div>
  )
}
