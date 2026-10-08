# 05 — UI/UX quality of the core screens (Split Now)

Lens: a demanding product designer who has shipped and used Splitwise, Settle Up, Tricount and Splitid, judging the app on a 360 px Android phone (the India-first target) and on iPhone. Read in full: `src/pages/Home.tsx`, `Groups.tsx`, `GroupDetail.tsx`, `GroupForm.tsx`, `ExpenseForm.tsx`, `ExpenseDetail.tsx`, `SettleUp.tsx`, `SplitBill.tsx`, `Friends.tsx`, `Login.tsx`; components `Layout`, `CreateSheet`, `Sheet`, `GroupRow`, `MemberChips`, `Select`, `Switch`, `DateField`, `Collapsible`, `Misc`, `Toast`, `Avatar`, `GroupIcon`, `IconPicker`, `DebtGraph`, `Aurora`, plus `Trust`, `InstallBanner`, `CaptureAlert`, `UpdatePrompt`; `src/index.css`; `src/App.tsx`; and the helpers that shape the UI (`lib/money.ts`, `lib/locale.ts`, `lib/greeting.ts`, `lib/categories.ts`, `lib/payments.ts`, `lib/recents.ts`, `lib/groupTypes.ts`, `hooks/data.ts`). Contrast ratios below were computed from the hex values in `index.css` / Tailwind's slate palette (WCAG relative luminance), not eyeballed. Pixel arithmetic assumes 360 px viewport, `px-4` page gutter (328 px content) and the card padding in the code.

## 1. Summary and verdict

The bones are good: the data model is exposed honestly (balances, simplified debts, who-paid/who-owes on every row), the Select/DateField/Switch primitives are better than most indie apps, settle-up with a UPI QR is genuinely India-first, and destructive actions on expenses already use undo toasts instead of dialogs. But the product does not yet *feel* crafted on a 360 px phone. The most common action (add an expense) costs an extra tap every time because the + button opens a chooser; the expense form is one long scroll with the full member list expanded twice, two Save buttons, and a split-type row whose last option is physically off-screen on a 360 px device; a brand-new user is greeted by a huge animated purple card saying "Overall, you are owed ₹0.00" and then hits a dead end ("Create a group first") when they tap +. Visually it reads as a 2024 template: six continuously animating blurred blobs on Home, a perpetually spinning conic gradient on the FAB on every screen, gradients on buttons, avatars, group icons, splash, update banner and budget bar, and emoji sprinkled into toasts, labels and headings. Accessibility is mixed: the custom Select is exemplary, but the Sheet has no focus management or accessible name, the tab bar's inactive labels fail contrast in light mode (2.6:1), muted text fails in dark mode (3.9:1), several inputs including the main amount field have no accessible name, and the global reduced-motion rule most likely turns the infinite animations into flicker rather than stopping them. None of this is structural; roughly ten targeted changes (section 2) would move it from "impressive demo" to "product I'd switch to from Splitwise".

## 2. Top-10 UX fixes that would most change how the product feels (prioritised)

1. **+ adds an expense, full stop.** Route the FAB straight to `/add` (scoped to the current group); move the other four CreateSheet tiles to a long-press / "⋯" on the FAB or to where they already live (Groups header, group card, Scan). Saves one tap on every single expense. (H1)
2. **Collapse "Paid by" and "Split" into one summary row** — "You paid · split equally with everyone" — that opens a sheet; show the full editor only when the user taps it. Fix the clipped split-type row (2×3 grid, not a hidden horizontal scroller). This alone fits the 80 % case on one 360 px screen. (C1, H2)
3. **Fix first run.** When there are no shared groups, replace the balance hero with an onboarding card (Create group / Import from Splitwise / Split a bill at a table) and make the FAB go to `/groups/new`; never show "Overall, you are owed ₹0.00" to someone with no data. (C2)
4. **Make "who owes me" one tap away.** Promote Friends (rename "People") to the tab bar in place of Insights; make the hero's "You are owed / You owe" tiles tappable → People; render the already-computed greeting subline ("Rohan owes you ₹1,240"). (H6, M1)
5. **Kill the spinner flash.** Keep the last group-data snapshot in a module-level store so Home/Groups render instantly on tab switch; use height-stable skeleton rows instead of a centred spinner. (H3)
6. **Progressive disclosure in GroupForm** — name, icon, people, Create. Budget, dates, simplify, approval go under a `Collapsible` "More options"; replace the stretched native checkboxes with the existing `Switch`. (H7)
7. **Contrast and size pass.** Introduce a `text-muted` token (slate-500 light / slate-400 dark) and replace the 80+ ad-hoc `text-slate-500/400`; tab bar inactive → slate-500 in light; no meaning-bearing text under 12 px; every icon button `h-11 w-11`. (H5, M14)
8. **Sheet accessibility**: `aria-labelledby`, move focus in on open and back on close, `inert` the page behind, and either implement swipe-to-dismiss or remove the drag handle that promises it. (H4, M13)
9. **One form chrome.** ExpenseForm, SettleUp, GroupForm and SplitBill should share the same header (X · Title · Save) and the same sticky bottom CTA; delete the duplicate Save in ExpenseForm. (M7)
10. **Calm the surface.** Static hero gradient (animate only when `(hover:hover)` and not reduced-motion), no spinning FAB, emoji only for user-chosen content (category, group icon), native `confirm()` → a `ConfirmSheet`, toasts at the bottom above the tab bar where the thumb is. (M2, M8, M9, H10)

## 3. Findings

Severity: **Critical** = a core flow is broken, invisible or misleading on the target device; **High** = hurts the 80 % flow or is a hard accessibility failure; **Medium** = polish that a demanding user notices on day one; **Low** = nice to have. Confidence tags on non-obvious claims.

### Critical

#### C1. Split-type picker is clipped at 360 px: "Shares" is cut in half and "Adjust" is off-screen with no scroll affordance
- `src/pages/ExpenseForm.tsx:451-458`; `src/index.css:190-192` (scrollbar hidden on every `.overflow-x-auto`).
- What: five tiles with `min-w-[4.5rem]` (72 px) and `gap-1.5` (6 px) = 384 px minimum, inside a card whose inner width at 360 px is 296 px (`360 − 2×16 page − 2×16 card`). The row is `overflow-x-auto` and the stylesheet hides scrollbars globally, so nothing hints that more exists. Tile 4 ("Shares") starts at 234 px and is cut at ~300 px; tile 5 ("Adjust") starts at 312 px and is entirely invisible. [Certain] from the min-widths; actual label widths only make it worse.
- Why: two of the six advertised split types do not exist for the primary device class.
- Fix: replace the scroller with `grid grid-cols-5 gap-1.5` and shrink tile padding (`px-1 py-2`, label `text-[11px]`), or better, make the split type part of the collapsed summary row (see H2) and show the type picker inside the split sheet as a `Segmented` that wraps (`flex-wrap`). If a scroller must stay, add a right-edge fade (`mask-image: linear-gradient(to right, #000 85%, transparent)`) and `scroll-snap-type: x mandatory`.

#### C2. First-run experience: a meaningless balance hero, then a dead end
- `src/pages/Home.tsx:104-126` (hero always rendered), `:129-140` (empty state below it); `src/components/Layout.tsx:39-47` + `CreateSheet.tsx:16` (FAB → Add expense); `src/pages/ExpenseForm.tsx:69,77-92` (`NoGroups` dead end).
- What: a user with zero groups sees a two-line animated greeting, then a full-width animated purple card reading "Overall, you are owed ₹0.00 / You are owed ₹0.00 / You owe ₹0.00", then a small "No groups yet" card. If they do the obvious thing and tap the glowing + button, the first and largest option is "Add expense", which lands on "👀 Create a group first" with three more buttons. Meanwhile Groups has a *different* empty state ("🧳 Start your first group") for the same condition.
- Why: the first 30 seconds decide whether a Splitwise user stays. The hero answers a question nobody has asked yet, and the primary CTA leads to a wall.
- Fix: (a) In `Home`, when `shared.length === 0 && personal.length === 0`, render an `Onboarding` card in the hero slot (three rows with icons: "Create a group — trips, flats, dinners", "Import from Splitwise", "Split a bill at a table — no group needed") and drop the greeting to one line. (b) In `Layout`, pass `hasGroups` from `useGroups()` into the FAB handler: `onClick={() => hasGroups ? nav('/add'+q) : nav('/groups/new')}`. (c) Delete `NoGroups` once (b) exists, or keep it as a guard only for deep links. (d) Share one `EmptyGroups` component between Home, Groups and ExpenseForm so copy and CTAs match.

### High

#### H1. The most common action costs an extra tap every time
- `src/components/Layout.tsx:39-47`, `src/components/CreateSheet.tsx:9-31`.
- What: the + button opens a chooser sheet; "Add expense" is the first option but still a second tap. Count for the 80 % case (I paid, split equally with everyone): + (1) → Add expense (2) → amount is auto-focused, type → tap Description (3), type → Save (4). Splitwise and Settle Up do it in 2–3. The other four tiles already have homes: New group (Groups header), Settle up (group card primary button), Split a bill (ExpenseForm offers it after a scan; also `/split`), Scan (ExpenseForm's "Scan receipt" + `/scan`).
- Fix: FAB `onClick` → `nav(groupId ? `/add?group=${groupId}` : '/add')`. Keep `CreateSheet` for a long-press (`onContextMenu` + a 400 ms `pointerdown` timer) and for a small "⋯" chip in the ExpenseForm header. Also add `enterKeyHint="next"` on Description that focuses the amount, and `enterKeyHint="done"` on the amount that calls `save()` when `validAmount` — the 80 % case becomes + → type → next → type → done.

#### H2. ExpenseForm is a single long scroll; both member lists are always expanded; two Save buttons
- `src/pages/ExpenseForm.tsx:420-465` (Paid by + Split cards), `:628-646` (equal editor renders every member as a row), `:467-495` (Repeat and Notes always visible), `:336` and `:497` (header "Save" pill *and* bottom "Add expense" button with different labels), `:355-388` (Description above Amount, Amount auto-focused).
- What: for a 6-person trip the visible form is Group card, Description/Category, Amount, Date/Scan row, Paid-by card, Split card with six checkbox rows + "Everyone/Only me", Repeat Select card, Notes card, then the big button — roughly 1,400 px on a 360 px phone. The field order fights the focus order: the eye reads Description first but the cursor starts in Amount below it. The header says "Save" and the footer says "Add expense"; one of them is redundant. Split-by-shares input uses `inputMode="decimal"` for an integer (`:692`).
- Why: Splitwise shows "Paid by **you** and split **equally**" as one line and opens an editor on tap; that is why its form fits a screen. Here the editor is the default view.
- Fix: (a) Replace the two cards with one `SummaryRow`: avatar + "You paid" · "split equally with everyone (6)" + chevron; tapping opens a `Sheet` containing the existing payer list, multi-pay toggle, split-type picker and `SplitEditor`. Keep `SameHint` inside the row. (b) Fold Repeat + Notes into a `Collapsible` titled "More" with summary "Repeat: never · No notes" (the component exists and is unused here). (c) Remove the bottom button; keep the sticky header Save but make it `min-h-11` and label it "Add" / "Save". (d) Swap the Description and Amount blocks so the hero amount is first and auto-focused, with Description directly beneath (matches SettleUp's amount-first layout). (e) `inputMode="numeric"` on the shares input.

#### H3. A spinner flashes on every tab switch and every page open; there are no skeletons anywhere
- `src/hooks/data.ts:12-17` (`useGroups` starts at `null` on each mount), `:188-230` (`useAllGroupData` returns `null` until every group has reported once); `src/pages/Home.tsx:28`, `Groups.tsx:10`, `GroupDetail.tsx:46`, `Friends.tsx:55`, `ExpenseForm.tsx:68-70` all render `<Loading />` (`Misc.tsx:41-47`, a centred `py-20` spinner).
- What: state lives in the component, not in a module store, so Home → Groups → Home re-subscribes and shows a spinner until N+1 Firestore snapshots arrive (from cache, but still asynchronous). Content then jumps in at a different height. [Certain] for the state initialisation; [Likely] that the flash is visible on mid-range Android — cache snapshots usually land in 20–80 ms, which is enough to see.
- Fix: (a) Add a tiny module-level cache in `hooks/data.ts` (`let lastGroups: Group[] | null`, `const lastExp = new Map()`) that `useGroups`/`useAllGroupData` seed their `useState` from and update on every snapshot; the first render after a tab switch is then synchronous. (b) Add `Skeleton` to `Misc.tsx` (a `div` with `animate-pulse rounded-2xl bg-slate-200/70 dark:bg-ink-800` and fixed heights) and give Home a `HomeSkeleton` (hero 180 px + 3 group rows 64 px) and GroupDetail a card + 4 rows; keep the spinner for truly indeterminate work (OCR).

#### H4. `Sheet` is an `aria-modal` dialog with no accessible name, no focus management and no background isolation
- `src/components/Sheet.tsx:14-22`.
- What: `role="dialog" aria-modal` but no `aria-labelledby`; focus is not moved into the sheet on open nor restored on close; the page behind is not `inert`, so Tab/VoiceOver swipes walk into the tab bar and page content under the scrim. Escape works; outside-click works. Every create flow (CreateSheet), the Friends netting confirm, category/payer/currency pickers, Invite and Recently-deleted all inherit this.
- Fix: render through `createPortal` into `document.body`; `const titleId = useId()`; `<h2 id={titleId}>`; `aria-labelledby={title ? titleId : undefined}`; on open, `requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('[autofocus],button,input,[tabindex]')?.focus())`; remember `document.activeElement` and `.focus()` it on close; set `document.getElementById('root')!.inert = true` while open (React 19 supports the `inert` prop; `#root` is the sibling once portalled). Also set `aria-describedby` for sheets whose first child is a paragraph (Invite, Net out).

#### H5. Contrast failures in both themes, including the tab bar
- Computed ratios: slate-400 `#94a3b8` on white = **2.57:1**; slate-500 `#64748b` on white = 4.76:1 (pass); slate-500 on ink-900 `#13111f` = **3.91:1**; slate-500 on ink-800 `#1c1a2b` = **3.58:1**; slate-400 on ink-900 = 7.25:1 (pass); slate-300 `#cbd5e1` on white = **1.48:1**.
- Light-mode failures (slate-400 as text): tab bar inactive labels `src/components/Layout.tsx:54` (11 px, 2.57:1 — fails AA text *and* the 3:1 non-text minimum for the icons); GroupRow "settled up" `GroupRow.tsx:35`; GroupDetail "even / not involved" `:381` and month headers `:343`; ExpenseDetail footer `:151`; DebtGraph empty text `:9`; Home greeting salutation uses slate-500 (ok).
- Dark-mode failures (slate-500 without a `dark:` override): `GroupRow.tsx:26`, `Home.tsx:158`, `CreateSheet.tsx:40` (tile subtitles), `GroupDetail.tsx:94,108-115,164,192,350,373`, `ExpenseForm.tsx:343,436,621,633`, `SettleUp.tsx:155,171,190,252-253`, `Friends.tsx:120`, `GroupForm.tsx:288,290,336,363`, and ~60 more (`grep -c text-slate-500` ≈ 80, of which only the `label` utility and `PageHeader` subtitle add `dark:text-slate-400`).
- The Home hero's `text-white/75` 12 px labels over the animated gradient: ≈3.9:1 over brand-600 and lower where the `bg-brand-400/60` blob passes underneath. [Likely]
- Fix: in `index.css` add `@utility text-muted { @apply text-slate-500 dark:text-slate-400; }` and `@utility text-faint { @apply text-slate-400 dark:text-slate-500; }` (reserve `text-faint` for decorative chevrons/placeholders only); codemod `text-slate-500` → `text-muted` and audit each `text-slate-400` that carries meaning → `text-muted`. Tab bar: inactive `text-slate-500 dark:text-slate-400`. Hero labels: `text-white/90` or solid `text-brand-100`.

#### H6. The "who owes me" answer is hidden; Insights gets a tab, Friends gets an icon nobody will find
- `src/components/Layout.tsx:9-15` (tabs: Home, Groups, +, Insights, Profile); Friends is reachable only from `Groups.tsx:21` (a `UserPlus` icon — the "add person" glyph), `Profile.tsx:187` (a card at the bottom of settings) and `CreateSheet.tsx:29` (the "Settle up" tile falls through to `/friends` when not in a group, which is a surprise). Home's hero tiles (`Home.tsx:110-117`) are not tappable.
- What: every competitor's second tab is People/Friends because "how much does Rohan owe me across everything" is the question users open the app with. Here it is three taps away behind the wrong icon. Charts (`Insights`) are a weekly curiosity at best.
- Fix: tabs → Home, Groups, +, People, Profile; add an Insights entry point as a Home section ("This month" mini-bar) and a card in Profile. Wrap the hero's two tiles in `<Link to="/friends">`. Rename the page "People" (both "Friends" and "Friends (non-group)" are confusing when a 1:1 is also called a friend).

#### H7. GroupForm shows every setting up front, and uses stretched native checkboxes instead of the existing Switch
- `src/pages/GroupForm.tsx:238-253` (7 type chips + two text links), `:268-269` (Budget), `:272-298` (dates + two tips), `:299-307` and `:308-324` (`<input type="checkbox" className="h-6 w-11 … accent-brand-600">` for Simplify debts and Require approval — a native checkbox forced to 44×24, which renders as a distorted square on iOS/Android, not a switch), `:327-367` (members with Name + Email + Add). A proper `Switch` (`src/components/Switch.tsx`) is used two screens later in `GroupDetail.tsx:425`.
- Why: creating "Goa trip with Riya and Arjun" should be name + two chips + Create. Budget, approval thresholds and debt simplification are power-user settings shown to someone who has not yet created their first group.
- Fix: first card = icon + Name + `TypeSuggestion` + People (chips from "People from your groups" + a single Name field; drop the Email field into a "+ email" link). Second = `<Collapsible title="More options" summary="INR · no budget · simplify debts on">` containing Currency, Budget, Dates, Simplify, Require approval. Replace both checkboxes with `<Switch checked onChange label=…>`. Keep the type chips but show them only after a name is typed (the guess already picks one) or inside "More options".

#### H8. Validation happens only on Save, as transient toasts at the top; key inputs have no accessible name
- `src/pages/ExpenseForm.tsx:250-266` (six toast-only validations), `:381-388` (amount input: no `aria-label`, no `id`/`label`), `:494` (Notes `<label>` not associated, textarea unnamed); `src/pages/SettleUp.tsx:153` (amount input unnamed), `:203` (note placeholder-only); `src/pages/GroupForm.tsx:268-269` (Budget label not associated), `:358-360` (member Name/Email placeholder-only); `src/pages/Login.tsx:50,68-70` (placeholder-only). Toast lives at the top (`Toast.tsx:24`) and auto-dismisses in 3.2 s; errors use `aria-live="polite"`.
- Why: a 3-second "Enter an amount" at the top of the screen while the keyboard covers the bottom is easy to miss, and nothing marks the offending field. Screen readers announce the main amount field as "0.00, edit text".
- Fix: add `aria-label="Amount"` (and `aria-describedby` to the currency button) on both amount inputs; associate every visible label (`htmlFor`/`id`); in `save()` set a `fieldError` state and render `<p role="alert" className="mt-1 text-sm text-rose-600">` under the field, plus `scrollIntoView({block:'center'})` and `.focus()` on the first invalid field; keep the toast only for server errors. In `Toast.tsx`, render error toasts with `role="alert"` (assertive) and pause the timer on hover/focus.

#### H9. The reduced-motion rule most likely turns infinite animations into flicker instead of stopping them
- `src/index.css:145-147` sets `animation-duration: 0.01ms !important` for everything but does not set `animation-iteration-count: 1 !important`. The Aurora blobs/bubbles (`:173-179`), the FAB spin (`:176`), `animate-float` (`:163`), `animate-pulse` (LiveBadge) and `animate-spin` (Spinner) are all `infinite`.
- What: with a 0.01 ms duration and infinite iterations the animation keeps cycling ~100,000×/s; browsers sample it at an arbitrary phase each frame, so blobs and the FAB gradient jump to random keyframes — the opposite of what a motion-sensitive user asked for. `Aurora.tsx`'s comment "Stops under prefers-reduced-motion" relies on this rule. [Likely] — this is the documented reason the standard snippet includes the iteration-count line; exact behaviour varies by engine.
- Fix: add `animation-iteration-count: 1 !important; scroll-behavior: auto !important;` to that block, and additionally gate the decorative animations explicitly: `@media (prefers-reduced-motion: no-preference) { @utility animate-blob-a … }` or add `motion-safe:` to the Aurora/FAB class names so they never start.

#### H10. Native `confirm()` dialogs in an installed PWA, inconsistent with the undo-toast pattern used elsewhere
- `src/pages/GroupForm.tsx:220` (delete group), `src/pages/ExpenseDetail.tsx:41` (stop repeating), `:180` (delete comment), `src/components/Trust.tsx:211,241` (purge). Expenses and settlements, by contrast, use `useUndoableDelete` (`Trust.tsx:39-54`) with a 6 s Undo.
- Why: `window.confirm` renders the browser's chrome ("splitnow.app says…"), ignores the app's theme, blocks the thread, and cannot be styled or made undoable. In standalone iOS it looks like a system error.
- Fix: add `ConfirmSheet` (uses `Sheet`; props `title`, `body`, `confirmLabel`, `destructive`) and a `useConfirm()` hook returning a promise. Comment delete should not confirm at all — delete with an Undo toast like expenses. Stop-repeating is non-destructive (copies stay) — no confirm, just a toast with "Undo" that restores `recurrence`.

### Medium

#### M1. Home spends its top 80 px on two greeting lines and a waving emoji, while the useful one-liner is computed and thrown away
- `src/pages/Home.tsx:79-100` renders `hello.salutation` ("Good morning") and "Hi, Amrit! 👋" (animated). `greeting()` in `src/lib/greeting.ts:364-367` also returns `subline` — "Rohan owes you ₹1,240 💸", "Goa trip is live today", "2 expenses waiting for your OK" — and `Home.tsx` never reads it (`grep subline src/pages/Home.tsx` → nothing). [Certain]
- Fix: one line: `<p className="text-sm text-muted">{hello.salutation}, {hello.name}</p>` and beneath it `<p className="text-base font-semibold">{hello.subline}</p>` (strip the emoji from `stateLines`). Drop `animate-wave`/`animate-float`. The avatar and inbox buttons stay on the right.

#### M2. Perpetual decorative animation on the two most-viewed surfaces
- `src/components/Aurora.tsx:17-24`: six absolutely positioned layers, three of them `blur-3xl` (64 px blur) with `will-change: transform`, animating forever on Home. `Aurora.tsx:9-15` + `Layout.tsx:45`: a conic gradient spinning forever inside the FAB on every tabbed screen. `index.css:165-179`.
- Why: on the ₹10–15k Android phones this product targets, large-radius blur layers compositing every frame cost real battery and cause scroll jank; a permanently spinning element in the tab bar is a distraction in the peripheral vision while reading numbers. It also reads as "AI-generated template" more than any other single element.
- Fix: default to a static `bg-gradient-to-br from-brand-700 via-brand-600 to-duo-600` with the blobs rendered once (no animation); enable the blob animation only under `@media (hover: hover) and (prefers-reduced-motion: no-preference)` (desktop); pause via `IntersectionObserver` when the card is off-screen. Remove the FAB spin entirely — a solid brand-600 disc with the white plus is more legible.

#### M3. GroupDetail tabs overflow at 360 px, and the header spends its three slots on the wrong actions
- `src/pages/GroupDetail.tsx:133` (`Segmented` with Expenses / Balances / Graph / Activity: `px-3 text-sm whitespace-nowrap` ≈ 336 px of content in a 296 px container; `Segmented` is `overflow-x-auto` with hidden scrollbars so "Activity" is clipped). [Likely] within ±10 px depending on font metrics. `:81-83`: header icons are Export CSV, Insights, Settings; `aria-label="Settings"` leads to a page titled "Edit group" (`GroupForm.tsx:228`).
- Why: "Graph" is a novelty view of the same data as Balances; CSV export is a once-a-year action with a permanent top-right slot. There is no "Add expense" affordance on the group screen other than the FAB.
- Fix: three tabs — Expenses · Balances · Activity — with the graph as a `Collapsible` inside Balances ("Show as graph"). Header right = a single "⋯" menu (`Sheet` with rows: Edit group, Invite, Insights, Export CSV, Recently deleted). Rename the gear/page pair consistently ("Group settings"). Give `Segmented` `role="tablist"` / `role="tab" aria-selected`, and let labels wrap or use `text-xs` under 380 px.

#### M4. Contradictory primary action and a noisy card on the group screen
- `src/pages/GroupDetail.tsx:97-98` shows "You're all settled up ✨" while `:123` still renders **Settle up** as the primary gradient button. `:129` + `:407-431`: the "Trip auto-capture" card (SMS capture settings) is inserted between the balance and the expense list for every group with dates, even for users who have never configured capture.
- Fix: when `myBal === 0`, make Invite the primary and hide/disable Settle up (or label it "Record a payment" as secondary). Show `TripAutoCapture` only when the user has a capture key (`profile.captureKeys?.length`) or collapse it to a one-line row with a chevron.

#### M5. SettleUp: the only screen with a long UPI card has no sticky primary button; duplicated method choice
- `src/pages/SettleUp.tsx:207` (Record button at the bottom of a page that includes a 196 px QR, three app buttons and a note), `:199` (Method chips) duplicates what tapping a pay option already sets (`pickMethod` in `:179,186,187`), `:153` (amount unnamed), `:157` ("Read from payment screenshot" sits above the pay options, i.e. before the user has paid), `:263` (11 px body copy explaining iOS behaviour).
- Fix: sticky bottom bar as in `SplitBill.tsx:230-240` ("Record ₹500 · UPI"); demote Method to a small inline Select under the amount, pre-set by the pay option; move the screenshot reader below the pay options ("Already paid? Read the screenshot"); 12 px minimum for the iOS note.

#### M6. ExpenseForm navigation and defaults
- `src/pages/ExpenseForm.tsx:334` Cancel is `nav(-1)`. The PWA manifest ships an "Add expense" shortcut to `/add` (`vite.config.ts:36-38`); launched that way, history has one entry and Cancel does nothing. [Likely] (`PageHeader` already guards this with `history.length > 1 ? nav(-1) : nav('/')` — `Misc.tsx:14`).
- `:340-347` "Change" group link is shown even when the user has exactly one group; the sheet then lists one row.
- `src/hooks/data.ts` `memberOrder` sorts alphabetically, so in the payer sheet (`ExpenseForm.tsx:519-529`), equal-split list (`:636`) and SettleUp selects (`:212-233`) "You" appears wherever your name sorts, not first.
- Fix: `onClick={() => history.length > 1 ? nav(-1) : nav(`/groups/${group.id}`)}`; hide "Change" when `groups.length === 1`; `memberOrder(g, me?)` returns `me` first, rest alphabetical.

#### M7. Three different form chromes
- ExpenseForm: custom sticky header X · Title · Save (`ExpenseForm.tsx:333-337`) + a second bottom button. SettleUp and GroupForm: `PageHeader` with a back chevron, no header action, non-sticky bottom button (`SettleUp.tsx:145,207`; `GroupForm.tsx:228,369`). SplitBill: `PageHeader` + a fixed bottom bar (`SplitBill.tsx:230-240`). Expense editing uses X-to-cancel; group editing uses ‹ back; both discard changes silently.
- Fix: one `FormShell` component: header X · Title · (optional right action), content, sticky bottom CTA with `safe-bottom` (the SplitBill bar is the best model). Use it in all four. Discarding a dirty form should ask (ConfirmSheet) in all of them or none.

#### M8. Notifications fight for the same slot; toasts are at the top, actions at the bottom
- `src/components/Toast.tsx:24` toasts render at the top of the screen (`top-0`), 6 s for Undo. `InstallBanner.tsx:102`, `CaptureAlert.tsx:174`, `UpdatePrompt.tsx:239` are all `fixed … bottom-[calc(var(--nav-h)+2rem)]` and hide one another with `html[data-update-ready] .install-banner`, `html[data-capture-alert] …` attribute hacks (`index.css:157,203-204`).
- Why: on a phone the thumb is at the bottom; an "Undo" at the top of a 6.1" screen is a reach. Three banners with ad-hoc precedence will eventually overlap (e.g. a toast + capture alert + install banner during a save).
- Fix: a single `BottomNotices` component in `Layout` that owns a priority queue (capture > update > install > toast) and renders at most one banner plus the toast stack *above the tab bar*; `Toast.tsx` positions `bottom-[calc(var(--nav-h)+0.75rem)]` when `html[data-nav]` is present, else `bottom-4`.

#### M9. "AI template" tells: emoji as UI, gradient everywhere, sparkles for non-AI features
- Emoji in chrome: toasts "Expense added ✅", "Group created 🎉", "Payment recorded 💸" (`ExpenseForm.tsx:294`, `GroupForm.tsx:209`, `SettleUp.tsx:135`); labels "📎 Receipt attached" (`ExpenseForm.tsx:407`), "🗓️" (`GroupDetail.tsx:116`), "📩 Tip" (`GroupForm.tsx:291`), "💡" (`Friends.tsx:110`), "✨" (`GroupDetail.tsx:98`), "⏳/🚩" (`GroupDetail.tsx:145-146`); `Empty` illustrations are 48 px emoji (`Misc.tsx:31-39`): 👯 🧳 🤝 🔍 🧾 📜 🎉 🔎 👀; the Personal CTA uses a full-width "＋" character (`Groups.tsx:50`) next to screens that use the lucide `Plus`.
- Gradients: `btn-primary` (`index.css:124`), Avatar initials (`Avatar.tsx:29`), GroupIcon (`GroupIcon.tsx:4`), IconPicker button (`IconPicker.tsx:33`), Splash (`App.tsx:138`), Login blobs (`Login.tsx:25-26`), UpdatePrompt (`UpdatePrompt.tsx:240`), BudgetBar (`GroupDetail.tsx:215`), SplitBill scan tile (`SplitBill.tsx:148`), Aurora hero + FAB.
- `Sparkles` icon for a regex-based name guess (`IconPicker.tsx:83`) and for cross-group netting (`Friends.tsx:100`) — the sparkle now universally means "AI did this".
- Fix: emoji only where the user chose it (group icon, category); toasts and labels plain; `Empty` takes a lucide icon in a tinted circle. Keep *one* gradient (the hero); `btn-primary` solid `bg-brand-600`; avatars solid colour. Replace `Sparkles` with `Wand2`/`Lightbulb` for the guess and `ArrowLeftRight` for netting. Consider radius scale 20/14/10 px instead of 32/24/16 — the uniform `rounded-3xl` is part of the template look.

#### M10. Copy and naming inconsistencies a user trips over
- "Friends (non-group)" (`Groups.tsx:42`), "Friend (1:1)" / "New 1:1" / "Create 1:1" (`GroupForm.tsx:228,369`, `groupTypes.ts:26`), "Just one friend?" (`GroupForm.tsx:248`) — four names for the same thing. "With" as the group label on the expense form (`ExpenseForm.tsx:343`) vs "Group" in SplitBill (`SplitBill.tsx:181`). "Settle up" tile that opens Friends (`CreateSheet.tsx:29`). Header "Settings" → page "Edit group". Two "Recent activity" sections with different row designs (`Home.tsx:142-169`). "Scan — Receipt, statement or payment" is a feature list, not a task (`CreateSheet.tsx:27`).
- Fix: a 20-line glossary (Group · 1:1 · Personal · People · Settle up · Record a payment) applied across pages; `CreateSheet` Settle-up tile → "Record a payment" and, outside a group, opens a group picker sheet rather than Friends.

#### M11. Toggle-like controls lack state semantics
- Equal/adjust split rows are `<button>`s with a painted checkbox span and no `role="checkbox"`/`aria-checked` (`ExpenseForm.tsx:637-642`, `:709`); split-type tiles (`:453`), category grid (`:513`), currency grid (`:506`), payer rows (`:522`) and SettleUp method chips (`SettleUp.tsx:199`) have no `aria-pressed`/`aria-checked` (GroupDetail's filter chips do, `GroupDetail.tsx:316,321` — the pattern exists). `Segmented` (`Misc.tsx:49-64`) has no `tablist`/`radiogroup` role.
- Fix: rows → `role="checkbox" aria-checked={sel.includes(id)}`; type tiles/method chips → `role="radiogroup"` + `role="radio" aria-checked`; grids → `aria-pressed`; `Segmented` → `role="radiogroup"` by default with a `tabs` prop that switches to `tablist`.

#### M12. Money formatting is not quite Indian
- `src/lib/money.ts:33-46` always prints two decimals (`₹500.00`, `₹1,20,000.00`); `centsToInput` (`:74-77`) prefills "500.00" when editing; inputs use placeholder "0.00" everywhere (`ExpenseForm.tsx:384`, `SettleUp.tsx:153`, `GroupForm.tsx:269`, `SplitBill.tsx:196,207`). Indian users think and type in whole rupees; Settle Up and Tricount show "₹500".
- Fix: `formatMoney(minor, cur, { trim: true })` → `minimumFractionDigits: 0` when `minor % factor === 0`; use `trim` in rows, hero and chips (keep exact in detail/exact-split inputs); `centsToInput` strips a trailing `.00`; placeholders "0" for 0- and 2-decimal currencies. Optional: accept "2k", "1.5L", "2Cr" in `parseMoney`.

#### M13. The sheet's drag handle promises a gesture that does not exist
- `src/components/Sheet.tsx:17` renders the iOS-style grabber; there is no touch handling. Users on every modern phone will try to swipe it down.
- Fix: a 30-line `useSheetDrag(ref, onClose)` (`pointerdown` on the panel header, translateY while dragging, close when `dy > 80 || velocity > 0.5`), or remove the handle.

#### M14. Tap targets below 44 px on frequent controls
- Header icon buttons `p-2.5` + 20 px icon = 40 px (`GroupDetail.tsx:81-83`, `ExpenseDetail.tsx:61-63`, `Groups.tsx:20-22`); back/close `p-2` + 20–24 px = 36–40 px (`Misc.tsx:15`, `Sheet.tsx:21`); chips `py-1.5 text-sm` ≈ 32 px (`index.css:130-133`, used for Settle, Method, type, filters); `MemberChips` `!py-1` ≈ 30 px; Today/Yesterday chips ≈ 36 px (`ExpenseForm.tsx:398-399`); header Save pill `py-2 text-sm` ≈ 36 px (`:336`); settlement trash `p-2` + 16 px = 32 px in `text-slate-300` (1.5:1) (`GroupDetail.tsx:352`); DateField clear `p-1` + 15 px.
- Fix: icon buttons `h-11 w-11 inline-flex items-center justify-center`; `chip` → `min-h-10`; trash → `text-muted` and `h-11 w-11`; header Save `min-h-11 px-5`.

#### M15. ExpenseDetail header is three unlabeled icons and an empty title
- `src/pages/ExpenseDetail.tsx:59-65`: `PageHeader title=""` with `CopyPlus` ("Add again", explained only by a `title` tooltip that never shows on touch), `Pencil`, red `Trash2`.
- Fix: title = the expense description (truncated), right = Edit (text) + "⋯" opening a sheet with "Add again (dated today)", "Flag a problem", "Delete" — or keep icons but add visible 11 px labels under them.

### Low

#### L1. Keyboard and autofill hints
- Missing `enterKeyHint` on amount/description (`ExpenseForm.tsx:355-388`), `inputMode="email"` on the UPI ID field (`SettleUp.tsx:174`) and the Login email (`Login.tsx:69`), `autoCapitalize="words"` on name fields (`GroupForm.tsx:358`, `Login.tsx:50,68`), `autoComplete="off"` on Description to stop browser autofill noise; shares input should be `inputMode="numeric"` (`ExpenseForm.tsx:692`).

#### L2. Login is forced dark; signing in flips to a light app
- `src/pages/Login.tsx:24` hard-codes `bg-ink-950 text-white`, so in light mode the first thing a new user sees after sign-in is a white Home. Fix: respect the theme (`bg-slate-50 dark:bg-ink-950`), or carry the dark hero only for the top half.

#### L3. Two different "Recent activity" renderings on Home
- `src/pages/Home.tsx:142-169`: `ActivityFeed` when the inbox hook has a feed, else a hand-rolled expense list with lent/borrowed deltas. Pick one (the expense list with deltas is more useful) and title it "Recent expenses".

#### L4. Friends empty state is wrong for a brand-new user
- `src/pages/Friends.tsx:77-84` "You're all square — No one owes anyone. Nice." also shows when there are no groups at all. Branch on `data.length === 0` → "Add people by creating a group".

#### L5. Inbox icon on Home for users who have never set up capture
- `src/pages/Home.tsx:87-95` always shows the Inbox icon. Show it only when `box.count > 0 || profile has capture keys`; otherwise the Inbox lives in Profile.

#### L6. Groups header icon semantics
- `src/pages/Groups.tsx:20-22`: `UserPlus` means "add a person", not "Friends"; `FileUp` (Import) does not deserve a permanent slot. Header = "+ New group" only; Import stays in the empty state and GroupForm footer (already there) and Profile.

#### L7. Member email field adds friction for no visible benefit
- `src/pages/GroupForm.tsx:360` — the email is only used to render "not joined yet" copy. Hide behind "+ add email" or drop until invites by email exist.

#### L8. No offline indication anywhere in the shell
- Only `ExpenseForm.tsx:293` mentions offline (receipt upload). Add a 24 px "Offline — changes will sync" pill under the header in `Layout` driven by `online`/`offline` events; saves already resolve locally, so this is pure reassurance.

#### L9. Decorative-but-interactive icons at 1.5:1
- `GroupDetail.tsx:352` settlement delete is `text-slate-300 hover:text-rose-500` — invisible until hovered, and phones don't hover. Use `text-muted`.

#### L10. 10–11 px text carrying meaning
- Direction labels "you owe / you are owed" (`GroupRow.tsx:38`), "you lent / you borrowed" (`GroupDetail.tsx:384`), "Disputed/Pending" (`Trust.tsx:25,30`), recurrence pill (`GroupDetail.tsx:366`), tab labels (`Layout.tsx:54`), DebtGraph amounts (`DebtGraph.tsx:42`). Raise to 12 px; the row has room if the amount drops to `text-sm`.

## 4. Things that are already good (do not "fix")

- `Select` (`src/components/Select.tsx`): proper combobox/listbox roles, type-ahead, Home/End, flips upward, portal with scroll re-placement, `currencyOptions` with ISO + symbol + name. Better than most design systems.
- `DateField`: solves the real iOS `<input type=date>` problems (no placeholder, intrinsic width, Reset not firing change) with a transparent overlay and a clear button. Keep.
- `Switch`, `Collapsible` (grid-rows animation, `inert` body, `aria-expanded/controls`) and `IconPickerField` (radiogroup semantics, custom emoji input) are solid primitives.
- Undoable delete for expenses and settlements with a 30-day trash and "Recently deleted" sheet — the right pattern; extend it (H10) rather than replace it.
- Settle Up's UPI card: exact-amount QR, app deep links, "Get paid by X" reverse mode, manual UPI ID entry when the payee hasn't joined, remembered method per payee. This is the product's real differentiator.
- Sensible memory: last group, last payer/split per group ("Same as last time" hint), last currency, description suggestions that also restore the split, name-based group type/icon guess, auto-category from merchant.
- Dark mode via `color-scheme`, 16 px inputs to avoid iOS zoom, `safe-area` handling in header/nav/sheet, `tabular-nums` on every amount, en-IN lakh grouping, `overscroll-behavior-y: none`.
- Empty/not-found states exist on every screen; the "Expense not found / Group not found" guards are in place.
- Lucide icons default to `aria-hidden`, and most icon-only buttons do carry `aria-label`s.

## 5. Open questions for the product owner

1. Is "Insights" important enough to keep a tab? If yes, People still needs a first-class home — a fifth tab is not an option with the centre FAB, so something gives.
2. Should the + button bypass the chooser entirely (recommended), or is the "one place to start anything" sheet a deliberate brand moment worth one tap per expense?
3. Per-group "Graph" and cross-group "Net out": keep as power features behind Balances/People, or are they marketing-visible enough to stay top-level?
4. Hero animation: ship static by default and animate only on desktop/hover devices, or drop the Aurora entirely?
