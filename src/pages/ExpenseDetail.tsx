import { Link, useNavigate, useParams } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { myMemberId, useExpenses, useGroup } from '@/hooks/data'
import { CATEGORIES } from '@/lib/categories'
import { formatMoney } from '@/lib/money'
import { Avatar } from '@/components/Avatar'
import { Empty, Loading, PageHeader } from '@/components/Misc'
import { useToast } from '@/components/Toast'

const SPLIT_LABEL = { equal: 'Split equally', exact: 'Exact amounts', percent: 'By percentage', shares: 'By shares', adjust: 'Equal with adjustments', itemized: 'Itemized' }

export default function ExpenseDetail() {
  const { groupId, expenseId } = useParams()
  const group = useGroup(groupId)
  const expenses = useExpenses(groupId)
  const { user } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  if (group === undefined || !expenses) return <Loading />
  const e = expenses.find((x) => x.id === expenseId)
  if (!group || !e) return <><PageHeader title="Expense" back /><Empty emoji="🔍" title="Expense not found" /></>
  const me = myMemberId(group, user.uid)
  const cur = group.currency
  const cat = CATEGORIES[e.category]
  const name = (id: string) => (id === me ? 'You' : group.members[id]?.name ?? 'Former member')

  const del = async () => {
    if (!confirm('Delete this expense?')) return
    await repo.deleteExpense(group.id, e.id)
    toast('Expense deleted')
    nav(`/groups/${group.id}`, { replace: true })
  }

  return (
    <div>
      <PageHeader title="" back right={
        <div className="flex gap-1">
          <Link to={`/groups/${group.id}/expenses/${e.id}/edit`} className="rounded-full p-2.5 hover:bg-slate-200/60 dark:hover:bg-ink-800" aria-label="Edit"><Pencil size={20} /></Link>
          <button onClick={del} className="rounded-full p-2.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10" aria-label="Delete"><Trash2 size={20} /></button>
        </div>
      } />
      <div className="card p-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl text-4xl" style={{ background: cat.color + '22' }}>{cat.emoji}</div>
        <h1 className="mt-3 text-xl font-bold">{e.description}</h1>
        <div className="mt-1 text-4xl font-extrabold tabular-nums tracking-tight">{formatMoney(e.amount, cur)}</div>
        <div className="mt-2 text-sm text-slate-500">{cat.label} · {new Date(e.date + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        <div className="mt-1 text-xs text-slate-400">{group.emoji} {group.name}</div>
      </div>

      {group.type !== 'personal' && (
        <>
          <div className="card mt-3 p-4">
            <div className="label">Paid by</div>
            {Object.entries(e.paidBy).map(([id, v]) => (
              <div key={id} className="flex items-center gap-3 py-1.5">
                <Avatar name={group.members[id]?.name ?? '?'} color={group.members[id]?.color ?? '#999'} size={32} />
                <span className="flex-1 font-medium">{name(id)}</span>
                <span className="font-semibold tabular-nums">{formatMoney(v, cur)}</span>
              </div>
            ))}
          </div>
          <div className="card mt-3 p-4">
            <div className="label">{SPLIT_LABEL[e.splitType]}</div>
            {Object.entries(e.splits).map(([id, v]) => {
              const net = (e.paidBy[id] ?? 0) - v
              return (
                <div key={id} className="flex items-center gap-3 py-1.5">
                  <Avatar name={group.members[id]?.name ?? '?'} color={group.members[id]?.color ?? '#999'} size={32} />
                  <div className="flex-1">
                    <div className="font-medium">{name(id)}</div>
                    {e.splitType === 'percent' && <div className="text-xs text-slate-500">{e.splitInput.percent?.[id]}%</div>}
                    {e.splitType === 'shares' && <div className="text-xs text-slate-500">{e.splitInput.shares?.[id]} share(s)</div>}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">{formatMoney(v, cur)}</div>
                    {net !== 0 && <div className={`text-xs tabular-nums ${net > 0 ? 'pos' : 'neg'}`}>{net > 0 ? 'gets back' : 'owes'} {formatMoney(Math.abs(net), cur)}</div>}
                  </div>
                </div>
              )
            })}
            {e.splitType === 'itemized' && e.splitInput.items && (
              <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm dark:border-white/5">
                {e.splitInput.items.map((it, i) => (
                  <div key={i} className="flex justify-between gap-2"><span className="truncate">{it.name} <span className="text-slate-400">· {it.members.map((m) => name(m).split(' ')[0]).join(', ')}</span></span><span className="tabular-nums">{formatMoney(it.amount, cur)}</span></div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {e.notes && <div className="card mt-3 p-4"><div className="label">Notes</div><p className="whitespace-pre-wrap text-sm">{e.notes}</p></div>}
      {e.receiptUrl && (
        <div className="card mt-3 overflow-hidden">
          <div className="label px-4 pt-4">Receipt</div>
          <a href={e.receiptUrl} target="_blank" rel="noreferrer"><img src={e.receiptUrl} alt="Receipt" className="max-h-96 w-full object-contain" /></a>
        </div>
      )}
      <p className="mt-4 text-center text-xs text-slate-400">Added {new Date(e.createdAt).toLocaleString()}</p>
    </div>
  )
}
