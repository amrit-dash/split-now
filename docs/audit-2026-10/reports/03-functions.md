# 03 — Cloud Functions: correctness, robustness, cost

## 1. Summary

I read every file under `functions/` (src, src/lib, test, build.mjs, package.json, tsconfig.json), `shared/*.ts`, the `functions` block of `firebase.json`, `vitest.functions.config.ts`, `docs/PLAN.md` §4.0 and `docs/AUTO_CAPTURE.md`, and compared the server copies of balance / trip / prefs / id / money logic with their client counterparts in `src/lib`. I ran `tsc --noEmit` in `functions/` (clean), the 5 pure test files (117 tests, all pass), and an esbuild bundle to the scratchpad to measure cold-start weight (78 KB bundle, ~590 ms to `require` in a fresh Node 22 process, of which `firebase-admin/firestore` is ~390 ms, `auth` ~190 ms, `messaging` ~110 ms). The code is small, deliberately pure where it matters, and well tested at the unit level. **Verdict: no data-corrupting bug, but three things need fixing before the user base grows: (a) `dailyReminders` is an unbounded sequential full scan whose cost grows with the total number of expenses in the project and whose tail silently stops being processed at the 540 s timeout; (b) the server's balance maths disagrees with the client's (pending-approval expenses are counted on the server, excluded on the client), so reminders can nag people about money the app itself says they don't owe yet; (c) every webhook request pays ~31 billed Firestore reads for an `offset()` log-trimming query, which at realistic SMS volumes dwarfs every other per-request cost.** A handful of medium items (currency inference on the structured capture path, no global cap on the shared Gemini key, unmasked SMS sent to Gemini, plaintext user API keys) and a list of duplicated-logic drift complete the picture.

Severity scale: Critical = money or data wrong for users today; High = wrong/expensive at modest scale or a real abuse vector; Medium = correctness drift or avoidable cost; Low = hygiene.

---

## 2. Findings

### HIGH

#### H1. `dailyReminders` is an O(all expenses in the project) sequential scan; at scale the tail of groups is never processed
**Files:** `functions/src/reminders.ts:14-46`, `functions/src/lib/balances.ts:27-41, 57-79`, `docs/PLAN.md` §4.0 (line 183: "If groups grow large, replace the reminder scan with a maintained balance doc").

**What:** Every day the function does `db().collection('groups').get()` (L18), then for every shared group reads **all** expenses and **all** settlements (`gs.ref.collection('expenses').get()` / `settlements.get()`, L24-25) plus `reminderState/{gid}`, computes two full net-balance passes, and only then checks prefs. Groups are processed one after another (`for … await`, L20-43) with no parallelism, no projection (`select()`), no pagination and no gate on activity. `retryCount: 0`, `timeoutSeconds: 540`.

**Cost curve** [Certain for the read counts, Likely for prices]: reads/day ≈ N_groups × (E + S + 2) + 2 per nudge, where E/S are *total* (live + trashed + approved + pending) docs per group, since nothing is filtered server-side.
| groups | avg expenses+settlements | reads/day | reads/month | ≈ $/month at $0.03–0.06 per 100k |
|---|---|---|---|---|
| 20 | 200 | 4k | 120k | $0 (free tier 50k/day) |
| 500 | 300 | 150k | 4.5M | $1.4–2.7 |
| 2,000 | 300 | 600k | 18M | $5–11 |
| 10,000 | 300 | 3M | 90M | $27–54 |
Wall-clock is the worse problem: ~3 round trips per group at ~100–150 ms in-region → 1,000 groups ≈ 2–3 min, 5,000 ≈ 10–15 min > 540 s. The scan order is Firestore's default (document id) and identical every day, so once the job times out **the same tail of groups never gets a reminder**, with no error for most of them (the function is just killed). `logger.info('reminders done')` on L44 never runs, which is at least a detectable symptom.

**Why it matters:** This is the only unbounded operation in the backend; it turns a per-user product into a per-project cost, and it fails silently and deterministically for the same users.

**Fix (recommended, server-only, no rules/client change): activity-gated incremental evaluation with candidate memory.**
1. Keep exact maths but only re-evaluate groups that changed or already had a candidate debtor:
   ```ts
   // reminders.ts
   const since = now - DAY - 3_600_000                                   // yesterday with slack
   const [active, pending] = await Promise.all([
     db().collection('groups').where('updatedAt', '>', since).select('type','memberUids','members','currency','name','emoji').get(),
     db().collection('reminderState').where('hasCandidates', '==', true).select().get(),
   ])
   const ids = new Set([...active.docs.map(d => d.id), ...pending.docs.map(d => d.id)])
   ```
   `updatedAt` is already bumped by every client write (`src/data/firebaseRepo.ts:451, 460, 566`), and single-field inequality needs no composite index. Idle groups with nobody over the threshold cost **zero** reads.
2. Store per-group candidate state in `reminderState/{gid}`: `{ lastSent: {uid: ts}, candidates: { [memberId]: sinceTs }, hasCandidates: boolean, evaluatedAt }`. On each evaluation: for members over the threshold, `candidates[m] ??= now`; for members at/below, delete. Nudge when `now - candidates[m] >= minAgeDays*DAY` and cooldown allows. This replaces the `thenNet` "balance as of createdAt − 7 days" pass (`balances.ts:67`), which is also subtly wrong today: an expense *edited* yesterday to add a large share is treated as 10 days old because `createdAt` is unchanged, and a debt that was briefly settled and re-incurred is not distinguished.
3. Process groups in parallel chunks (`Promise.all` over 10 at a time) and project fields: `.select('amount','paidBy','splits','createdAt','deletedAt','requiresApproval','approvals','createdBy')` cuts bandwidth and memory (not billed reads).
4. Raise `timeoutSeconds` (gen-2 scheduled functions are HTTP under the hood and accept up to 3600 [Likely]), set `retryCount: 1`, and `logger.warn` when `Date.now() - start > 0.8 × timeout` so a near-timeout is visible.
5. Optional, for exactness under heavy load: per-group `lastEvaluatedAt`; if `group.updatedAt <= lastEvaluatedAt` and the group has no candidates, skip even when it appears in `pending`.

**Alternative A (client-maintained summary):** write `groups/{gid}/meta/balances.net` with `FieldValue.increment` deltas in the same batch as each expense/settlement (`saveExpense` L446-455, `saveSettlement` L561-569, delete/restore/approve paths). Increments are commutative so concurrent members don't race. Rules can't verify an increment against the expense in the same batch without heavy `getAfter` gymnastics, so treat it as a *gate*: the server trusts it only to select candidate groups, then recomputes exactly (as in the fix above). More client surface, same server logic — do this only if you also want balances for list views.
**Alternative B (server-maintained summary):** `onDocumentWritten` triggers on expenses and settlements that recompute the group net (E+S reads per write, idempotent under at-least-once redelivery because it's a full recompute, unlike increments). Moves cost from "all groups daily" to "active groups per write"; fine for this product's write rates (~50 expenses/week/group) but the reminder job still needs candidate memory for the 7-day rule.

#### H2. Server balance maths counts expenses the client excludes (pending approval) → false "you owe ₹X" nudges and share lines
**Files:** `functions/src/lib/balances.ts:27-41` (no `requiresApproval`/`approvals` check), `src/lib/trust.ts:40-60` (`pendingApprovers`, `isPending`, `countedExpenses` exclude them), `src/lib/balances.ts:31-43` (client `netBalances` is fed `countedExpenses`), `functions/src/reminders.ts:29-36`, `functions/src/triggers.ts:41-44`. [Certain]

**What:** In a group with `requireApproval`, an expense above the threshold is listed but **left out of balances until everyone charged approves** (PLAN §3.3b, `trust.ts:50-51`). The server's `netBalances` has no notion of this, so `reminderTargets` can report someone as owing > ₹500 for > 7 days purely on the strength of an unapproved (possibly disputed) expense, and the push says "Friendly nudge: you owe ₹1,240…" while the app's balance screen shows ₹0. The same `ExpenseLite` shape omits `requiresApproval`, `approvals`, `createdBy`, so the information isn't even loaded.

**Fix:** make the balance core shared (see M7) and give it the client's semantics. Minimal server patch:
```ts
// functions/src/lib/balances.ts
export interface ExpenseLite { amount: number; paidBy?: Record<string, number>; splits?: Record<string, number>; createdAt?: number; deletedAt?: number; requiresApproval?: boolean; approvals?: Record<string, true>; createdBy?: string }
export const isPendingApproval = (e: ExpenseLite, members: Record<string, { uid?: string }>) =>
  e.requiresApproval === true && Object.entries(e.splits ?? {}).some(([id, v]) => { const u = members[id]?.uid; return v > 0 && !!u && u !== e.createdBy && !e.approvals?.[u] })
export function netBalances(expenses, settlements, members, asOf = Infinity) { … if (… || isPendingApproval(e, members)) continue … }
```
and pass `g.members` from `reminders.ts`. Add a unit test mirroring `trust.ts` (`isPending` true → excluded). While here: the expense push (`triggers.ts:43`) appends "needs your approval" to **every** recipient including payers who have nothing to approve; use `needsApproval: e.requiresApproval === true && r.share > 0 && !e.approvals?.[r.uid]`.

#### H3. Every webhook request pays ~31 billed reads + a delete batch to trim `captureLog`
**Files:** `functions/src/capture.ts:70-84` (`writeLog`), `:99` (called on every reject), `:159` (and on success), `shared/capture-filters.ts:120` (`CAPTURE_LOG_KEEP = 30`), `src/lib/capture-settings.ts:80-95` (client reads the last 10 and clears by deleting rows).

**What:** After `col.add(entry)`, `writeLog` runs `orderBy('at','desc').offset(30).limit(20).select().get()`. Firestore bills a document read for every document **skipped by `offset()`** as well as every document returned [Likely — Firestore pricing docs, "offset" note; verify, but the fix is cheaper regardless]. Once a user has 30 entries (after a day or two of SMS), every processed request costs 1 write + ≥31 reads + up to 20 deletes, and the log is written for `not_a_debit` too — i.e. for every OTP / balance / promo SMS a "Message contains Rs" automation forwards (AUTO_CAPTURE §3.7 recommends exactly that filter). 20 forwarded SMS/day/user ≈ 650 reads/user/day; 1,000 users ≈ 650k reads/day ≈ $6–12/month, and 5,000 users ≈ $30–60/month, for a 30-row debugging aid. This is larger than the reminder scan at small-to-mid scale.

**Fix:** store the log as one document, `users/{uid}/captureLog/recent = { entries: CaptureLogEntry[] }`, trimmed in a transaction (1 read + 1 write, no deletes):
```ts
async function writeLog(userRef, entry) {
  if (!entry) return
  const ref = userRef.collection('captureLog').doc('recent')
  await db().runTransaction(async (t) => {
    const prev = ((await t.get(ref)).get('entries') as CaptureLogEntry[] | undefined) ?? []
    t.set(ref, { entries: [entry, ...prev].slice(0, CAPTURE_LOG_KEEP), updatedAt: entry.at })
  }).catch((e) => logger.warn('capture log', e))
}
```
Client: `watchCaptureLog` subscribes to that one doc (`entries.slice(0, limit)`), `clearCaptureLog` deletes it (rules already allow owner delete, `firestore.rules:62-65`). A 30-entry array is ~3 KB. If you want to keep per-row docs, at minimum (a) don't trim on every call — trim only when `Math.random() < 0.1` or when the entry count in a counter field exceeds 40, and (b) use a cursor (`startAfter(entries[29].at)`) instead of `offset`. Update AUTO_CAPTURE §3.6 (line 153) accordingly.

---

### MEDIUM

#### M1. Structured-amount captures lose the currency the contract promises to infer (`A$12.50` → ₹12.50)
**Files:** `functions/src/lib/capture-core.ts:47, 64-67` (`CURRENCY_HINTS` = INR/USD/EUR/GBP/AED only), `functions/src/lib/request.ts:100` (`raw` accepted as alias for `amount`), `src/lib/capture.ts:54-73` (`SYMBOLS`/`currencyFromAmount` knows A$, NZ$, C$, S$, ¥, Rp, ฿ and any ISO code), `docs/AUTO_CAPTURE.md:61` ("same meaning as the /capture URL contract (§6)") and `:255` ("inferred from amount/raw (A$, €, NZ$, USD…)"). [Certain]

**What:** A POST to `/api/capture` with `{ token, amount: "A$12.50", merchant: "Cafe" }` and no `currency` resolves `currency = 'INR'` on the server and `parseAmountMinor("A$12.50", 'INR') = 1250` paise. The client-side path for the identical string yields AUD 1250 cents. Same for `S$`, `NZ$`, `¥`, `฿`, `Rp`, and for bare codes like `"12.50 SGD"`.

**Fix:** move `currencyFromAmount` (and its `SYMBOLS` table) to `shared/money-core.ts` next to `minorDigitsOf` and use it in `interpret()` in place of `CURRENCY_HINTS`. Also pass the detected currency into `parseAmountMinor` only after detection (it already does). Add a test: `interpret({amount:'A$12.50', merchant:'x'})` → `{ amount: 1250, currency: 'AUD' }`.

#### M2. No global cap on the shared Gemini key; per-user quota writes on every denied call
**Files:** `functions/src/ai.ts:55-62` (`allow`), `:81-100` (`withAi`), `:87` (limits per user only), `shared/ai-config.ts:34` (defaults `perDay: 100, perHour: 30`), `functions/src/ai.ts:64-75` (`record` already keeps `stats/ai_{day}.app`).

**What:** With `config/ai.mode = 'everyone'`, every signed-in (non-anonymous) account may spend `perDay` calls on the project key; N accounts × 100 calls × (images are the expensive kind) is the only ceiling, and creating accounts is free. There is no project-wide daily budget. Separately, `allow()` does `tx.set(ref, r.next)` even when `allowed === false` (L59), so a client in a tight loop costs a Firestore write per denied call.

**Fix:** (a) add `appDailyMax` to `AppAiConfig` (default e.g. 2,000) and check `stats/ai_{day}.app < appDailyMax` inside `withAi` before trying the `app` plan (one read; the doc is already written by `record`); when exceeded, skip the plan and log once. (b) In `allow`, only write when allowed, or when the window rolled over (`r.next.hourStart !== prev.hourStart`). (c) `aiKey` (L163) uses the same counter doc `ai_own_{uid}` with different limits (20/h) as real AI calls (120/h): after ~20 AI calls in an hour a user can't save or test a key ("Too many tries"). Use a separate id, e.g. `ai_key_${uid}`.

#### M3. Unmasked bank SMS text is sent to Gemini; `aiSms` defaults to on and fires for cosmetic merchant enrichment
**Files:** `functions/src/capture.ts:108-116`, `functions/src/ai.ts:233-244` (`aiReadSms` → `text.slice(0, 1000)`), `shared/capture-filters.ts:29` (`aiSms: true` default), `shared/sms-parse.ts:363` (`maskSms` exists and is used for storage, L88 of capture-core).

**What:** The webhook stores only `maskSms(text)` (account/card/phone digit runs masked — AUTO_CAPTURE §3.5), but the AI fallback sends the **raw** message, including account suffix, available balance and phone numbers, to Google. The fallback also runs for every *successfully parsed* debit that merely lacks a merchant (`it.ok && !it.parsed.merchant`, L108), which (a) adds an Auth `getUser` call (ai.ts:235), 3 Firestore reads (`loadCtx`), a rate-limit transaction and 2–3 writes, plus up to 12 s of latency to the webhook for a nicer label, and (b) spends shared-key quota on it.

**Fix:** pass `maskSms(req.text, 1000)` to `readSms` (the model does not need the balance or account number to find amount/merchant); restrict the enrichment path to `!it.ok && it.reason === 'unparsed'` or make merchant enrichment opt-in (`prefs.aiSmsMerchant`); cache the email lookup by reading `users/{uid}.email` (already in the profile doc, `UserProfile.email`) instead of `auth().getUser`. Consider `aiSms` default `false` when the only available key is the shared one (the user never explicitly chose to send SMS to a third party).

#### M4. User-supplied Gemini keys are stored in plaintext in Firestore
**Files:** `functions/src/ai.ts:182` (`secretRef(uid).set({ key, hint, savedAt })`), `firestore.rules:30-32` (client access denied — good).

**What:** Rules keep clients out, but the key is readable by anyone with console/IAM access, appears in exports/backups, and sits next to user data. The security lens probably covers this; from the functions side the cheap mitigation is envelope encryption with a project secret.

**Fix:** derive a per-project data key from a second Secret Manager secret (`AI_KEY_WRAP`, 32 random bytes) and store `aes-256-gcm` ciphertext + iv + tag via `node:crypto` (`createCipheriv`), decrypting in `loadCtx`. Keep `hint` in `aiState/status` (already there) so the UI doesn't need the secret doc. Rotate by re-encrypting on next successful use.

#### M5. Public `capture` endpoint: a Firestore read per request before any rate limit
**Files:** `functions/src/capture.ts:88-93` (token lookup first), `:56-64` (rate limit after), `:168` (`invoker: 'public', maxInstances: 10, concurrency: 40`).

**What:** `isTokenShaped` rejects junk for free, but any well-formed 24–64-char string costs one `captureTokens/{token}` read and returns 401. 400 concurrent slots × fast 401s ≈ millions of billed reads/day from one script. The per-token limiter can't help since the token is invalid.

**Fix:** (a) in-memory per-instance limiter keyed by `req.ip` (a `Map<ip, {count, windowStart}>`, say 60/min) applied before the lookup — cheap and good enough at this scale; (b) negative-cache unknown tokens in the same map for 5 min; (c) `maxInstances: 2–3` is plenty for SMS volume; (d) longer term, Cloud Armor on the Hosting → Cloud Run path. Also `tokenSnap.ref.update({ lastUsedAt })` (L96) is a write on every valid request; throttle to once per 10 min (`if (now - (tokenSnap.get('lastUsedAt') ?? 0) > 600_000)`).

#### M6. `refreshFx` has no per-caller limit and accepts anonymous callers; client timeouts are shorter than the server's worst case
**Files:** `functions/src/fx.ts:52-84`, `functions/src/lib/fx-core.ts:80-93` (two 10 s fetches), `src/lib/fx.ts:98` (`SHARED_TIMEOUT_MS = 8000`), `src/data/firebaseRepo.ts:787` (`callable('refreshFx', 15_000)`).

**What:** Any signed-in user including table guests (anonymous) can call `refreshFx({date})` for ~7,000 distinct past dates, each an external fetch to Frankfurter plus 1–2 writes; `maxInstances: 5` bounds concurrency, not volume. The throttle only covers `latest`. Not expensive for us, but it's an amplification vector against a free public API and the only callable without `applyRateLimit`. Separately, the client gives up after 8 s (`within`) while the server may legitimately take up to ~20 s (v2 timeout then v1) — the server still stores the result, so the next lookup succeeds; just be aware the "refresh" button can report failure on a success.

**Fix:** reuse `applyRateLimit` with doc `rateLimits/fx_${uid}` (e.g. 30/h, 200/day); for anonymous callers allow only the `latest` path. Lower `fetchEcb` per-call timeout to 6 s so v2+v1 fit in the client's 15 s. Weekend aliasing logic itself (`refreshWrites` L125-131) is correct and well tested; the v2 response shape `[{date, base, quote, rate}]` and `providers=ECB` are asserted in comments only [Guessing — cannot verify offline], but the v1 fallback makes a v2 drift self-healing.

#### M7. Duplicated logic between `functions/src/lib` and `src/lib` has already drifted; move it to `shared/`
[Certain for each item]
| Logic | Server | Client | Drift |
|---|---|---|---|
| Balance core | `functions/src/lib/balances.ts:23-41` | `src/lib/balances.ts:12-43` + `src/lib/trust.ts:58-61` | server ignores pending approval (H2) |
| Trip pick | `functions/src/lib/trips.ts:30-34` (`pickTrip`: tightest → `updatedAt`) | `src/lib/capture.ts:250-265` (`rankGroupsForCapture`: tightest → **same currency** → `updatedAt`) | AUTO_CAPTURE §2 L25 documents the client order; the webhook (and the wizard's demo simulation, `AutoCaptureSetup.tsx:518`) can pick different groups for the same SMS |
| Currency from amount | `capture-core.ts:47` (5 hints) | `src/lib/capture.ts:54-73` | M1 |
| `minorDigits` | `functions/src/ai.ts:228`, `functions/src/capture.ts:192`, `shared/sms-parse.ts:47` | `src/lib/money.ts:14` | 4 copies of the same Intl call |
| Notification/push prefs defaults | `functions/src/lib/prefs.ts:26-33` | `src/lib/push.ts:15-36` | identical today; nothing enforces it |
| `sanitiseRef` | `functions/src/lib/request.ts:112-115` | `src/lib/capture.ts:49-52` | identical today |
| IST day | `functions/src/lib/time.ts:3-8` (Intl) | `functions/src/ai.ts:36` (`+5.5h` hack) | two implementations inside the same package |
| Capture id | `functions/src/lib/ids.ts:13-18` (`sms_` + sha256) | `AutoCaptureSetup.tsx:514` (`sms_${ref}`), `/capture` page uses `ref` as doc id | a payment arriving via webhook and via share-sheet/link never dedupes; demo ids differ from prod |

**Fix:** create `shared/balances-core.ts` (`isBalancedExpense`, `isPendingApproval`, `netBalances(expenses, settlements, members)`), `shared/trips.ts` (`hasTripWindow`, `inTripWindow`, `rankGroupsForCapture`, `pickTrip = ranked.best`, `pausedTrip`, `matchScoped`), `shared/money-core.ts` (`minorDigitsOf`, `currencyFromAmount`, `sanitiseRef`), `shared/prefs.ts` (`DEFAULT_PREFS`, `resolvePrefs`, `resolveCapturePrefs`), and have both `src/lib/*` and `functions/src/lib/*` re-export them exactly as `src/lib/sms-parse.ts` already does. Add the new files to `functions/tsconfig.json` `include` (line 17 lists only two of the three shared files already imported — `ai-config.ts` is missing; harmless because tsc follows imports, but keep it honest). `shared/` must stay free of `@/types` and DOM imports; type the inputs structurally (`Pick<…>`), as `trips.ts` already does. For the capture id, expose the hashing as `captureIdFor` using Web Crypto `subtle.digest` (async) so the demo can use the identical scheme.

#### M8. Gemini response handling: `finishReason`/`blockReason` ignored, 8k output cap for statements
**Files:** `functions/src/lib/gemini.ts:145` (`maxOutputTokens: 8192`), `:154-160` (parses `candidates[0]…text` and reports any failure as "invalid JSON" → `GeminiError` kind `server`), `functions/src/ai.ts:130-133` (statement path, up to 6 screenshots).

**What:** A statement with ~150–200 rows at ~40–50 tokens each hits 8,192 output tokens; Gemini returns `finishReason: 'MAX_TOKENS'` with truncated JSON, which is reported as a server error, counted as a shared-key failure in `stats`, and makes `withAi` fall through to the *next key* (burning the own key's and then the app key's quota on a request that cannot succeed). Safety blocks (`promptFeedback.blockReason`) are indistinguishable from outages.

**Fix:** read `out.candidates?.[0]?.finishReason` and `out.promptFeedback?.blockReason`; classify `MAX_TOKENS` as a new kind `'truncated'` (don't retry on another key; for statements, retry once with `maxOutputTokens: 16384` or ask the client to split images), `SAFETY`/`blockReason` as `'blocked'` (return `null` result, not unavailable). Also record `model` in `record()` (it's returned by `generateJson` and dropped in `withAi` L90-92) so the admin stats can show which model served.

#### M9. Cold start: every function loads Firestore + Auth + Messaging + the whole `firebase-functions` index
**Files:** `functions/src/admin.ts:1-4`, six `import { logger } from 'firebase-functions'` (`capture.ts:26`, `triggers.ts:7`, `reminders.ts:6`, `push.ts:1`, `fx.ts:13`, `ai.ts:2`), `functions/build.mjs` (single bundle, `packages: 'external'`).

**Measured** (fresh Node 22 process, `functions/node_modules`): whole bundle `require` ≈ 590 ms; `firebase-admin/firestore` ≈ 390 ms alone, `firebase-admin/auth` ≈ 190 ms, `firebase-admin/messaging` ≈ 110 ms, `firebase-functions/v2/https` ≈ 200 ms, bare `firebase-functions` ≈ 550 ms alone but only ~60–100 ms *marginal* once the v2 providers are loaded; `firebase-functions/logger` ≈ 20 ms. All ten functions share the bundle, so `aiStatus` (15 s timeout, 5 instances) pays for Messaging and Auth it never uses, and `fxDaily` pays for all three.

**Fix:** (a) `import { logger } from 'firebase-functions/logger'` everywhere (−60–100 ms, free). (b) Lazy-load the rarely used Admin modules: in `admin.ts` make `messaging()`/`auth()` async and `await import('firebase-admin/messaging')` inside (esbuild turns it into a deferred `require` for externals), so only `capture`/triggers/reminders pay for Messaging and only `aiReadSms` for Auth (−100–300 ms on the AI/FX callables). (c) Keep `initializeApp` lazy as it is. Don't bother with `minInstances` at this traffic.

---

### LOW

#### L1. Push: arbitrary 20 tokens, no stale-token pruning, one dead-token code missing
**Files:** `functions/src/push.ts:23` (`limit(20)` with no `orderBy`), `:7-10` (`DEAD_TOKEN`), `src/lib/push.ts:81` (client writes `lastSeen`).
`limit(20)` without an order returns an arbitrary subset, so a user with >20 registrations (old browsers never cleaned up) may have their current phone silently excluded. Add `.orderBy('lastSeen', 'desc')` (single-field, no index needed) and delete tokens whose `lastSeen` is older than ~90 days in the same batch. Also treat `messaging/invalid-argument` whose message mentions the registration token as dead [Likely]. `sendEach` with per-token messages is equivalent to `sendEachForMulticast` here (≤20 tokens, one payload) — fine as is. Payload (title/body/url/tag ≈ 200 bytes) and deep links (`/capture/:id`, `/groups/:gid`, `/groups/:gid/expenses/:eid`, `/groups/:gid/settle`) all resolve to routes in `src/App.tsx:100-115`. [Certain]

#### L2. Fire-and-forget writes may be dropped when the response is sent
**Files:** `functions/src/ai.ts:67-74` (`record` not awaited; called from `withAi` L91/96 right before `return`), `functions/src/capture.ts:96` (`lastUsedAt`).
In gen 2, CPU is only guaranteed while a request is in flight; a `.set().catch()` that is still pending when the callable returns can be throttled or lost, so `stats/ai_{day}` and `aiState/status` may under-count. Collect the promises and `await Promise.allSettled([...])` before returning (adds ~20–50 ms to the response), or move the stats write into the same transaction as `allow()` (which already costs a round trip).

#### L3. Reminder age uses `createdAt`, not "how long the debt has existed"
**Files:** `functions/src/lib/balances.ts:66-67, 73`.
Covered by the redesign in H1 (candidate `since` timestamps). Also `expenses` with `requiresApproval` later approved count from their original `createdAt`, and settlements recorded with a back-dated `date` are evaluated by `createdAt` while the client shows them by `date` — fine for a nudge, but note it in the config comment.

#### L4. Currency formatting locale is fixed to en-IN on the server
**Files:** `functions/src/lib/notify-text.ts:16, 30`, `src/lib/money.ts:33-46` (`appLocale()`).
An AU user whose app shows `$12.50` gets a push saying `A$12.50`; a JPY amount formats fine (digits from Intl). Acceptable; if you want parity, store `locale` on `users/{uid}` and read it in `sendToUser` (already reads the user's settings doc).

#### L5. Emulator and unit test gaps
**Files:** `functions/test/capture.emulator.test.ts`, `functions/src/lib/*.test.ts`.
Covered well: request parsing, `interpret`, dates, trips, idempotency, rate limit, notification text, recipients, prefs, reminder maths, FX parsing/planning/writes, Gemini normalisers, `generateJson` fallback, `listModels` paging, capture filters/log entries, webhook happy paths and 401/400/405.
Not covered: `handleCapture`'s AI branch (it takes an injectable `readSms` at L86 — no test uses it); `writeLog` trimming; prefs paths in the emulator (`paused`, `below_min`, `ignored`, `outsideTrips`, scoped `captureOff`); the 429 path (needs 61 posts — use a tiny `RATE_LIMIT` via env in the emulator); `push.ts` dead-token deletion (mock `messaging().sendEach`); `triggers.ts` recipient/text assembly (extract a pure `expenseEvent(group, expense) → Array<{uid, note}>` and test it); `withAi` plan order and quota-skip behaviour (extract the loop from Firestore); `normaliseStatement` with a bogus `today`; `transactionDate` with an SMS date 300 days in the future (allowed by design, should be asserted). Add `shared/**` and `functions/src/**` tests to CI if they aren't (root `vite.config.ts` already includes them in `test.include`).

#### L6. Build/deploy hygiene
**Files:** `functions/package.json`, `functions/build.mjs`, `functions/tsconfig.json:17`, `firebase.json` (functions block).
- `firebase-functions@7.4.0` + `firebase-admin@14.5.0` on Node 22 are compatible (peer range `^14.0.0`, engines `>=22`). v2 API usage (`onRequest` `cors`/`invoker`/`concurrency`, `onSchedule` `retryCount`, `onDocumentCreated`, `defineSecret`, `onCall` `enforceAppCheck`) matches the installed typings. [Certain]
- `concurrency: 40` with `memory: '256MiB'` is valid because gen-2 defaults to 1 vCPU for ≤2 GiB (`options.d.ts:104`); it also means each `capture` instance may hold 40 in-flight Gemini calls × up to 12 s — fine.
- `secrets: [GEMINI_API_KEY]` on `capture` and all AI callables means the secret must exist in Secret Manager before the first deploy even with `config/ai.mode = 'off'` (the CLI prompts to create it) — add one line to FIREBASE_SETUP §5a.
- `sourcemap: true` ships `lib/index.js.map`, but stack traces are not source-mapped unless `NODE_OPTIONS=--enable-source-maps` is set; either drop the map or add the env var in the function options (`environmentVariables` is not supported for `NODE_OPTIONS` reliably — simplest is to leave as is and read bundled line numbers).
- Dev dependencies (`esbuild`, `typescript` 7, `@types/node`) are installed by Cloud Build then pruned [Likely]; moving them to the root `devDependencies` and running `node functions/build.mjs` from root would shrink `functions/package-lock.json` (148 KB) and the Cloud Build step. Nice-to-have.
- `functions/tsconfig.json` `include` omits `../shared/ai-config.ts` (imported by `ai.ts`); add it for consistency.

---

## 3. Already good (don't "fix")
- **Pure core + thin shells.** `capture-core`, `request`, `trips`, `ids`, `ratelimit`, `fx-core`, `gemini` normalisers and `notify-text` are free of firebase-admin and tested; `handleCapture` even takes an injectable `readSms`. Keep this shape.
- **Idempotent capture ids** (`ids.ts`) with `DocumentReference.create()` and gRPC `ALREADY_EXISTS` (code 6 — verified in `google-gax/status.js`) → clean `duplicate` outcome; 200 for every "handled" outcome so automations don't retry.
- **Notification `tag`s** (`capture-{id}`, `expense-{id}`, `settlement-{id}`, `reminder-{gid}`) make the at-least-once Firestore trigger delivery harmless on the device.
- **Dead-token cleanup** on `registration-token-not-registered` / `invalid-registration-token`; `sendToUser` never throws; data-only web push with `Urgency`/`TTL` headers.
- **Rate limiting** in a Firestore transaction with hashed doc ids (token never becomes a doc id twice); server-only collections denied in rules.
- **AI output validation**: schema-constrained generation, then `normaliseReceipt/Sms/Statement` re-validate every field (bounded lengths, finite numbers, ISO dates, dedupe) before anything reaches Firestore or the client; model ids validated by regex before being put in a URL; anonymous users rejected from AI callables.
- **FX**: v2 → v1 fallback, EUR-based docs so any pair is one division, weekend aliasing only for past dates, `latest` never regresses, stale copy served on fetch failure, `retryCount: 2` on schedules.
- **Lazy `initializeApp`**, single esbuild bundle (78 KB), `packages: 'external'`, empty `gcp-build` so Cloud Build doesn't need `../shared`.
- **Logging hygiene**: no SMS text, tokens or keys in logs; Gemini error bodies truncated to 300 chars; `aiKey` never returns the key.

## 4. Open questions for the product owner
1. Should reminders exclude pending-approval expenses (match the app, recommended) or should the push instead say "₹X pending your approval"? Decides H2's text.
2. Is the capture activity log worth keeping as per-row documents (clearable individually) or is a single 30-entry document acceptable? Decides H3's shape and the client change.
3. Default for `aiSms` when only the shared key is available: on (current) or off until the user opts in? Privacy stance for M3.
4. Should table guests (anonymous) be allowed to trigger external FX fetches for arbitrary past dates, or only read `latest`? (M6)
