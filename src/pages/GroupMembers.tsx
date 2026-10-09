import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { computeGroupData, useExpenses, useGroup, useGroups, useSettlements } from '@/hooks/data'
import { useRemoveMember } from '@/hooks/useRemoveMember'
import { usePageTitle } from '@/lib/brand'
import { colorFor } from '@/lib/colors'
import { errText } from '@/lib/errors'
import { uid } from '@/lib/id'
import {
  activeMembers,
  formerMemberMatch,
  listedMemberIds,
  memberActions,
  memberRemoval,
  memberState,
  membersIn,
  repeatingByMember,
  type MemberRemoval,
} from '@/lib/members'
import { formatMoney } from '@/lib/money'
import { Avatar } from '@/components/Avatar'
import { MemberPicker } from '@/components/MemberPicker'
import { Empty, PageHeader } from '@/components/Misc'
import { CardSkeleton, ListSkeleton } from '@/components/Skeleton'
import { SwipeRow, type SwipeAction } from '@/components/SwipeRow'
import { useToast } from '@/components/Toast'

/**
 * A group's people: who is in it, whether they have joined, where each stands, and adding or
 * removing them. Someone can be removed only once their balance is settled; their past expenses
 * stay and read as a former member. Removing yourself is Leave group.
 */
export default function GroupMembers() {
  const { groupId } = useParams()
  const { user } = useMe()
  const liveGroup = useGroup(groupId)
  const expenses = useExpenses(groupId)
  const settlements = useSettlements(groupId)
  const groups = useGroups()
  const toast = useToast()
  const nav = useNavigate()
  const d = useMemo(
    () => (liveGroup && expenses && settlements ? computeGroupData(liveGroup, expenses, settlements, user.uid) : null),
    [liveGroup, expenses, settlements, user.uid],
  )
  const remove = useRemoveMember(d)
  usePageTitle(liveGroup ? `Members · ${liveGroup.name}` : liveGroup === null ? 'Group not found' : undefined)

  if (liveGroup === null)
    return (
      <>
        <PageHeader title="Members" back="/groups" />
        <Empty emoji="🔍" title="This group doesn’t exist or you’re not a member" />
      </>
    )
  if (!d)
    return (
      <>
        <PageHeader title="Members" subtitle={liveGroup?.name} back={groupId ? `/groups/${groupId}` : '/groups'} />
        <div className="space-y-4" role="status" aria-label="Loading">
          <ListSkeleton rows={4} />
          <CardSkeleton className="h-40" />
        </div>
      </>
    )

  const { me, net, debts, group } = d
  const cur = group.currency
  const pending = membersIn(d.pending)
  const repeating = repeatingByMember(d.expenses)
  // Everyone in the group now (you first), plus anyone who left with money still against them.
  const ids = listedMemberIds(group.members, net).sort((x, y) => (x === me ? -1 : y === me ? 1 : 0))
  const current = activeMembers(group.members)
  const others = Object.keys(current).length - (me ? 1 : 0)
  const maxOthers = group.type === 'personal' ? 0 : group.type === 'direct' ? 1 : Number.POSITIVE_INFINITY

  const add = (name: string, email?: string, accountUid?: string) => {
    if (others >= maxOthers) return
    // Someone who left comes back into their old entry, so their history joins up.
    const back = formerMemberMatch(group.members, { name, email, uid: accountUid })
    const before = back ? group.members[back] : undefined
    repo
      .addMember(group, back ?? uid('p_'), { name, ...(email ? { email } : {}), color: colorFor(Object.keys(group.members).length) })
      .then(() => toast(before ? `${before.name} is back${before.uid ? '. They rejoin with the invite link' : ''}` : `${name} added`))
      .catch((e) => toast(errText(e), 'err'))
  }

  /** Where to settle this person's balance: the suggested payment they are in, prefilled. */
  const settleLink = (id: string) => {
    const x = debts.find((p) => p.from === id || p.to === id)
    return x ? `/groups/${group.id}/settle?from=${x.from}&to=${x.to}&amount=${x.amount}` : `/groups/${group.id}/settle`
  }

  const actionsFor = (id: string, r: MemberRemoval, v: number, self: boolean): SwipeAction[] =>
    memberActions(r, v).map((a): SwipeAction => {
      const who = group.members[id].name
      if (a === 'settle')
        return { label: 'Settle up', ariaLabel: `Settle up with ${who}`, tone: 'neutral', onClick: () => nav(settleLink(id)), testId: 'member-settle' }
      if (a === 'remove') return { label: 'Remove', ariaLabel: `Remove ${who} from the group`, onClick: () => void remove(id), testId: 'member-remove' }
      if (a === 'leave') return { label: 'Leave', ariaLabel: `Leave ${group.name}`, onClick: () => void remove(id), testId: 'member-leave' }
      // Explains why not (settle up first, waiting for an OK, only the creator…) in a toast.
      return {
        label: self ? 'Leave' : 'Remove',
        ariaLabel: self ? `Leave ${group.name} (not possible yet)` : `Remove ${who} (not possible yet)`,
        tone: 'muted',
        onClick: () => void remove(id),
        testId: 'member-remove-blocked',
      }
    })

  return (
    <div>
      <PageHeader title="Members" subtitle={group.name} back={`/groups/${group.id}`} />
      {group.type === 'personal' ? (
        <Empty emoji="👛" title="A personal wallet is just you" />
      ) : (
        <div className="space-y-4">
          <ul className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5" aria-label="People in this group" data-testid="members-list">
            {ids.map((id) => {
              const m = group.members[id]
              const self = id === me
              const v = net[id] ?? 0
              const r = memberRemoval({ memberId: id, member: m, me, myUid: user.uid, createdBy: group.createdBy, balance: v, inPending: pending, repeating })
              return (
                <SwipeRow key={id} actions={actionsFor(id, r, v, self)} contentClassName="flex items-center gap-3 px-4 py-3" testId="member-row">
                  <Avatar name={m.name} color={m.color} photoURL={m.photoURL} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {m.name} {self && <span className="text-muted text-xs">(you)</span>}
                    </div>
                    <div className="text-muted truncate text-xs">{memberState(m).replace(/\. Share the invite link$/, '')}</div>
                  </div>
                  <div className={`shrink-0 text-right text-sm font-semibold ${v > 0 ? 'pos' : v < 0 ? 'neg' : 'text-muted'}`}>
                    {v === 0 ? 'settled' : `${v > 0 ? 'gets back' : 'owes'} ${formatMoney(Math.abs(v), cur)}`}
                  </div>
                </SwipeRow>
              )
            })}
          </ul>
          <p className="text-muted px-1 text-xs">Swipe a person left to settle up or remove them; only people who are settled up can be removed.</p>
          {others < maxOthers && (
            <section className="card p-4" aria-labelledby="members-add">
              <h2 id="members-add" className="label">
                Add people
              </h2>
              <MemberPicker
                groups={groups}
                myUid={user.uid}
                groupId={group.id}
                members={current}
                onAdd={add}
                hint="They can claim their spot with the invite link. You can log expenses with them straight away."
              />
            </section>
          )}
        </div>
      )}
    </div>
  )
}
