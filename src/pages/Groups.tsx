import { Link } from 'react-router-dom'
import { FileUp, Plus, UserPlus } from 'lucide-react'
import { useAllGroupData } from '@/hooks/data'
import { GroupRow } from '@/components/GroupRow'
import { Empty, Loading, PageHeader } from '@/components/Misc'
import { Section } from './Home'

export default function Groups() {
  const data = useAllGroupData()
  if (!data) return <Loading />
  const shared = data.filter((d) => d.group.type !== 'personal' && d.group.type !== 'direct')
  const direct = data.filter((d) => d.group.type === 'direct')
  const personal = data.filter((d) => d.group.type === 'personal')
  return (
    <div>
      <PageHeader
        title="Groups"
        right={
          <div className="flex gap-2">
            <Link to="/groups/import" className="rounded-full bg-slate-200/70 p-2.5 dark:bg-ink-800" aria-label="Import from Splitwise"><FileUp size={20} /></Link>
            <Link to="/friends"className="rounded-full bg-slate-200/70 p-2.5 dark:bg-ink-800" aria-label="Friends"><UserPlus size={20} /></Link>
            <Link to="/groups/new" className="rounded-full bg-brand-600 p-2.5 text-white" aria-label="New group"><Plus size={20} /></Link>
          </div>
        }
      />
      {shared.length === 0 ? (
        <Empty emoji="🧳" title="Start your first group">
          <Link to="/groups/new" className="btn-primary mt-4">Create group</Link>
          <Link to="/groups/import" className="btn-ghost mt-1">Switching from Splitwise? Import a group</Link>
        </Empty>
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
          {shared.map((d) => <GroupRow key={d.group.id} d={d} />)}
        </div>
      )}
      {direct.length > 0 && (
        <Section title="Friends (non-group)">
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">{direct.map((d) => <GroupRow key={d.group.id} d={d} />)}</div>
        </Section>
      )}
      <Section title="Personal">
        {personal.length ? (
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">{personal.map((d) => <GroupRow key={d.group.id} d={d} />)}</div>
        ) : (
          <Link to="/groups/new?type=personal" className="card block px-4 py-4 text-sm text-slate-500">＋ Track your own spending in a personal wallet</Link>
        )}
      </Section>
    </div>
  )
}
