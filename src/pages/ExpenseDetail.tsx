import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Pencil, Repeat, Send, Trash2 } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { myMemberId, useComments, useExpenses, useGroup } from '@/hooks/data'
import type { Expense, Group } from '@/types'
import { CATEGORIES } from '@/lib/categories'
import { formatMoney } from '@/lib/money'
import { FREQ_LABEL } from '@/lib/recurrence'
import { rateLabel } from '@/lib/fx'
import { colorFor } from '@/lib/colors'
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

  const template = e.recurringFrom ? expenses.find((x) => x.id === e.recurringFrom) : undefined

  const stopRepeating = async () => {
    if (!confirm('Stop repeating? Copies already added stay.')) return
    try {
      await repo.saveExpense({ ...e, recurrence: undefined, updatedAt: Date.now() })
      toast('This expense no longer repeats')
    } catch (err) {
      toast((err as Error).message, 'err')
    }
  }

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
        {e.original && (
          <div className="mt-1 text-sm text-slate-500" data-testid="fx-original">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{formatMoney(e.original.amount, e.original.currency)}</span> at {rateLabel(e.original, cur)}
          </div>
        )}
        <div className="mt-2 text-sm text-slate-500">{cat.label} · {new Date(e.date + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        <div className="mt-1 text-xs text-slate-400">{group.emoji} {group.name}</div>
      </div>

      {e.recurrence && (
        <div className="card mt-3 flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-200"><Repeat size={20} /></div>
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold">Repeats {FREQ_LABEL[e.recurrence.freq].toLowerCase()}</div>
            <div className="text-slate-500">Next on {fmtDate(e.recurrence.nextDate)}{e.recurrence.until ? ` · ends ${fmtDate(e.recurrence.until)}` : ''}</div>
          </div>
          <button onClick={stopRepeating} className="chip shrink-0">Stop repeating</button>
        </div>
      )}
      {e.recurringFrom && !e.recurrence && (
        <div className="card mt-3 flex items-center gap-3 p-4 text-sm">
          <Repeat size={18} className="shrink-0 text-slate-400" />
          <div className="flex-1 text-slate-500">Added automatically from a repeating expense.</div>
          {template && <Link to={`/groups/${group.id}/expenses/${template.id}`} className="chip shrink-0">{template.recurrence ? 'Manage' : 'View original'}</Link>}
        </div>
      )}

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
                  <div key={i} className="flex justify-between gap-2"><span className="truncate">{it.name} <span className="text-slate-400">· {it.members.map((m) => name(m).split(' ')[0]).join(', ')}</span></span><span className="tabular-nums">{formatMoney(it.amount, e.original?.currency ?? cur)}</span></div>
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
      {group.type !== 'personal' && <Comments group={group} expense={e} />}
      <p className="mt-4 text-center text-xs text-slate-400">Added {new Date(e.createdAt).toLocaleString()}</p>
    </div>
  )
}

function Comments({ group, expense }: { group: Group; expense: Expense }) {
  const { user, profile } = useMe()
  const comments = useComments(group.id, expense.id)
  const toast = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const colorOf = (authorUid: string, i: number) => Object.values(group.members).find((m) => m.uid === authorUid)?.color ?? colorFor(i)

  const send = async () => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    try {
      await repo.addComment(group.id, expense.id, {
        text: t.slice(0, 2000), authorUid: user.uid, authorName: profile.displayName || user.displayName, createdAt: Date.now(),
      })
      setText('')
    } catch (err) {
      toast((err as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }
  const remove = async (id: string) => {
    if (!confirm('Delete this comment?')) return
    try { await repo.deleteComment(group.id, expense.id, id) } catch (err) { toast((err as Error).message, 'err') }
  }

  return (
    <div className="card mt-3 p-4">
      <div className="label">Comments{comments?.length ? ` · ${comments.length}` : ''}</div>
      {comments === null ? null : comments.length === 0 ? (
        <p className="text-sm text-slate-500">No comments yet. Ask a question or add context for the group.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c, i) => (
            <li key={c.id} className="flex gap-2.5">
              <Avatar name={c.authorName} color={colorOf(c.authorUid, i)} size={30} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{c.authorUid === user.uid ? 'You' : c.authorName}</span>
                  <span className="text-slate-400">{fmtWhen(c.createdAt)}</span>
                  {c.authorUid === user.uid && (
                    <button onClick={() => remove(c.id)} className="ml-auto text-slate-400 hover:text-rose-500" aria-label="Delete comment"><Trash2 size={14} /></button>
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{c.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="mt-3 flex items-end gap-2" onSubmit={(ev) => { ev.preventDefault(); send() }}>
        <textarea
          className="input min-h-11 !py-2.5"
          rows={1}
          maxLength={2000}
          placeholder="Add a comment"
          aria-label="Add a comment"
          value={text}
          onChange={(ev) => setText(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.nativeEvent.isComposing) { ev.preventDefault(); send() } }}
        />
        <button type="submit" disabled={!text.trim() || busy} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white disabled:opacity-40" aria-label="Send comment"><Send size={18} /></button>
      </form>
    </div>
  )
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtWhen(ts: number) {
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
