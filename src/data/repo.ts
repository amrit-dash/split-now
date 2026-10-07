import type { Capture, Expense, ExpenseComment, Group, Member, MemberId, Settlement, UserProfile } from '@/types'
import type { CaptureDraft, InboxDoc } from '@/lib/capture'

export type Unsub = () => void

export interface AuthUser {
  uid: string
  displayName: string
  email?: string
  photoURL?: string
}

export interface InviteInfo {
  groupId: string
  groupName: string
  emoji: string
  /** unclaimed placeholder members the joiner can claim */
  placeholders: Record<MemberId, string>
}

export type NewGroup = Omit<Group, 'id' | 'createdAt' | 'updatedAt' | 'inviteCode'>

export interface Repo {
  mode: 'firebase' | 'demo'

  onAuth(cb: (u: AuthUser | null) => void): Unsub
  signInWithGoogle(): Promise<void>
  signInWithEmail(email: string, password: string): Promise<void>
  signUpWithEmail(name: string, email: string, password: string): Promise<void>
  signInDemo?(name: string): Promise<void>
  signOut(): Promise<void>

  watchProfile(uid: string, cb: (p: UserProfile | null) => void): Unsub
  saveProfile(p: UserProfile): Promise<void>
  getProfile(uid: string): Promise<UserProfile | null>

  watchGroups(uid: string, cb: (groups: Group[]) => void): Unsub
  watchGroup(id: string, cb: (g: Group | null) => void): Unsub
  createGroup(g: NewGroup): Promise<string>
  updateGroup(id: string, patch: Partial<Group>): Promise<void>
  deleteGroup(id: string): Promise<void>

  getInvite(code: string): Promise<InviteInfo | null>
  joinGroup(code: string, memberId: MemberId, member: Member): Promise<string>

  watchExpenses(groupId: string, cb: (e: Expense[]) => void): Unsub
  saveExpense(e: Expense): Promise<void>
  deleteExpense(groupId: string, id: string): Promise<void>

  watchSettlements(groupId: string, cb: (s: Settlement[]) => void): Unsub
  saveSettlement(s: Settlement): Promise<void>
  deleteSettlement(groupId: string, id: string): Promise<void>

  uploadReceipt(groupId: string, file: Blob): Promise<string>

  /**
   * Recurring catch-up: write generated occurrences (deterministic ids, so concurrent
   * clients overwrite rather than duplicate) and the template's advanced `recurrence`
   * (only that field is touched) in one atomic write.
   */
  saveRecurringOccurrences(template: Expense, occurrences: Expense[]): Promise<void>

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

/** Build a pending capture from a validated draft. Undefined fields are dropped. */
export function draftToCapture(d: CaptureDraft, id: string, now = Date.now()): Capture {
  return compact({
    id, amount: d.amount, currency: d.currency, merchant: d.merchant, date: d.date, ts: d.ts, source: d.source,
    card: d.card, raw: d.raw, note: d.note, suggestedGroup: d.group, status: 'pending' as const, createdAt: now, updatedAt: now,
  })
}

export const compact = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

export const byCreatedDesc =<T extends { createdAt: number }>(a: T, b: T) => b.createdAt - a.createdAt
