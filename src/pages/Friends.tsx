import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { useAllGroupData, type GroupData } from '@/hooks/data'
import type { Group } from '@/types'
import { formatMoney } from '@/lib/money'
import { todayISO, uid } from '@/lib/id'
import { errText } from '@/lib/errors'
import { filterFriends, friendBalances, parseFriendFilter, type FriendBalance, type FriendFilter } from '@/lib/friends'
import { usePageTitle } from '@/lib/brand'
import { Avatar } from '@/components/Avatar'
import { Empty, PageHeader, Segmented } from '@/components/Misc'
import { ListSkeleton } from '@/components/Skeleton'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { RemindActions } from '@/components/RemindActions'

type Friend = FriendBalance<GroupData>

export default function Friends() {
  usePageTitle('Friends')
  const data = useAllGroupData()
  const { user } = useMe()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const filter = parseFriendFilter(params.get('filter'))
  const [netting, setNetting] = useState<Friend | null>(null)
  const [busy, setBusy] = useState(false)

  const friends = useMemo(() => (data ? friendBalances(data) : null), [data])
  const header = <PageHeader title="Friends" back subtitle="Your balance with each person, across every group" />
  if (!friends || !data)
    return (
      <div>
        {header}
        <ListSkeleton rows={3} />
      </div>
    )
  const shown = filterFriends(friends, filter)
  const hasGroups = data.some((d) => d.group.type !== 'personal')
  const setFilter = (f: FriendFilter | 'all') => setParams(f === 'all' || f === null ? {} : { filter: f }, { replace: true })

  const settleAll = async (f: Friend) => {
    // Record one settlement per group so every group's balance clears; the real-world
    // payment is a single transfer of the net amount.
    setBusy(true)
    try {
      for (const p of f.parts) {
        const me = p.d.me!
        await repo.saveSettlement({
          id: uid('s_'),
          groupId: p.d.group.id,
          from: p.amount > 0 ? p.memberId : me,
          to: p.amount > 0 ? me : p.memberId,
          amount: Math.abs(p.amount),
          method: 'Cross-group netting',
          note: `Net ${formatMoney(Math.abs(f.net), f.currency)} ${f.net > 0 ? `from ${f.name}` : `to ${f.name}`} across ${f.parts.length} groups`,
          date: todayISO(),
          createdBy: user.uid,
          createdAt: Date.now(),
        })
      }
      setNetting(null)
      toast(`Settled with ${f.name} across ${f.parts.length} groups`)
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {header}
      {friends.length > 0 && (
        <div className="mb-4">
          <Segmented
            value={filter ?? 'all'}
            onChange={setFilter}
            label="Show"
            testId="friends-filter"
            options={[
              { value: 'all', label: 'Everyone' },
              { value: 'owed', label: 'Owe you' },
              { value: 'owe', label: 'You owe' },
            ]}
          />
        </div>
      )}
      {friends.length === 0 ? (
        hasGroups ? (
          <Empty emoji="🤝" title="You’re all square">
            No one owes anyone right now.
            <div className="mt-4 flex justify-center gap-2">
              <Link to="/add" className="btn-primary btn-sm" data-testid="friends-add">
                Add an expense
              </Link>
              <Link to="/groups" className="btn-secondary btn-sm">
                Your groups
              </Link>
            </div>
          </Empty>
        ) : (
          <Empty emoji="👥" title="No one here yet">
            Balances with people appear once you share a group with them.
            <div className="mt-4">
              <Link to="/groups/new" className="btn-primary btn-sm">
                Create a group
              </Link>
            </div>
          </Empty>
        )
      ) : shown.length === 0 ? (
        <Empty emoji="🤝" title={filter === 'owed' ? 'No one owes you' : 'You owe no one'}>
          <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => setFilter('all')}>
            Show everyone
          </button>
        </Empty>
      ) : (
        <div className="space-y-3">
          {shown.map((f) => {
            const multi = f.parts.length > 1
            const mixed = multi && f.parts.some((p) => p.amount > 0) && f.parts.some((p) => p.amount < 0)
            return (
              <section key={f.key} className="card p-4" aria-label={f.name}>
                <div className="flex items-center gap-3">
                  <Avatar name={f.name} color={f.color} size={44} />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-semibold">{f.name}</h2>
                    <div className={`text-sm font-semibold ${f.net > 0 ? 'pos' : f.net < 0 ? 'neg' : 'text-muted'}`}>
                      {f.net === 0
                        ? 'settled overall'
                        : f.net > 0
                          ? `owes you ${formatMoney(f.net, f.currency)}`
                          : `you owe ${formatMoney(-f.net, f.currency)}`}
                    </div>
                  </div>
                  {multi && (
                    <button type="button" className="chip chip-on min-h-10" onClick={() => setNetting(f)}>
                      Net out
                    </button>
                  )}
                </div>
                <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm dark:border-white/5">
                  {f.parts.map((p) => (
                    <li key={p.d.group.id} className="flex items-center gap-1">
                      <Link
                        to={`/groups/${p.d.group.id}/settle?from=${p.amount > 0 ? p.memberId : p.d.me}&to=${p.amount > 0 ? p.d.me : p.memberId}&amount=${Math.abs(p.amount)}`}
                        className="flex min-h-10 min-w-0 flex-1 items-center justify-between rounded-xl px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-ink-800"
                      >
                        <span className="truncate">
                          <span aria-hidden>{p.d.group.emoji} </span>
                          {p.d.group.name}
                        </span>
                        <span className={p.amount > 0 ? 'pos' : 'neg'}>{formatMoney(p.amount, f.currency, { sign: true })}</span>
                      </Link>
                      {/* They owe you here: a pay link to share, or a nudge (the group's feed isn't loaded on this screen; the server still keeps it to one a day). */}
                      {p.amount > 0 && p.d.me && (
                        <RemindActions group={p.d.group as Group} debtor={p.memberId} amount={p.amount} me={p.d.me} className="-mr-2" />
                      )}
                    </li>
                  ))}
                </ul>
                {mixed && (
                  <p className="mt-2 rounded-xl bg-brand-50 p-2.5 text-xs text-brand-900 dark:bg-brand-900/30 dark:text-brand-100">
                    You owe each other in different groups. Net out to settle everything with <b>one</b> payment of {formatMoney(Math.abs(f.net), f.currency)}.
                  </p>
                )}
              </section>
            )
          })}
        </div>
      )}

      <Sheet open={!!netting} onClose={() => setNetting(null)} title={`Net out with ${netting?.name}`}>
        {netting && (
          <>
            <p className="text-muted text-sm">This records a payment in each group so they all clear. In real life, only one payment happens:</p>
            <div className="my-4 rounded-2xl bg-slate-100 p-4 text-center dark:bg-ink-800">
              <div className="text-sm">
                {netting.net > 0 ? `${netting.name} pays you` : netting.net < 0 ? `You pay ${netting.name}` : 'No money changes hands'}
              </div>
              <div className="text-3xl font-extrabold">{formatMoney(Math.abs(netting.net), netting.currency)}</div>
            </div>
            <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => settleAll(netting)}>
              Record as settled
            </button>
          </>
        )}
      </Sheet>
    </div>
  )
}
