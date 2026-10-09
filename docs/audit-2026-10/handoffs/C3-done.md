# C3 — Settings IA, Profile, Inbox, Capture, Scan, auto-capture wizard, import, tables

## What changed

Settings IA (new)
- `src/pages/Settings.tsx` — nested router for `settings/*`: `/settings` home, `preferences`, `notifications`, `automation`, `ai`, `data`, `admin` (lazy chunks), unknown → `/settings`. `settings/auto-capture` stays App.tsx's route.
- `src/pages/settings/common.tsx` — `SettingsPage` (header + `usePageTitle`), `SettingsRow`, `useSavedFlash` + `SavedPill` (the quiet "Saved" that replaces every save bar), `SectionTitle`.
- `src/pages/settings/SettingsHome.tsx` — one row per area with a one-line summary (currency · theme · accent; notification state; auto-capture state; AI availability; Admin only when `aiStatus().admin`).
- `src/pages/settings/Preferences.tsx` — default currency (autosaves through `repo.saveProfile`, with the rates Refresh), theme Segmented (labelled radiogroup), AccentPicker.
- `src/pages/settings/Notifications.tsx`, `Automation.tsx`, `Ai.tsx` — wrappers for the three components below; demo/no-VAPID explanations.
- `src/pages/settings/Data.tsx` — export any group as CSV (`groupCsv` + `deliverCsv`), Import from Splitwise link, Install row (prompt / iOS steps), version line.
- `src/pages/settings/Admin.tsx` — `AdminAi` moved here unchanged in behaviour (status line with source, in-app project key set/test/remove, project model, compact Save/Discard bar only when dirty, `refreshAiStatus()` after changes) + a "Flags, limits, stats and users — coming at /admin" placeholder. Non-admins are redirected.

Profile
- `src/pages/Profile.tsx` — account card (photo, name, mobile number, email, sign-in methods), "How friends can pay you" (region groups, one phone field: the mobile number plus a Switch "Friends can pay this number with UPI"), links to Settings and Friends, Sign out at the bottom as a quiet secondary button (the Sheet confirm and its test ids stay). Everything autosaves: 800 ms after the last edit, on blur, and on leaving the screen; no Save button, no floating bar. Old `#auto-capture|#ai|#ai-admin|#notifications|#appearance` deep links redirect to the Settings routes.
- `src/components/ProfileCards.tsx` — `AccountCard` gains `onBlur` + `phoneHint`, loses `currencyField` (currency lives in Preferences); `RatesField` unchanged; `errText`.

Components
- `src/components/AutoCapture.tsx` — content-only (no Collapsible) for Settings → Automation: master switch, "Set up on a new phone" link, what gets captured, filters (`currencySymbol('INR')`), trips, **capture keys with copy and revoke (useConfirm)**, recent activity (`ago()` formats week-old rows as dates), Apple Pay / capture-link advanced section kept behind `<details>`. Glossary: "capture key", never "token".
- `src/components/AiSettings.tsx` — one switch "Read bills and SMS with AI" + consent line + status line (`aiAvailability`); everything else (feature switches, which key, Split Now's key status, own key form with the paid-tier note, **model selector always visible**) under a Collapsible "Advanced" that opens by itself only when the shared key can't serve the account and there is no own key.
- `src/components/AdminAi.tsx` — behaviour unchanged; adds the new `globalPerDay` field B put in `AppAiConfig` ("Everyone / day"), button types, `parseInt(…, 10)`.
- `src/components/NotificationSettings.tsx` — content-only, `Switch` rows (no stretched checkboxes), examples via `formatMoney(…, profile.currency)`, reminders copy without the INR-only threshold, `errText`; exports `notificationsAvailable()`.
- `src/components/AiScanToggle.tsx` — flips only `aiImages` (never the master switch), follows `watchPrefs` (no stale value), hides the switch and shows a link when nothing can read with AI or AI is off in Settings.
- `src/components/InstallBanner.tsx` — gated by `src/lib/install.ts` (2nd visit or first expense), permanent dismiss, iOS copy "Add to Home Screen for notifications and offline use", 44px targets.
- `src/components/CaptureAlert.tsx` — a queue: each new capture is shown in turn; two or more waiting → "N new captured payments — sort them?" → Inbox. Target group via `targetGroupFor` (server suggestion first).
- `src/components/StatementImport.tsx` — gated up front (`aiAvailability` + prefs; the button is replaced by "Statement import needs AI, which isn’t turned on for your account" with the right link), "Preparing screenshots… / Reading with AI…" stages, Cancel (drops the result), offline check, `'unavailable' in r` contract, `errText`, `pos`/`text-muted`.
- `src/components/OfflinePill.tsx` (new) + `src/hooks/useOnline.ts` (new) — `useSyncExternalStore` on online/offline; mounted in Inbox and ImportGroup.

Pages
- `src/pages/AutoCaptureSetup.tsx` — the 3-screen gated stepper (`?step=`, progress dots, `?platform=`): (1) what it does + "Set up on this iPhone / Android" (creates the key for the scope if missing and copies it), (2) iPhone: Add Shortcut + the one Message automation with a mock, sender note, "Test the Shortcut" link; Android: Get MacroDroid, **download the prefilled .macro** when `VITE_ANDROID_MACRO_URL` is set (else the manual checklist), battery exemption; (3) live "Waiting for your phone…" that flips to "Got it: ₹250 at Swiggy, 14:32 — Auto-capture is on" from `lastUsedAt` / a new activity row, the "Keep every payment" switch (`outsideTrips`), Done. Collapsibles at the bottom: Set up by hand (regex, JSON body, copy buttons), Try it from this browser (the old TestSender; demo simulation), Only one trip (scope picker, still honours `?group=`), Your capture keys (copy/revoke with useConfirm), Privacy. Back goes to the group when `?group=` is set, else Settings → Automation.
- `src/pages/Inbox.tsx` — header and tabs render at once with skeleton rows per section; "To sort" badge in rose, "Updates" in brand; `OfflinePill`; "Checking for new captured payments…" while the captures list is only from cache (`useCapturesMeta`); captures honour `suggestedGroup`; **"Add all N to 🏝 Goa trip"** (`bulkCandidates`) → sheet with tick boxes → equal splits you paid, Undo removes them; "Ignore <merchant>" on SMS captures (writes the ignore keyword, marks not shared, Undo restores both); approvals show amount + "added by"; Recently handled delete is an Undo toast and shows all after 15.
- `src/pages/Capture.tsx` — one-tap "Split equally in <group>" saves at once (equal split, you paid) with an Undo toast and goes to the group; "Edit details first" opens the form; a different-currency group goes to the form with the conversion note; "Not shared" has try/catch, busy state and Undo; headline "You paid ₹X (UPI)" when the merchant is unknown; glossary (no "Dismissed"); `usePageTitle`; history back.
- `src/pages/CaptureGuest.tsx` — the failed drop says so ("Couldn’t save this automatically. Sign in and it will be kept.") with Retry; the link is kept either way.
- `src/pages/Scan.tsx` — title "Scan"; currency from the bill (`parsed.currency`) else the profile, shown as a small currency picker next to Total and passed through `pending.receipt.parsed.currency`; AI fallback is a calm toast via B's `unavailableText` (quiet reasons once per session); "That doesn’t look like a bill" card with "Read on this phone instead"; Cancel during OCR/AI; `role="progressbar"` + live label; `formatDate`; "Couldn’t read the total" instead of three "not found" lines; `ListChecks` icon for Split by items; "Create a group first" when there are no groups; `?shared=toolarge` line; `warmOcr()` when on-device is the likely path.
- `src/hooks/useOcr.ts` — `cancel()` + `OcrCancelled`.
- `src/pages/ImportGroup.tsx` — plain copy ("Positive = is owed money. Balances match Splitwise exactly." + a details for how amounts are rebuilt), progress per batch ("Adding people 2/5…", "Importing 120 items…"), back hidden while busy, `OfflinePill`, `<th scope="col">`, radiogroup type chips, `pos`/`neg`, `errText`, `usePageTitle`; the Splitwise totals check is untouched.
- `src/pages/Table.tsx` — guests on a closed table get the UPI app buttons, the exact-amount UPI QR and then the copy rows (`GuestPay`); deep links (`upi://`, `tez://`…) never open in a new tab, only https does; "Ask the host to finish the bill"; button types; `errText`; `usePageTitle`; `text-muted`.
- `src/pages/TableFinish.tsx` — "Claim or split the leftover items first" under disabled Finish buttons, "Different currency (AUD)" subtitle + `aria-disabled`/`title` on other-currency groups, archived groups hidden, `errText`.
- `src/pages/Share.tsx` — glossary ("Scan"), `usePageTitle`.
- `src/lib/share.ts` — `downloadText()`.

Pure logic (+ tests)
- `src/lib/ai-copy.ts` — `aiAvailability()` (shared-key status × own key × switch → one answer).
- `src/lib/install.ts` — `shouldOfferInstall`, `countVisit`, `isInstallDismissed`, `dismissInstall`.
- `src/lib/inbox-sort.ts` — `targetGroupFor`, `bulkCandidates`, `sumCaptures`.
- `src/lib/sms-macro.ts` — `fillMacroTemplate`, `macroFilename`.

## What I verified
- `npx tsc -b`: exit 0 (whole repo) at my finish.
- `npx vitest run`: 54 files, 813 tests, all green (my new suites: ai-copy 6, install 5, inbox-sort 6, sms-macro 4).
- `npx biome lint` on every file I own: 0 errors; the one warning left is `useExhaustiveDependencies` on `AdminAi.tsx:49` (the owner's model-list effect, behaviour deliberately untouched).
- Grep audits over my files: no `(e as Error).message` in toasts (the one left parses Firebase's password-rules text), no native `confirm()`, no `text-slate-400` on text (only on decorative chevrons), no exclamation marks in copy, no "Dismissed"/"Smart scan"/"token" in UI strings.
- E's smoke expectations: `/settings` h1 "Settings", `/scan` h1 "Scan" + "Camera" button, `sign-out`/`confirm-sign-out` kept.
- Not run (plan): `vite build`, emulators, Playwright.

## Deliberately left out, and why
- **Swipe gestures on Inbox cards (06 §H7):** the bulk add and the Ignore button cover the triage cost; a pointer-events swipe needs the shared `useSwipe` helper nobody owns and would collide with the card's two links. Buttons only.
- **A generated MacroDroid macro:** `docs/AUTO_CAPTURE.md` says the schema is undocumented and a broken import is worse than the manual steps; the wizard fills the owner-exported template (placeholders in C3.md #9) and otherwise shows the manual path.
- **A real cancel for the AI stage in Scan:** `useReceiptReader` / `recognizeImage` (A1 / A2) take no `AbortSignal`, so Cancel drops the result and clears the overlay; the worker finishes in the background (A2's singleton reuses it). `useOcr.cancel()` is in place for when a signal exists (C3.md #7).
- **Apple Pay Shortcut / capture-link section** stays in Settings → Automation under `<details>` (06 §L7 suggested the wizard's manual path): it is a different automation (Transaction, not Message) and its only users are already past the wizard.
- **Insights, Join, SplitBill items in 06:** other tracks' files; SplitBill's fallback toast was done by C1.
- **Capture prompt with a 5 s deferred save (06 Q4):** the one-tap add writes at once with an Undo toast (soft delete to Recently deleted + capture back to pending), which is the app's standard pattern.
- **`perDay` / `lite` from B's A1-1:** `AiStatusResult` and `AiModel` in `src/data/repo.ts` don't carry them yet (A1's file), so Scan and the model pickers feature-detect them; nothing to change on my side when A1 adds the fields.

## B's handoff items (B.md → C3), all wired
- C3-1 conditional "All my trips" sentence + outcome line; C3-2 `aiSmsMerchant` switch; C3-3 `classifySharedText` in Share.tsx with the user's filters; C3-4 `unavailableText(reason, { limit })` + `isQuietReason`; C3-5 gone-group key text; C3-6 lite model labels. One naming request back to B in C3.md #8 ("Settings → Auto-capture" → "Settings → Automation" in `sharedTextIgnoredText`).

## Decisions the owner should know
- `/profile` is now identity only (photo, name, number, payment handles, sign-in methods, sign out) with a gear to `/settings`; nothing on either screen has a Save button. Name/number/handles save 800 ms after typing stops and when leaving; a brief "Saved" shows top-right.
- The "Phone number for UPI apps" field is gone: the mobile number is the UPI number when the switch "Friends can pay this number with UPI" is on. Existing profiles with a different stored UPI number keep it (the hint shows which number is shared) until the mobile number is edited.
- AI features for non-admins: one switch and one sentence; the key plumbing is under Advanced. Nothing changed in what is stored or how keys are chosen (`aiEnabled`, `aiImages`, `aiSms`, `aiSource`, `aiModel` as before).
- Statement import no longer lets the user pick six screenshots and then fail: when AI can't read for the account the button is replaced by the reason and the right link.
- The capture prompt's primary button really is one tap now (equal split, you paid, everyone in, Undo in the toast). "Edit details first" is the ghost link under it; a group in another currency still goes through the form so the rate is visible.
- The install banner waits for the second visit or the first expense and never comes back after a dismiss; Settings → Data has the Install row.
- The wizard's "Done" appears only after the phone (or the browser test in demo mode) has forwarded something; "I’ll check later" is always there so nobody is trapped.
- `DEFAULT_MODEL` and `globalPerDay` came from B mid-flight; AdminAi exposes `globalPerDay` as "Everyone / day" next to the per-person limits.
