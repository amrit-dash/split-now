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
  /** optional trip/event window, ISO yyyy-mm-dd (inclusive) */
  startDate?: string
  endDate?: string
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
  /** Storage path of the receipt image, for cleanup on delete */
  receiptPath?: string
  createdBy: string
  createdAt: number
  updatedAt: number
  /** Present on a repeating "template" expense. See src/lib/recurrence.ts. */
  recurrence?: Recurrence
  /** Set on an occurrence generated from a template: the template's id. */
  recurringFrom?: string
  /**
   * Set when the expense was entered in a currency other than the group's. `amount`,
   * `paidBy` and `splits` are still in the group currency (converted once, at `rate`);
   * `splitInput` amounts (exact / adjust / items) are in the original currency.
   */
  original?: OriginalAmount
}

export type FxSource = 'ecb' | 'manual'

/** The amount as entered in a foreign currency, with the exchange rate locked at entry. */
export interface OriginalAmount {
  /** ISO 4217 code */
  currency: string
  /** minor units of `currency` */
  amount: Cents
  /** group-currency units per 1 unit of `currency` */
  rate: number
  /** yyyy-mm-dd the rate is for (ECB publishes on business days) */
  rateDate: string
  source: FxSource
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

export type CaptureStatus = 'pending' | 'assigned' | 'dismissed'

/**
 * A transaction captured from outside the app (iOS Shortcuts, Android automation, share sheet)
 * that the user still has to sort into a group. Stored per user: users/{uid}/captures/{id}.
 */
export interface Capture {
  id: string
  amount: Cents
  /** ISO 4217 code if known (from the URL or the amount's symbol) */
  currency?: string
  merchant: string
  date: string // ISO yyyy-mm-dd
  /** original ISO 8601 timestamp, when the sender gave one */
  ts?: string
  /** where it came from: ios-shortcut, android-auto, share, email, manual */
  source: string
  /** card label (e.g. "Amex"), never a card number */
  card?: string
  /** the amount as the sender wrote it, e.g. "A$12.50" */
  raw?: string
  note?: string
  /** groupId the capture link asked to pre-select */
  suggestedGroup?: string
  status: CaptureStatus
  groupId?: string
  expenseId?: string
  createdAt: number
  updatedAt: number
}
