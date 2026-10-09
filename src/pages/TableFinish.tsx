import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Users } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { createGroup as createNewGroup, memberOrder, myMemberId, useGroups } from '@/hooks/data'
import type { Expense, Group, Member, MemberId } from '@/types'
import { guessCategory } from '@/lib/categories'
import { colorFor } from '@/lib/colors'
import { uid } from '@/lib/id'
import { formatMoney } from '@/lib/money'
import { errText } from '@/lib/errors'
import { groupTableLinks, openTableLinks } from '@/lib/paylinks'
import {
  taxSplitOf,
  claimLeftoversForAll,
  computeTableTotals,
  matchParticipants,
  participantOrder,
  tableToSplit,
  tableTotal,
  TableError,
  type LiveTable,
  type ParticipantId,
  type TableTotals,
} from '@/lib/table'
import { GroupIcon } from '@/components/GroupIcon'
import { Loading } from '@/components/Misc'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { Select } from '@/components/Select'

const NEW = '__new'
const NONE = '__none'

/** Host's "Finish": pick a group, confirm who's who, and add the itemized expense. */
export default function TableFinish({ table, totals, onClose }: { table: LiveTable; totals: TableTotals; onClose: () => void }) {
  const groups = useGroups()
  const [target, setTarget] = useState<string>(table.groupId ?? NONE)
  const usable = useMemo(() => (groups ?? []).filter((g) => g.type !== 'personal'), [groups])
  const group = usable.find((g) => g.id === target)
  const toast = useToast()

  return (
    <Sheet open onClose={onClose} title="Finish the bill">
      {!groups ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          {!totals.allClaimed && (
            <div className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              <div className="font-semibold">
                {totals.unclaimed.length} item{totals.unclaimed.length === 1 ? ' is' : 's are'} still unclaimed (
                {formatMoney(totals.unclaimedAmount, table.currency)}).
              </div>
              <button
                type="button"
                className="btn-secondary mt-2 w-full !min-h-0 !py-2 text-sm"
                onClick={() => {
                  repo.updateTable(table.code, { claims: claimLeftoversForAll(table) }).catch((e) => toast(errText(e), 'err'))
                }}
              >
                <Users size={16} aria-hidden /> Split leftovers between everyone
              </button>
            </div>
          )}
          <div>
            <div className="label">Add to</div>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              <button
                type="button"
                onClick={() => setTarget(NONE)}
                className={`flex w-full items-center gap-3 rounded-2xl p-2 text-left ${target === NONE ? 'bg-brand-50 dark:bg-brand-900/30' : ''}`}
                data-testid="finish-new-group"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-lg dark:bg-ink-800">➕</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">New group</span>
                  <span className="block text-muted text-xs">With everyone at this table</span>
                </span>
                {target === NONE && <Check size={18} className="text-brand-600" />}
              </button>
              {usable
                .filter((g) => !g.archived)
                .map((g) => {
                  const off = g.currency !== table.currency
                  return (
                    <button
                      key={g.id}
                      type="button"
                      disabled={off}
                      aria-disabled={off || undefined}
                      title={off ? `Different currency (${g.currency})` : undefined}
                      onClick={() => setTarget(g.id)}
                      className={`flex w-full items-center gap-3 rounded-2xl p-2 text-left disabled:opacity-50 ${target === g.id ? 'bg-brand-50 dark:bg-brand-900/30' : ''}`}
                    >
                      <GroupIcon emoji={g.emoji} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{g.name}</span>
                        {off && <span className="text-muted block text-xs">Different currency ({g.currency})</span>}
                      </span>
                      {target === g.id && <Check size={18} className="text-brand-600" aria-hidden />}
                    </button>
                  )
                })}
            </div>
          </div>
          {group ? (
            <ToGroup key={group.id} table={table} group={group} ready={totals.allClaimed} />
          ) : target === NONE ? (
            <NoGroup table={table} ready={totals.allClaimed} />
          ) : null}
        </div>
      )}
    </Sheet>
  )
}

function useSaveExpense(table: LiveTable) {
  const { user } = useMe()
  return async (group: Group, mapping: Record<ParticipantId, MemberId>, payer: MemberId, newMembers: Record<MemberId, Member>) => {
    // Membership changes go one per write (rules), and in order before the expense.
    for (const [id, m] of Object.entries(newMembers)) await repo.addMember(group, id, m)
    const merged: Group = { ...group, members: { ...group.members, ...newMembers } }
    const split = tableToSplit(table, mapping, memberOrder(merged))
    const now = Date.now()
    const e: Expense = {
      id: uid('e_'),
      groupId: group.id,
      description: table.merchant,
      amount: split.amount,
      category: guessCategory(table.merchant) ?? 'food',
      date: table.date,
      notes: 'Split at the table',
      paidBy: { [payer]: split.amount },
      splits: split.splits,
      splitType: split.splitType,
      splitInput: split.splitInput,
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
    }
    await repo.saveExpense(e)
    // Each guest gets their own Pay me link for exactly their share, so their "I've paid" is
    // recorded in this group. Only when the payer is the host's own member (the rules check it).
    const links =
      merged.members[payer]?.uid === user.uid ? groupTableLinks(table, merged, mapping, payer, split.splits, user.uid, now) : { links: [], byParticipant: {} }
    for (const l of links.links) await repo.createPayLink(l.code, l.link)
    await repo.updateTable(table.code, {
      status: 'closed',
      groupId: group.id,
      closedGroupId: group.id,
      expenseId: e.id,
      ...(links.links.length ? { payLinks: links.byParticipant } : {}),
    })
    return e
  }
}

function ToGroup({ table, group, ready }: { table: LiveTable; group: Group; ready: boolean }) {
  const { user } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const save = useSaveExpense(table)
  const order = participantOrder(table)
  // Only people with a claim end up in the split (plus the host, who paid).
  const people = order.filter((p) => p === table.hostUid || Object.keys(table.claims[p] ?? {}).length)
  const members = memberOrder(group)
  const [mapping, setMapping] = useState<Record<ParticipantId, string>>(() => {
    const auto = matchParticipants(table.participants, group.members, people)
    const me = myMemberId(group, user.uid)
    if (me) auto[table.hostUid] = me
    return Object.fromEntries(people.map((p) => [p, auto[p] ?? NEW]))
  })
  const [busy, setBusy] = useState(false)
  const payer = myMemberId(group, user.uid) ?? members[0]
  const dupes = new Set(Object.values(mapping).filter((m, i, a) => m !== NEW && a.indexOf(m) !== i))

  const finish = async () => {
    setBusy(true)
    try {
      const newMembers: Record<MemberId, Member> = {}
      const final: Record<ParticipantId, MemberId> = {}
      let n = Object.keys(group.members).length
      for (const p of people) {
        if (mapping[p] === NEW) {
          const id = uid('m_')
          newMembers[id] = { name: table.participants[p].name, color: colorFor(n++) }
          final[p] = id
        } else final[p] = mapping[p]
      }
      const e = await save(group, final, payer, newMembers)
      toast(`Added to ${group.name} ✅`)
      nav(`/groups/${group.id}/expenses/${e.id}`, { replace: true })
    } catch (err) {
      toast(err instanceof TableError ? err.message : errText(err), 'err')
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="label">Who’s who in {group.name}</div>
      <div className="space-y-2">
        {people.map((p) => (
          <div key={p} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-medium">
              {table.participants[p].name}
              {p === table.hostUid && ' (paid)'}
            </span>
            <div className="w-48 shrink-0">
              <Select
                size="sm"
                value={mapping[p]}
                disabled={p === table.hostUid && !!myMemberId(group, user.uid)}
                onChange={(v) => setMapping({ ...mapping, [p]: v })}
                aria-label={`Group member for ${table.participants[p].name}`}
                options={[
                  ...members.map((m) => ({ value: m, label: group.members[m].name })),
                  { value: NEW, label: 'Add as new member', icon: <span>➕</span> },
                ]}
              />
            </div>
          </div>
        ))}
      </div>
      {dupes.size > 0 && <p className="mt-2 text-xs text-amber-600">Two people point at the same member — their items will be combined.</p>}
      <p className="mt-2 text-muted text-xs">
        {group.members[payer]?.name ?? 'You'} paid {formatMoney(tableTotal(table), table.currency)}. Everyone else owes their share.
      </p>
      <button type="button" className="btn-primary mt-4 w-full" disabled={!ready || busy} onClick={finish}>
        <Check size={18} aria-hidden /> Add expense to {group.name}
      </button>
      {!ready && <p className="text-muted mt-2 text-center text-xs">Claim or split the leftover items first.</p>}
    </div>
  )
}

function NoGroup({ table, ready }: { table: LiveTable; ready: boolean }) {
  const { user, profile } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const save = useSaveExpense(table)
  const [busy, setBusy] = useState(false)

  // Everyone still gets a Pay me link for their total, so "I've paid" reaches the host.
  const closeWithoutGroup = async () => {
    const links = openTableLinks(table, computeTableTotals(table).people, user.uid, Date.now())
    for (const l of links.links) await repo.createPayLink(l.code, l.link)
    await repo.updateTable(table.code, { status: 'closed', ...(links.links.length ? { payLinks: links.byParticipant } : {}) })
  }

  const createGroup = async () => {
    setBusy(true)
    try {
      const members: Record<MemberId, Member> = { [user.uid]: { name: profile.displayName, uid: user.uid, email: user.email, color: colorFor(0) } }
      const mapping: Record<ParticipantId, MemberId> = { [table.hostUid]: user.uid }
      participantOrder(table).forEach((p, i) => {
        if (p === table.hostUid) return
        const id = uid('m_')
        members[id] = { name: table.participants[p].name, color: colorFor(i) }
        mapping[p] = id
      })
      const draft = {
        name: table.merchant,
        emoji: '🍽️',
        type: 'outing' as const,
        currency: table.currency,
        simplify: true,
        members,
        memberUids: [user.uid],
        createdBy: user.uid,
      }
      const gid = await createNewGroup(draft)
      const g: Group = { ...draft, id: gid, inviteCode: '', createdAt: Date.now(), updatedAt: Date.now() }
      const e = await save(g, mapping, user.uid, {})
      toast(`Created ${table.merchant} ✅`)
      nav(`/groups/${gid}/expenses/${e.id}`, { replace: true })
    } catch (err) {
      toast(errText(err), 'err')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-muted text-sm">
        Creates “{table.merchant}” with everyone here and{' '}
        {!table.extras.tip && taxSplitOf(table) === 'items'
          ? 'adds this bill item by item, so you can fix who had what later.'
          : 'adds each person’s share exactly as shown here (tip and tax included).'}{' '}
        Friends join it with the invite link.
      </p>
      <button type="button" className="btn-primary w-full" disabled={!ready || busy} onClick={createGroup} data-testid="create-table-group">
        <Users size={18} aria-hidden /> Create group and add the bill
      </button>
      {!ready && <p className="text-muted text-center text-xs">Claim or split the leftover items first.</p>}
      <button type="button" className="btn-ghost w-full" disabled={busy} onClick={() => closeWithoutGroup().catch((e) => toast(errText(e), 'err'))}>
        Don’t make a group, just show who owes what
      </button>
    </div>
  )
}
