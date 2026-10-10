import type { ActivityEntry, Capture, Cents, Expense, ExpenseComment, Group, Member, MemberId, PaymentHandles, Settlement, UserProfile } from '@/types'
import type { CaptureDraft, InboxDoc } from '@/lib/capture'
import type { ItemId, LiveTable, NewTable, ParticipantId, TableExtras, TableItem, TableParticipant, TableStatus, TaxSplit } from '@/lib/table'
import type { ActivityCtx } from '@/lib/activity'
import type { NewPayLink, PayLink, PayLinkClaim } from '@/lib/paylinks'
import type { FxRatesDoc, FxRefreshResult } from '@/lib/fx'
import type { ParsedReceipt } from '@/lib/ocr-parse'
import type { AppAiConfig } from '@/lib/ai-config'
import type { MerchantMemory } from '@/lib/merchants'
import type { AiTextExpense } from '@/lib/nl-expense'
import type { NudgeItem, NudgeResult } from '@/lib/nudge'
import type { AiUnavailableReason } from '../../shared/ai-config'
import type { QuickAiRequest, QuickAiResponse } from '../../shared/quick-ai'
import { defaultCurrency } from '@/lib/locale'
import { sharedPhotoURL, type OwnMemberPatch } from '@/lib/memberSync'

export type Unsub = () => void

/**
 * Where a live query's data came from. Passed as the optional second argument of every
 * `watch*` callback so screens can tell "nothing here yet (cached)" from "nothing here (server)".
 * The demo repo always reports a server-equivalent snapshot.
 */
export interface SnapMeta {
  /** The snapshot came from this device's cache and the server hasn't confirmed it yet. */
  fromCache: boolean
  /** Some of the data was written on this device and hasn't reached the server. */
  hasPendingWrites: boolean
  /** The query itself failed (access lost, deleted): the value is a fallback (empty / null). */
  error?: boolean
}
export type Watch<T> = (value: T, meta?: SnapMeta) => void

export interface AuthUser {
  uid: string
  displayName: string
  email?: string
  photoURL?: string
  /** The Google account photo, when signed in with Google (offered as "Use Google photo"). */
  googlePhotoURL?: string
  /** Firebase anonymous sign-in (a guest at a live table). Such users only see /t/ pages. */
  isAnonymous?: boolean
  /** Sign-in methods on this account: 'google.com', 'password'. */
  providers?: string[]
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
  /** profile photo (https URL), for co-members' avatars */
  photoURL?: string
  /** their own currency, so a payer can offer to pay them in it (Settle up) */
  currency?: string
  /** Collect in my currency is on: Settle up starts out paying them in `currency` */
  collect?: boolean
}

/** The shareable part of a private profile (data: URLs are demo-only and never shared). */
export function memberProfileOf(
  p: Pick<UserProfile, 'displayName' | 'payment' | 'photoURL'> & Partial<Pick<UserProfile, 'currency' | 'collectInHome'>>,
): MemberProfile {
  const photo = sharedPhotoURL(p.photoURL)
  return compact({
    displayName: p.displayName,
    payment: p.payment ?? {},
    photoURL: photo,
    currency: p.currency && /^[A-Z]{3}$/.test(p.currency) ? p.currency : undefined,
    collect: p.collectInHome ? true : undefined,
  })
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
   * offline). Server rejections arrive later through this subscription. The exceptions are
   * documented per method (joinGroup, submitToInbox, uploads, deleteGroup wait for the server).
   *
   * Every `watch*` method delivers its first value as soon as the cache (or the server) has
   * one, then again on each change; the optional second callback argument says where the
   * data came from (SnapMeta). Callbacks may be invoked with the same array reference as
   * before when only the metadata changed. Screens share listeners through src/data/store.ts,
   * so a watcher is normally opened once per key for the whole session.
   */
  onError(cb: (e: RepoError) => void): Unsub

  onAuth(cb: (u: AuthUser | null) => void): Unsub
  signInWithGoogle(): Promise<void>
  signInWithEmail(email: string, password: string): Promise<void>
  signUpWithEmail(name: string, email: string, password: string): Promise<void>
  signInDemo?(name: string): Promise<void>
  /**
   * Signs out and wipes this device's offline cache so the next person on the browser can't
   * read the previous user's data. Writes still queued (offline, or not acknowledged within
   * a few seconds) are never thrown away: the cache is then kept and a warning is shown; they
   * sync the next time the same user signs in on this device.
   */
  signOut(): Promise<void>
  /** Add Google sign-in to the current account (same email → one account). Firebase only. */
  linkGoogle?(): Promise<void>
  /** Add an email + password sign-in to the current (e.g. Google) account. Firebase only. */
  addPassword?(password: string): Promise<void>

  watchProfile(uid: string, cb: Watch<UserProfile | null>): Unsub
  /**
   * Saves the private profile and copies name + payment handles + photo into every group the
   * user is in. A missing photoURL removes the stored photo.
   */
  saveProfile(p: UserProfile): Promise<void>
  /**
   * Stores a profile photo (an already cropped square JPEG) and returns its URL: Storage
   * avatars/{uid}/{random}.jpg in Firebase (needs a connection), a data: URL in demo mode.
   * The caller then saves it with saveProfile.
   */
  uploadAvatar(uid: string, jpeg: Blob): Promise<string>
  /** Own (private) profile only. */
  getProfile(uid: string): Promise<UserProfile | null>
  /** A co-member's shared name + payment handles for one group. */
  getMemberProfile(groupId: string, uid: string): Promise<MemberProfile | null>

  /** Groups the user belongs to, most recently updated first. */
  watchGroups(uid: string, cb: Watch<Group[]>): Unsub
  /** null when the group doesn't exist or the user can't read it (removed, deleted). */
  watchGroup(id: string, cb: Watch<Group | null>): Unsub
  createGroup(g: NewGroup): Promise<string>
  /** Writes only the fields that differ from `base` (the group as the form loaded it). */
  updateGroupSettings(base: Group, patch: GroupSettings): Promise<void>
  /** @deprecated use updateGroupSettings/addMember/removeMember. Membership fields in `patch` are ignored. */
  updateGroup(id: string, patch: Partial<Group>): Promise<void>
  /**
   * Adds a placeholder. When `memberId` is a removed entry (formerMemberMatch), that entry comes
   * back instead, as a placeholder: removedAt and any uid are dropped and `member` is ignored, so
   * their old expenses join up; someone with an account rejoins through the invite.
   */
  addMember(group: Group, memberId: MemberId, member: Member): Promise<void>
  /**
   * A soft remove: the entry stays, marked `removedAt`, so old expenses keep their name and stay
   * editable; their uid leaves memberUids, so they lose access. Callers check the balance is
   * settled first (src/lib/members.ts memberRemoval); lists skip them via activeMembers().
   */
  removeMember(group: Group, memberId: MemberId): Promise<void>
  /**
   * The signed-in user's own member entry: set its name and photo from their profile (no photo
   * removes it). Background sync (src/hooks/auth.tsx); a refusal is logged, not shown.
   */
  updateOwnMember(group: Group, memberId: MemberId, patch: OwnMemberPatch): Promise<void>
  /**
   * Deletes the group with everything under it (expenses, payments, activity, profiles,
   * receipts). Needs the server: rejects with a readable message offline or on failure.
   */
  deleteGroup(id: string): Promise<void>

  getInvite(code: string): Promise<InviteInfo | null>
  joinGroup(code: string, memberId: MemberId, member: Member): Promise<string>

  /** Every expense of the group, including trashed ones (deletedAt set). */
  watchExpenses(groupId: string, cb: Watch<Expense[]>): Unsub
  /**
   * Create or edit. Writes an activity entry in the same batch, and keeps the stored trust
   * fields (flags, approvals, trash) whatever the form passed (see prepareExpenseSave).
   * An edit only writes the fields that changed, so a flag or approval that landed on the
   * server after this device last saw the expense survives the save.
   */
  saveExpense(e: Expense): Promise<void>
  /** Soft delete: moves the expense to "Recently deleted" (deletedAt/deletedBy). A no-op when already there. */
  deleteExpense(groupId: string, id: string): Promise<void>
  restoreExpense(groupId: string, id: string): Promise<void>
  /** Hard delete (with its comments and receipt). Only the deleter or the group creator may. */
  purgeExpense(groupId: string, id: string): Promise<void>
  /** Add (or replace) the signed-in user's flag on an expense they are part of. */
  flagExpense(group: Group, expense: Expense, reason: string): Promise<void>
  /** Remove the signed-in user's own flag. */
  resolveFlag(group: Group, expense: Expense): Promise<void>
  approveExpense(group: Group, expense: Expense): Promise<void>
  /**
   * Downscales and uploads a receipt in the background, then patches the expense's
   * receiptUrl/receiptPath. Returns false (and does nothing) when offline.
   */
  attachReceipt(groupId: string, expenseId: string, file: Blob): boolean
  /** @deprecated blocks on the network; prefer attachReceipt after saving. */
  uploadReceipt(groupId: string, file: Blob): Promise<string>

  /** Every settlement of the group, including trashed ones. */
  watchSettlements(groupId: string, cb: Watch<Settlement[]>): Unsub
  saveSettlement(s: Settlement): Promise<void>
  /** Soft delete (restorable for 30 days). A no-op when already in the trash. */
  deleteSettlement(groupId: string, id: string): Promise<void>
  restoreSettlement(groupId: string, id: string): Promise<void>
  purgeSettlement(groupId: string, id: string): Promise<void>

  /** groups/{gid}/activity, newest first. */
  watchActivity(groupId: string, cb: Watch<ActivityEntry[]>, max?: number): Unsub
  /** Activity entries about one expense/settlement, newest first. */
  watchHistory(groupId: string, targetId: string, cb: Watch<ActivityEntry[]>): Unsub

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

  watchComments(groupId: string, expenseId: string, cb: Watch<ExpenseComment[]>): Unsub
  addComment(groupId: string, expenseId: string, c: Omit<ExpenseComment, 'id'>): Promise<void>
  deleteComment(groupId: string, expenseId: string, id: string): Promise<void>

  /**
   * Per-user inbox of transactions captured outside the app (users/{uid}/captures). Captures
   * are written by the server, so an empty cache is reported only once the server has answered
   * (or after a few seconds when it doesn't, with meta.fromCache = true).
   */
  watchCaptures(uid: string, cb: Watch<Capture[]>): Unsub
  saveCapture(uid: string, c: Capture): Promise<void>
  updateCapture(uid: string, id: string, patch: Partial<Omit<Capture, 'id'>>): Promise<void>
  deleteCapture(uid: string, id: string): Promise<void>

  /**
   * users/{uid}/settings/merchants: the categories this user picked by hand per merchant
   * (src/lib/merchants.ts). Owner only; the whole document is replaced on save (entries are
   * evicted, so a merge can't do it). null until it exists.
   */
  watchMerchants(uid: string, cb: Watch<MerchantMemory | null>): Unsub
  saveMerchants(uid: string, memory: MerchantMemory): Promise<void>

  /**
   * Push a settle-up nudge to a member who owes the signed-in user (the `nudge` callable; one
   * per person per group per day, server-enforced; the server writes a `settlement.nudged`
   * activity entry, also when the debtor gets no push: `no_push`, and they see it in the app).
   * `amount` is what the app shows and is only a hint. Demo mode: pretends it was sent (no push
   * exists) and writes the activity entry, so the flow can be tried. Rejects with a readable message.
   */
  nudge(groupId: string, memberId: MemberId, amount?: Cents): Promise<NudgeResult>
  /**
   * One nudge about everything one person owes the signed-in user across several groups (the
   * same callable with `items`, at most 20): one push with the total, a `settlement.nudged`
   * entry in each group where they owe, once per person per day. Same results as `nudge`, with
   * the total as `amount` and `groups` covered.
   */
  nudgeAcross(items: NudgeItem[]): Promise<NudgeResult>

  /** Capture tokens let signed-out automations (iOS Shortcuts) drop transactions into captureInbox. */
  watchCaptureTokens(uid: string, cb: Watch<CaptureToken[]>): Unsub
  /**
   * Optional `groupId` scopes the token to one trip (the webhook then only accepts messages
   * dated inside that group's trip window); `label` is a display name for the key list.
   */
  createCaptureToken(uid: string, opts?: CaptureTokenOpts): Promise<string>
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
  watchTable(code: string, cb: Watch<LiveTable | null>): Unsub
  /** Add or rename a participant. Guests may only write their own entry (pid = their uid). */
  joinTable(code: string, pid: ParticipantId, p: TableParticipant): Promise<void>
  /** Replace one participant's claims ({itemId: shares}). */
  setTableClaims(code: string, pid: ParticipantId, claims: Record<ItemId, number>): Promise<void>
  /** Host only. `null` entries are removed. */
  updateTable(code: string, patch: TablePatch): Promise<void>
  /** Host only. */
  deleteTable(code: string): Promise<void>

  // ---- Pay me links (payLinks/{code}, see src/lib/paylinks.ts) ----
  /**
   * The payee creates a link (the code is made on this device, so the share sheet opens at once).
   * Like other saves it resolves once applied locally; a refusal arrives through onError.
   */
  createPayLink(code: string, link: NewPayLink): Promise<void>
  /** null when there is no such link. Anyone signed in (anonymous included) may read one by its code. */
  watchPayLink(code: string, cb: Watch<PayLink | null>): Unsub
  /**
   * "I've paid": open → paid (open → claimed for a live table link not locked to one guest: the
   * host confirms it), after uploading the screenshot when one is given (payproofs/{code}/).
   * Waits for the server and rejects with a readable message (expired, offline, not theirs).
   * Firebase: the onPayLinkPaid trigger then records the settlement. Demo: recorded here at once.
   */
  markPayLinkPaid(code: string, claim: PayLinkClaim, proof?: Blob): Promise<void>
  /**
   * The signed-in user's own links that a table guest says are paid and that wait for them
   * (createdBy == uid, status 'claimed'): the Inbox's "Says they've paid" cards and the group card.
   */
  watchClaimedPayLinks(uid: string, cb: Watch<PayLink[]>): Unsub
  /** The payee (a live table's host) confirms a guest's "I've paid" on a link not locked to one guest: claimed → paid, then recorded as usual. */
  confirmPayLinkClaim(code: string): Promise<void>
  /** The payee dismisses that claim: claimed → open, the claim fields cleared, so it can be paid and claimed again. */
  dismissPayLinkClaim(code: string): Promise<void>
  /** The payee withdraws an open link. */
  cancelPayLink(code: string): Promise<void>
  /** A URL for the payment screenshot (the payee and the group's members may read it); null when unavailable. */
  payProofUrl(path: string): Promise<string | null>

  // ---- Shared exchange rates (fxRates/*, written by Cloud Functions; see src/lib/fx.ts) ----
  /** fxRates/{yyyy-mm-dd} or fxRates/latest; null when missing, signed out, or in demo mode. */
  getFxRates(date: string | 'latest'): Promise<FxRatesDoc | null>
  /**
   * Ask the server (refreshFx callable) to fetch and store the latest rates, or those for a
   * past `date`. Throttled server-side. null on failure, when signed out, or in demo mode.
   */
  refreshFx(date?: string): Promise<FxRefreshResult | null>

  // ---- AI (parseReceiptAi callable, Gemini) ----
  /**
   * Read a bill photo (base64, already downscaled) with Gemini. `{ receipt: null }` means it isn't
   * a bill; `{ unavailable: true, reason }` is the server declining (no usable key, quota, Gemini
   * down: see AiUnavailableReason, src/lib/ai.ts words it); null means the call couldn't be made
   * (offline, demo mode, signed out, timed out).
   */
  readReceiptAi(image: string, mimeType: string): Promise<ReceiptAiResult | null>
  /**
   * Read payment-app / bank statement screenshots into transactions (amounts in hundredths).
   * `{ statement: null }`: no transactions found; `{ unavailable: true, reason }`: the server
   * declined (StatementImport words it with unavailableText, without the on-phone line: this path
   * has no fallback); null: the call couldn't be made (offline, signed out, failed or timed out).
   * Demo mode returns a sample.
   */
  readStatementAi(images: Array<{ image: string; mimeType: string }>, today: string): Promise<StatementAiResult | null>
  /**
   * Read a Quick add line ("dinner 1200 with Rahul, I paid") with Gemini (parseReceiptAi,
   * kind 'text'; it shares the bill reader's switch and allowance). People come back as the
   * names given in `members`; src/lib/nl-expense.ts resolves them. `{ expense: null }`: not an
   * expense; `{ unavailable, reason }`: the server declined; null: couldn't be called (offline,
   * demo mode, signed out).
   */
  parseTextAi(text: string, ctx: { members: string[]; currency: string; today: string }): Promise<TextAiResult | null>
  /**
   * Quick add with AI (callable quickAddAi): a line the phone's grammar can't handle, read with the
   * caller's groups as context. The answer is validated on the server (shared/quick-ai.ts); it never
   * saves anything. `{ unavailable, reason }`: the flag, the person's switch or every key said no;
   * null: couldn't be called (offline, signed out, failed). Demo mode reads one sentence shape on
   * the phone (src/lib/quick-ai-demo.ts) and answers 'unknown' for the rest.
   */
  quickAddAi(req: QuickAiRequest): Promise<QuickAiResponse | null>
  /**
   * Save / re-test / remove the user's own Gemini key (aiKey callable), or with which 'app' the
   * in-app project key (admins; overrides Secret Manager's). Throws with a readable message.
   */
  aiKey(action: 'set' | 'test' | 'remove', key?: string, which?: 'own' | 'app'): Promise<AiKeyResult>
  /** Models for the user's own key, or the project key (admins). Throws on failure. */
  aiModels(which: 'own' | 'app'): Promise<AiModel[]>
  /** Whether the shared key can be used; null if unknown (offline, demo). */
  aiStatus(): Promise<AiStatusResult | null>
  /** users/{uid}/aiState/status (server-written). */
  watchAiState(userId: string, cb: (s: AiState | null) => void): Unsub
  /** config/ai (raw; resolve with resolveAppAi). */
  watchAppAi(cb: (raw: unknown) => void): Unsub
  /** Admins only (rules). */
  saveAppAi(cfg: AppAiConfig): Promise<void>
  /** stats/ai_{day} (admins only). */
  aiUsage(day: string): Promise<Record<string, number> | null>
}

export type { AiUnavailableReason }
/** The server declined to read with AI; `reason` picks the copy (src/lib/ai.ts unavailableText). */
export interface AiUnavailable {
  unavailable: true
  reason?: AiUnavailableReason
}
export type ReceiptAiResult = { receipt: ParsedReceipt | null; unavailable?: undefined } | AiUnavailable
export type StatementAiResult = { statement: AiStatement | null; unavailable?: undefined } | AiUnavailable
export type TextAiResult = { expense: AiTextExpense | null; unavailable?: undefined } | AiUnavailable

export interface AiModel {
  id: string
  label: string /** a cheap model (minimal thinking); the pickers mark the others as costing more */
  lite?: boolean
}
export interface AiKeyResult {
  hint: string | null
  models: AiModel[]
  source?: AppKeySource | null
}
/** Where the project key comes from: set in the app by an admin, or Secret Manager. */
export type AppKeySource = 'admin' | 'secret'
export type AppAiStatusValue = 'available' | 'off' | 'not_listed' | 'feature_off'
export interface AiStatusResult {
  admin: boolean
  app: {
    images: AppAiStatusValue
    sms: AppAiStatusValue
    model: string
    /** per-user daily allowance on the shared key */
    perDay?: number
    configured?: boolean
    source?: AppKeySource | null
    hint?: string | null
    /** admins: the stored key is sealed (encrypted) */
    sealed?: boolean
    globalPerDay?: number
  }
}
export interface AiState {
  hint?: string
  lastOkAt?: number
  lastError?: { kind: 'bad_key' | 'quota' | 'model' | 'server' | 'billing' | 'blocked' | 'truncated'; at: number }
}

export interface StatementTxn {
  date: string
  name: string
  /** hundredths of the statement currency */
  amount: number
  direction: 'debit' | 'credit'
  kind: 'payment' | 'self_transfer' | 'refund' | 'other'
  note?: string
}
export interface AiStatement {
  currency?: string
  transactions: StatementTxn[]
}

export interface TablePatch {
  merchant?: string
  extras?: TableExtras
  taxSplit?: TaxSplit
  groupId?: string | null
  status?: TableStatus
  expenseId?: string
  closedGroupId?: string
  items?: Record<ItemId, TableItem | null>
  participants?: Record<ParticipantId, TableParticipant | null>
  claims?: Record<ParticipantId, Record<ItemId, number> | null>
  payLinks?: Record<ParticipantId, string | null>
}

export interface CaptureToken {
  token: string
  uid: string
  createdAt: number
  /** scoped to one trip (see docs/AUTO_CAPTURE.md) */
  groupId?: string
  label?: string
  /** set by the capture webhook on every request it receives with this key */
  lastUsedAt?: number
}

export interface CaptureTokenOpts {
  groupId?: string
  label?: string
}

export function placeholdersOf(g: Pick<Group, 'members'>): Record<MemberId, string> {
  return Object.fromEntries(
    Object.entries(g.members)
      // the invite's claim spots: people not joined yet who are still in the group
      .filter(([, m]) => !m.uid && typeof m.removedAt !== 'number')
      .map(([id, m]) => [id, m.name]),
  )
}

export const byDateDesc = <T extends { date: string; createdAt: number }>(a: T, b: T) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt

/** Settings fields whose value differs from the base group. `undefined` in the result means "clear the field". */
export function changedSettings(base: Group, patch: GroupSettings): GroupSettings {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    const before = (base as unknown as Record<string, unknown>)[k]
    if (JSON.stringify(before) !== JSON.stringify(v)) out[k] = v
  }
  return out as GroupSettings
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
      // Replayed a tick later, to whoever is still subscribed: StrictMode mounts, unmounts and
      // remounts the App effect synchronously, and the first subscription is gone by then.
      if (early.length)
        setTimeout(() => {
          if (!listeners.has(cb) || !early.length) return
          const q = early
          early = []
          q.forEach(cb)
        }, 0)
      return () => {
        listeners.delete(cb)
      }
    },
    emit(kind: RepoError['kind'], error: unknown, context: string) {
      console.error(`[repo] ${context}`, error)
      const code = (error as { code?: string })?.code
      const message =
        code === 'permission-denied'
          ? `${context}: you don’t have permission (the change was undone)`
          : `${context}: ${(error as Error)?.message ?? String(error)}`
      const e: RepoError = { kind, message, error }
      if (listeners.size) for (const l of listeners) l(e)
      else early.push(e)
    },
  }
}

/** Build a pending capture from a validated draft. Undefined fields are dropped. */
export function draftToCapture(d: CaptureDraft, id: string, now = Date.now()): Capture {
  return compact({
    id,
    amount: d.amount,
    currency: d.currency,
    merchant: d.merchant,
    date: d.date,
    ts: d.ts,
    source: d.source,
    card: d.card,
    raw: d.raw,
    note: d.note,
    suggestedGroup: d.group,
    status: 'pending' as const,
    createdAt: now,
    updatedAt: now,
  })
}

export const compact = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

export const byCreatedDesc = <T extends { createdAt: number }>(a: T, b: T) => b.createdAt - a.createdAt

/**
 * Why `uid` can't delete group `g`, or null when they can. Only the creator deletes a group
 * (the rules enforce it); everyone else gets a readable reason.
 */
export function groupDeleteBlocker(g: Pick<Group, 'name' | 'createdBy' | 'members' | 'memberUids'>, uid: string): string | null {
  if (!g.memberUids.includes(uid)) return `You’re no longer in “${g.name}”.`
  if (g.createdBy === uid) return null
  const by = Object.values(g.members).find((m) => m.uid === g.createdBy)?.name
  return `Only ${by ?? 'the person who created it'} can delete “${g.name}”.`
}

/** Context for building activity entries (src/lib/activity.ts) for a write by `actor` in `group`. */
export function activityCtxFor(group: Pick<Group, 'currency' | 'members'> | undefined, actor: { uid: string; name: string }, _item?: object): ActivityCtx {
  return {
    actorUid: actor.uid,
    actorName: actor.name.slice(0, 80) || 'Someone',
    // amounts are stored in the group currency (a foreign original is formatted from `original`)
    currency: group?.currency ?? defaultCurrency(),
    memberName: (id) => group?.members[id]?.name ?? 'Former member',
  }
}
