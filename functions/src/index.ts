/**
 * Split It Cloud Functions (2nd gen, Node 22, region asia-south1; see config.ts).
 *  capture             HTTPS  POST /api/sms, /api/capture — bank SMS webhook (token auth, rate-limited)
 *  onExpenseCreated    Firestore groups/{gid}/expenses/{eid} created → push to the people in it
 *  onSettlementCreated Firestore groups/{gid}/settlements/{sid} created → push to the payee
 *  dailyReminders      Schedule every day 10:00 Asia/Kolkata → settle-up nudges
 */
export { capture } from './capture'
export { onExpenseCreated, onSettlementCreated } from './triggers'
export { dailyReminders } from './reminders'
