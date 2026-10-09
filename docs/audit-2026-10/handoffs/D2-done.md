# D2 — done (admin console)

Requests to others are in `D2.md`. Nothing committed (lead commits); the tree has D1's in-flight work alongside.

## What changed

### Documents and rules (`firestore.rules`, tests)
- `config/app` (world-readable, admin-written, validated field by field): `maintenance`, `maintenanceMessage ≤ 300`, `minVersion` (`x.y.z`), `announcement { text ≤ 300, level info|warn, until? } | null`, `flags` (known names → bool: `aiImages aiSms liveTables autoCapture quickAdd nudges statementImport payLinks duplicates merchantMemory whoseTurn budgetAlerts`), `signups open|invite`, `updatedAt/By`.
- `config/limits` (admin-read, admin-written, ranges mirror `shared/limits.ts`): `capturePerHour/Day`, `aiOwnPerHour/Day`, `nudgePerDay`, `fxPerUserPerHour/Day`.
- `config/ai` rule unchanged in substance, moved into a `validAiConfig()` function; `config/*` is now `get: id == 'app' || isAdmin()`, writes per id.
- `blocked/{uid}`: server-written; the account reads its own, admins any. `stats/*`: comment widened to the four kinds.
- `writesOpen()` = `(!maintenanceOn() && !isBlocked()) || isAdmin()` on every write rule: users doc + captures/pushTokens/settings create/update, captureTokens create, groups create/update/delete, expenses/comments/settlements/activity/profiles, tables, invites. Deletes under `users/{uid}/*` stay open (sign-out cleanup). Two cached reads per write; the admin `exists` only runs when one of them says no.
- New `tests/firestore.admin.test.ts` (12 tests): public read of config/app incl. signed-out and anonymous, 14 invalid shapes, limits ranges, blocked read/write matrix, stats of every kind, maintenance freeze for members / guests / admins / after switching off, blocked-account freeze while others keep writing.

### Cloud Functions
- New `shared/limits.ts` (+ test): `Limits`, `LIMIT_META` (label, hint, min, max, default), `DEFAULT_LIMITS`, `resolveLimits`, `clampLimit`, `limitPair`. Pure, used by both bundles.
- New `functions/src/lib/limits.ts`: `getLimits(now)` and `flagOn(name)` from `config/limits` + `config/app`, one `getAll`, cached 60 s per instance, last good value kept on a failed read, `resetConfigCache()` for tests.
- `functions/src/admin.ts` (kept the SDK handles): `countStats(kind, fields, now)` (merge + increment on `stats/{kind}_{day}`, never throws) and three callables, admin-checked against `admins/{uid}`:
  - `adminStats({ days 1..30 })` → `{ today, days: [{ day, ai, capture, push, nudge }], totals: { users (Auth list, null when unreadable, truncated flag), groups, activeGroups (7 d), blocked } }` — one `getAll` of ≤ 120 stats docs + three count aggregates.
  - `adminUsers({ q, limit })` → exact email/uid lookup, else ≤ 3 `listUsers` pages filtered by email/name/uid, newest first, with each row's `blocked` entry.
  - `adminBlockUser({ uid, block, reason })` → writes/deletes `blocked/{uid}`, disables/enables the Auth user and revokes sessions (best effort, `authUpdated` in the answer), deletes the account's `pushTokens` and `captureTokens`; refuses self and other admins.
- `capture.ts`: per-key limits from `getLimits()`; `flags.autoCapture === false` → `paused`; `stats/capture_{day}` counts `received`, every outcome (`captured`, `outside_trip`, `bad_token`, `rate_limited`, …) and `ai` (Gemini used). `fx.ts`: per-user limits from `getLimits()`. `ai.ts` (two lines in D1's file): `flagOn('aiImages'|'aiSms')` kill switch → `reason: 'off'`; own-key limits from `getLimits()`. `push.ts`: `stats/push_{day}` `sent / failed / dead`. `config.ts`: `RATE_LIMIT` removed (nothing read it any more). `index.ts`: exports + header line.
- D1's `nudge.ts` already reads `getLimits().nudgePerDay` and `flagOn('nudges')` and writes `stats/nudge_{day}.sent`; the `denied` counter is requested in D2.md #1.
- New `functions/test/admin.emulator.test.ts` (5 tests, unsigned JWT the emulator accepts): auth/permission refusals, `adminStats` shape and totals, block → entry + key cleanup → unblock, self/admin/input guards, and the webhook bumping `stats/capture_{day}`.

### Client
- New `src/lib/flags.ts` (+ 10 tests): `FLAG_NAMES`/`FLAG_INFO`, `AppConfig`, `resolveAppConfig` (missing → everything on), `toAppConfigDoc`, `semverOf`/`compareSemver`/`updateRequired`, `announcementActive/Key`, per-device dismiss, `signupsOpen`, `writesOpen`, `resolveBlockInfo`, and the live store (`startAppConfig(mode)` — one `onSnapshot` on `config/app`, localStorage copy for first paint, cached-missing snapshots ignored; `watchBlocked`). A test reads `firestore.rules` and asserts the flag list matches `validFlags`.
- New `src/hooks/useAppConfig.ts`: `useAppConfig()`, `useFlag(name)` (true unless an admin set false), `useBlocked(uid)`.
- `src/App.tsx`: gates in the signed-in branch — blocked screen ("This account is paused" + reason + sign out), maintenance screen (non-admins; message, Try again, sign out; splash while the admin flag is unknown), update-required screen (non-admins; SKIP_WAITING handshake like UpdatePrompt, then reload), announcement banner at the top of every screen (dismiss = 44 px, warn/info tones) that also tells admins when maintenance or an update requirement is on; `refreshPush`/`claimInbox` skipped while writes are frozen; route `admin/*` inside Layout; flag-gated routes (`liveTables` → `/split`, `/t`, `/t/:code` redirect home and guests get a "Live tables are off for now" screen; `autoCapture` → wizard and `/capture*` redirect, guest capture disabled).
- `src/routes.ts` (+ test): lazy `Admin` chunk, `/admin*` → `Admin`.
- New `src/pages/Admin.tsx` + `src/pages/admin/`: tabs Overview (adminStats: four stat tiles, today's row, three 14-day `AreaChart` sparklines, refresh), Flags & app (maintenance switch + message, minimum version with "you are running x" and a newer-than-this-build warning, announcement text/tone/hide-after date/clear, flag switches with one-line explanations, sign-ups segmented + soft-gate note, ChangedBy, compact Save/Discard bar), Limits (one `IntField` per limit from `LIMIT_META`, clamped on blur, Reset to defaults, pointer to the AI tab for shared-key limits, Save/Discard bar), AI (`AdminAi` unchanged: status line with source, in-app project key set/test/remove, project model, limits incl. `globalPerDay`, compact dirty bar, `refreshAiStatus()` after changes), Users (search by email/uid/name, newest sign-ups by default, block with an inline reason, unblock via `useConfirm`, can't block self). `api.ts` talks to Firestore/callables directly (admin-only screen; no Repo widening). Demo mode shows one explanatory card; non-admins are redirected to Settings; `aiStatus().admin` is still the single admin signal.
- `src/components/AdminAi.tsx` → `src/pages/admin/AdminAi.tsx` (imports only). `src/pages/settings/Admin.tsx` → `<Navigate to="/admin" replace />` (old deep links keep working); `SettingsHome` Admin row → `/admin`.
- `docs/FIREBASE_SETUP.md`: new §5e Admin console (tabs ↔ documents, flags incl. which are server-enforced, rules summary, soft invite-only and the Identity Platform note, maintenance caveat), function table row, data-model paragraph.

## Verified
- `npx tsc -b` 0; `npm run typecheck:all` 0 (app, tooling, functions).
- `npx vitest run`: 65 files, 897 tests green (whole repo, D1's in-flight files included).
- `npm run test:rules` (`HTTPS_PROXY= https_proxy=`, emulator lock honoured): 14 files, 186 tests green.
- `npm run test:functions`: 2 files, 18 tests green (13 capture + 5 admin), run twice.
- `npx biome check` on every file I own or touched: clean after `biome format --write`; the one remaining warning is the owner's model-list effect in the moved `AdminAi.tsx` (behaviour deliberately untouched, as C3 noted). `npm run check` on the whole repo fails only on D1's not-yet-formatted files (`functions/src/ai.ts` parseText, `lib/gemini.ts`, `lib/notify-text.ts`, `nudge-core.test.ts`, `text-ai.test.ts`, `src/components/RemindActions.tsx`); my two lines in `ai.ts` are within the line width and not flagged.
- Not run (plan): Playwright, `vite build`, git.

## Deliberately left out, and why
- **`config/limits` does not hold `aiPerUserPerDay` / `aiGlobalPerDay`.** The owner's `AdminAi` (ADDENDUM, requests 5–7) edits the shared key's `perHour`/`perDay`/`globalPerDay` in `config/ai`; a second copy would have meant two sources of truth for one number. The Limits tab links to the AI tab for them; `config/limits` holds everything that was hard-coded (capture, own-key AI, nudge, FX).
- **Login's invite-only gate is a handoff (D2.md #3), not an edit:** `Login.tsx` is D1's in phase 2 and not in my list. `useAppConfig()` + `signupsOpen()` are ready and work signed out; the patch is six lines.
- **No maintenance screen for signed-out visitors:** Login is not mine, and admins must be able to sign in during maintenance. Signed-in non-admins get the screen the moment config/app flips.
- **UI gating of phase-1 surfaces by flag** (CreateSheet's live-table tile, StatementImport, AutoCapture settings, AI switches) is in D1's files → exact one-liners in D2.md #2. The routes and the servers are gated here, so a switched-off feature is unreachable and inert; only its button copy is pending.
- **Auth `listUsers` for the account total** is paged to 10,000 and marked `usersTruncated` beyond that; a Firestore counter would need a trigger on sign-up that doesn't exist (no Auth emulator in `test:functions`, so the test asserts `users: null`).
- **Blocking does not run `recursiveDelete`** on the user's data: a block is reversible; purging belongs to an account-deletion flow (B's phase-1 note).
- **Stats for `users_{day}`** (new/active users) not added: the plan asked for capture + push + nudge counters; sign-up counting needs an Auth trigger (v1 API).

## Decisions the owner should know
- Admins are exempt from maintenance mode and from "Update required" (they see an amber line at the top instead), so a typo in the console can always be undone from the console.
- Maintenance mode is enforced by the rules, so offline saves queued before it was turned on are rejected when they sync (the app says "the change was undone"). Keep windows short and announce them first; the docs say so.
- Blocking an account: rules refuse every write, the Auth user is disabled and its sessions revoked, push and capture keys are deleted; the person sees "This account is paused" with the reason you typed. Reading still works until their ID token expires (≤ 1 h) — by design, so the screen can say why.
- `config/app.flags.autoCapture`, `aiImages`, `aiSms` are real kill switches (server-side); `liveTables` hides the routes for members and guests; the others hide UI only (D1 wired `quickAdd`, `nudges`, `payLinks`, `duplicates`, `merchantMemory`, `whoseTurn`).
- A missing `config/app` or `config/limits` means everything on and the shipped limits; nothing needs to be created in the console before or after deploy except `admins/<uid>`.
- Invite-only sign-ups are soft (client copy) until an Identity Platform blocking function exists; documented in §5e.
