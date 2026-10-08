/**
 * Split It Cloud Functions (2nd gen, Node 22, region asia-south1; see config.ts).
 *  capture             HTTPS  POST /api/sms, /api/capture — bank SMS webhook (token auth, rate-limited)
 *  onExpenseCreated    Firestore groups/{gid}/expenses/{eid} created → push to the people in it
 *  onSettlementCreated Firestore groups/{gid}/settlements/{sid} created → push to the payee
 *  dailyReminders      Schedule every day 10:00 Asia/Kolkata → settle-up nudges
 *  fxDaily, fxMorning  Schedule weekdays 17:15 Europe/Berlin + daily 09:00 IST → shared ECB rates (fxRates/*)
 *  refreshFx           Callable { date? } → fetch + store ECB rates (throttled), any signed-in user
 *  parseReceiptAi      Callable { kind, image(s) } → bill / statement read by Gemini (own key, then project key)
 *  aiKey, aiModels, aiStatus  Callables: save/test/remove a user's Gemini key, list models, AI availability
 */
export { capture } from './capture'
export { onExpenseCreated, onSettlementCreated } from './triggers'
export { dailyReminders } from './reminders'
export { fxDaily, fxMorning, refreshFx } from './fx'
export { aiKey, aiModels, aiStatus, parseReceiptAi } from './ai'
