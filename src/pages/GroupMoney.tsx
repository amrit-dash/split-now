import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, HandCoins } from 'lucide-react'
import { useMe } from '@/hooks/auth'
import { computeGroupData, memberOrder, useExpenses, useGroup, useSettlements } from '@/hooks/data'
import { usePageTitle } from '@/lib/brand'
import { formatDate } from '@/lib/locale'
import { formatMoney } from '@/lib/money'
import { receivedBreakdown } from '@/lib/received-breakdown'
import { groupLabels } from '@/lib/shortNames'
import { Avatar } from '@/components/Avatar'
import { HintText } from '@/components/Hint'
import { Empty, PageHeader } from '@/components/Misc'
import { CardSkeleton, ListSkeleton } from '@/components/Skeleton'
import { handlersOf } from '../../shared/received'
import { MagnifyingGlassIcon } from '@/components/icons'

/** "owes ₹300" / "gets back ₹200" / "settled", from a balance (+ is owed to them). */
const standing = (v: number, cur: string) => (v > 0 ? `gets back ${formatMoney(v, cur)}` : v < 0 ? `owes ${formatMoney(-v, cur)}` : 'settled')

/**
 * Money received, worked through (src/lib/received-breakdown.ts): what the group spent, what came
 * back, each person's real cost, and how money received moved their balance. Settle up already
 * uses the balance after it.
 */
export default function GroupMoney() {
  const { groupId } = useParams()
  const { user } = useMe()
  const liveGroup = useGroup(groupId)
  const expenses = useExpenses(groupId)
  const settlements = useSettlements(groupId)
  const d = useMemo(
    () => (liveGroup && expenses && settlements ? computeGroupData(liveGroup, expenses, settlements, user.uid) : null),
    [liveGroup, expenses, settlements, user.uid],
  )
  const b = useMemo(() => {
    if (!d) return null
    // The same expenses the balances count: not the ones still waiting for an OK.
    const counted = d.expenses.filter((e) => !d.pending.includes(e))
    return receivedBreakdown(counted, d.settlements, memberOrder(d.group))
  }, [d])
  usePageTitle(liveGroup ? `Money received · ${liveGroup.name}` : liveGroup === null ? 'Group not found' : undefined)
  const back = groupId ? `/groups/${groupId}` : '/groups'

  if (liveGroup === null)
    return (
      <>
        {/* Fixed: this group is gone for you, and every screen of it behind this one would say the same, so back leaves the group. */}
        <PageHeader title="Money received" back={{ to: '/groups', mode: 'fixed' }} />
        <Empty icon={MagnifyingGlassIcon} title="This group doesn’t exist or you’re not a member" />
      </>
    )
  if (!d || !b)
    return (
      <>
        <PageHeader title="Money received" subtitle={liveGroup?.name} back={back} />
        <div className="space-y-4" role="status" aria-label="Loading">
          <CardSkeleton className="h-28" />
          <ListSkeleton rows={4} />
        </div>
      </>
    )

  const { group, me } = d
  const cur = group.currency
  const labels = groupLabels(group.members, me)
  const name = (id: string) => (id === me ? 'You' : (labels[id] ?? 'Former member'))

  return (
    <div data-testid="group-money">
      <PageHeader title="Money received" subtitle={group.name} back={back} />
      <section className="card grid grid-cols-3 gap-2 p-4 text-center" aria-label="Totals">
        <div>
          <div className="text-muted text-xs">Spent</div>
          <div className="font-bold tabular-nums">{formatMoney(b.spent, cur)}</div>
        </div>
        <div>
          <div className="text-muted text-xs">Money received</div>
          <div className="pos font-bold tabular-nums">{formatMoney(b.received, cur)}</div>
        </div>
        <div>
          <div className="text-muted text-xs">Real cost</div>
          <div className="font-bold tabular-nums" data-testid="money-net-cost">
            {formatMoney(b.netCost, cur)}
          </div>
        </div>
      </section>
      <HintText
        hint={{
          full: 'Total spent and the budget leave money received out. Balances and Settle up include it: whoever received it owes the others their share.',
          tier: 'key',
        }}
        as="p"
        className="text-muted mt-2 px-1 text-xs"
      />

      <h2 className="mt-6 mb-2 px-1 font-bold">Each person</h2>
      <ul className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5" aria-label="Each person">
        {b.people.map((p) => {
          const m = group.members[p.id]
          const moved = p.balance !== p.balanceBefore
          return (
            <li key={p.id} className="flex items-start gap-3 px-4 py-3" data-testid="money-person">
              <Avatar name={m?.name ?? '?'} color={m?.color ?? '#999'} photoURL={m?.photoURL} size={36} />
              <div className="min-w-0 flex-1 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold">{name(p.id)}</span>
                  <span className="shrink-0 tabular-nums font-semibold">{formatMoney(p.netCost, cur)}</span>
                </div>
                <div className="text-muted text-xs">
                  Share {formatMoney(p.share, cur)}
                  {p.receivedShare ? ` − ${formatMoney(p.receivedShare, cur)} back` : ''} = real cost
                  {p.received ? ` · received ${formatMoney(p.received, cur)} for the group` : ''}
                </div>
                <div className={`mt-1 text-xs ${p.balance > 0 ? 'pos' : p.balance < 0 ? 'neg' : 'text-muted'}`}>
                  {moved ? (
                    <>
                      Without money received {standing(p.balanceBefore, cur)} · now <b>{standing(p.balance, cur)}</b>
                    </>
                  ) : (
                    <>Now {standing(p.balance, cur)}</>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <h2 className="mt-6 mb-2 px-1 font-bold">Money received</h2>
      {b.entries.length === 0 ? (
        <p className="card text-muted p-4 text-sm">
          Nothing yet. Add a refund or reimbursement with Add expense → <b>Money received</b>.
        </p>
      ) : (
        <ul className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
          {b.entries.map((e) => {
            const by = Object.keys(handlersOf(e))
            return (
              <li key={e.id}>
                <Link to={`/groups/${group.id}/expenses/${e.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3">
                  <HandCoins size={20} className="pos shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{e.description}</span>
                    <span className="text-muted block truncate text-xs">
                      {by.length > 1 ? `${by.length} people` : name(by[0])} received it · {formatDate(e.date)}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{formatMoney(e.amount, cur)}</span>
                  <ChevronRight size={16} className="text-slate-300 dark:text-slate-600" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      <Link to={`/groups/${group.id}/settle`} className="btn-primary mt-6 w-full">
        Settle up
      </Link>
    </div>
  )
}
