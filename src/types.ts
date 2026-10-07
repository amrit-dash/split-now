export type Cents = number
export type MemberId = string

export type GroupType = 'trip' | 'home' | 'couple' | 'event' | 'other' | 'direct' | 'personal'

export interface PaymentHandles {
  payid?: string
  bsb?: string
  account?: string
  paypal?: string
  upi?: string
  revolut?: string
}

export interface UserProfile {
  uid: string
  displayName: string
  email?: string
  photoURL?: string
  currency: string
  payment?: PaymentHandles
}

export interface Member {
  name: string
  email?: string
  uid?: string
  color: string
}

export interface Group {
  id: string
  name: string
  emoji: string
  type: GroupType
  currency: string
  budget?: Cents
  simplify: boolean
  memberUids: string[]
  members: Record<MemberId, Member>
  inviteCode: string
  createdBy: string
  createdAt: number
  updatedAt: number
}

export type SplitType = 'equal' | 'exact' | 'percent' | 'shares' | 'adjust' | 'itemized'

export interface ReceiptItem {
  name: string
  amount: Cents
  members: MemberId[]
}

export interface SplitInput {
  /** members included (equal / adjust) */
  selected?: MemberId[]
  /** exact cents per member */
  exact?: Record<MemberId, Cents>
  /** percent per member (0-100, may be fractional) */
  percent?: Record<MemberId, number>
  /** shares per member */
  shares?: Record<MemberId, number>
  /** +/- cents per member on top of an equal split */
  adjust?: Record<MemberId, Cents>
  /** receipt line items */
  items?: ReceiptItem[]
}

export type Category =
  | 'food' | 'groceries' | 'transport' | 'stay' | 'entertainment' | 'shopping'
  | 'utilities' | 'rent' | 'health' | 'travel' | 'gifts' | 'other'

export interface Expense {
  id: string
  groupId: string
  description: string
  amount: Cents
  category: Category
  date: string // ISO yyyy-mm-dd
  notes?: string
  paidBy: Record<MemberId, Cents>
  splits: Record<MemberId, Cents>
  splitType: SplitType
  splitInput: SplitInput
  receiptUrl?: string
  createdBy: string
  createdAt: number
  updatedAt: number
  /** Present on a repeating "template" expense. See src/lib/recurrence.ts. */
  recurrence?: Recurrence
  /** Set on an occurrence generated from a template: the template's id. */
  recurringFrom?: string
}

export interface Settlement {
  id: string
  groupId: string
  from: MemberId
  to: MemberId
  amount: Cents
  method: string
  note?: string
  date: string
  createdBy: string
  createdAt: number
}

export interface Debt {
  from: MemberId
  to: MemberId
  amount: Cents
}

export type RecurrenceFreq = 'weekly' | 'fortnightly' | 'monthly' | 'yearly'

export interface Recurrence {
  freq: RecurrenceFreq
  /** Next occurrence (yyyy-mm-dd) still to be created. */
  nextDate: string
  /** Last date (inclusive) an occurrence may fall on. */
  until?: string
}

/** groups/{gid}/expenses/{eid}/comments/{cid} */
export interface ExpenseComment {
  id: string
  text: string
  authorUid: string
  authorName: string
  createdAt: number
}
