import type { Expense, Group, Member, MemberId, Settlement, UserProfile } from '@/types'

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
}

export function placeholdersOf(g: Pick<Group, 'members'>): Record<MemberId, string> {
  return Object.fromEntries(Object.entries(g.members).filter(([, m]) => !m.uid).map(([id, m]) => [id, m.name]))
}

export const byDateDesc = <T extends { date: string; createdAt: number }>(a: T, b: T) =>
  b.date.localeCompare(a.date) || b.createdAt - a.createdAt
