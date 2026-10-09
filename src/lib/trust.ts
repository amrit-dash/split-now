import type { Expense, ExpenseFlag, Group, MemberId, Settlement } from '@/types'
import { type ApprovalGroup, approvalNeeded, editApprovalOutcome, groupThreshold } from './approval'
import { activeMembers, isRemoved } from '../../shared/members'

/**
 * Trust features that aren't the activity log: soft delete (trash), disputes (flags) and
 * approvals. Pure, so both repos, the hooks and the rules tests agree on the semantics.
 */

export const TRASH_DAYS = 30
const DAY = 86_400_000

type Trashable = Pick<Expense, 'deletedAt' | 'deletedBy'>

export const isTrashed = (x: Trashable) => typeof x.deletedAt === 'number'
/** Items that count: everything not in the trash. */
export const liveItems = <T extends Trashable>(xs: T[]): T[] => xs.filter((x) => !isTrashed(x))
/** Trashed items still restorable (newest deletion first). */
export const trashedItems = <T extends Trashable>(xs: T[], now = Date.now()): T[] =>
  xs.filter((x) => isTrashed(x) && now - x.deletedAt! < TRASH_DAYS * DAY).sort((a, b) => b.deletedAt! - a.deletedAt!)
/** Trashed longer than TRASH_DAYS: due for purging. */
export const expiredTrash = <T extends Trashable>(xs: T[], now = Date.now()): T[] => xs.filter((x) => isTrashed(x) && now - x.deletedAt! >= TRASH_DAYS * DAY)
export const daysLeftInTrash = (x: Trashable, now = Date.now()) => Math.max(0, Math.ceil((x.deletedAt! + TRASH_DAYS * DAY - now) / DAY))

/** Hard delete is for whoever trashed it, or the group creator (matches firestore.rules). */
export function canPurge(x: Trashable, group: Pick<Group, 'createdBy'>, uid: string): boolean {
  return x.deletedBy === uid || group.createdBy === uid
}

/**
 * The group's own threshold, else its currency's default (src/lib/approval.ts; firestore.rules
 * approvalThresholdOf carries the same table). No rate here: an off-table currency gets the flat
 * fallback, as in the rules.
 */
export const thresholdOf = groupThreshold

type ApprovalPolicy = ApprovalGroup

/** Whether an expense of this amount must be approved in this group (amount strictly above the threshold). */
export const needsApproval = approvalNeeded

/** Charged members (with an account, other than the author) who still have to approve. */
export function pendingApprovers(e: Pick<Expense, 'requiresApproval' | 'approvals' | 'splits' | 'createdBy'>, g: Pick<Group, 'members'>): MemberId[] {
  if (!e.requiresApproval) return []
  return Object.entries(e.splits)
    .filter(([id, v]) => {
      const u = g.members[id]?.uid
      // Someone who left can't approve any more (the same rule as shared/balances-core.ts).
      return v > 0 && !!u && u !== e.createdBy && !e.approvals?.[u] && !isRemoved(g.members[id])
    })
    .map(([id]) => id)
}

/** Pending expenses are listed but left out of balances until everyone charged approves. */
export const isPending = (e: Expense, g: Pick<Group, 'members'>) => !isTrashed(e) && pendingApprovers(e, g).length > 0

export function awaitingMyApproval(e: Expense, g: Pick<Group, 'members'>, uid: string): boolean {
  return !isTrashed(e) && pendingApprovers(e, g).some((id) => g.members[id]?.uid === uid)
}

/** Expenses that count towards balances: not trashed and not pending approval. */
export function countedExpenses(expenses: Expense[], g: Pick<Group, 'members'>): Expense[] {
  return expenses.filter((e) => !isTrashed(e) && !isPending(e, g))
}
export const countedSettlements = (s: Settlement[]) => liveItems(s)

export const flagsOf = (e: Pick<Expense, 'dispute'>): ExpenseFlag[] => Object.values(e.dispute ?? {}).sort((a, b) => a.at - b.at)
export const isDisputed = (e: Pick<Expense, 'dispute'>) => flagsOf(e).length > 0

/** The member id the user would flag as, if they are part of the expense (paid or owe). */
export function flaggableAs(e: Pick<Expense, 'paidBy' | 'splits'>, g: Pick<Group, 'members'>, uid: string): MemberId | undefined {
  const id = Object.entries(activeMembers(g.members)).find(([, m]) => m.uid === uid)?.[0]
  return id && (id in e.splits || id in e.paidBy) ? id : undefined
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
/** Who pays/owes what changed (approvals given for the old numbers no longer apply). */
export function moneyChanged(prev: Pick<Expense, 'amount' | 'paidBy' | 'splits'>, next: Pick<Expense, 'amount' | 'paidBy' | 'splits'>) {
  return prev.amount !== next.amount || !same(sortKeys(prev.paidBy), sortKeys(next.paidBy)) || !same(sortKeys(prev.splits), sortKeys(next.splits))
}
const sortKeys = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b)))

/**
 * The document to write when saving an expense from the form. Trust fields come from the
 * stored copy (`prev`), never from the form, so an edit can't wipe someone's flag:
 *  - dispute and trash fields are kept as they are,
 *  - requiresApproval is set on create above the threshold; on an edit it follows
 *    editApprovalOutcome (src/lib/approval.ts): 'clear' drops it (at or below the threshold, or
 *    approval off: the expense counts at once), 'keep' leaves it as it was, 'rerequest' sets it,
 *  - approvals survive unless the money changed (then only the editor's own stays), except
 *    after an amount change the group's edit auto-approve let through ('keep'): all stay,
 *  - `g` undefined means the group isn't known on this device yet: nothing is cleared then,
 *    since the rules would refuse dropping the mark if the group still asks for it.
 */
export function prepareExpenseSave(prev: Expense | undefined, next: Expense, g: ApprovalPolicy | undefined, editorUid: string): Expense {
  const { dispute: _d, approvals: _a, requiresApproval: _r, deletedAt: _t, deletedBy: _b, ...rest } = next
  const out: Expense = { ...rest }
  if (prev?.dispute && Object.keys(prev.dispute).length) out.dispute = prev.dispute
  if (prev && isTrashed(prev)) {
    out.deletedAt = prev.deletedAt
    out.deletedBy = prev.deletedBy
  }
  const outcome = g && prev ? editApprovalOutcome({ group: g, before: prev, after: next }) : undefined
  if (!g) {
    if (prev?.requiresApproval) out.requiresApproval = true
  } else if (!prev) {
    if (needsApproval(g, next.amount)) out.requiresApproval = true
  } else if (outcome === 'rerequest' || (outcome === 'keep' && prev.requiresApproval)) out.requiresApproval = true
  if (prev?.approvals) {
    const autoApproved = outcome === 'keep' && prev.amount !== next.amount
    const kept = moneyChanged(prev, next) && !autoApproved ? (prev.approvals[editorUid] ? { [editorUid]: true as const } : undefined) : prev.approvals
    if (kept && Object.keys(kept).length) out.approvals = kept
  }
  return out
}

/** Fields with their own writes (flag, approve, trash): an edit never carries them. */
export const TRUST_FIELDS = ['dispute', 'approvals', 'deletedAt', 'deletedBy'] as const

export interface ExpenseEditPatch {
  /** fields whose value changed, with the new value */
  set: Record<string, unknown>
  /** fields present before that the edit removes */
  unset: string[]
  /**
   * What to write to `approvals`: untouched (undefined) when the money is the same, so an
   * approval that landed on the server after `prev` was cached survives; the editor's own
   * approval (or nothing) when the money changed, which also clears approvals this device
   * hasn't seen yet, as they were given for the old numbers. Untouched too after an amount
   * change edit auto-approve let through (`keepApprovals`).
   */
  approvals?: Record<string, true> | null
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * The minimal update that turns the stored `prev` into `next` (the output of prepareExpenseSave),
 * so a save only touches what the form changed and never overwrites concurrent trust writes
 * with stale copies. `requiresApproval` is added or removed like any other field: prepareExpenseSave
 * only drops it when the amount is no longer above the group's threshold, which the rules check.
 */
export function expenseEditPatch(prev: Expense, next: Expense, opts: { keepApprovals?: boolean } = {}): ExpenseEditPatch {
  const skip = new Set<string>([...TRUST_FIELDS, 'id'])
  const set: Record<string, unknown> = {}
  const unset: string[] = []
  const a = prev as unknown as Record<string, unknown>
  const b = next as unknown as Record<string, unknown>
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (skip.has(k) || sameValue(a[k], b[k])) continue
    if (b[k] === undefined) unset.push(k)
    else set[k] = b[k]
  }
  const out: ExpenseEditPatch = { set, unset }
  if (moneyChanged(prev, next) && !opts.keepApprovals) out.approvals = next.approvals && Object.keys(next.approvals).length ? next.approvals : null
  return out
}

/** An imported settlement starts live (never in the trash). */
export function prepareImportedSettlement(s: Settlement): Settlement {
  const { deletedAt: _t, deletedBy: _b, ...rest } = s
  return rest
}

/**
 * A generated recurring copy never inherits flags, approvals, trash or the receipt from its
 * template. Also used for imported rows: like any new expense, one above the group's approval
 * threshold is marked requiresApproval (the rules require it on every create).
 */
export function prepareOccurrence(o: Expense, g: ApprovalPolicy): Expense {
  // Nor the template's receipt: the copy has no image of its own (purging it must not delete the template's).
  const { dispute: _d, approvals: _a, requiresApproval: _r, deletedAt: _t, deletedBy: _b, receiptUrl: _u, receiptPath: _p, ...rest } = o
  return needsApproval(g, o.amount) ? { ...rest, requiresApproval: true } : rest
}
