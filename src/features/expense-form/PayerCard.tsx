import { Users } from 'lucide-react'
import type { Group, MemberId } from '@/types'
import { centsToInput } from '@/lib/money'
import { describePayer, sumOf, validAmount, type Action, type Draft } from '@/lib/expense-draft'
import { Avatar } from '@/components/Avatar'
import { MoneyInput } from '@/components/MoneyInput'
import { Left, MemberRow, SameHint, youFirst } from './bits'
import { SummaryCard } from './sheets'

/** "You paid" as one row; several payers open the amount rows right here with the "left to assign" strip. */
export function PayerCard({
  draft,
  dispatch,
  group,
  order,
  me,
  hint,
  onOpen,
}: {
  draft: Draft
  dispatch: (a: Action) => void
  group: Group
  order: MemberId[]
  me: MemberId
  hint: boolean
  onOpen: () => void
}) {
  const payer = group.members[draft.payer]
  const paidSum = sumOf(draft.payers)
  return (
    <SummaryCard
      id="payer-card"
      label={<>Paid by{hint && <SameHint />}</>}
      title={describePayer(draft, group, me, false)}
      icon={draft.multiPay ? <Users size={20} /> : <Avatar name={payer?.name ?? '?'} color={payer?.color ?? '#999'} size={40} />}
      plainIcon={!draft.multiPay}
      onClick={onOpen}
      testId="payer-summary"
    >
      {draft.multiPay && (
        <div className="mt-4 space-y-2">
          {youFirst(order, me).map((id) => (
            <MemberRow key={id} group={group} id={id} me={me}>
              <MoneyInput
                className="!w-28 !py-2"
                value={draft.payers[id]}
                currency={draft.cur}
                placeholder={centsToInput(0, draft.cur)}
                aria-label={`${id === me ? 'You' : group.members[id]?.name} paid`}
                onChange={(v) => dispatch({ type: 'payerAmount', id, amount: v })}
              />
            </MemberRow>
          ))}
          <button
            type="button"
            className="min-h-9 text-sm font-semibold text-brand-600 dark:text-brand-300"
            onClick={() => dispatch({ type: 'multiPay', on: false })}
          >
            One person paid
          </button>
        </div>
      )}
      {draft.multiPay && validAmount(draft) && <Left value={draft.amount - paidSum} currency={draft.cur} />}
    </SummaryCard>
  )
}
