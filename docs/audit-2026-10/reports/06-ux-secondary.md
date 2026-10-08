# 06 · UX quality of the secondary screens and flows

Lens: a demanding product designer walking every secondary flow end to end. Read in full: `src/pages/{Insights,Profile,Inbox,Capture,CaptureGuest,AutoCaptureSetup,Scan,SplitBill,Table,TableFinish,Join,Share,ImportGroup}.tsx`, `src/components/{AutoCapture,StatementImport,AiSettings,AdminAi,AiScanToggle,NotificationSettings,ProfileCards,Trust,InstallBanner,UpdatePrompt,CaptureAlert,QrCode,AccentPicker,Collapsible,Misc,Layout,Toast,Switch,CreateSheet}.tsx`, `src/hooks/{useOcr,useReceiptReader,useInbox,data}.ts`, `src/lib/{capture,inbox,capture-settings,sms-setup,ai,ocr,chartPalette,profileSummary}.ts`, `functions/src/lib/notify-text.ts`, `docs/AUTO_CAPTURE.md`. One claim (Insights timezone) was verified by running the bucketing code under `TZ=Asia/Kolkata`.

## 1. Summary

The secondary surfaces are unusually complete for an app this size: every async path has *some* loading state, destructive actions mostly have Undo, copy is written for humans, and the capture inbox's "nothing is added without you" promise is kept everywhere. The problems are of two kinds. First, a few real bugs that undermine trust in exactly the screens meant to build it: the Insights trend chart drops the current month and shifts every month by one for anyone in India (UTC+5:30), Smart scan prints amounts in whichever group happens to be first in the list, and the Inbox's trash icon is a permanent delete with no confirmation while the rest of the app has Undo. Second, structural debt: Profile has become a nine-card settings dump with two Save affordances and mixed autosave, the 36 KB auto-capture page reads as documentation rather than a setup flow, the AI-key UI exposes infrastructure choices to every user, and the same concept is named three or four different ways across screens (Not shared / Dismissed; Captured payment / Payment / capture; Split a bill / Split by items / Live table / table). Verdict: ship-blocking bugs are few and cheap to fix; the IA and copy work is the larger investment and is what will make the app feel finished.

## 2. Findings by severity

Confidence tags: [Certain] verified in code or by execution; [Likely] strong reading of the code, not executed; [Guessing] judgement call.

### Critical

#### C1. Insights monthly chart is off by one month and drops the current month in UTC+ timezones [Certain]
`src/pages/Insights.tsx:200-207`
```ts
const start = new Date(first.slice(0, 7) + '-01T00:00')          // local midnight
for (let d = new Date(start); d <= now; d.setMonth(d.getMonth() + 1)) {
  const k = d.toISOString().slice(0, 7)                            // UTC → previous month in IST
  series.set(k, { label: d.toLocaleDateString(appLocale(), { month: 'short' }), value: 0 })
}
for (const r of rows) { const s = series.get(r.e.date.slice(0, 7)); if (s) s.value += r.v }
```
Local midnight on 1 March in Asia/Kolkata is 28 Feb 18:30 UTC, so the key becomes `2026-02` while the label says "Mar". Every expense is then added to the bucket labelled one month *later*, and the current month's bucket does not exist at all, so October spend silently disappears. Verified with node: in `TZ=Asia/Kolkata` an expense dated 2026-10-05 is dropped and 2026-03-20 lands under "Apr"; in UTC and America/Los_Angeles the output is correct. This is the headline chart for an India-first app. The cutoff on line 176 (`new Date(now - days*86400000).toISOString().slice(0,10)`) has the same UTC drift (off by one day near midnight).

Fix:
```ts
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
for (let d = new Date(start); d <= now; d.setMonth(d.getMonth() + 1)) {
  series.set(ym(d), { label: ..., value: 0 })
}
```
and compute the cutoff from `todayISO()` arithmetic (there is already a local-date helper in `src/lib/id.ts`). Add a unit test for `compute()` that runs the month path with `TZ=Asia/Kolkata` set in the vitest config (or construct dates via a `localYm` helper and test that). Also see M2 for year labels.

### High

#### H1. Smart scan shows amounts in the wrong currency [Certain]
`src/pages/Scan.tsx:92` `const cur = data[0]?.group.currency ?? defaultCurrency()`, used at lines 143, 148, 161. "What we found" formats the receipt total and every line item in the currency of whatever group sorts first, not the bill's. A user with an AUD trip listed first scans an Indian bill and reads "A$1,240.00". The AI reader returns `parsed.currency` (SplitBill uses it correctly at `SplitBill.tsx:58`); the OCR path does not, but the profile currency is a far better default than "first group".

Fix: `const cur = receipt?.currency && CURRENCIES.includes(receipt.currency) ? receipt.currency : profile.currency` (import `useMe`), the same for the payment card, and show the currency as a small chip next to "Total" so a wrong guess is visible and tappable. Pass `cur` through `pending.receipt` so the expense form starts in it.

#### H2. Inbox "Recently handled" trash icon is a permanent delete with no confirm and no undo [Certain]
`src/pages/Inbox.tsx:190-191` calls `repo.deleteCapture`, which is `batch.delete(captureRef(...))` at `src/data/firebaseRepo.ts:688-692`. Everywhere else deletions are soft with a 6 s Undo (`src/components/Trust.tsx:39-54`). The icon sits 40 px from the "Back to sort" icon in a list of small rows.

Fix: either remove the button (the list already trims to 15 and these rows are inert history), or make it undoable: keep the `Capture` object, call `deleteCapture`, and toast `Deleted "${c.merchant}"` with `action: { label: 'Undo', run: () => repo.saveCapture(user.uid, c) }`. Prefer removal; the capture doc is tiny and the user gains nothing by deleting it.

#### H3. "AI isn't available" is shown as an error that blames the user and sends them to configure an API key [Certain]
`src/pages/Scan.tsx:67`, `src/pages/SplitBill.tsx:92`: `toast('AI isn't available, so this was read on the phone. Set it up in Profile → AI features.', 'err')` (red). `src/components/StatementImport.tsx:106`: `'AI isn't available. Turn it on or add your own Gemini key in Profile → AI features.'`. Whether AI is available is an *admin* decision (`AdminAi` mode off / allowlist) or a quota event; a normal user cannot "set it up" without obtaining a Google API key. The fallback actually worked, so this is not an error.

Fix:
- Scan/SplitBill: tone `'ok'`, text `Read on this phone (AI not available right now)`. Only append `· Use your own key` (as a toast action that deep-links to `/profile#ai`) when `aiStatus.app.images !== 'available'` AND the user already has a key or the admin mode is `off`/`not_listed`; never on a transient quota/server error.
- StatementImport: this path has *no* fallback, so gate it up front. Call `repo.aiStatus()` on mount; if images AI is not available for this account, render the empty-state card with the button disabled and copy `Statement import needs AI, which isn't turned on for your account.` plus a secondary link `Add your own Gemini key` only when that is actually a possibility. Do not let the user pick six screenshots and then fail.

#### H4. "Scan a bill → itemized split" always forces the live-table ceremony, even when the host is alone with the receipt [Certain]
`src/pages/ExpenseForm.tsx:38` ("Item-by-item splits happen on a live table (/split); Items stays only to edit older itemized expenses"), `src/pages/SplitBill.tsx:107-123` (the only exit is "Start table"), `src/pages/Table.tsx:152` (the QR sheet auto-opens when the host is the only participant). The common post-hoc case, "I have the Blinkit receipt from the flat, let me assign items to my 3 flatmates", becomes: start table → dismiss QR → Person → type name → Add (×3) → "Claiming for" chip → tap items → Finish → map who's who. The group's members are already known.

Fix: when `groupId` is set in SplitBill, seed participants from the group in `draftToTable` (name + uid for members with accounts, name only for placeholders), do not auto-open the QR sheet when `order.length > 1`, show the "Claiming for" chips immediately, and pre-fill the Finish mapping from those seeded ids. Add a second footer action in SplitBill: `Assign items myself` (same table, QR hidden) next to `Start table`. Keep the QR route for restaurants.

#### H5. The auto-capture setup page is documentation, not a flow; a non-technical friend will not finish it [Likely]
`src/pages/AutoCaptureSetup.tsx` (36 KB). Problems a first-time user hits in order:
- All five steps, "Your keys", "Privacy" and two "Profile → Auto-capture" links render on one scroll with no sense of progress or completion.
- Step 3 shows a 4–7 item checklist with mock screenshots, a regex (`(?is)^(?!.*\b(otp|…`), a JSON body with `[sms_message]`, "magic text", `%SMSRB`, and two "Copy Webhook URL / JSON body" buttons *above* the instructions. When `VITE_IOS_SHORTCUT_URL` is set, the manual path is still fully shown (lines 266-283 branch inside the same list).
- Step 5 is titled "You're set" and renders as soon as prefs load, before any test has succeeded or a message has been received (lines 142-153). The only signal of success is buried in the keys list ("Nothing received yet").
- Step 2 requires a tap to create a key even for "All my trips" (line 119); nothing else can proceed without it.
- `back="/profile"` is hard-coded (line 81), so arriving from a trip's "Set up for this trip" link and tapping back loses the group.
- Terminology inside the page: "key", "capture key", "token", "scope", "webhook".

Fix (concrete restructure, no new backend):
1. Make it a real stepper: one step per screen with Back/Next, `?step=` in the URL, progress dots. Steps: *Which trips* → *Your phone* (platform picker + the shared Shortcut / MacroDroid button only) → *Test* → *Done*. Auto-create the key when the user leaves step 1 (`repo.createCaptureToken`), show it only inside the phone step with one Copy button.
2. Hide the manual path behind `<details>Set up by hand</details>` when the shared Shortcut / macro URL exists; move Webhook URL / JSON body buttons inside it.
3. Gate "Done" on `outcome.kind === 'ok'` or `tokens.some(lastUsed)`; otherwise the last step reads "Waiting for your first message" with the Recent activity list and a "Send test" button.
4. Move "Your keys" and "Privacy" out of the wizard into Profile → Auto-capture (keys are already listed there, `AutoCapture.tsx:334-356`).
5. `back` should honour `params.get('group')` → `/groups/${id}`, else history.
6. Rename "key" consistently (see H8): call it **capture key** everywhere, never "token".

#### H6. Profile is a settings dump with two Save affordances and a mixed persistence model [Certain]
`src/pages/Profile.tsx:119-227`. Nine stacked cards: Account, Appearance, Payment handles, Notifications, Auto-capture, AI features, Admin · AI, Friends & balances, Install app, then a full-width "Save profile" button *and* a floating "Unsaved changes" bar (lines 203-213). Appearance, notification types, AI switches and auto-capture settings autosave; name, phone, currency and payment handles need Save (`ProfileCards.tsx:66` has to explain this in a footnote). Sign out is the single header action in red (line 122), the most prominent control on the page. "Friends & balances" is a primary feature, not a setting. The mobile number and "Phone number for UPI apps" are two fields for one number with mirroring logic (lines 67-72, 106-107).

Fix: see §5 for the IA. Minimum viable change inside the current page: autosave the four explicit fields on blur with a 600 ms debounce through `repo.saveProfile` (the write is already optimistic/offline-safe), delete the Save button and the unsaved bar, move Sign out to the bottom as a quiet secondary button, move Friends & balances to the Groups tab header, merge the two phone fields into one with a `Switch` "Friends can pay this number with UPI".

#### H7. Inbox triage is one card at a time with no bulk path and no noise control where the noise appears [Certain]
`src/pages/Inbox.tsx:123-156`. Each capture needs ≥2 taps (open or "Add to X", then the full expense form). After a trip you may have 20 SMS captures for the same live trip. "Not shared" has Undo (good) but no "always ignore this merchant"; ignore keywords live in Profile → Auto-capture (`AutoCapture.tsx:244-301`). No swipe gestures. The "Needs your OK" rows show the description and your share but not the amount or who added it.

Fix:
- Bulk: when ≥2 pending captures share the same `suggestedGroup`, show a header action `Add all N to {emoji} {name}` that opens a confirm sheet listing them (merchant · amount · date, each with a checkbox) and saves equal-split expenses via `buildExpense` from `src/lib/statement.ts`, then toasts with Undo (delete the N expenses).
- Noise: after "Not shared", extend the toast with a second action `Ignore {merchant}` → `addIgnoreWord(prefs.ignoreWords, merchant)`; or render a chip under the card.
- Swipe: a `useSwipe` on `CaptureCard` (left = Not shared, right = Add to best group) using pointer events; keep the buttons for discoverability.
- Approvals: add `formatMoney(e.amount)` and `added by {name}` to the subtitle.

#### H8. Terminology is inconsistent across screens for the same concept [Certain]
Found in copy strings:
| Concept | Names used | Where |
|---|---|---|
| A captured payment the user rejected | "Not shared", "Dismissed", "marked as not shared", "Dismissed — it won't be shared" | `Inbox.tsx:74,151,177`, `Capture.tsx:97-98,128,172` |
| The auto-capture object | "Captured payment", "Payment", "capture", "New payment", "Unsorted payment" | `Capture.tsx:183`, `ExpenseForm.tsx:335`, `Inbox.tsx:113`, `notify-text.ts:45-46` |
| The queue | "To sort", "sort it into a group", "Recently handled", "waiting for your OK" | `Inbox.tsx:44,81,166`, `CaptureAlert.tsx:53` |
| The itemized live split | "Split a bill", "Split by items", "Live table", "Join a table", "table", "Finish the bill", "Split at the table" | `CreateSheet.tsx:26`, `SplitBill.tsx:130`, `Table.tsx:82,166`, `TableFinish.tsx:34,84` |
| Paying someone back | "Settle up", "Record a payment", "Payments to me", "paid you back", "Settle" | `CreateSheet.tsx:29`, `NotificationSettings.tsx:17`, `GroupDetail.tsx:177` |
| The automation credential | "key", "capture key", "token", "Create key for all trips" | `AutoCaptureSetup.tsx:106-120,157`, `AutoCapture.tsx:146`, `sms-setup.ts` |
| Scanning | "Smart scan", "Scan", "Scan a screenshot" | `Scan.tsx:102`, `CreateSheet.tsx:27`, `Share.tsx:34` |
| AI | "AI features", "Read with AI", "Use AI", "Gemini", "Split Now's key" | `Profile.tsx:177`, `AiScanToggle.tsx:17`, `AiSettings.tsx:89,108` |

Fix: adopt one glossary and apply it as string edits (no logic change):
- **Captured payment** (object) · **Inbox** (place) · **Not shared** (verb and state; delete "Dismissed" everywhere, `Capture.tsx:97` title becomes "Not shared").
- **Split by items** (the feature, `CreateSheet` tile and page title) · **Table** only in "code" / "join" copy for guests · "Finish" stays.
- **Settle up** (the action), **Payment** (the record). `NotificationSettings` "Payments to me" → "Someone pays you back".
- **Capture key** everywhere; never "token" in UI.
- **Scan** (drop "Smart").
- **AI reading** as the section title; "Google Gemini" named once in the explanation only.

### Medium

#### M1. Insights period and basis reset on every visit while group is in the URL [Certain]
`Insights.tsx:23-26`: `groupId` comes from `useSearchParams`, `period` and `basis` are `useState`. Fix: `const period = (params.get('p') as Period) ?? '3m'` and write back with `setParams`, same for `b=mine|total`; default `3m` and `mine` are omitted from the URL.

#### M2. Month labels have no year; 12 months and "All time" produce "Jan … Jan" [Certain]
`Insights.tsx:205` labels with `{ month: 'short' }` only. Fix: when the series spans a year boundary use `MMM ’YY` (`{ month: 'short', year: '2-digit' }`); for "All time" over 24 months bucket by quarter ("Q1 ’25").

#### M3. "My share / Group total" toggle is shown for a personal group where it does nothing [Certain]
`Insights.tsx:68` always renders it; `compute()` line 181 ignores basis for `type === 'personal'`. Fix: hide the second `Segmented` when `single?.group.type === 'personal'`.

#### M4. 30-day view: the oldest weekly bucket holds 2–3 days of data and reads as a dip [Certain]
`Insights.tsx:209-216`: 5 buckets of 7 days against a 30-day cutoff; labels are each bucket's *end* date. Fix: use a 28-day window (4 full weeks) when `period === '1m'` (rename the segment "4 weeks"), label buckets "w/c {Mon date}".

#### M5. Insights does not answer the questions people actually have [Guessing on priority, Certain on absence]
Present: category donut, trend, paid vs share (single group only), top 5. Missing: comparison with the previous period, who you spend with across groups, what has been unsettled for a long time, and anything shareable. Fix, in order of value per effort:
1. **Previous period delta**: in `compute()` also run the same aggregation for `[cutoff - days, cutoff)` and return `prevTotal`; KPI subline `↑ 12% vs previous 3 months` (grey, with an `aria-label` that spells it out).
2. **With people** card (All groups): from `d.debts`/`d.net` across shared groups, top 5 counterparties by total shared spend in the period, each row linking to `/friends`. The data is already in `GroupData`.
3. **Settle-up nudge** card: for each shared group with `net[me] < 0`, the oldest expense date that is still unsettled; "You've owed Priya ₹1,240 since 12 Sep" → `/groups/:id/settle`. Server reminders exist (`functions/src/reminders.ts`), the UI counterpart does not.
4. **Year in review** (period `12m`, after 1 Dec): a single shareable card (total, top category, most expensive day, busiest group) rendered to canvas for `navigator.share`.

#### M6. Charts have no text alternative; the bar chart relies on colour alone [Certain]
`Insights.tsx:85-92,109-123,130-140`: Recharts SVGs with no `role`, `aria-label` or data table; the donut's legend list (lines 94-103) is the only readable fallback. Fix: wrap each chart in `<figure aria-label="Spending per month, {n} months">` with the SVG container `aria-hidden` and an `sr-only` `<table>` of the series (one row per bucket / member). For Paid vs Share, print values at bar ends (`<LabelList position="right" formatter={compact}>`) so the legend is not the only decoder.

#### M7. `Segmented` has no ARIA semantics [Certain]
`src/components/Misc.tsx:49-63`: plain `<button>`s; no `aria-pressed`, no `role`, no arrow keys. It is the control for Inbox tabs, Insights period/basis, Scan mode and the platform picker. Fix: `role="radiogroup"` on the container with `aria-label` prop, `role="radio" aria-checked` on each option, roving `tabIndex`, arrow-key handling (copy from `AccentPicker.tsx:14-22`). For Inbox pass `role="tablist"`/`"tab"` via a prop and link panels with `aria-controls`.

#### M8. NotificationSettings uses a raw checkbox styled as a switch; hints hard-code ₹ [Certain]
`NotificationSettings.tsx:105` `<input type="checkbox" className="h-6 w-11 accent-brand-600">` while every other section uses `Switch` (`Switch.tsx`). Hints at lines 14 and 18 say "₹840 at Swiggy" and "over ₹500" regardless of the user's currency. Fix: replace with `<Switch checked disabled onChange label={t.label} />`; build the example with `formatMoney(84000, profile.currency)` or drop the number ("a gentle weekly nudge when you've owed someone for a week").

#### M9. Home badge merges "to sort" and "unread updates" into one red count [Certain]
`Home.tsx:26` `const inbox = box.count` (= `toSort + unread`), rendered rose at lines 90-93; the Inbox then shows them as two separate badges. Informational updates should not be red. Fix: badge number = `box.toSort` in rose; when `toSort === 0 && unread > 0` show a small brand-coloured dot, no number.

#### M10. CaptureGuest "failed" state never tells the user that the automatic save failed [Certain]
`CaptureGuest.tsx:47-60`: `'login'` and `'failed'` render the same "Sign in to save ₹X at Y" banner. Fix: for `failed`: "Couldn't save this automatically. Sign in and it will be kept." with a `Retry` button that clears `submitted` for this `search` and re-runs the effect.

#### M11. Capture prompt `dismiss()` has no error handling and no busy state [Certain]
`Capture.tsx:126-130`: `await repo.updateCapture(...)` with no try/catch; a rejection leaves the user on the page with no feedback. Fix: wrap like `personal()` (lines 111-124), set `busy`, toast on error.

#### M12. "Split equally in {group}" promises a one-tap add but opens the full form [Certain]
`Capture.tsx:164-166` navigates to `/add?group=…&capture=…`; the Inbox card says "Add to {group}" for the same action. The whole point of auto-capture is speed. Fix (recommended): make the primary button really one-tap: build an equal-split expense (`buildExpense` in `src/lib/statement.ts`, payer = me, members = all), `saveExpense`, mark the capture `assigned`, toast `Added to Goa Trip · ₹840` with actions `Undo` and `Edit` (→ the expense edit route). Keep a quiet `Edit details first` ghost link under it. If that is too bold, at least rename to "Add to {group}" to match the Inbox.

#### M13. The QR icon is used for "Split by items" / "Split a bill" [Certain]
`Scan.tsx:153` and `CreateSheet.tsx:26` use `QrCode` for the itemized split; the QR is a means for guests, not the task. Fix: `ReceiptText` or `ListChecks` from lucide; keep `QrCode` for "Show QR" only.

#### M14. Scan result rows show raw ISO dates and three "not found" lines [Certain]
`Scan.tsx:144` renders `receipt.date` (yyyy-mm-dd from `parseDate`). Fix: `formatDate(receipt.date, { day: 'numeric', month: 'short' })`. Collapse "Total not found / Date not found / 0 line items" into one line: "Couldn't read the total — you can type it on the next screen."

#### M15. Guests who finish a table get copyable handles but not the exact-amount UPI QR the settle-up screen has [Certain]
`Table.tsx:410-427` lists `payOptions` with copy/open buttons, but `payOptions` already returns `qr: link` and `apps: [...]` for the UPI option (`src/lib/payments.ts:107`) and the closed view renders neither. Fix: for the option with `o.qr`, render `<QrCode value={o.qr} size={180} label="UPI QR for your share">` above the list and the `o.apps` buttons (GPay / PhonePe / Paytm) under it, exactly as SettleUp does. For a guest on another phone the deep links matter more than the QR, so order: app buttons, then QR, then copy rows.

#### M16. Disabled "Finish" buttons give no reason [Certain]
`TableFinish.tsx:56` disables other-currency groups with only "(AUD)" appended; lines 152 and 190 disable the primary button while items are unclaimed with no text under it. Fix: `<p className="text-xs text-slate-500">` under the button: "Claim or split the {n} leftover items first"; for currency: subtitle "Different currency ({g.currency})" and `aria-disabled` with `title`.

#### M17. ImportGroup explanation is long and technical; no progress during a large import [Certain]
`ImportGroup.tsx:255`: "Splitwise's file has each person's net per expense, not who paid what, so each expense is rebuilt as 'paid by the people who are owed'. Every balance stays exact." Fix: keep "Positive = is owed money. Balances match Splitwise exactly." and move the rebuilding note into a `<details>How amounts are rebuilt</details>`. During `run()` (lines 123-185) the button only says "Importing…"; `bulkImport` is one call but `addMember` loops; show `Importing {i}/{n}…` for newcomers and disable the back button.

#### M18. Join: dead-end "Invite not found" and a possibly empty name [Certain]
`Join.tsx:39` has no action; line 58 builds "I'm not listed — join as {profile.displayName}" which can be empty for a brand-new account. Fix: add `Go home` / `Ask for a new link` (share sheet with a prefilled message) buttons; fall back to "join as you" and prompt for a name inline when `displayName` is empty.

#### M19. AI settings expose infrastructure choices (which key, model, quota status) to every user [Certain on the UI, Guessing on the recommendation]
`AiSettings.tsx:101-168`: "Which key: Automatic / Only my key / Only Split Now's key", a status table ("Not enabled for your account", "Off for this"), a Gemini API key field, a model picker. A non-technical user has no mental model for any of this. Should it be user-facing? Partly. The *choice* to send photos/SMS to an AI is a privacy decision users must own; the *key plumbing* is not.

Fix: show two switches by default (`Use AI`, and under it `Bills & statements` / `Bank SMS the app can't read`) plus one status line ("Available", or "Not turned on for your account" with a `Learn more` link). Put everything else under `<details>Advanced: use your own Gemini key</details>`, opened automatically only when `status.app.images !== 'available'` and `mode !== 'off'` (i.e., BYOK is the user's only route). Hide the model picker unless a key is saved. Move `AdminAi` to its own route (`/admin/ai`) linked from the Advanced section for admins.

#### M20. Raw error messages leak to toasts across all secondary screens [Certain]
`toast((e as Error).message, 'err')` appears in every file read (e.g. `Inbox.tsx:73`, `Profile.tsx:113`, `Join.tsx:53`, `Table.tsx:126`, `ImportGroup.tsx:182`). Firebase errors read "Missing or insufficient permissions" or "FirebaseError: [code=unavailable] …". Two mappers already exist (`Login.tsx friendly()`, `ProfileCards.tsx linkError()`). Fix: one `friendlyError(e, fallback)` in `src/lib/errors.ts` mapping `permission-denied` → "You don't have access to that any more", `unavailable`/offline → "You're offline — this will retry", `not-found` → "That's been removed", else `fallback`; use it in every catch.

#### M21. Long async work cannot be cancelled and AI has no timeout [Certain]
`useOcr.ts`, `useReceiptReader.ts`: no `cancel()`; `recognizeImage` in `src/lib/ocr.ts` creates and terminates a worker per call but exposes nothing mid-flight; `readReceipt` in `src/lib/ai.ts:40` awaits `repo.readReceiptAi` with no timeout, and `StatementImport.onFiles` awaits up to six images with only a spinner. Fix: accept an `AbortSignal`; in `recognizeImage` call `worker.terminate()` on abort; in `readReceipt` race the AI call against `AbortSignal.timeout(25_000)` and fall back to OCR on timeout; show a `Cancel` button in the overlay (`Scan.tsx:114-121`, `SplitBill.tsx:137-144`) and in the Statement button while busy. The indeterminate bar for the AI stage exists (`index.css:182`), good.

#### M22. Inbox blocks the whole page on every group's expenses loading [Certain]
`Inbox.tsx:36` returns `<Loading />` until `data` (all groups' expenses and settlements, `hooks/data.ts:188-230`), captures and the capture list are all present, although the Updates tab needs only the activity feed. Fix: render the header and tabs immediately; show per-section skeleton rows; the "To sort" captures list needs only `captures` and `groups`, approvals need `data`.

#### M23. Three banner systems compete for the same slot [Certain]
`InstallBanner.tsx:102`, `UpdatePrompt.tsx:53`, `CaptureAlert.tsx:48` all render `fixed … bottom-[calc(var(--nav-h)+2rem)]` and coordinate through `data-update-ready` / `data-capture-alert` attributes on `<html>` (`UpdatePrompt.tsx:45`, `CaptureAlert.tsx:42`). Fix: one `BannerSlot` context in `Layout` with a priority queue (capture > update > install) and a single mount point; each banner registers/unregisters.

### Low

- **L1.** `Insights.tsx:245` KPI "Top category" is `text-xl truncate` in a half-width card; "🏨 Accommodation" clips at 320 px. Use `text-lg` and allow two lines.
- **L2.** `Insights.tsx:161-166` the "≈ converted" and "not included" notes are centred grey footers; move the ≈ note into the KPI subline and the exclusion into the group picker as a hint on those options.
- **L3.** `AutoCaptureSetup.tsx:168` `toLocaleDateString()` without `appLocale()`; every other date uses it.
- **L4.** `Inbox.tsx:49,166` "Recently handled · 15" is silently capped at 15 with no "show more".
- **L5.** `Scan.tsx:176-186` with zero groups the "Add to which group?" list is empty with no message; add "Create a group first" with a link to `/groups/new`.
- **L6.** `AccentPicker.tsx:42` swatches are `max-w-8` (32 px) targets in a row of eight; acceptable but under the 44 px guideline; add `p-1` hit padding.
- **L7.** `AutoCapture.tsx:142-189` "Advanced: Apple Pay Shortcut and capture links" exposes the Firestore REST URL with the web API key and a JSON document body inside a Profile section. Correct behind `<details>`, but it belongs in the wizard's manual path, not in settings.
- **L8.** `Capture.tsx:183` page title "Captured payment" with `back="/inbox"` even when arriving from a push notification or the in-app alert; use history when available (`PageHeader back` already supports `true`).
- **L9.** `Table.tsx:105` expired-table copy "Ask the host to settle it in Split Now" uses "settle" for finishing a bill; say "Ask the host to finish the bill".
- **L10.** `QrCode.tsx:11` default `aria-label` reads the whole URL aloud; `Table` and `GroupDetail` pass labels, `SettleUp` should be checked (out of lens).

## 3. Flow-by-flow verdicts

**Scan a bill → itemized split.** Camera/Photos → overlay with AI or OCR progress → "What we found" → "Split by items" → `/split` pre-filled (merchant title-cased, items, tax/tip/discount derived, "Bill says ₹X (+₹Y) · Fix with tax" reconciliation) → "Start table" → QR sheet → guests tap → Finish → who's who → expense. The reconciliation step is excellent. Failures: H1 (currency), H4 (forced table), M13/M14 (icon, dates), M21 (no cancel). The AI toggle under the scan buttons (`AiScanToggle`) is the right place for the privacy choice.

**Capture an SMS → inbox → expense.** Push "You spent ₹840 at Swiggy — add to Goa Trip?" → `/capture/:id` prompt with ranked groups and the live trip pre-selected → full form → saved, capture marked assigned. The prompt is the best-written screen in the app. Failures: M12 (not one tap), H7 (no bulk), H2 (hard delete in Handled), M9/M10/M11. The in-app `CaptureAlert` (20 s, suppressed on inbox/capture routes) is well judged.

**Live table from QR to finished expense.** Join form (name only, remembered in localStorage) → items with "Unclaimed" amber rings and per-person chips → shared-portion stepper → "Everyone" totals with tax/tip proportional → host Finish: leftovers button, group picker, who's who mapping with auto-match. Closed view for guests: share + pay handles. Strong. Failures: M15 (no UPI QR for guests), M16 (silent disabled buttons), L9. The 24 h expiry and "Finish it to add the expense" host banner are good.

**Import from Splitwise.** Dashed drop card with the three export steps → summary tiles → balances table with "Matches Splitwise ✓" → group details with type guess → who's who → Import. This is the most polished secondary flow. Failures: M17 (long copy, no progress). The "Nobody is mapped to you" warning should probably block, not warn, when importing into a new group (otherwise the importer has no share of anything) — open question Q2.

**Set up auto-capture.** See H5. The *content* is accurate and unusually honest about platform limits (the "sender" explainer, battery-saver tips per brand); the *form* is wrong for the audience. The demo-mode simulated webhook is a great testing idea.

**AI settings.** See M19. The copy is clear sentence by sentence ("Photos go to Gemini to read items, taxes and transactions") but the structure asks users to make infrastructure decisions.

**Profile.** See H6 and §5.

**Insights.** See C1, M1–M6. The donut legend with % and amounts, the "≈ converted" honesty, and the CVD-safe palette (`chartPalette.ts`) are good; the page answers "what did I spend on" and not "is this more than usual", "with whom", or "what should I do about it".

**Inbox.** See H7, M9, M22. The two-tab split (To sort / Updates) with auto-select of the tab that has work is right. "Pending" vs "assigned" never leaks into UI as jargon (good); "To sort" / "Needs your OK" / "Recently handled" are clear, but "Not shared" vs "Dismissed" is not (H8).

## 4. Loading and error states (audit)

| Async thing | Loading | Error | Cancel | Verdict |
|---|---|---|---|---|
| OCR (`useOcr`) | % progress bar over the image | toast with raw message | none | add Cancel (M21), friendly error (M20) |
| AI bill reading (`useReceiptReader`) | "Reading with AI…" indeterminate bar, then OCR % on fallback | red "AI isn't available" toast on a *successful* fallback (H3) | none, no timeout | fix tone, add timeout (M21) |
| Statement AI (`StatementImport`) | button spinner "Reading with AI…" | toast after picking files (H3) | none | gate up front |
| FX fetch (`RatesField`) | spinning icon, status dot | toast "Couldn't reach the rates service" / "You're offline" | n/a | good |
| QR generation (`QrCode`) | synchronous | n/a | n/a | good |
| Import parsing (`ImportGroup`) | synchronous parse; "Importing…" | red card with parser message | none | add progress (M17) |
| Capture creation (`CreateFromLink`) | full-page spinner | Empty with error + Add manually / Home | n/a | good |
| Guest capture (`CaptureGuest`) | dark spinner | falls to Login without saying it failed (M10) | n/a | fix copy |
| Table (`useTable`) | spinner; "Table not found" / "expired" empties | guest sign-in error explained | n/a | good |
| Inbox | whole page until all groups load (M22) | per-action toasts | n/a | skeletons |
| Insights | spinner until all groups load; rates failure silently excludes groups with a footnote | n/a | n/a | acceptable |
| Webhook test (`TestSender`) | spinner in button | three-tone outcome cards incl. "Backend not deployed yet" | n/a | excellent |
| Profile save | button disabled, "Saving…" | toast raw message | n/a | autosave (H6) |

## 5. Proposed Profile / Settings information architecture

Today everything lives on `/profile` as collapsible cards plus `/settings/auto-capture` as the only sub-route. Proposed:

```
/profile            Account (what other people see, and how you sign in)
  avatar · name · email · mobile number
  Sign-in methods (Google / password)
  "How friends can pay you" (payment handles)        ← stays here: it is identity other people consume
  [Sign out]  (bottom, secondary)                    ← out of the header
  version line

/settings           Settings (how the app behaves for you)
  Preferences       default currency + rates refresh · appearance (theme, accent, dual tone) · locale
  Notifications     push on/off for this device · types (uses Switch)
  Automation        Auto-capture (status · what gets captured · filters · trips · keys · recent activity · "Set up on a new phone" → /settings/auto-capture wizard)
                    Scan & AI (Use AI switch · two feature switches · status line · Advanced: own key)
  Data              Import from Splitwise · Export CSV · Recently deleted (per group today; a cross-group list would fit here)
  Install           "Add to Home Screen" row, only when installable
  Advanced          Admin · AI (admins only, own route) · demo/Firebase mode · diagnostics

Friends & balances  → Groups tab header icon (or Home), not a settings row
```
Navigation: a gear icon in the Profile header opens `/settings`; the tab bar keeps "Profile". Each settings group is its own route (`/settings/notifications` …) so deep links from toasts ("Turn on in Settings → Notifications") work and the page is never a nine-card scroll. Persistence rule: everything in Settings autosaves; Profile autosaves on blur. That removes the Save button and the footnote in `ProfileCards.tsx:66`.

## 6. Top 10, prioritised (impact × ease)

1. **C1** Fix Insights month bucketing in local time; add a TZ test. (1 hour, removes a trust-destroying bug for every Indian user.)
2. **H1** Scan amounts in the bill's / profile's currency, not `data[0]`'s. (30 min.)
3. **H2** Remove or make undoable the Inbox hard delete. (30 min.)
4. **H3** AI fallback toast → informational; gate Statement import before file pick. (1 hour.)
5. **M12 + H7** One-tap "Add to {group}" with Undo from the capture prompt; "Add all N to {trip}" and "Ignore {merchant}" in the Inbox. (1–2 days; this is the auto-capture payoff.)
6. **H5** Turn AutoCaptureSetup into a gated stepper; hide the manual path behind details; auto-create the key. (2 days.)
7. **H6 + §5** Split Profile into Account and Settings routes; autosave; drop the Save button and header Sign out. (2–3 days.)
8. **H8** Glossary pass: Not shared / Captured payment / Split by items / Settle up / Capture key / Scan / AI reading. (Half a day of string edits.)
9. **M1, M2, M5(1–3)** Insights: period in URL, year labels, previous-period delta, "With people" and "Owed for a while" cards. (2 days.)
10. **M7 + M6** `Segmented` radiogroup/tablist semantics; `figure` + sr-only tables for charts; value labels on Paid vs Share. (1 day.)

## 7. Already good (do not "fix")

- Undo toasts instead of confirm dialogs for Not shared and deletions (`Trust.tsx:39-54`, `Inbox.tsx:74`); optimistic local writes with server rejections surfaced centrally (`App.tsx` `repo.onError`).
- The capture prompt copy and structure (`Capture.tsx:134-176`): headline question, ranked groups with Live badge, currency-conversion note, "Nothing is added until you save".
- Trip-window ranking and the promise that nothing is auto-added; honest privacy copy (`AutoCaptureSetup.tsx:181-184`, `docs/AUTO_CAPTURE.md §3.5`).
- Demo-mode webhook simulation and the three-tone test outcome cards (`TestSender`, `Outcome`).
- Collapsible section summaries on Profile (`profileSummary.ts`), `AccentPicker` keyboard model, `Switch` and `Collapsible` ARIA (`inert`, `aria-controls`).
- Insights "≈" marking for converted totals, exclusion footnote, CVD-safe fixed category palette, dark-mode-aware tooltips.
- ImportGroup balance verification against Splitwise totals with a visible ✓ / ✗ per person.
- StatementImport flags (in trip, maybe already added, received, own transfer), "Tick all payments", and the "send to Inbox to review one by one" escape hatch.
- Table: unclaimed highlighting, "Split leftovers between everyone", host claiming on behalf of phoneless guests, name auto-matching on Finish, 24 h expiry handling.
- `CaptureGuest` token path saves without sign-in and explains "Open Split Now from your home screen".
- `UpdatePrompt` only appears on tab-bar screens and never covers Save buttons.

## 8. Open questions for the product owner

- **Q1.** Is the live table meant to be the *only* itemized path by design (one source of truth for item splits), or is that an implementation shortcut? H4's "assign items myself" variant keeps the single data model but changes the UI promise.
- **Q2.** ImportGroup allows importing into a *new* group with nobody mapped to "me" (soft warning at `ImportGroup.tsx:317`). Should that be a hard block, since the importer ends up with no history in a group they created?
- **Q3.** Should BYOK (own Gemini key) exist for non-admins at all, or only when the project key is unavailable to them (M19)? If the product direction is "the app's key or nothing", `AiSettings` shrinks to two switches.
- **Q4.** One-tap add from the capture prompt (M12) saves an equal split with you as payer without showing the form. Is Undo sufficient safety, or do you want a 5-second "Added — Edit" toast before the write (deferred save)?
