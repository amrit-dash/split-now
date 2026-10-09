/**
 * Split Now Cloud Functions (2nd gen, Node 22, region asia-south1; see config.ts).
 *  capture             HTTPS  POST /api/sms, /api/capture — bank SMS webhook (token auth, rate-limited)
 *  onExpenseCreated    Firestore groups/{gid}/expenses/{eid} created → push to the people in it
 *  onSettlementCreated Firestore groups/{gid}/settlements/{sid} created → push to the payee (and the payer, if someone else recorded it)
 *  onPushTokenCreated  Firestore users/{uid}/pushTokens/{id} created → drop the same browser token from other accounts
 *  onGroupDeleted      Firestore groups/{gid} deleted → delete its subcollections and receipts
 *  dailyReminders      Schedule every day 10:00 Asia/Kolkata → settle-up nudges (active groups only)
 *  fxDaily, fxMorning  Schedule weekdays 17:15 Europe/Berlin + daily 09:00 IST → shared ECB rates (fxRates/*)
 *  refreshFx           Callable { date? } → fetch + store ECB rates (throttled, per-user limit), any signed-in user
 *  parseReceiptAi      Callable { kind, image(s) } → bill / statement read by Gemini (own key, then project key)
 *  aiKey, aiModels, aiStatus  Callables: save/test/remove a user's Gemini key (sealed at rest), list models, AI availability
 *  nudge               Callable { groupId, memberId, amount? } or { items } (several groups, one push with the total) → push to someone who owes the caller (1 per pair per day)
 *  onPayLinkPaid       Firestore payLinks/{code} open → paid ("I've paid") → record the settlement in the group, push the payee
 *  adminStats, adminUsers, adminBlockUser  Callables (admins/{uid} only): usage counters + totals, account lookup, block / unblock
 */
export { capture } from './capture'
export { onExpenseCreated, onGroupDeleted, onPushTokenCreated, onSettlementCreated } from './triggers'
export { dailyReminders } from './reminders'
export { fxDaily, fxMorning, refreshFx } from './fx'
export { aiKey, aiModels, aiStatus, parseReceiptAi } from './ai'
export { nudge } from './nudge'
export { onPayLinkPaid } from './paylinks'
export { adminBlockUser, adminStats, adminUsers } from './admin'
