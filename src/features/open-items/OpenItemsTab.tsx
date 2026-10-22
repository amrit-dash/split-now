import { useEffect, useMemo, useState } from 'react'
import { labelOf } from '@/lib/shortNames'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CheckCircle2, ClipboardList, HandCoins, Plus, Trash2 } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { myMemberId } from '@/hooks/data'
import type { Expense, Group, OpenItem } from '@/types'
import { CATEGORIES } from '@/lib/categories'
import { authorMember } from '@/lib/chat'
import { errText } from '@/lib/errors'
import { todayISO } from '@/lib/id'
import { pending } from '@/lib/pending'
import type { OpenItemInput } from '@/lib/open-items'
import { formatDate } from '@/lib/locale'
import { askedMe, claimHref, openItemEmoji, openItemMeta, sortOpenItems, suspectLine } from '@/lib/open-items'
import { IconFace } from '@/components/IconFace'
import { Collapsible } from '@/components/Collapsible'
import { Empty } from '@/components/Misc'
import { ListSkeleton } from '@/components/Skeleton'
import { SwipeRow } from '@/components/SwipeRow'
import { HintText, type Hint } from '@/components/Hint'

const ADD_HINT: Hint = { full: 'Spent something but not sure who paid or how much? Write it down.', short: 'Not sure who paid? Write it down.' }
/** Kept in every look: an open item is not in anyone's balance yet. */
const NOT_COUNTED_HINT: Hint = {
  full: 'Open items don’t count in balances until someone claims them.',
  short: 'Not counted in balances until claimed.',
  tier: 'key',
}
import { useToast } from '@/components/Toast'
import { OpenItemSheet } from './OpenItemSheet'
import { ReceiptIcon } from '@/components/icons'

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
  // A line from Quick add ("lunch Oct 2, who paid?") lands here with the sheet open and filled in.
  // Read on every navigation (Quick add from the + sheet while this group is already open doesn't remount it).
  const loc = useLocation()
  const [handed, setHanded] = useState<OpenItemInput | undefined>(undefined)
  const [editing, setEditing] = useState<OpenItem | 'new' | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: loc.key is the trigger (a new navigation may carry a hand-off)
  useEffect(() => {
    const h = pending.openItem
    if (!h || h.groupId !== group.id) return
    pending.openItem = undefined
    setHanded(h.input)
    setEditing('new')
  }, [loc.key, group.id])
  const remove = useDeleteOpenItem()
  const { open, claimed } = useMemo(() => sortOpenItems(items, expenses), [items, expenses])
  const name = (id: string) => (group.members[id] ? labelOf(group.members, id, '', me) : undefined)
  const claimerName = (uid?: string) => {
    if (!uid) return 'Someone'
    if (uid === user.uid) return 'You'
    const id = authorMember(group, uid)
    return id ? labelOf(group.members, id, 'Someone', me) : 'Someone'
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
          <HintText hint={ADD_HINT} className="text-muted block text-xs" as="span" />
        </span>
      </button>

      {open.length === 0 ? (
        <Empty icon={ReceiptIcon} title="Nothing open">
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
                    <IconFace iconSvg={o.iconSvg} iconImage={o.iconImage} emoji={openItemEmoji(o)} vault={!!group.vault} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block font-semibold leading-snug">{o.title}</span>
                    <span className="text-muted block truncate text-xs">{openItemMeta(o, group.currency, today)}</span>
                    {who && (
                      <span className={`block text-xs ${asked ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-muted'}`}>
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
                    <IconFace iconSvg={o.iconSvg} iconImage={o.iconImage} emoji={openItemEmoji(o)} vault={!!group.vault} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{o.title}</span>
                    <span className="text-muted block truncate text-xs">
                      {claimerName(o.claimedBy)} claimed it{o.claimedAt ? ` on ${formatDate(o.claimedAt)}` : ''}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Collapsible>
      )}

      <p className="text-muted flex items-start gap-2 px-1 text-xs">
        <ClipboardList size={14} className="mt-0.5 shrink-0" aria-hidden />
        <HintText hint={NOT_COUNTED_HINT} className="" as="span" />
      </p>

      <OpenItemSheet
        open={editing !== null}
        onClose={() => {
          setEditing(null)
          setHanded(undefined)
        }}
        group={group}
        item={editing && editing !== 'new' ? editing : undefined}
        initial={editing === 'new' ? handed : undefined}
        onDelete={remove}
      />
    </div>
  )
}
