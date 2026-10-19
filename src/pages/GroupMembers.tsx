import { useMemo, useState } from 'react'
import { addPlan, addRefusal } from '@/lib/vault-api'
import { addedPrompt } from '@/lib/vault-setup'
import { useConfirm } from '@/components/ConfirmSheet'
import { passkeyCancelled, passkeyProof } from '@/features/vault/passkey'
import { HandCoins, Link2, LogOut, UserMinus } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { computeGroupData, useExpenses, useGroup, useGroups, useMergeRequests, useSettlements } from '@/hooks/data'
import { useRemoveMember } from '@/hooks/useRemoveMember'
import { usePageTitle } from '@/lib/brand'
import { colorFor } from '@/lib/colors'
import { errText } from '@/lib/errors'
import { uid } from '@/lib/id'
import {
  activeMembers,
  currentMemberMatch,
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
import { Detail, HintText, InfoTip, type Hint } from '@/components/Hint'
import { labelOf } from '@/lib/shortNames'
import { Switch } from '@/components/Switch'
import { MergeOffers, MergeSheet } from '@/features/merge/Merge'
import { mergeCandidates } from '@/lib/merge'

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
  const confirm = useConfirm()
  const nav = useNavigate()
  const d = useMemo(
    () => (liveGroup && expenses && settlements ? computeGroupData(liveGroup, expenses, settlements, user.uid) : null),
    [liveGroup, expenses, settlements, user.uid],
  )
  const remove = useRemoveMember(d)
  const mergeRequests = useMergeRequests(groupId)
  const [mergeFrom, setMergeFrom] = useState<string | null>(null)
  usePageTitle(liveGroup ? `Members · ${liveGroup.name}` : liveGroup === null ? 'Group not found' : undefined)

  if (liveGroup === null)
    return (
      <>
        {/* Fixed: this group is gone for you, and every screen of it behind this one would say the same, so back leaves the group. */}
        <PageHeader title="Members" back={{ to: '/groups', mode: 'fixed' }} />
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

  const isCreator = group.createdBy === user.uid
  const add = (name: string, email?: string, accountUid?: string) => {
    if (others >= maxOthers) return
    // A private group: its creator alone adds people; someone they know joins at once (src/lib/vault-api.ts addPlan).
    const plan = addPlan(group, isCreator, accountUid)
    if (plan === 'forbidden') return toast(addRefusal(group, isCreator) ?? 'Only the person who made this group adds people', 'err')
    if (plan === 'contact' && accountUid) {
      void (async () => {
        try {
          const auth = await passkeyProof(repo)
          const r = await repo.vault<{ opens?: boolean }>({ op: 'addContact', groupId: group.id, uid: accountUid, auth })
          // In, with nothing to open it with yet: offer to give it its own pattern to tell them.
          if (r.opens === false) {
            if (await confirm(addedPrompt(name))) nav(`/groups/${group.id}?private=pattern`)
          } else toast(`${name} added`)
        } catch (e) {
          if (!passkeyCancelled(e)) toast(errText(e), 'err')
        }
      })()
      return
    }
    // The same person twice (same account or email) would split their money across two entries.
    const already = currentMemberMatch(group.members, { email, uid: accountUid })
    if (already) return toast(`${labelOf(group.members, already, group.members[already]!.name, me)} is already in this group`, 'err')
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

  const mergeAction = (id: string): SwipeAction[] =>
    group.members[id]?.removedAt === undefined && mergeCandidates(group.members, id).length
      ? [
          {
            label: 'Merge',
            ariaLabel: `Merge ${id === me ? 'yourself' : group.members[id].name} with someone else in the group`,
            icon: <Link2 size={20} strokeWidth={2.25} />,
            tone: 'neutral',
            onClick: () => setMergeFrom(id),
            testId: 'member-merge',
          },
        ]
      : []
  const actionsFor = (id: string, r: MemberRemoval, v: number, self: boolean): SwipeAction[] => [...mergeAction(id), ...removalActions(id, r, v, self)]
  const removalActions = (id: string, r: MemberRemoval, v: number, self: boolean): SwipeAction[] =>
    memberActions(r, v).map((a): SwipeAction => {
      const who = group.members[id].name
      if (a === 'settle')
        return {
          label: 'Settle up',
          ariaLabel: `Settle up with ${who}`,
          icon: <HandCoins size={20} strokeWidth={2.25} />,
          tone: 'accent',
          onClick: () => nav(settleLink(id)),
          testId: 'member-settle',
        }
      if (a === 'remove')
        return {
          label: 'Remove',
          ariaLabel: `Remove ${who} from the group`,
          icon: <UserMinus size={20} strokeWidth={2.25} />,
          onClick: () => void remove(id),
          testId: 'member-remove',
        }
      if (a === 'leave')
        return {
          label: 'Leave',
          ariaLabel: `Leave ${group.name}`,
          icon: <LogOut size={20} strokeWidth={2.25} />,
          onClick: () => void remove(id),
          testId: 'member-leave',
        }
      // Explains why not (settle up first, waiting for an OK, only the creator…) in a toast.
      return {
        label: self ? 'Leave' : 'Remove',
        ariaLabel: self ? `Leave ${group.name} (not possible yet)` : `Remove ${who} (not possible yet)`,
        icon: self ? <LogOut size={20} strokeWidth={2.25} /> : <UserMinus size={20} strokeWidth={2.25} />,
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
          <MergeOffers group={group} requests={mergeRequests} me={me} myUid={user.uid} />
          <ul className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5" aria-label="People in this group" data-testid="members-list">
            {ids.map((id) => {
              const m = group.members[id]
              const self = id === me
              const v = net[id] ?? 0
              const r = memberRemoval({ memberId: id, member: m, me, myUid: user.uid, createdBy: group.createdBy, balance: v, inPending: pending, repeating })
              return (
                <SwipeRow
                  key={id}
                  actions={actionsFor(id, r, v, self)}
                  menuTitle={self ? 'You' : labelOf(group.members, id, m.name, me)}
                  contentClassName="flex items-center gap-3 px-4 py-3"
                  testId="member-row"
                >
                  <Avatar name={m.name} color={m.color} photoURL={m.photoURL} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {self ? m.name : labelOf(group.members, id, m.name, me)} {self && <span className="text-muted text-xs">(you)</span>}
                    </div>
                    {/* The full name under the short one: this is where you check who someone is. */}
                    <div className="text-muted truncate text-xs">
                      {!self && labelOf(group.members, id, m.name, me) !== m.name.trim() ? `${m.name.trim()} · ` : ''}
                      {memberState(m).replace(/\. Share the invite link$/, '')}
                    </div>
                  </div>
                  <div className={`shrink-0 text-right text-sm font-semibold ${v > 0 ? 'pos' : v < 0 ? 'neg' : 'text-muted'}`}>
                    {v === 0 ? 'settled' : `${v > 0 ? 'gets back' : 'owes'} ${formatMoney(Math.abs(v), cur)}`}
                  </div>
                </SwipeRow>
              )
            })}
          </ul>
          <HintText hint={SWIPE_HINT} className="text-muted px-1 text-xs" />
          {group.createdBy === user.uid && (
            // Room at the end so it clears the raised + button. Optional in the Minimal look.
            <Detail min={2}>
              <div className="card mb-[calc(var(--lane)-var(--nav-h))] flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center font-medium">
                    Merging people needs my OK
                    <InfoTip hint={MERGE_OK_HINT} label="About merge approval" />
                  </div>
                  <HintText hint={MERGE_OK_HINT} className="text-muted text-xs" as="div" />
                </div>
                <Switch
                  checked={!!group.mergeNeedsOk}
                  onChange={(on) => repo.updateGroupSettings(group, { mergeNeedsOk: on }).catch((e) => toast(errText(e), 'err'))}
                  label="Merging people needs my OK"
                  testId="merge-needs-ok"
                />
              </div>
            </Detail>
          )}
          {others < maxOthers && addRefusal(group, isCreator) && (
            <p className="card text-muted p-4 text-sm" data-testid="members-private-note">
              {addRefusal(group, isCreator)}
            </p>
          )}
          {others < maxOthers && !addRefusal(group, isCreator) && (
            <section className="card p-4" aria-labelledby="members-add">
              <h2 id="members-add" className="label">
                Add people
                <InfoTip hint={ADD_HINT} label="About adding people" />
              </h2>
              <MemberPicker groups={groups} myUid={user.uid} groupId={group.id} members={current} onAdd={add} hint={ADD_HINT} />
            </section>
          )}
        </div>
      )}
      <MergeSheet group={group} from={mergeFrom} me={me} myUid={user.uid} net={net} open={!!mergeFrom} onClose={() => setMergeFrom(null)} />
    </div>
  )
}

const SWIPE_HINT: Hint = {
  full: 'Swipe a person left, or press and hold (right-click on a computer), to settle up, merge or remove them. Merge someone added twice (by name and by email) into one person. Only people who are settled up can be removed.',
  short: 'Swipe a person left, or press and hold, for more.',
}
const MERGE_OK_HINT: Hint = {
  full: 'When someone else merges two people here, you get a request in the chat to approve.',
  short: 'Approve merges others make here.',
}
/** Must stay in every look: without it people wait for friends to join before logging anything. */
const ADD_HINT: Hint = {
  full: 'They can claim their spot with the invite link. You can log expenses with them straight away.',
  short: 'They can claim their spot with the invite link.',
  tier: 'key',
}
