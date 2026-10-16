/**
 * Split Now Cloud Functions (2nd gen, Node 22, region asia-south1; see config.ts).
 *  capture             HTTPS  POST /api/sms, /api/capture — bank SMS webhook (token auth, rate-limited)
 *  onExpenseCreated    Firestore groups/{gid}/expenses/{eid} created → push to the people in it
 *  onExpenseUpdated    Firestore an edit, trash or restore that moves balances → the group comes back for those it touched (if archived);
 *                      an edit that takes OKs away pushes those people ("Needs your OK")
 *  onSettlementCreated Firestore groups/{gid}/settlements/{sid} created → push to the payee (and the payer, if someone else recorded it);
 *                      one that needs the payee's OK has its screenshot checked with AI first (payment-ok.ts)
 *  onSettlementUpdated Firestore the payee confirmed a payment or said it hasn't arrived → push to the payer
 *  onPushTokenCreated  Firestore users/{uid}/pushTokens/{id} created → drop the same browser token from other accounts
 *  onGroupDeleted      Firestore groups/{gid} deleted → delete its subcollections and receipts
 *  onChatMessageCreated Firestore groups/{gid}/chat/{mid} created → push everyone else in the group (one per chat, quiet within a minute; mute and prefs respected)
 *  onOpenItemWritten   Firestore groups/{gid}/openItems/{id} names people as "might have paid" → push them to claim it
 *  onGroupTrashed      Firestore groups/{gid} moved to Recently deleted → push the other members (they can restore it)
 *  purgeDeletedGroups  Schedule every day 03:30 Asia/Kolkata → remove groups deleted 30 days ago for good
 *  dailyReminders      Schedule every day 10:00 Asia/Kolkata → settle-up nudges (active groups only)
 *  fxDaily, fxMorning  Schedule weekdays 17:15 Europe/Berlin + daily 09:00 IST → shared ECB rates (fxRates/*)
 *  refreshFx           Callable { date? } → fetch + store ECB rates (throttled, per-user limit), any signed-in user
 *  parseReceiptAi      Callable { kind, image(s) } → bill / statement read by Gemini (own key, then project key)
 *  iconPictureAi       Callable { title, kind, category? } → one picture from a paid Gemini image model (own key, or the shared key when allowed)
 *  iconsAi             Callable { title, kind, category? } → 3 emoji and up to 3 cleaned SVG icons (Gemma or Gemini; nothing saved)
 *  quickAddAi          Callable { text, groups, … } → a Quick add line read by Gemini: an expense, or a new group and an expense (validated; nothing saved)
 *  aiKey, aiModels, aiStatus  Callables: save/test/remove a user's Gemini key (sealed at rest), list models, AI availability
 *  nudge               Callable { groupId, memberId, amount? } or { items } (several groups, one push with the total) → push to someone who owes the caller (1 per pair per day)
 *  onPayLinkPaid       Firestore payLinks/{code} open → paid ("I've paid") → record the settlement in the group, push the payee
 *  cleanupCaptures     Schedule every day 03:45 Asia/Kolkata → remove captured payments handled longer than config/limits captureKeepDays
 *  linkPreview         HTTPS (Hosting rewrites /join/*, /r/*, /t/*) → the app page with a preview about the link (group invite, Pay me link, live table)
 *  onGroupMembersLink  Firestore groups/{gid} written → a placeholder whose email has a verified account gets it attached (the group shows up for them, push); other emails wait in emailInvites
 *  linkMyInvites       Callable (after sign-in) → attach the groups that added this verified email before the account existed
 *  claimEmail          Callable { token } → another email joins the account, proved by opening Firebase's sign-in link for it (emailIndex)
 *  removeEmail         Callable → take an added email off the account
 *  mergeAccount        Callable (after a sign-in link proved an address that has its own account) → that account's groups, links and tables move here; it is switched off
 *  adoptGuest          Callable { guestToken } → a guest who signed in to an existing account: their links and tables move, the group entry their locked Pay me link points to gets the account
 *  claimGuestLinks     Callable → the same group entries, when the guest account became a real one in place
 *  mergeMembers        Callable { groupId, from, into } → two entries that are one person become one (expenses, payments, open items, Pay me links rewritten); waits for the creator's OK when the group asks for it (a chat card @mentioning them, a push)
 *  decideMerge         Callable { groupId, requestId, approve } → the creator decides a request; any member acts on a suggestion
 *  vault               Callable { op, … } → private groups: passkeys, the group's pattern, and its data key once both pass (vault.ts)
 *  adminLogs           Callable (admins only) { level?, fn?, hours?, text?, id?, next? } → the functions' own logs from Cloud Logging, newest first (logs.ts)
 *  adminStats, adminUsers, adminBlockUser, adminSetAdmin  Callables (admins/{uid} only): usage counters + totals, account lookup, block / unblock, make or remove an admin
 */
export { capture } from './capture'
export { linkPreview } from './preview'
export { cleanupCaptures } from './cleanup'
export { onExpenseCreated, onExpenseUpdated, onGroupDeleted, onPushTokenCreated, onSettlementCreated, onSettlementUpdated } from './triggers'
export { dailyReminders } from './reminders'
export { fxDaily, fxMorning, refreshFx } from './fx'
export { aiKey, aiModels, aiStatus, iconPictureAi, iconsAi, parseReceiptAi, quickAddAi } from './ai'
export { nudge } from './nudge'
export { onPayLinkPaid } from './paylinks'
export { adminBlockUser, adminSetAdmin, adminStats, adminUsers } from './admin'
export { onGroupTrashed, purgeDeletedGroups } from './trash'
export { linkMyInvites, onGroupMembersLink } from './link-members'
export { onChatMessageCreated, onOpenItemWritten } from './chat'
export { adoptGuest, claimEmail, claimGuestLinks, mergeAccount, removeEmail } from './accounts'
export { decideMerge, mergeMembers } from './merge-members'
export { vault } from './vault'
export { adminLogs } from './logs'
