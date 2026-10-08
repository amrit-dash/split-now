# Security audit — Split Now (split-it) · lens: SECURITY

Scope examined (read-only, by reading the code; every rules claim below was additionally **executed against the real `firestore.rules` in the Firestore emulator** via a scratch probe suite at `scratchpad/rulesprobe/tests/probe.test.ts`, 17/17 probes behaved as described): `firestore.rules`, `storage.rules`, all of `tests/*.test.ts`, `functions/src/**` (capture webhook, callables, triggers, reminders, fx, push, Gemini), `shared/*`, `src/lib/{appcheck,push,ai,capture,pending,share,qr,payments,table,balances}.ts`, `src/pages/{Join,Table,CaptureGuest,Share,Scan,Capture,Login}.tsx`, `src/components/{AutoCapture,AdminAi,AiSettings,QrCode}.tsx`, `src/data/firebaseRepo.ts`, `src/App.tsx`, `index.html`, `public/*.js`, `firebase.json`, `.env.production`, `.firebaserc`, `.github/workflows/ci.yml`, docs, and the full git history for secrets.

**Verdict.** The core trust model (group data gated on `memberUids`, one-slot-per-write membership changes, own-key-only disputes/approvals, append-only activity, token-bound `captureInbox`, server-only secrets/counters) is well designed and well tested, and nothing in the repo or its history is a leaked secret. The real problems are at the edges the tests do not cover: (1) **any account, including a throw-away anonymous table guest, can push arbitrary notifications to any user whose uid it has seen**, because group *creation* lets `members[*].uid` name strangers and the Cloud Functions route pushes by that field; (2) **anonymous accounts are treated as full users everywhere except where the rules say "tables"**, contradicting `docs/FIREBASE_SETUP.md:10`; (3) **`config/ai` (the admin's email allow-list) is readable by every signed-in account**; plus a cluster of Medium items (unbounded/unvalidated fields on groups and expenses incl. a cross-user avatar-deletion chain through `receiptPath`, plaintext per-user Gemini keys, the unmetered pre-auth path of the capture webhook, and the complete absence of security headers). No Critical finding.

---

## Findings (ranked)

### HIGH

#### H1. Push-notification spam / phishing to any user from any account (incl. anonymous), via foreign uids in `members` on group create
- **Where:** `firestore.rules:241-245` (group `create` validates `createdBy`, `memberUids == [uid()]` and `inviteCode` only; `members` content is unchecked). `functions/src/lib/recipients.ts:22` (`const uid = members?.[memberId]?.uid` → recipient), `functions/src/triggers.ts:30-45` and `:48-59` (push to that uid; no `memberUids` check), `functions/src/lib/balances.ts:69-77` (`reminderTargets` same), `functions/src/reminders.ts:22` (only checks `memberUids.length >= 2`). Uids of strangers are readable by anyone with a table code: `tables/{code}.hostUid` and `participants[*].uid` (`firestore.rules:491-494`).
- **Proof:** probe P1 — `mallory` creates `groups/evil` with `members: { v: { name: 'URGENT: pay now', uid: 'victim' } }`, `memberUids: ['mallory']`, then `expenses/e1` with `splits: { v: 999999 }`. Both writes are **allowed**. `onExpenseCreated` will then `sendToUser('victim', …)` with title = attacker's group name (≤60 chars), body = `"<member name ≤30> added <description ≤40> · ₹… · your share ₹…"`, tapping opens `/groups/evil/...` (permission-denied inside the app). `onSettlementCreated` gives "`<name>` paid you ₹…". `dailyReminders` gives weekly "you owe ₹X in <group>" if the attacker adds a second (anonymous) account via the group's own invite. [Certain] for the rules + routing; [Certain] that the victim must have push enabled.
- **Why it matters:** harassment and social-engineering channel ("URGENT: pay now … Click to settle") that looks like a genuine app notification, usable at scale from anonymous accounts (no email, no attribution), rate-limited only by Firestore write throughput. The documented invariant "`members[*].uid` only ever gets set through `isJoining`" is true for *updates* but not for *creates*, and the server trusts it.
- **Fix (server, authoritative — rules cannot iterate a map):**
  ```ts
  // functions/src/lib/recipients.ts
  export function expenseRecipients(members, e, memberUids: string[] = []): ExpenseRecipient[] {
    …
      const uid = members?.[memberId]?.uid
  -   if (!uid || uid === e.createdBy || (share <= 0 && paid <= 0)) continue
  +   if (!uid || uid === e.createdBy || !memberUids.includes(uid) || (share <= 0 && paid <= 0)) continue
  // functions/src/triggers.ts
  - const recipients = expenseRecipients(g.members, e)
  + const recipients = expenseRecipients(g.members, e, Array.isArray(g.memberUids) ? g.memberUids : [])
  …
  - if (!g || !to || to === s.createdBy) return
  + if (!g || !to || to === s.createdBy || !g.memberUids?.includes(to)) return
  // functions/src/lib/balances.ts reminderTargets(): add `memberUids: string[]` and
  -   if (!m.uid) continue
  +   if (!m.uid || !args.memberUids.includes(m.uid)) continue
  ```
  (add `memberUids?: string[]` to `GroupLite`). **Rules hardening in the same change:** cap the blast radius and make placeholders placeholders on create too, as far as rules can express it:
  ```
        allow create: if isUser()
          && request.resource.data.createdBy == uid()
          && request.resource.data.memberUids == [uid()]
  +       && request.resource.data.members is map && request.resource.data.members.size() <= 60
  +       && request.resource.data.members[uid()].uid == uid()
          && request.resource.data.inviteCode is string …
  ```
  (The bulk-import path in `tests/firestore.import.test.ts:36-41` still passes: it creates the creator's entry plus uid-less placeholders.) Add a unit test in `functions/src/lib/functions.test.ts` that a member entry whose uid is not in `memberUids` gets no push, and a rules test that `groups/x` with a foreign uid still *creates* but is harmless.

#### H2. Anonymous (table-guest) accounts are full users everywhere except tables
- **Where:** `firestore.rules:8` `signedIn()` is the only auth predicate; used for `users/*` (:22-94), `captureTokens` create (:145), `captureInbox` read (:177), `isGroupMember` (:13), `isAdmin` (:11), group `create`/`isJoining`/`list` (:194, :239, :241), `profiles` (:437, :446), `invites` get/create/delete (:527, :534, :538), `config` read (:113). Anonymous sign-in is enabled for live tables (`src/pages/Table.tsx:52-53`), and anyone holding the public web API key can mint anonymous accounts at the Auth REST API — so "signed in" ≈ "anyone".
- **Proof:** probe P2 — an auth context with `sign_in_provider: 'anonymous'` can: `get invites/ABCD2345` (group name, emoji, **placeholder names**), `get config/ai` (admin allow-list of emails), **join `groups/g1` with the invite code and then read the whole group**, create groups, write a 300 KB `users/{uid}` doc, create capture tokens. All allowed. `docs/FIREBASE_SETUP.md:10` ("they can't see any group") is false. [Certain]
- **Why it matters:** removes all accountability from H1 and from invite-code abuse (an invite link forwarded once lets a no-identity account read every expense, payment handle and member email in the group), and gives anonymous accounts unlimited storage write capacity under the project's bill. App Check (not enforced yet) would not change this — anonymous tokens are legitimate app traffic.
- **Fix (rules):**
  ```
       function signedIn() { return request.auth != null; }
  +    // A real account (Google / email). Anonymous guests exist only for live tables.
  +    function isUser() { return signedIn() && request.auth.token.firebase.sign_in_provider != 'anonymous'; }
  -    function isAdmin() { return signedIn() && exists(…) }
  +    function isAdmin() { return isUser() && exists(…) }
  -    function isGroupMember(groupId) { return signedIn() && uid() in … }
  +    function isGroupMember(groupId) { return isUser() && uid() in … }
  ```
  then replace `signedIn()` with `isUser()` at every site listed above (all of `/users/**`, `/captureTokens`, `/captureInbox` read/delete, `/groups/**` incl. `isMember()`, `isJoining()`, `validAuthor()`-adjacent `allow` lines, `/profiles`, `/invites`). Keep `signedIn()` only for `/tables/**` and `/fxRates`. The `tests/firestore.tables.test.ts` helper already shows how to assert the anonymous provider; add an inverse test file asserting anonymous `get invites/*`, `update groups/*`, `create groups/*`, `create captureTokens/*` all fail. Also enable **Authentication → Settings → User account cleanup** for anonymous accounts (console).

### MEDIUM

#### M1. `config/ai` leaks the admin allow-list of emails (and the admin's uid) to every signed-in account
- **Where:** `firestore.rules:112-113` (`allow read: if signedIn()`), document shape `allowEmails` (≤200 emails), `updatedBy` (admin uid). The only client reader is the admin panel: `src/components/AdminAi.tsx:27` (`repo.watchAppAi`); normal users get availability through the `aiStatus` callable (`src/components/AiSettings.tsx:52`, `functions/src/ai.ts:212-226`), so the rules comment at :110-111 is stale.
- **Proof:** probe P2 (anonymous read succeeds). [Certain]
- **Fix:**
  ```
       match /config/{id} {
  -      allow read: if signedIn();
  +      // Only the admin screen reads this; everyone else asks the aiStatus callable.
  +      allow get: if isAdmin();
  +      allow list: if false;
  ```
  and update `tests/firestore.ai.test.ts:573` (alice's read must now fail).

#### M2. Capture webhook: unauthenticated requests are unmetered before the Firestore read (cost DoS), and bodies are unbounded
- **Where:** `functions/src/capture.ts:88-93` — the token-doc `get()` happens **before** `rateLimited()`, and the only limiter is keyed by *valid token* (`rateLimits/{sha(token)}`), so a request with an invalid token is never rate-limited. `:167-168` `invoker: 'public', maxInstances: 10, concurrency: 40`, no content-length check; `functions/src/lib/request.ts:55-69` JSON-parses whatever arrives (Express/raw body).
- **Why it matters:** every garbage POST to `/api/capture` costs one Firestore read plus an invocation; 400 concurrent × 24 h is a real bill with zero attacker cost. The 401-vs-429 difference is also a token-validity oracle, irrelevant at 140 bits but free to query. (The rate limiter itself is correct: a `runTransaction` read-modify-write, no race — `functions/src/capture.ts:56-64`, `lib/ratelimit.ts`.)
- **Fix:** add a cheap pre-auth limiter and size guard in the handler (per instance is enough to blunt it; Hosting puts the client IP first in `X-Forwarded-For`):
  ```ts
  const ipHits = new Map<string, { n: number; t: number }>()
  function ipLimited(ip: string, now: number, max = 60, windowMs = 60_000): boolean {
    const h = ipHits.get(ip)
    if (!h || now - h.t > windowMs) { ipHits.set(ip, { n: 1, t: now }); if (ipHits.size > 5000) ipHits.clear(); return false }
    return ++h.n > max
  }
  export const capture = onRequest({ …, maxInstances: 3, concurrency: 20 }, async (req, res) => {
    if (req.method !== 'POST') { … }
  + if (Number(req.get('content-length') ?? 0) > 16_384) { res.status(413).json({ ok: false, reason: 'bad_request' }); return }
  + const ip = (req.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.ip || 'unknown'
  + if (ipLimited(ip, Date.now())) { res.status(429).json({ ok: false, reason: 'rate_limited' }); return }
  ```
  and in `handleCapture` return `bad_token` for malformed tokens *without* a read (already done at :88) — fine. If abuse appears, put Cloud Armor in front of the Cloud Run service. Keep the budget alert the docs recommend.

#### M3. Expense documents: unchecked `receiptPath`/`receiptUrl`, unbounded fields, untyped money maps — including a cross-user avatar-deletion chain
- **Where:** `firestore.rules:308-317` (`validExpense` checks `amount`, `groupId`, key membership only). Client deletes whatever path an expense names: `src/data/firebaseRepo.ts:380-391` (`deleteGroup`), `:538-542` (`attachReceipt` → `deleteFileLater(old)`), `:477` — none has the `startsWith('avatars/${uid}/')` guard the author added for profiles at `:271`. `storage.rules:20-24` lets a user delete their own avatars.
- **Proof:** probe P3 — a member writes `receiptUrl: 'javascript:alert(document.domain)'`, `receiptPath: 'avatars/alice/photo.jpg'`, a 300 KB `description`, and `paidBy: { bob: 'lots' }, splits: { alice: -1e15, bob: 'abc' }`: all **allowed**. [Certain]
- **Impact, in order:** (a) *Cross-user integrity:* Bob sets `receiptPath` to Alice's avatar object (its name is in `groups/g1/profiles/alice.photoURL`, readable to co-members); when Alice deletes that expense or the group, **her own client deletes her own profile photo** (owner delete is allowed by storage rules). Low-impact but a real confused-deputy. (b) *XSS:* `src/pages/ExpenseDetail.tsx:146` renders `href={e.receiptUrl}`; React 19's `sanitizeURL` (verified in `react-dom-client.production.js:1579-1582`) neutralises `javascript:` so this is blocked today — but only by the framework, not by the data model. (c) *Garbage money values* are already ignored by `src/lib/balances.ts:12-29` (`isBalancedExpense` + `countable`) and `functions/src/lib/balances.ts:23-24`, so no balance corruption — but a 1 MiB expense doc is pushed to every member's listener on every snapshot (bandwidth/cost within a group).
- **Fix (rules):**
  ```
        function validReceipt(d) {
          return (!('receiptUrl' in d) || (d.receiptUrl is string && d.receiptUrl.size() <= 1024
                    && d.receiptUrl.matches('https://firebasestorage\\.googleapis\\.com/v0/b/[^/]+/o/receipts%2F' + groupId + '%2F[^/?]+\\?.*')))
            && (!('receiptPath' in d) || (d.receiptPath is string && d.receiptPath.matches('receipts/' + groupId + '/[A-Za-z0-9_.-]+')));
        }
        function validExpense() {
          return (validAuthor() || isOccurrence())
            && validOriginal(request.resource.data)
  +         && validReceipt(request.resource.data)
  +         && request.resource.data.description is string && request.resource.data.description.size() <= 200
  +         && (!('notes' in request.resource.data) || (request.resource.data.notes is string && request.resource.data.notes.size() <= 2000))
  +         && request.resource.data.paidBy is map && request.resource.data.paidBy.size() <= 60
  +         && request.resource.data.splits is map && request.resource.data.splits.size() <= 60
            && request.resource.data.groupId == groupId …
  ```
  (apply the same `receiptUrl` idea to settlements if they ever carry one). **Fix (client):** one helper used by all three deletion sites:
  ```ts
  const receiptPathOf = (groupId: string, e: Pick<Expense, 'receiptPath' | 'receiptUrl'>) => {
    const p = e.receiptPath ?? storagePathFromUrl(e.receiptUrl)
    return p && p.startsWith(`receipts/${groupId}/`) && !p.includes('..') ? p : undefined
  }
  ```

#### M4. Any member can rewrite group policy and bloat the group document
- **Where:** `firestore.rules:246-253` — `update` by any member checks `createdBy`, `inviteCode`, `captureOff` type and membership shape only. No key whitelist, no size caps, and `requireApproval` / `approvalThreshold` / `currency` / `type` are freely editable.
- **Proof:** probe P4 — non-creator `bob` sets `requireApproval:false, approvalThreshold:1e12, currency:'USD', type:'personal'` and then adds a ₹50,000 expense without `requiresApproval` (the `approvalFlagOk()` check reads the *new* group doc); probe P3 adds a 300 KB `junk` field. All **allowed**. [Certain]
- **Why it matters:** the approval feature is advertised as a trust control ("stay pending until everyone charged approves") but any charged member can switch it off, add the expense, and switch it back on; the activity log is client-written so nothing need be recorded (see L12). Doc bloat hits every member's device on every change.
- **Fix:** make policy fields creator-only and whitelist the shape:
  ```
        function validGroupShape(g) {
          return g.keys().hasOnly(['id','name','emoji','type','currency','budget','startDate','endDate','simplify','requireApproval',
              'approvalThreshold','captureOff','memberUids','members','inviteCode','createdBy','createdAt','updatedAt','joinCode','joinMemberId','memberOpId'])
            && g.name is string && g.name.size() > 0 && g.name.size() <= 80
            && g.emoji is string && g.emoji.size() <= 16
            && g.type is string && g.type.size() <= 20
            && g.currency is string && g.currency.size() == 3
            && g.members is map && g.members.size() <= 60
            && g.memberUids is list && g.memberUids.size() <= 60
            && (!('budget' in g) || g.budget is int)
            && (!('startDate' in g) || (g.startDate is string && g.startDate.size() == 10))
            && (!('endDate' in g) || (g.endDate is string && g.endDate.size() == 10))
            && (!('approvalThreshold' in g) || (g.approvalThreshold is int && g.approvalThreshold > 0));
        }
        function policyUnchangedOrCreator() {
          let b = resource.data; let a = request.resource.data;
          return b.createdBy == uid()
            || (a.get('requireApproval', false) == b.get('requireApproval', false)
                && a.get('approvalThreshold', 0) == b.get('approvalThreshold', 0));
        }
        allow create: if … && validGroupShape(request.resource.data);
        allow update: if (isMember() && … && validGroupShape(request.resource.data) && policyUnchangedOrCreator() && validMembershipChange()) || isJoining();
  ```
  Caveat: `members[*]` entries themselves (name/color/email) remain unbounded; cap `name` where entries are written (`isJoining` → `after.members[mid].name.size() <= 60`, placeholder add likewise).

#### M5. Users' Gemini API keys are stored in plaintext in Firestore and never purged
- **Where:** `functions/src/ai.ts:34` (`users/{uid}/secrets/gemini`), `:182` (`set({ key, hint, savedAt })`), `:46` read on every AI call. Rules deny all client access (`firestore.rules:30-32`, tested) — good — but the key is readable to anything with Admin SDK / console / export / backup access, and there is no cascade on account deletion (no `onDelete` trigger; `captureTokens` of a deleted user also keep working against `users/{deleted}/captures`).
- **Why it matters:** a third-party credential (billable to the user) sitting in the primary datastore; one over-broad IAM grant, a Firestore export to GCS, or a future admin/debug path exposes every user's key.
- **Fix:** envelope-encrypt with Cloud KMS (≈$0.03 per 10k ops, negligible here):
  ```ts
  import { KeyManagementServiceClient } from '@google-cloud/kms'
  const kms = new KeyManagementServiceClient()
  const KEY = `projects/${process.env.GCLOUD_PROJECT}/locations/asia-south1/keyRings/app/cryptoKeys/user-secrets`
  const seal = async (plain: string) => Buffer.from((await kms.encrypt({ name: KEY, plaintext: Buffer.from(plain) }))[0].ciphertext as Uint8Array).toString('base64')
  const unseal = async (enc: string) => Buffer.from((await kms.decrypt({ name: KEY, ciphertext: Buffer.from(enc, 'base64') }))[0].plaintext as Uint8Array).toString()
  // aiKey set:   secretRef(uid).set({ enc: await seal(key), hint, savedAt })
  // loadCtx:     const enc = secret.get('enc'); ownKey = enc ? await unseal(enc) : undefined
  ```
  Grant the functions' service account `roles/cloudkms.cryptoKeyEncrypterDecrypter` on that key only. Add an Auth `onDelete` (v1 `functions.auth.user().onDelete`) that deletes `users/{uid}/**` (secrets, pushTokens, captures, settings) and every `captureTokens` doc with that uid.

#### M6. No security headers on Hosting (no CSP, XCTO, Referrer-Policy, frame-ancestors, Permissions-Policy, COOP)
- **Where:** `firebase.json` `hosting[*].headers` only sets `Cache-Control`/`Content-Type`. `index.html:19-31` has an inline classic script (theme/accent boot), fonts from `fonts.googleapis.com`/`fonts.gstatic.com`, Tesseract core/worker served from `/tesseract/` (`src/lib/ocr.ts:9-10`), language data from `cdn.jsdelivr.net` (`vite.config.ts:61`), reCAPTCHA Enterprise for App Check, Google sign-in popup/redirect, Firestore/Auth/Storage/FCM/Functions endpoints. Also `share-target-sw.js` lacks the `no-cache` header `push-sw.js` has (both are `importScripts` into `sw.js`).
- **Why it matters:** the app renders member-supplied strings everywhere; React escaping is the only XSS defence. A CSP turns a future bug into a report; `frame-ancestors` stops clickjacking of settle-up/UPI buttons; `Referrer-Policy` keeps `/join/<code>` and `/t/<code>` (secrets in URLs) out of third-party referrers; XCTO stops MIME sniffing of uploaded images served same-site.
- **Fix:** move the inline script to `public/theme-boot.js` (`<script src="/theme-boot.js"></script>`), then add to **both** hosting entries, starting in Report-Only mode:
  ```json
  { "source": "**", "headers": [
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
    { "key": "X-Frame-Options", "value": "SAMEORIGIN" },
    { "key": "Permissions-Policy", "value": "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
    { "key": "Cross-Origin-Opener-Policy", "value": "same-origin-allow-popups" },
    { "key": "Content-Security-Policy-Report-Only", "value": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; manifest-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://apis.google.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://firebasestorage.googleapis.com https://*.googleusercontent.com; connect-src 'self' https://*.googleapis.com https://asia-south1-split-it-prod.cloudfunctions.net https://api.frankfurter.dev https://cdn.jsdelivr.net https://www.google.com/recaptcha/ https://www.gstatic.com; frame-src 'self' https://accounts.google.com https://www.google.com https://split-it-prod.firebaseapp.com https://split-now.firebaseapp.com; upgrade-insecure-requests" }
  ]},
  { "source": "/share-target-sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }
  ```
  Watch the console for violations for a week (sign-in popup, App Check, OCR worker, statement import), then switch to `Content-Security-Policy`. `frame-ancestors 'self'` rather than `'none'` because the Auth iframe `/__/auth/iframe` is same-origin here. Firebase Hosting already sends HSTS; verify with `curl -I`. [Likely] that no further origins are needed — the list is from the code, not from a live run.

#### M7. Members' email addresses are stored in the group document, visible to every member and every joiner
- **Where:** `src/pages/Join.tsx:49` writes `{ name, uid, email: user.email, color }` into `members[memberId]`; `src/pages/GroupForm.tsx:97-100, 336` lets the organiser type friends' emails into placeholders; `src/types.ts:42-47` (`Member.email`). `firestore.rules:18-20` says email is owner-only and the per-group `profiles` whitelist (`:439`) deliberately excludes it — but `isJoining` (`:190-202`) and `validMembershipChange` accept any member-entry content.
- **Why it matters:** with H2 an anonymous joiner holding a forwarded link harvests every member's email; even without H2 it contradicts the documented data model and the privacy claims.
- **Fix:** (a) drop `email` from the joiner's own entry in `Join.tsx:49` (the uid is the identity; the placeholder match already happened); (b) for organiser-typed hints keep only what matching needs — the folded local part (`priya.s`) or a `sha256(email)` — in `invites/{code}.placeholders`, not in `groups/*`; (c) rules: `!('email' in after.members[mid])` inside `isJoining` and the placeholder-add branch, `name.size() <= 60`.

### LOW

#### L1. Post-login return path is not validated (crash today, open redirect if ever pushed instead of replaced)
- `src/App.tsx:75` stores `loc.pathname + loc.search` for any signed-out visit; `:52` `nav(back, { replace: true })`. A link `https://split-now.web.app//evil.com/x` yields `pathname === '//evil.com/x'`; `replaceState` throws `SecurityError` (cross-origin URL) out of the effect → blank screen until reload. React Router 7.18.4's `push` path catches that error and calls `window.location.assign(url)` (`node_modules/react-router/dist/development/chunk-OB3PAWPO.mjs:310-317`), so the same value through a non-`replace` `nav()` would be an **open redirect after Google sign-in**. [Likely — depends on Hosting preserving `//` in the path, which it does for SPA rewrites.] Fix:
  ```ts
  const safePath = (p: string | null) => (p && /^\/(?![\/\\])[^\s]*$/.test(p) ? p : null)
  if (!loading && !user && …) { const p = loc.pathname + loc.search; if (safePath(p)) sessionStorage.setItem('splitit-return', p) }
  …
  else if (safePath(back)) nav(back!, { replace: true })
  ```
  and `nav(\`/capture${capture}\`)` only when `capture.startsWith('?')`.

#### L2. `public/push-sw.js:16` accepts protocol-relative URLs
- `data.url.startsWith('/')` admits `//evil.com/…`, which `openWindow` would open cross-origin (`:41`). Only the project's Admin SDK can send FCM messages, so not exploitable today; hygiene: `data.url.startsWith('/') && !data.url.startsWith('//')`, and `new URL(target).origin === self.location.origin` before `openWindow`.

#### L3. `public/share-target-sw.js` can be driven by any website
- Any page can `<form method=post action=https://split-now.web.app/share-target>`; the SW then parks an attacker image in Cache Storage and redirects to `/scan?shared=1`, or to `/share?text=…` → `/capture?amount=…&merchant=…` (`src/pages/Share.tsx:22`). The user must still confirm, so impact is a pre-filled prompt (phishing nuisance). Fetch-metadata headers are added after the SW so cannot be checked there; acceptable risk — note it and keep "nothing is saved until you confirm".

#### L4. Storage rules: `image/.*` admits `image/svg+xml`; receipts deletable by any member; no receipts test
- `storage.rules:16, 22` allow SVG (active content served from `firebasestorage.googleapis.com`; no app-origin impact, but pointless since the client always uploads JPEG). `tests/storage.avatars.test.ts` exists; **there is no test for `receipts/`** (member read/create/delete, size, type, cross-group). Fix: `contentType.matches('image/(jpeg|png|webp|heic|heif)')` on both paths; add `tests/storage.receipts.test.ts` mirroring the avatars file with a Firestore-seeded group. Download URLs are bearer tokens that outlive membership — acceptable, but `deleteGroup` already revokes by deleting objects.

#### L5. Weak invite codes and table codes accepted by rules
- `firestore.rules:245` `inviteCode.size() >= 6`, any charset; `:499` table code 6–12. A hostile/buggy client can create a group with `inviteCode: 'aaaaaa'`, exposing *the other members'* data to guessers (probe P6). Client generates 8 chars from a 31-symbol alphabet (`src/lib/id.ts:7-11`). Fix: `inviteCode.matches('[A-HJ-NP-Z2-9]{8}')` and `code.matches('[A-HJ-NP-Z2-9]{8}')`.

#### L6. Table claim values unchecked; host update has no key whitelist
- `firestore.rules:482-485` checks keys only; probe P5 writes `claims.ben = { a: -5 }` / `'lots'`. Harmless because `src/lib/table.ts:102` `sanitizeClaims` runs on read and before write, but add `&& claimsAfter[me].values().hasOnly([1,2,…])`-style checks is impossible — instead cap doc growth: host `update` should reuse the create whitelist (`request.resource.data.keys().hasOnly([...])`) and `participants.size() <= 60`.

#### L7. `aiKey` and own-key reads share one rate-limit document
- `functions/src/ai.ts:163` `allow(uid, 'own', {20, 60})` writes the same `rateLimits/ai_own_{uid}` doc that `parseReceiptAi` uses with `{120, 600}` (`:55-62, :87`). After 20 scans in an hour, "Save key"/"Test key" fail with `resource-exhausted`. Use `ai_keyops_{uid}` for key operations.

#### L8. Data retention gaps
- `captureInbox` docs (merchant, amount, card label, **capture token in plaintext**) live until the owner next opens the app — forever for a lapsed user; no timestamp field is even allowed (`firestore.rules:165`), so a TTL policy cannot be attached. `users/{uid}/captures.raw` keeps masked SMS text indefinitely. Orphaned `captureTokens` keep accepting SMS after the owner is gone. Fix: allow an int `createdAt` in `validInbox` (client sets `Date.now()`), add a Firestore TTL policy on it (e.g. 30 days) and on `captures.createdAt` for `status != 'pending'`; purge on account deletion (see M5).

#### L9. `refreshFx` is callable by anonymous users with no per-uid limit
- `functions/src/fx.ts:52-83`: the 10-minute throttle covers `latest` only; any unstored past date (~7,000 since 1999) triggers up to two external fetches + writes. Bounded (each date becomes final), `maxInstances: 5`, so cost is small. Add `applyRateLimit` per uid (e.g. 20/h) and `enforceAppCheck: true` once App Check is on; table guests don't need FX.

#### L10. Shared Gemini key exposure scales with free accounts
- `parseReceiptAi` limits are per uid (`functions/src/ai.ts:87`); with `config/ai.mode = 'everyone'` and App Check off, N free accounts = N × `perDay` calls on the project key. Default is `off` and the admin UI offers `allowlist` — keep `allowlist` (or require a verified email) until App Check is enforced on callables.

#### L11. Activity log is honest-client only
- `firestore.rules:412-431`: entries must be written as yourself with bounded fields, but nothing forces an edit to carry an entry, and `summary/before/after` are free text. A tampering member edits silently. Rules can't enforce batch composition; the robust fix is a server-side `onDocumentWritten('groups/{g}/expenses/{e}')` trigger that writes the authoritative entry (and drop client writes). Design decision; see Open questions.

#### L12. Capture token in URLs (Open-URL path)
- `src/components/AutoCapture.tsx:73` builds `/capture?…&t=<token>&u=<uid>`; `src/pages/CaptureGuest.tsx` consumes it. Tokens land in Safari history/screenshots/shared links. The webhook path is now primary (docs §3); mark §4b deprecated and hide the Open-URL variant, or mint a separate short-lived token for it.

#### L13. Committed public identifiers — verify key restrictions
- `.env.production` holds the Firebase web API key, App Check site key, VAPID public key, iCloud Shortcut URL; `.firebaserc` the project id. All public by design; **no private secret appears anywhere in the tree or git history** (`git log -S AIza` only finds this key and a test fixture). Verify in Google Cloud → Credentials that the web key has **API restrictions** (Identity Toolkit, Token Service, Firestore, Storage, FCM Registration, App Check) but **not** HTTP-referrer restrictions — the documented Shortcut REST path (`docs/AUTO_CAPTURE.md §4a`, `AutoCapture.tsx:58`) sends `?key=` with no referrer and would break.

---

## What the rules tests prove — and don't
`tests/*.test.ts` (10 Firestore files + 1 Storage) solidly cover: member-only reads, join/claim semantics, `memberOpId` membership changes, author immutability, trash/purge, disputes/approvals own-key, comments, activity append-only, invites binding, per-group profiles, tables (host vs guest, expiry), capture tokens/inbox binding and shape, settings whitelist, push tokens, server-only collections, `config/ai` admin write, secrets inaccessibility, bulk import. **Not covered** (all confirmed exploitable above): group `create` member content (H1); any anonymous-provider *denial* outside tables (H2); `config` read scope (M1); expense field hygiene incl. `receiptUrl/receiptPath`, sizes, money-map types (M3); group settings whitelist/policy ownership (M4); invite-code strength (L5); table claim values and host update keys (L6); **no `receipts/` storage test at all** and no content-type negative test for SVG (L4). The scratch suite at `scratchpad/rulesprobe/tests/probe.test.ts` can be inverted (`assertSucceeds` → `assertFails`) and dropped into `tests/` as the regression suite for the fixes.

## Things that are already good (don't "fix")
- Membership model: one entry per write, uid immutability, placeholder claim only via `isJoining`, creator-only removal of others, `getAfter` for batch joins — tight and tested (`firestore.rules:190-236`).
- Trust fields: `dispute`/`approvals` own-key-only, flagger must be in the expense, `requiresApproval` cannot be dropped, trash fields isolated (`:262-363`).
- `captureInbox`: whitelist + types + sizes, token must exist and belong to the stated uid, no update, owner-only read — and no token-validity oracle via rules (both wrong-token and wrong-uid are the same permission-denied). Tokens are 140-bit client-random, immutable (`update: if false`), rate-limit doc ids are hashed.
- Webhook: rate limit is a Firestore transaction (no race); idempotent capture ids; `raw` SMS masked (`shared/sms-parse.ts:363-374`) and capped; **no SMS text or phone number is logged** (all `logger.*` calls reviewed); `captureLog` never stores text and is trimmed to 30; generic 500; `groupId` from the request is membership-checked (`capture.ts:50-54`).
- Gemini: anonymous callers rejected (`ai.ts:102-105`), per-user transactional quotas, responses schema-constrained *and* re-validated (`lib/gemini.ts:185-296`), model ids regex-validated and URL-encoded, keys never returned (4-char hint), failures counted against quota, SMS-fallback output cannot do anything without the user confirming.
- Client: no `dangerouslySetInnerHTML`/`innerHTML`/`eval` anywhere; QR is an SVG path from a local encoder; UPI/PayPal/Revolut links percent-encode handles and strip `pn`/`tn` to a safe charset (`src/lib/payments.ts:54-79`); `index.html` boot script whitelists accent names; `authDomain` kept same-site; `navigateFallbackDenylist` protects `/__/` and `/api/`.
- Storage: single-segment paths (no traversal), size + `image/*` limits, owner-only avatar writes, `receipts` not overwritable (no `update`), membership checked against Firestore; `saveProfile` guards the avatar delete prefix.
- No collection-group rules → collection-group queries denied; `users`/`invites` `list: false`; server-only `rateLimits`/`reminderState`/`secrets`/`stats` closed; CI runs typecheck, unit, rules and functions tests.

## Open questions for the product owner
1. **Splitwise parity vs. trust controls:** should any member be able to (a) edit anyone's expense, (b) record a settlement between two *other* members (probe P7: Bob writes "Alice paid Cat ₹5,000", which also pushes "Alice paid you" to Cat), (c) change approval settings? If the trust features are meant to be enforced, (c) must be creator-only (M4) and the log server-written (L11).
2. **Member emails in `groups/*`** (M7): intended for placeholder matching, or an oversight? Decides whether to hash/move them.
3. **Anonymous accounts:** anything beyond live tables and FX rates ever intended for them? If not, H2's `isUser()` is a safe blanket change.
4. **Retire the Firestore-REST `?key=` inbox path** (docs §4a / `AutoCapture.tsx:58`) now that the webhook is primary? It is the reason App Check can't be enforced on Firestore and the reason the API key can't carry referrer restrictions.
5. **Console settings not visible in the repo:** API key restrictions (L13), Auth email-enumeration protection and password policy (client only enforces `minLength=6`, `src/pages/Login.tsx:70`), anonymous-account auto-cleanup, App Check enforcement timeline (`enforceAppCheck: false` in `functions/src/ai.ts:109`, `fx.ts:56`).
