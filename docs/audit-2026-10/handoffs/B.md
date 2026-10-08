# Handoffs from Track B (security, rules, functions, auto-capture, AI backend)

Each item: file, exact change, why. Everything below is already supported on B's side (rules, functions, shared modules), so the other track only has to wire its end.

## To A1 (data layer: src/data/repo.ts, src/data/firebaseRepo.ts, src/lib/balances.ts, src/lib/trust.ts)

### A1-1 repo.ts: AI results carry a reason (contract change, exact types)
`parseReceiptAi` now answers `{ unavailable: true, reason }` instead of a bare `{ unavailable: true }`, and `aiStatus` returns `app.perDay` (plus `globalPerDay`, `sealed` for admins). Please change the Repo contract to pass the reason through so the UI can show the right line (src/lib/ai.ts already handles both shapes and exports `unavailableText(reason, { limit })`):

```ts
import type { AiUnavailableReason } from '@/lib/ai-config'   // 'off' | 'not_listed' | 'not_configured' | 'quota' | 'bad_key' | 'server'

/** `{ receipt: null }` = not a bill; `{ unavailable, reason }` = AI can't be used (the app reads on the phone); null = offline / demo / the call itself failed. */
readReceiptAi(image: string, mimeType: string): Promise<{ receipt: ParsedReceipt | null } | { unavailable: true; reason?: AiUnavailableReason } | null>
readStatementAi(images: Array<{ image: string; mimeType: string }>, today: string): Promise<{ statement: AiStatement | null } | { unavailable: true; reason?: AiUnavailableReason } | null>

export interface AiStatusResult {
  admin: boolean
  app: { images: AppAiStatusValue; sms: AppAiStatusValue; model: string; perDay?: number; configured?: boolean; source?: AppKeySource | null; hint?: string | null; sealed?: boolean; globalPerDay?: number }
}
export interface AiModel { id: string; label: string; lite?: boolean }   // lite = cheap model (minimal thinking); the pickers can label the others "costs more"
export interface AiState { hint?: string; lastOkAt?: number; lastError?: { kind: 'bad_key' | 'quota' | 'model' | 'server' | 'billing' | 'blocked' | 'truncated'; at: number } }
```
In firebaseRepo `readReceiptAi` / `readStatementAi`: `return d.unavailable ? { unavailable: true, reason: d.reason } : { receipt: d.receipt ?? null }` (same for statement). localRepo keeps returning null / the sample.

### A1-2 firebaseRepo.removeMember: skip the invite write for joined members
Rules now accept the leaver's invite write when it only removes placeholder keys (tested: tests/firestore.hardening.test.ts "leaving a group"), so the current batch passes as-is. Still, a joined member's id is never in `invites/{code}.placeholders` (placeholdersOf filters uid-less members), so the write is a no-op: wrap it in `if (!m?.uid && group.type !== 'personal')` to save a write and keep the batch minimal.

### A1-3 firebaseRepo.deleteGroup: the server now does the recursive delete
`onGroupDeleted` (functions/src/triggers.ts) runs `recursiveDelete` on the group's subcollections and deletes `receipts/{gid}/` in Storage. The client can shrink to one batch: delete profiles the creator may delete? No — just `invites/{code}` (non-personal) + the group doc. Keep deleting the user's own `groups/{gid}/profiles/{me}` if you like; everything else is cleaned up server-side within seconds. Keep the current code path working until you make the change (it still passes the rules).

### A1-4 balances/trust: one implementation
`shared/balances-core.ts` holds `isBalancedExpense`, `pendingApprovers`, `isPendingApproval`, `netBalances(expenses, settlements, { members, asOf })` with the client's semantics (tests: shared/balances-core.test.ts). The functions already use it. When convenient: `export { isBalancedExpense } from '../../shared/balances-core'` in src/lib/balances.ts, and have `trust.ts`'s `pendingApprovers` delegate to it (same signature modulo `Pick<Group,'members'>` → pass `g.members`). Not urgent; the shared tests pin the semantics.

### A1-5 firebaseRepo capture paths (FYI, no change needed)
`watchCaptureLog` / `clearCaptureLog` live in src/lib/capture-settings.ts (B) and now read one document `users/{uid}/captureLog/recent`. Nothing in the repo touches captureLog.

## To A2 (src/App.tsx, src/lib/push.ts client side)
### A2-1 App.tsx: service-worker messages
public/push-sw.js posts `{ type: 'navigate', url }` (a same-origin path) to a focused/visible window on notification tap, and `{ type: 'push', data: { title, body, url, tag, badge } }` when a push arrives while a window is focused (non-iOS: no OS notification is shown then). Please: `navigator.serviceWorker?.addEventListener('message', …)` → `navigate` → `nav(url)`; `push` → show a toast / CaptureAlert with `data.body` linking to `data.url` (C3's CaptureAlert already shows captures; a toast is enough for the rest), and `setBadge(Number(data.badge))`.
### A2-3 App.tsx: validate the post-login return path (02-security L1)
`sessionStorage` 'splitit-return' is replayed with `nav(back, { replace: true })`; a path like `//evil.com/x` throws in `replaceState` (blank screen) and would be an open redirect through a non-replace nav. Guard both store and replay with `const safePath = (p: string | null) => (p && /^\/(?![\/\\])\S*$/.test(p) ? p : null)`, and only `nav(\`/capture${capture}\`)` when `capture.startsWith('?')`.
### A2-2 push.ts: badge
Pushes carry `data.badge` (pending captures + approvals, computed server-side); the SW sets it via `navigator.setAppBadge`. Your `setBadge(count)` from the Inbox count keeps it in step while the app is open.

## To C2 (Layout, icons)
### C2-1 public/badge-96.png
push-sw.js now uses `badge: '/badge-96.png'`: a 96×96 PNG, white mark on transparent (Android renders the alpha channel as a silhouette). Please generate it in scripts/generate-icons.mjs from the mark. Until it exists Android shows a blank badge, nothing breaks.
### C2-2 `archived`
Already in the rules whitelist (`groups.archived: bool`, any member may toggle; tested). The webhook, reminders and trip matching skip archived groups.

## To C3 (Settings, wizard, Share, AI settings)
### C3-1 Wizard copy for the "All my trips" scope (replaces "Debits outside every trip wait in the Inbox, without a notification.")
Exact sentence, conditional on `prefs.outsideTrips`:
- off (default): **"Matches any trip whose dates include the payment. Payments outside every trip are ignored. Want them in the Inbox instead? Turn on All bank & UPI payments in Settings → Auto-capture."**
- on: **"Matches any trip whose dates include the payment. Payments outside every trip wait in the Inbox as "outside any trip", without a notification."**
Also the step-5 summary line `'No trip matched: it waits in your Inbox'` is only true with `outsideTrips` on; otherwise say "No trip matched: it was ignored (All bank & UPI payments is off)".
### C3-2 New setting `aiSmsMerchant` (default off) — shared/capture-filters.ts, in AllPrefs already
Under the "Bank SMS the app can't read" switch, a second Switch: label **"Also ask Gemini who was paid"**, text **"When the app reads the amount but not the payee, the masked message is sent to Gemini for the name. Off: such payments are saved as "Payment"."** Save with `savePrefs(uid, { aiSmsMerchant })`. Rules accept it.
### C3-3 Share.tsx: typed rejection
`classifySharedText(parts, today, filters?)` in src/lib/capture.ts returns `{ outcome: 'capture', draft } | { outcome: 'ignored', kind | filtered } | { outcome: 'none' }`; `sharedTextIgnoredText(o)` gives the one-line copy ("That's money you received, not a payment."). Pass the user's prefs (`minAmount`, `ignoreWords` from watchPrefs) as `filters` so the share path applies the same filters as the webhook. `captureFromSharedText` keeps working (null for ignored).
### C3-4 AI copy by reason
`readReceipt()` now returns `reason` (and `notABill`) on a fallback; `unavailableText(reason, { limit: aiStatus.app.perDay })` and `isQuietReason(reason)` in src/lib/ai.ts give the copy: quiet reasons ('off', 'not_listed', 'not_configured') deserve no error tone. Needs A1-1 for the reason to arrive; until then `reason` is 'server' on failures.
### C3-5 Recent activity: `bad_scope`
`logResultText` already has the text ("Ignored: this key's trip no longer exists. Create a new key."), tone 'warn'. The key list can show the same line for keys whose group is gone.
### C3-6 Model picker
`aiModels()` entries now carry `lite: boolean`; show "Recommended (cheapest)" for lite ids and "costs ~10× more per bill" for the rest (12-ai M7).

## To E (tooling)
### E-1 functions/tsconfig.json `include`
Add the new shared files for honesty (tsc follows imports anyway): `../shared/ai-config.ts`, `../shared/money-core.ts`, `../shared/trips.ts`, `../shared/balances-core.ts`.
### E-2 tests/storage.receipts.test.ts (3 failures here, environment only)
The three membership-positive cases fail in this sandbox because the Storage rules runtime's cross-service lookup (`firebase-tools/lib/emulator/storage/rules/runtime.js` → `fetchFirestoreDocument`) does `GET http://127.0.0.1:8080/v1/projects/demo-splitit/databases/(default)/documents/groups/g1` through the container's agent proxy, which answers `502 "refusing to forward injected credentials over non-TLS port"` (see `scratchpad/storage-debug.log` lines 76–78). The runtime maps that to NOT_FOUND, the rule sees `null.data`, hence "Null value error" at storage.rules line 14. Verified independent of my `isUser()` change (same result with the pre-change guard, with hosts pinned to 127.0.0.1, and with NO_PROXY set). Nothing to change in the test or the rules; in CI (no proxy) it should pass. If you want the lead's local sweep green here, the only lever is running that one file with `HTTPS_PROXY= https_proxy= npm run test:rules` (the emulators need no outbound network once the jars are cached).

## To the lead
- `firestore.indexes.json` now has a field override (collection-group `pushTokens.token`): deploy indexes before functions.
- New secret `AI_KEY_KEK` (docs/FIREBASE_SETUP.md §5a/§5d): generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
- Security headers in firebase.json are Report-Only CSP; promote after a week of console checks.
