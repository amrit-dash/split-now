import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, ClipboardList, HandCoins, Plus, Trash2 } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { myMemberId } from '@/hooks/data'
import type { Expense, Group, OpenItem } from '@/types'
import { CATEGORIES } from '@/lib/categories'
import { authorMember } from '@/lib/chat'
import { errText } from '@/lib/errors'
import { todayISO } from '@/lib/id'
import { askedMe, claimHref, openItemMeta, sortOpenItems, suspectLine } from '@/lib/open-items'
import { Collapsible } from '@/components/Collapsible'
import { Empty } from '@/components/Misc'
import { ListSkeleton } from '@/components/Skeleton'
import { SwipeRow } from '@/components/SwipeRow'
import { useToast } from '@/components/Toast'
import { OpenItemSheet } from './OpenItemSheet'

/** Delete with Undo (any member may; it's a soft delete). */
export function useDeleteOpenItem() {
  const toast = useToast()
  const fail = (e: unknown) => toast(errText(e), 'err')
  return (o: OpenItem) =>
    repo
      .deleteOpenItem(o.groupId, o.id)
      .then(() =>
        toast(`Deleted “${o.title}”`, 'ok', {
          action: { label: 'Undo', run: () => void repo.restoreOpenItem(o.groupId, o.id).catch(fail) },
        }),
      )
      .catch(fail)
}

/**
 * The group's Open tab: what nobody has added yet, newest first, each with Claim (Add expense,
 * prefilled, paid by you); and below, what was claimed lately. An item whose expense is deleted
 * comes back here on its own (src/lib/open-items.ts).
 */
export function OpenItemsTab({ group, items, expenses }: { group: Group; items: OpenItem[] | null; expenses: Expense[] }) {
  const { user } = useMe()
  const nav = useNavigate()
  const me = myMemberId(group, user.uid)
  const today = todayISO()
  const [editing, setEditing] = useState<OpenItem | 'new' | null>(null)
  const remove = useDeleteOpenItem()
  const { open, claimed } = useMemo(() => sortOpenItems(items, expenses), [items, expenses])
  const name = (id: string) => group.members[id]?.name
  const claimerName = (uid?: string) => {
    if (!uid) return 'Someone'
    if (uid === user.uid) return 'You'
    const id = authorMember(group, uid)
    return (id && group.members[id]?.name) || 'Someone'
  }

  if (items === null) return <ListSkeleton rows={3} />

  return (
    <div className="space-y-3" data-testid="open-items">
      <button
        type="button"
        className="card flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
        onClick={() => setEditing('new')}
        data-testid="open-item-add"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-fill text-on-fill" aria-hidden>
          <Plus size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Add an open item</span>
          <span className="text-muted block text-xs">Spent something but not sure who paid or how much? Write it down.</span>
        </span>
      </button>

      {open.length === 0 ? (
        <Empty emoji="🧾" title="Nothing open">
          Lunch you can’t place, a taxi nobody added: write it down here and whoever paid can claim it.
        </Empty>
      ) : (
        <ul className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5" aria-label="Open items">
          {open.map((o) => {
            const cat = CATEGORIES[o.category ?? 'other']
            const asked = askedMe(o, me)
            const who = suspectLine(o.suspects, me, name)
            return (
              <SwipeRow
                key={o.id}
                contentClassName="flex items-center gap-3 px-4 py-3"
                testId="open-item-row"
                menuTitle={o.title}
                actions={[
                  {
                    label: 'Delete',
                    ariaLabel: `Delete “${o.title}”`,
                    icon: <Trash2 size={20} strokeWidth={2.25} />,
                    onClick: () => remove(o),
                  },
                ]}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => setEditing(o)}
                  aria-label={`Edit “${o.title}”`}
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xl"
                    style={{ background: cat.color + '22' }}
                    aria-hidden
                  >
                    {cat.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{o.title}</span>
                    <span className="text-muted block truncate text-xs">{openItemMeta(o, group.currency, today)}</span>
                    {who && (
                      <span className={`block truncate text-xs ${asked ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-muted'}`}>
                        {asked ? 'Did you pay? ' : ''}
                        {who}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  className={`${asked ? 'btn-primary' : 'btn-secondary'} btn-sm shrink-0`}
                  onClick={() => nav(claimHref(group.id, o.id))}
                  aria-label={`Claim “${o.title}”: I paid`}
                  data-testid="open-item-claim"
                >
                  <HandCoins size={16} aria-hidden /> Claim
                </button>
              </SwipeRow>
            )
          })}
        </ul>
      )}

      {claimed.length > 0 && (
        <Collapsible title="Claimed" summary={`${claimed.length} added as expenses`} icon={<CheckCircle2 size={18} aria-hidden />} testId="open-items-claimed">
          <ul className="-mx-1 divide-y divide-slate-100 dark:divide-white/5">
            {claimed.slice(0, 30).map((o) => (
              <li key={o.id}>
                <Link to={`/groups/${group.id}/expenses/${o.expenseId}`} className="flex min-h-12 items-center gap-3 px-1 py-2 text-sm">
                  <span aria-hidden className="text-lg">
                    {CATEGORIES[o.category ?? 'other'].emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{o.title}</span>
                    <span className="text-muted block truncate text-xs">{claimerName(o.claimedBy)} claimed it</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Collapsible>
      )}

      <p className="text-muted flex items-start gap-2 px-1 text-xs">
        <ClipboardList size={14} className="mt-0.5 shrink-0" aria-hidden />
        Open items don’t count in balances until someone claims them.
      </p>

      <OpenItemSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        group={group}
        item={editing && editing !== 'new' ? editing : undefined}
        onDelete={remove}
      />
    </div>
  )
}
