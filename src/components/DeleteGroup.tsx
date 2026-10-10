import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RotateCcw, Trash2 } from 'lucide-react'
import { repo } from '@/data'
import { groupPurgeBlocker } from '@/data/repo'
import { useMe } from '@/hooks/auth'
import { computeGroupData, useExpenses, useSettlements } from '@/hooks/data'
import { errText } from '@/lib/errors'
import { formatDate } from '@/lib/locale'
import { formatMoney } from '@/lib/money'
import { deleteMessage, groupDeleteState } from '@/lib/group-delete'
import type { Debt, Group } from '@/types'
import { daysLeft } from '../../shared/group-trash'
import { useConfirm } from './ConfirmSheet'
import { useToast } from './Toast'

/**
 * Deleting a group moves it to Recently deleted for everyone (30 days to restore, then gone for
 * good). Who may: groupDeleteState (src/lib/group-delete.ts). The confirmation lists the payments
 * still open, and the toast offers Undo. Shared by the group's ⋯ menu and Edit group.
 */
export function useDeleteGroup(group: Group, debts: readonly Debt[]) {
  const { user } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const state = groupDeleteState(group, user.uid, debts.length === 0)
  const name = (id: string) => (group.members[id]?.uid === user.uid ? 'you' : (group.members[id]?.name ?? 'Someone'))

  const run = async () => {
    if (!state.allowed) return toast(state.reason, 'err')
    const ok = await confirm({
      title: `Delete “${group.name}”?`,
      message: deleteMessage(debts, name, (n) => formatMoney(n, group.currency)),
      confirmLabel: 'Delete group',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await repo.deleteGroup(group)
      toast(`“${group.name}” moved to Recently deleted`, 'ok', {
        action: { label: 'Undo', run: () => void repo.restoreGroup(group).catch((e) => toast(errText(e), 'err')) },
      })
      nav('/groups', { replace: true })
    } catch (e) {
      toast(errText(e), 'err')
    }
  }
  return { state, run }
}

/** "Delete group" on Edit group: loads the group's balances itself, so the confirmation can list what's still open. */
export function DeleteGroupButton({ group }: { group: Group }) {
  const { user } = useMe()
  const expenses = useExpenses(group.id)
  const settlements = useSettlements(group.id)
  const debts = useMemo(
    () => (expenses && settlements ? computeGroupData(group, expenses, settlements, user.uid).debts : null),
    [group, expenses, settlements, user.uid],
  )
  const { state, run } = useDeleteGroup(group, debts ?? [])
  return (
    <>
      <button type="button" className="btn w-full text-rose-700 dark:text-rose-400" disabled={!debts} onClick={() => void run()} data-testid="delete-group">
        <Trash2 size={18} aria-hidden /> Delete group
      </button>
      {!state.allowed && <p className="text-muted -mt-3 text-center text-xs">{state.reason}</p>}
    </>
  )
}

/**
 * A deleted group, opened from Recently deleted (or an old link): who deleted it, how long is
 * left, Restore for any member, and Delete forever for the person who created it.
 */
export function DeletedGroupCard({ group }: { group: Group }) {
  const { user } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const by = group.deletedBy === user.uid ? 'you' : (Object.values(group.members).find((m) => m.uid === group.deletedBy)?.name ?? 'someone')
  const left = daysLeft(group.deletedAt ?? Date.now(), Date.now())
  const canPurge = !groupPurgeBlocker(group, user.uid)

  const restore = async () => {
    try {
      await repo.restoreGroup(group)
      toast(`“${group.name}” is back`)
    } catch (e) {
      toast(errText(e), 'err')
    }
  }
  const purge = async () => {
    const ok = await confirm({
      title: `Delete “${group.name}” forever?`,
      message: 'All its expenses, payments, comments and history go for everyone in the group. This can’t be undone.',
      confirmLabel: 'Delete forever',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    try {
      await repo.purgeGroup(group.id)
      toast(`Deleted “${group.name}” for good`)
      nav('/groups', { replace: true })
    } catch (e) {
      toast(errText(e), 'err')
      setBusy(false)
    }
  }

  return (
    <div className="card p-5 text-center" data-testid="group-deleted">
      <div
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400"
        aria-hidden
      >
        <Trash2 size={22} />
      </div>
      <h2 className="mt-3 text-lg font-bold">In Recently deleted</h2>
      <p className="text-muted mt-1 text-sm">
        Deleted by {by}
        {group.deletedAt ? ` on ${formatDate(group.deletedAt, { day: 'numeric', month: 'short' })}` : ''}. Anyone in the group can restore it for{' '}
        {left === 1 ? '1 more day' : `${left} more days`}, then it’s gone for good.
      </p>
      <button type="button" className="btn-primary mt-4 w-full" onClick={() => void restore()} disabled={busy} data-testid="group-restore">
        <RotateCcw size={18} aria-hidden /> Restore group
      </button>
      {canPurge && (
        <button
          type="button"
          className="btn mt-2 w-full text-rose-700 dark:text-rose-400"
          onClick={() => void purge()}
          disabled={busy}
          data-testid="group-purge"
        >
          <Trash2 size={18} aria-hidden /> {busy ? 'Deleting…' : 'Delete forever'}
        </button>
      )}
    </div>
  )
}
