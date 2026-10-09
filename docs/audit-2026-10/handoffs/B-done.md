# Track B — done (security, rules, Cloud Functions, auto-capture backend, AI backend)

All of this is in the lead's checkpoint commits (`aed6be9` and earlier); nothing is uncommitted except the three small test/firebase.json edits made after that checkpoint. Requests to other tracks are in `B.md`.

## What changed

### Rules and hosting
- `firestore.rules`: `isUser()` (signed in and not anonymous) everywhere except `tables/*` and `fxRates/*`; `config/*` is admin-get only (no list); group create/update validate the whole document (`validGroupShape`: key whitelist incl. `archived`, name ≤ 80, emoji ≤ 16, known `type`, 3-letter currency, ≤ 60 members and memberUids, typed dates/budget/threshold) and `creatorPolicy()` (only the creator changes `requireApproval` / `approvalThreshold`); invite codes ≥ 8 on the group and the `invites/{code}` id; joins cap member names at 60 and memberUids at 60; expenses check `description` ≤ 200, `notes` ≤ 2000, `paidBy`/`splits` maps ≤ 60, `receiptUrl` https ≤ 1024, `receiptPath` matching `receipts/<gid>/[A-Za-z0-9_.-]+`; settlements `method` ≤ 40, `note` ≤ 500; settings whitelist gains `aiSmsMerchant`; `config/ai` gains `globalPerDay` (1..100000); `captureInbox` may carry an int `createdAt` (for a TTL policy); the leave-group batch passes: `isLeaverCleanup()` lets a member who is in the group before the batch and not after remove placeholder keys from the invite (nothing added or renamed).
- `storage.rules`: `isUser()`, `contentType.matches('image/(jpeg|png|webp|heic|heif)')` for receipts and avatars.
- `firebase.json`: identical security headers on both sites (X-Content-Type-Options, Referrer-Policy strict-origin-when-cross-origin, X-Frame-Options DENY, Permissions-Policy camera=(self) only, COOP same-origin-allow-popups, Content-Security-Policy-Report-Only listing every origin the code uses), `/*-sw.js` no-cache (covers share-target-sw.js); emulator hosts pinned to 127.0.0.1 (no IPv6 here).
- `firestore.indexes.json`: collection-group index on `pushTokens.token`.

### Shared modules (pure, used by both bundles)
- `shared/sms-parse.ts`: the audited parser patch applied verbatim (0/39 probe failures, see `scratchpad/parser-probe`), plus `isBankLikeSms()`, masking of 7+ digit account numbers and the user's phone number, `'transfer'` kind (UPI Lite / wallet top-ups). Tests: the 39 probe strings folded into `shared/sms-parse.test.ts`.
- New `shared/money-core.ts` (`minorDigitsOf`, `currencyFromAmount`, `sanitiseRef`, `fingerprint`), `shared/trips.ts` (`rankGroupsForCapture`, `pickTrip` with the client's currency tie-break, `pausedTrip`, `matchScoped`; archived groups never match), `shared/balances-core.ts` (`isBalancedExpense`, `pendingApprovers`, `isPendingApproval`, `netBalances` with the app's pending-approval semantics), each with tests.
- `shared/capture-filters.ts`: `aiSmsMerchant` pref (default false), `bad_scope` log result + copy, transfer wording, `CAPTURE_LOG_DOC`.
- `shared/ai-config.ts`: `DEFAULT_MODEL = 'gemini-3.5-flash-lite'`, `FALLBACK_MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest']` (verified against ai.google.dev/gemini-api/docs/models and /deprecations on 2026-10-08), `globalPerDay` (default 2000), `AiUnavailableReason`, `usefulModels` returns `lite` and sorts cheap models first.

### Cloud Functions
- `capture.ts`: per-IP in-memory limiter (60/min/instance), 16 KB body cap (413), 5-minute negative cache of unknown tokens, `maxInstances: 3, concurrency: 20`; `writeLog` → one document `users/{uid}/captureLog/recent` (transaction, capped array); `lastUsedAt` at most once a minute; Gemini only for bank-looking messages, only `maskSms()` text, only when unparsed (or payee missing and `aiSmsMerchant` on and no VPA); scoped key whose group is gone → `bad_scope` (200), never "all trips"; `pickTrip` with currency; dedupe without a ref by the masked text.
- `ai.ts`: keys sealed with AES-256-GCM under `defineSecret('AI_KEY_KEK')` (`lib/seal.ts`; `"<new>,<old>"` list for rotation; legacy plaintext read and re-sealed on next use; both `users/{uid}/secrets/gemini` and `private/geminiAppKey`); `allow()` writes only when allowed or the window rolled; shared key checks `stats/ai_{day}.app < globalPerDay`; denials counted (`denied_app`, `denied_app_global`, `denied_own`); `aiKey` uses `ai_keycheck_{uid}`; `withAi` returns `{ unavailable: true, reason }` with the most actionable reason; `blocked` → `receipt: null`; callables trust the email only when `email_verified`; `aiReadSms` likewise; `today` clamped to ±2 days; receipts accept up to 3 images; `record()` awaited and counts tokens; `aiStatus` returns `perDay` (+ `sealed`, `globalPerDay` for admins); IST day via `Intl`. `looksLikeGeminiKey`, `cleanKey`, `aiKey(which:'app')` kept.
- `lib/gemini.ts`: `systemInstruction` support (prompts separated from data; SMS wrapped in `<sms>` with an "untrusted data" line), `finishReason`/`promptFeedback` handling (`blocked`), `MAX_TOKENS` → retry once with double budget then `truncated`, one retry on 429/500/503/504, 403-about-the-model → next model, leaked key → `bad_key`, 402/FAILED_PRECONDITION → `billing`, `usageMetadata` returned.
- `push.ts`: tokens by `lastSeen desc` (20), stale > 90 days deleted, `invalid-argument` about the token treated as dead, `urgency` per note (reminders `normal`), `data.badge` = pending captures (count query) + approvals awaiting the user (bounded).
- `triggers.ts`: recipients filtered by `memberUids` (push-spam fix), "needs your approval" only for people who have to approve, debtor-side `settlementRecordedNote` when someone else records "X paid me", `onPushTokenCreated` (collection-group dedupe), `onGroupDeleted` (`recursiveDelete` + `receipts/{gid}/` in Storage).
- `reminders.ts`: only groups with `updatedAt` in the last 36 h or `reminderState.hasCandidates`, `getAll` with field masks, projected subcollection reads, 10 at a time, candidate memory (`evaluateReminders`: a nudge is about a debt over the threshold for 7 real days; first run keeps the old createdAt-based age so nothing is delayed), 80 %-budget early stop, `retryCount: 1`.
- `fx.ts`: per-user 30/h, 200/day; anonymous guests only `latest`.
- `index.ts`: exports the two new triggers.
- `lib/balances.ts`, `lib/trips.ts`, `lib/request.ts`, `lib/capture-core.ts` (currency inference from money-core, `bad_scope`, `sms` carried on the interpretation), `lib/ids.ts`, `lib/recipients.ts` (`memberUids`, `memberUid()`), `lib/notify-text.ts`.

### Client files I own
- `src/lib/capture.ts`: trip helpers and `currencyFromAmount`/`sanitiseRef` re-exported from `shared/`; `classifySharedText()` runs shared text through `parseBankSms` + `maskSms` + the user's filters (credits/OTPs/transfers refused with copy via `sharedTextIgnoredText()`, dedupe by bank ref or masked-text fingerprint); `captureFromSharedText` keeps its signature.
- `src/lib/capture-settings.ts`: `watchCaptureLog` / `clearCaptureLog` read and delete the single log document; `logRowsOf()`.
- `src/lib/sms-setup.ts`: `bad_scope` reason + copy, tighter `ANDROID_FILTER_REGEX` (needs a bank marker), more `DEBIT_KEYWORDS`.
- `src/lib/ai.ts`: `ReceiptAiResult`, `unavailableText(reason, { limit })`, `isQuietReason`, `readReceipt()` returns `reason` / `notABill`.
- `public/push-sw.js`: title 'Split Now', `/badge-96.png`, same-origin path guard, app badge from `data.badge`, hand-off to a focused window (non-iOS) instead of an OS notification, tap → `postMessage({ type: 'navigate', url })` else `openWindow`.
- Docs: `docs/FIREBASE_SETUP.md` (asia-south1, function table, secrets incl. `AI_KEY_KEK` + rotation, §5d AI, security headers, index, rules summary, anonymous guests), `docs/AUTO_CAPTURE.md` (parser coverage, guards, dedupe, Gemini masking and gating, `bad_scope`, outside-trip behaviour, log document, share path, regex, `aiSms`/`aiSmsMerchant` rows).

## Verified
- `npx tsc -b` exit 0 (root) and `tsc --noEmit -p functions` exit 0.
- `npx vitest run`: 54 files, 813 tests green (whole repo, incl. other tracks' files at the time).
- `npm run test:rules`: 171 of 174 pass. The 3 failures are all in E's new `tests/storage.receipts.test.ts`, every case that needs `firestore.get()` to find the seeded group. Root cause (from a `--debug` run, `scratchpad/storage-debug.log`): the Storage rules runtime's `fetchFirestoreDocument` (firebase-tools 15.32.1) sends `GET http://127.0.0.1:8080/v1/projects/demo-splitit/databases/(default)/documents/groups/g1` through this container's agent proxy, which refuses it with `502 "refusing to forward injected credentials over non-TLS port"`; the runtime treats that as NOT_FOUND and the rule hits `null.data` ("Null value error", storage.rules line 14). Not caused by my change: the same three fail with the pre-change `request.auth != null` guard, with emulator hosts pinned to 127.0.0.1, and with NO_PROXY covering localhost. Negative cases (SVG, PDF, oversize, outsiders) pass. In CI without the proxy the file should pass unchanged; locally, `HTTPS_PROXY= https_proxy= npm run test:rules` is the workaround (noted in B.md E-2).
- `npm run test:functions`: 13 of 13 pass (new cases: single log document without SMS text, transfer → `not_a_debit`, `A$12.50` → AUD, `bad_scope`, same card alert without a ref captured once, 413 on a 20 KB body).
- Parser probe re-run against the live `shared/sms-parse.ts`: 0 of 39 fail.
- `node --check public/push-sw.js`.

## Deliberately left out (and why)
- Member emails inside `groups/*.members` (02 M7): `Join.tsx` (C2) still writes them; forbidding them in rules would break joining today. Follow-up once the UI drops the field.
- Firestore TTL policies (console settings) for `captureInbox.createdAt` and `rateLimits/*`: the rules now allow the field; the policy itself is a console action, noted in B.md for the lead.
- Auth `onDelete` cascade (purge `users/{uid}/**`, tokens) needs a v1 trigger import; not in the plan, left for phase 2.
- `aiSms` default stays on (plan said mask + gate, not flip); the owner may still decide to default it off (12-ai H4). With masking and the bank-marker gate, personal texts never leave the project.
- Quiet hours / per-device timezone, statement de-dup by time (12-ai M9), multi-image receipts on the client: not in the plan.
- `functions/tsconfig.json` include list (E owns): tsc follows imports, so the new shared files compile anyway.
- Client-side `email` in `users/*`: untouched.

## Decisions the owner should know
- Default AI model is now `gemini-3.5-flash-lite`; 2.5 is only a fallback for keys that still have it. `usefulModels` marks `lite` models so the pickers can warn that full Flash models cost ~10× per bill.
- Without `AI_KEY_KEK` the functions keep storing keys as before and log one warning; set the secret before enabling AI for others (FIREBASE_SETUP §5a/§5d).
- The shared key has a project-wide budget (`globalPerDay`, default 2000 calls/day) on top of per-user limits.
- The capture webhook now runs with `maxInstances: 3, concurrency: 20` (SMS volume never needs more); a scoped key to a left/deleted group is dead (`bad_scope`) instead of silently widening to every trip.
- `pickTrip` on the server now breaks ties by currency like the app, so prompt and Inbox card agree.
- Security headers ship with CSP in report-only mode; promote after a week of console checks (steps in FIREBASE_SETUP).
- Reminders: the first run after deploy still uses the old "age from createdAt" heuristic so existing debts aren't delayed a week; from then on the clock is the day the debt went over the threshold.
