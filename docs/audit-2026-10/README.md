# October 2026 audit — handover

Everything an engineer or agent needs to continue from where this audit stopped. The code on
`claude/codebase-audit-optimization-k2uyfs` (the audit on top of the owner's
`claude/splitwise-replica-planning-v7w2hw`, merged in up to 89746f2 on 9 Oct) is verified and pushed; the
owner's parallel "feedback round" (`docs/REQUESTS-2026-10-08.md`, 26 items) is included and
treated as binding product decisions throughout.

## What is in this folder

| Path | What it is |
|---|---|
| `reports/01…16-*.md` | The sixteen audit reports (data layer, security, functions, domain logic, UX core/secondary, performance, design system + icon, half-baked features, product/USP research, testing/CI, AI, auto-capture, PWA, accessibility, code quality). Findings are ranked, with file:line references and proposed fixes. Many are now implemented; each report's "already good" and "open questions" sections are still current. |
| `IMPLEMENTATION-PLAN.md` | The plan the implementation tracks followed: global rules, per-track ownership, phase 2, and the ADDENDUM listing the owner's decisions that must not be undone. |
| `AGENT-BRIEF.md` | The brief every auditor received. |
| `handoffs/<Track>.md` | Cross-track requests (contracts, exact one-line changes). |
| `handoffs/<Track>-done.md` | Each track's final report: file list, what it verified, what it left out and why, decisions the owner should know. **Read these before changing the same areas.** |
| `BUNDLE-SIZES.md` | Measured before/after bundle sizes and first-paint analysis. |
| `icon-candidates/` | The icon options shown to the owner (see "Decisions waiting on the owner"). |

## Second pass (9 Oct 2026)

The owner's UI rounds 2 to 7 (`docs/REQUESTS-2026-10-08.md` items 27 to 71, 17 commits on
`claude/splitwise-replica-planning-v7w2hw`) are merged in (commit 421e735) and are **the UI to keep**:
Balances at `/settle` (Friends is gone; `/friends` redirects), settle with one person across groups,
scan history, member photos and first names, Insights charts with motion and filters, the group flow
graph, greeting icons, card fireworks, the toast deck, the + button and tab bar look, the version from
`config/app`, and the group-delete fix. The audit's engineering sits underneath (shared store, lazy
routes, errText, useConfirm, MoneyInput, page titles, skeletons, flags, a11y attributes, archived groups
left out of totals, local-date Insights maths). Then:

- `config/app`: the owner's version editor and the admin console overwrote each other. `version` is now a field of `AppConfig` (kept by `toAppConfigDoc`, merge write, one listener, whitelisted in the rules). The editor lives in `/admin` (Flags & app), the version line stays on Profile.
- Member photos: `isOwnMemberEdit()` in the rules; the sync shares the group-list listener.
- Group delete: the owner's client-side batched delete (works before `onGroupDeleted` is deployed; the trigger sweeps leftovers).
- Aurora: the owner's rAF motion now stops while off-screen or the tab is hidden.
- Seven per-component listeners (capture keys, AI key state) moved onto the shared store (`useCaptureTokens`, `useAiState`).
- Inbox "Add all" marks likely duplicates and leaves them unticked.
- The expense form keeps the scanned photo across a reload (`src/lib/draft-blob.ts`, IndexedDB, 3-day expiry).
- Cancel in Scan really stops the read (`src/lib/abortable.ts`); Statement import says why AI is unavailable.
- Biome: 0 warnings; hook-deps, button-type and the interaction a11y rules are errors.
- First paint 333 → 325 kB gzip (lazy card fireworks, Quick add parser on demand). Tried and rejected: grouping icon chunks (+7 kB on first paint) and aliasing React Router's production build (−0.5 kB, not worth hard-coded dependency paths).

## State at hand-over (all on the final commit)

| Check | Result |
|---|---|
| `npm run typecheck` / `typecheck:all` / functions | clean |
| `npm run check` (Biome lint + format) | 0 errors, 0 warnings |
| `npm test` | 73 files, 1110 tests |
| `npm run test:rules` (Firestore + Storage emulator) | 16 files, 206 tests |
| `npm run test:functions` (emulator) | 18 tests |
| `npm run build` | ok; 114 precached entries, 2.0 MiB; total JS 560 kB gzip, first paint 325 kB (the owner's rounds 2-7 added features) |
| `npm run test:e2e` (Playwright, demo mode, Pixel 7) | 7 passed |

In this container the Storage emulator's Firestore lookup needs the proxy disabled:
`HTTPS_PROXY= https_proxy= npm run test:rules`. CI (`.github/workflows/ci.yml`) runs all of the
above in four jobs; it registers once the workflow reaches the default branch.

## What changed (short; `docs/PLAN.md §9` has the full list)

- **Correctness**: Insights month bucketing in UTC+ zones (months mislabelled, current month missing); exact/percent/shares editors that reset after one digit; split-type row clipped at 360 px; recurring copies inheriting the template's receipt path (purging a copy deleted the template's image); CSV round trip with `;` and `=+-@` in names; negative/non-finite split inputs; concurrent approvals wiped by a full-document save; captures hanging behind captive portals; sign-out destroying queued writes.
- **Security**: anonymous (live-table) users limited to tables and rates; key whitelists and size caps on groups/expenses/settlements; admin-only `config/ai`; creator-only approval policy; push recipients filtered by membership; receipts deletable only under their own group; security headers + report-only CSP; Gemini keys sealed (AES-256-GCM under the `AI_KEY_KEK` secret); webhook per-IP limiter and body cap; masked, bank-only SMS to Gemini; `writesOpen()` maintenance/blocked gate.
- **Efficiency**: one refcounted Firestore listener per key shared across screens (no re-subscribe or spinner on tab switches); build-time repo alias (no serial JS waterfalls); self-hosted Inter; Firestore chunk minus the unused regex engine; recharts replaced by hand-rolled SVG charts; route prefetch; single OCR worker; reminders job gated on recent activity; single capture-log document.
- **UX**: first-run Home, People section, Create sheet with Add expense primary, decomposed expense form with inline validation and drafts, settle-up round-down and waive, Settings information architecture, 3-step auto-capture wizard, Inbox triage (bulk add, ignore merchant, undo), one-tap capture add, accessible Sheet/confirm/segmented controls, contrast tokens, skeletons, offline pill, page titles, app badge.
- **Features**: Remind with pay-me deep link and share card, Nudge push, duplicate warning, merchant memory, natural-language/voice Quick add, whose-turn, budget alerts, leave/archive/remove member, admin console (`/admin`: flags, maintenance, min version, announcement, limits, stats, user blocking, AI).
- **Tooling**: Biome, tooling tsconfig, Playwright smoke suite, CI rewrite, dependabot, `CLAUDE.md`, coverage config.

## Decisions (1 settled, 2 to 6 waiting on the owner)

1. **App icon: decided.** The owner keeps the current mark (`public/favicon.svg`). Do not redesign it. The candidates in `icon-candidates/` are kept only as a record of what was considered and rejected.
2. **The + button.** Audit finding: the Create sheet costs taps versus going straight to Add expense (`reports/05-ux-core.md` #3). Kept as the owner designed it (Add expense is now the first, primary tile). Change only if the owner wants it.
3. **Approval threshold default** is 10,000 minor units (₹100 in INR, "A$100" in the old docs); pick a per-currency default or keep.
4. **Pay-me pages for signed-out friends** (`/r/{code}`) would expose UPI IDs publicly; not built pending a decision.
5. **`aiSms` default on** (bank SMS the app cannot read go to Gemini, masked). Consider opt-in.
6. **Trademark check** for "Split Now" is still pending (pre-existing).

## Deploy checklist (first deploy after this branch)

1. `firebase deploy --only firestore:indexes` first (new collection-group index on `pushTokens.token`), then rules, then functions, then hosting.
2. Secrets: `GEMINI_API_KEY` (existing) and new `AI_KEY_KEK` (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`); see `docs/FIREBASE_SETUP.md §5a/§5d` for rotation.
3. Create `admins/<uid>` for the owner (console). `config/app` and `config/limits` are optional (defaults: everything on, shipped limits).
4. Security headers ship with a **Report-Only** CSP; promote to enforcing after a week of clean reports.
5. App Check is loaded lazily; enforcement stays off until the console shows verified traffic.
6. Optional: TTL policies on `captureInbox` and `rateLimits`; an Auth `onDelete` cascade.

## Open items for the next pass (in rough priority)

Done in the second pass and removed from this list: lint warnings and rule flips, Inbox bulk-add duplicates, receipt photo across reload, real AI cancel, statement-import reason, icon chunk grouping and router alias (measured, rejected).

- **Owner decisions** (see Decisions above, plus): `members[*].email` in group documents feeds the owner's request 26 (find people by email), so dropping it needs a decision; inactive tab labels use slate-400 (owner's look, below 4.5:1 contrast) vs `text-muted`; Home balance-card text kept at the audit's `text-white/90` and the inbox badge at `rose-600` for contrast (owner had `/75` and `rose-500`).
- Component tests (React Testing Library + jsdom as dev dependencies) do not exist; e2e covers 7 flows. Worth adding for SettleWithPerson, the expense editor and Inbox bulk add.
- Group Settle up: an auto-filled amount does not follow a live balance change while the screen is open (deliberate, kept).
- `SettingsHome`/`AdminAi`/`Table` still call `repo.watch*` for single-use documents (`watchAppAi`, `watchTable`); fine, but a store key would match the convention.
- Settling in another currency; year-in-review; Splitwise API import; email forwarding (`reports/09-half-baked.md`).
- Push notifications for comments, disputes and approval decisions; quiet hours (`reports/14-pwa.md` M6) — needs the owner's pick of which.
- Self-hosted Tesseract language data (owner: ~3 MB hosting traffic vs one less CDN dependency).
- Swipe gestures on Inbox cards (`handoffs/C3-done.md`).
- Each report's "Open questions" section.

## How to resume with agents

Give a new agent `IMPLEMENTATION-PLAN.md` (rules + ADDENDUM), the relevant `reports/*.md`, and the
`handoffs/*-done.md` for the areas it touches. Keep the ownership discipline (one owner per file,
requests via handoff notes), re-read files before editing, and finish with the full check list
above. `CLAUDE.md` at the repo root has the day-to-day commands and conventions.
