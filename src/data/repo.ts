import type { Capture, Expense, ExpenseComment, Group, Member, MemberId, PaymentHandles, Settlement, UserProfile } from '@/types'
import type { CaptureDraft, InboxDoc } from '@/lib/capture'
import type { ItemId, LiveTable, NewTable, ParticipantId, TableExtras, TableItem, TableParticipant, TableStatus } from '@/lib/table'

export type Unsub = () => void

export interface AuthUser {
  uid: string
  displayName: string
  email?: string
  photoURL?: string
  /** Firebase anonymous sign-in (a guest at a live table). Such users only see /t/ pages. */
  isAnonymous?: boolean
}

export interface InviteInfo {
  groupId: string
  groupName: string
  emoji: string
  /** unclaimed placeholder members the joiner can claim */
  placeholders: Record<MemberId, string>
}

export type NewGroup = Omit<Group, 'id' | 'createdAt' | 'updatedAt' | 'inviteCode'>

/** Scalar group fields any member may edit. Membership has its own methods. */
export type GroupSettings = Partial<Omit<Group, 'id' | 'members' | 'memberUids' | 'inviteCode' | 'createdBy' | 'createdAt' | 'updatedAt'>>

/**
 * What a member shares with the other members of one group (stored per group, so it
 * is only readable by co-members and only writable by its owner).
 */
export interface MemberProfile {
  displayName: string
  payment?: PaymentHandles
}

export interface RepoError {
  /** 'write' = a save the UI already treated as done was rejected; 'read' = a live query failed */
  kind: 'write' | 'read'
  message: string
  error: unknown
}

export interface Repo {
  mode: 'firebase' | 'demo'

  /**
   * Writes resolve as soon as they are applied to the local cache (so the UI never hangs
   * offline). Server rejections arrive later through this subscription.
   */
  onError(cb: (e: RepoError) => void): Unsub

  onAuth(cb: (u: AuthUser | null) => void): Unsub
  signInWithGoogle(): Promise<void>
  signInWithEmail(email: string, password: string): Promise<void>
  signUpWithEmail(name: string, email: string, password: string): Promise<void>
  signInDemo?(name: string): Promise<void>
  signOut(): Promise<void>

  watchProfile(uid: string, cb: (p: UserProfile | null) => void): Unsub
  /** Saves the private profile and copies name + payment handles into every group the user is in. */
  saveProfile(p: UserProfile): Promise<void>
  /** Own (private) profile only. */
  getProfile(uid: string): Promise<UserProfile | null>
  /** A co-member's shared name + payment handles for one group. */
  getMemberProfile(groupId: string, uid: string): Promise<MemberProfile | null>

  watchGroups(uid: string, cb: (groups: Group[]) => void): Unsub
  watchGroup(id: string, cb: (g: Group | null) => void): Unsub
  createGroup(g: NewGroup): Promise<string>
  /** Writes only the fields that differ from `base` (the group as the form loaded it). */
  updateGroupSettings(base: Group, patch: GroupSettings): Promise<void>
  /** @deprecated use updateGroupSettings/addMember/removeMember. Membership fields in `patch` are ignored. */
  updateGroup(id: string, patch: Partial<Group>): Promise<void>
  addMember(group: Group, memberId: MemberId, member: Member): Promise<void>
  removeMember(group: Group, memberId: MemberId): Promise<void>
  deleteGroup(id: string): Promise<void>

  getInvite(code: string): Promise<InviteInfo | null>
  joinGroup(code: string, memberId: MemberId, member: Member): Promise<string>

  watchExpenses(groupId: string, cb: (e: Expense[]) => void): Unsub
  saveExpense(e: Expense): Promise<void>
  deleteExpense(groupId: string, id: string): Promise<void>
  /**
   * Downscales and uploads a receipt in the background, then patches the expense's
   * receiptUrl/receiptPath. Returns false (and does nothing) when offline.
   */
  attachReceipt(groupId: string, expenseId: string, file: Blob): boolean
  /** @deprecated blocks on the network; prefer attachReceipt after saving. */
  uploadReceipt(groupId: string, file: Blob): Promise<string>

  watchSettlements(groupId: string, cb: (s: Settlement[]) => void): Unsub
  saveSettlement(s: Settlement): Promise<void>
  deleteSettlement(groupId: string, id: string): Promise<void>

  /**
   * Recurring catch-up: write generated occurrences (deterministic ids, so concurrent
   * clients overwrite rather than duplicate) and the template's advanced `recurrence`
   * (only that field is touched) in one atomic write.
   */
  saveRecurringOccurrences(template: Expense, occurrences: Expense[]): Promise<void>

  /**
   * Bulk import (Splitwise / CSV): writes many expenses and settlements into a group the
   * user is a member of, in ≤450-write batches committed in order. Like other saves it
   * resolves once applied locally; rejections arrive through onError.
   */
  bulkImport(groupId: string, expenses: Expense[], settlements: Settlement[]): Promise<void>

  watchComments(groupId: string, expenseId: string, cb: (c: ExpenseComment[]) => void): Unsub
  addComment(groupId: string, expenseId: string, c: Omit<ExpenseComment, 'id'>): Promise<void>
  deleteComment(groupId: string, expenseId: string, id: string): Promise<void>

  /** Per-user inbox of transactions captured outside the app (users/{uid}/captures). */
  watchCaptures(uid: string, cb: (c: Capture[]) => void): Unsub
  saveCapture(uid: string, c: Capture): Promise<void>
  updateCapture(uid: string, id: string, patch: Partial<Omit<Capture, 'id'>>): Promise<void>
  deleteCapture(uid: string, id: string): Promise<void>

  /** Capture tokens let signed-out automations (iOS Shortcuts) drop transactions into captureInbox. */
  watchCaptureTokens(uid: string, cb: (t: CaptureToken[]) => void): Unsub
  createCaptureToken(uid: string): Promise<string>
  revokeCaptureToken(token: string): Promise<void>
  /** Signed-out write of one transaction into captureInbox, authorised only by the token. */
  submitToInbox(doc: InboxDoc, id?: string): Promise<void>
  /** Move this user's captureInbox docs into users/{uid}/captures. Returns how many were moved. */
  claimInbox(uid: string): Promise<number>

  // ---- Live table split (tables/{code}, see src/lib/table.ts) ----
  /** Firebase only: guests at a table sign in anonymously (no account needed). */
  signInAnonymously?(): Promise<void>
  /** Creates an open table that expires in 24 hours. Returns its share code (the doc id). */
  createTable(t: NewTable): Promise<string>
  /** null when the table doesn't exist or can no longer be read (expired / closed for non-participants). */
  watchTable(code: string, cb: (t: LiveTable | null) => void): Unsub
  /** Add or rename a participant. Guests may only write their own entry (pid = their uid). */
  joinTable(code: string, pid: ParticipantId, p: TableParticipant): Promise<void>
  /** Replace one participant's claims ({itemId: shares}). */
  setTableClaims(code: string, pid: ParticipantId, claims: Record<ItemId, number>): Promise<void>
  /** Host only. `null` entries are removed. */
  updateTable(code: string, patch: TablePatch): Promise<void>
  /** Host only. */
  deleteTable(code: string): Promise<void>
}

export interface TablePatch {
  merchant?: string
  extras?: TableExtras
  groupId?: string | null
  status?: TableStatus
  expenseId?: string
  closedGroupId?: string
  items?: Record<ItemId, TableItem | null>
  participants?: Record<ParticipantId, TableParticipant | null>
  claims?: Record<ParticipantId, Record<ItemId, number> | null>
}

export interface CaptureToken {
  token: string
  uid: string
  createdAt: number
}

export function placeholdersOf(g: Pick<Group, 'members'>): Record<MemberId, string> {
  return Object.fromEntries(Object.entries(g.members).filter(([, m]) => !m.uid).map(([id, m]) => [id, m.name]))
}

export const byDateDesc = <T extends { date: string; createdAt: number }>(a: T, b: T) =>
  b.date.localeCompare(a.date) || b.createdAt - a.createdAt

/** Settings fields whose value differs from the base group. `undefined` in the result means "clear the field". */
export function changedSettings(base: Group, patch: GroupSettings): GroupSettings {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    const before = (base as unknown as Record<string, unknown>)[k]
    if (JSON.stringify(before) !== JSON.stringify(v)) out[k] = v
  }
  return out as GroupSettings
}

/** Member ids added/removed between two members maps. */
export function diffMembers(before: Record<MemberId, Member>, after: Record<MemberId, Member>) {
  return {
    added: Object.keys(after).filter((id) => !(id in before)),
    removed: Object.keys(before).filter((id) => !(id in after)),
  }
}

/** Storage path from a Firebase Storage download URL (…/o/<encoded path>?alt=media…). */
export function storagePathFromUrl(url: string | undefined): string | undefined {
  const m = url?.match(/\/o\/([^?]+)/)
  return m ? decodeURIComponent(m[1]) : undefined
}

/** Simple listener set used by both repos for the error channel. */
export function errorChannel() {
  const listeners = new Set<(e: RepoError) => void>()
  // Errors raised before anyone subscribed (e.g. a failed sign-in redirect at startup) are kept.
  let early: RepoError[] = []
  return {
    on(cb: (e: RepoError) => void): Unsub {
      listeners.add(cb)
      if (early.length) { const q = early; early = []; q.forEach(cb) }
      return () => { listeners.delete(cb) }
    },
    emit(kind: RepoError['kind'], error: unknown, context: string) {
      console.error(`[repo] ${context}`, error)
      const code = (error as { code?: string })?.code
      const message = code === 'permission-denied'
        ? `${context}: you don’t have permission (the change was undone)`
        : `${context}: ${(error as Error)?.message ?? String(error)}`
      const e: RepoError = { kind, message, error }
      if (listeners.size) listeners.forEach((l) => l(e))
      else early.push(e)
    },
  }
}

/** Build a pending capture from a validated draft. Undefined fields are dropped. */
export function draftToCapture(d: CaptureDraft, id: string, now = Date.now()): Capture {
  return compact({
    id, amount: d.amount, currency: d.currency, merchant: d.merchant, date: d.date, ts: d.ts, source: d.source,
    card: d.card, raw: d.raw, note: d.note, suggestedGroup: d.group, status: 'pending' as const, createdAt: now, updatedAt: now,
  })
}

export const compact = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

export const byCreatedDesc = <T extends { createdAt: number }>(a: T, b: T) => b.createdAt - a.createdAt
