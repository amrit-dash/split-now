export type Cents = number
export type MemberId = string

export type GroupType = 'trip' | 'outing' | 'home' | 'couple' | 'event' | 'office' | 'other' | 'direct' | 'personal'

export interface PaymentHandles {
  /** India: UPI ID / VPA, e.g. rohan@okaxis */
  upi?: string
  /** India: mobile number linked to UPI (GPay / PhonePe / Paytm "pay to phone") */
  phone?: string
  /** bank account number (India with ifsc, Australia with bsb) */
  account?: string
  /** India: bank branch code, e.g. HDFC0001234 */
  ifsc?: string
  /** Australia */
  payid?: string
  bsb?: string
  /** international */
  paypal?: string
  revolut?: string
}

export interface UserProfile {
  uid: string
  displayName: string
  email?: string
  /** Profile photo: a Storage download URL (upload), the Google account photo, or a data: URL in demo mode. */
  photoURL?: string
  /**
   * Where photoURL came from. 'none' = the user removed their photo (so a later Google
   * sign-in doesn't bring it back); missing on old profiles (treated like 'google').
   */
  photoSource?: PhotoSource
  currency: string
  /** Mobile number (E.164 where possible). Not verified; shown to the user only. */
  phone?: string
  payment?: PaymentHandles
}

export type PhotoSource = 'upload' | 'google' | 'none'

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
  /** New expenses above approvalThreshold by others stay pending until everyone charged approves. */
  requireApproval?: boolean
  /** Minor units of the group currency (default DEFAULT_APPROVAL_THRESHOLD in src/lib/trust.ts). */
  approvalThreshold?: Cents
  /** a member paused SMS auto-capture for this trip (the webhook skips it; docs/AUTO_CAPTURE.md) */
  captureOff?: boolean
  /** Archived: hidden from totals, pickers and capture matching; listed under "Archived" on Groups. Any member may toggle it. */
  archived?: boolean
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
  /** portions per member (e.g. one person had 2 of 3 beers); absent means equal */
  shares?: Record<MemberId, number>
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
  | 'food'
  | 'groceries'
  | 'transport'
  | 'stay'
  | 'entertainment'
  | 'shopping'
  | 'utilities'
  | 'rent'
  | 'health'
  | 'travel'
  | 'gifts'
  | 'other'

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
  /** Set when the expense came from a file import (src/lib/import-splitwise.ts). */
  importedFrom?: ImportedFrom
  /** Soft delete: in "Recently deleted" (ignored by balances) until restored or purged. */
  deletedAt?: number
  /** uid of whoever moved it to the trash (they, or the group creator, may purge it) */
  deletedBy?: string
  /** Open flags, keyed by the flagger's uid. Disputed expenses still count in balances. */
  dispute?: Record<string, ExpenseFlag>
  /** Set at creation when the group requires approval and the amount is above the threshold. */
  requiresApproval?: boolean
  /** uid → true for each person charged who approved it. */
  approvals?: Record<string, true>
}

export interface ExpenseFlag {
  byUid: string
  /** the flagger's member id (rules check it is theirs and is part of the expense) */
  memberId: string
  reason: string
  at: number
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

/** 'splitwise' = Splitwise CSV export, 'csv' = our own CSV export re-imported. */
export type ImportedFrom = 'splitwise' | 'csv'

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
  /** Set when the payment came from a file import. */
  importedFrom?: ImportedFrom
  deletedAt?: number
  deletedBy?: string
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

export type ActivityType =
  | 'expense.created'
  | 'expense.updated'
  | 'expense.deleted'
  | 'expense.restored'
  | 'expense.purged'
  | 'expense.disputed'
  | 'expense.resolved'
  | 'expense.approved'
  | 'expense.imported'
  | 'settlement.created'
  | 'settlement.deleted'
  | 'settlement.restored'
  | 'settlement.purged'
  | 'member.added'
  | 'member.removed'

/**
 * groups/{gid}/activity/{aid}: an append-only log entry, written in the same batch as the
 * change it describes. See src/lib/activity.ts.
 */
export interface ActivityEntry {
  id: string
  /** from the document path (not stored) */
  groupId: string
  type: ActivityType
  actorUid: string
  actorName: string
  /** expense / settlement / member id the entry is about */
  targetId: string
  /** human text, e.g. "Priya changed amount ₹800.00 → ₹840.00 on “Dinner”" */
  summary: string
  /** compact snapshot of the changed fields */
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  createdAt: number
}
