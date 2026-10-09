import { useNavigate } from 'react-router-dom'
import { repo } from '@/data'
import type { GroupData } from '@/hooks/data'
import { useMe } from '@/hooks/auth'
import { useConfirm } from '@/components/ConfirmSheet'
import { useToast } from '@/components/Toast'
import { errText } from '@/lib/errors'
import { formatMoney } from '@/lib/money'
import { memberRemoval, membersIn, repeatingByMember } from '@/lib/members'

/**
 * Removing someone from a group, or leaving it yourself, from the Members screen or a Balances
 * row. Only with a settled balance (and nothing waiting for an OK), so no money goes missing.
 * Their past expenses stay and show them as a former member; they can rejoin with the invite link.
 */
export function useRemoveMember(d: GroupData | null) {
  const { user } = useMe()
  const confirm = useConfirm()
  const toast = useToast()
  const nav = useNavigate()

  return async (memberId: string) => {
    if (!d) return
    const { group, me, net } = d
    const m = group.members[memberId]
    if (!m) return
    const self = memberId === me
    const who = self ? 'you' : m.name
    const r = memberRemoval({
      memberId,
      member: m,
      me,
      myUid: user.uid,
      createdBy: group.createdBy,
      balance: net[memberId] ?? 0,
      inPending: membersIn(d.pending),
      repeating: repeatingByMember(d.expenses),
    })
    if (r.kind === 'unsettled') {
      const amount = formatMoney(r.amount, group.currency)
      toast(self ? `Settle up first: you ${r.owes ? 'owe' : 'are owed'} ${amount}` : `Settle up first: ${who} ${r.owes ? 'owes' : 'is owed'} ${amount}`, 'err')
      return
    }
    if (r.kind === 'repeating')
      return void toast(
        `${self ? 'You are' : `${who} is`} in a repeating expense (${r.description}). Stop it or take ${self ? 'yourself' : 'them'} out of it first.`,
        'err',
        { action: { label: 'Open', run: () => nav(`/groups/${group.id}/expenses/${r.expenseId}`) } },
      )
    if (r.kind === 'pending') return void toast(`${self ? 'You are' : `${who} is`} in an expense waiting for an OK. Sort that out first.`, 'err')
    if (r.kind === 'creator') return void toast('You created this group. Delete it from Edit group, or ask someone else to re-create it.', 'err')
    if (r.kind === 'removed') return
    if (r.kind === 'not-allowed') return void toast(`Only the person who created the group can remove ${who}.`, 'err')
    const ok = await confirm(
      self
        ? {
            title: `Leave ${group.name}?`,
            message: 'You lose access to its expenses. Expenses you were part of stay in the group.',
            confirmLabel: 'Leave group',
            tone: 'danger',
          }
        : { title: `Remove ${who}?`, message: 'Their expenses stay. They can rejoin with the invite link.', confirmLabel: 'Remove', tone: 'danger' },
    )
    if (!ok) return
    try {
      await repo.removeMember(group, memberId)
      if (self) {
        toast(`You left ${group.name}`)
        nav('/groups', { replace: true })
      } else toast(`${who} removed`)
    } catch (e) {
      toast(errText(e), 'err')
    }
  }
}
