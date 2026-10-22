# Pending work

What the owner asked for that isn't shipped yet, newest first. Read this at the start of a session;
remove an item when its release merges, and add anything left half-done.

## Batch 9.0.0 (branch `batch/v9`, release only when the owner says)

- [x] Home: pinned header; the balance moves into it once the card scrolls away.
- [x] Tab bar: Live table replaces Insights (Insights back if liveTables is off); Insights becomes a Profile row; faint accent glow across the bar.
- [x] + inside a group: tap goes straight to Add expense for that group (the group stays changeable: owner left it to us); press and hold opens the Create sheet.
- [x] Create sheet: Quick add first, "or", Add expense, then New group + Scan. Settle up and Live table tiles removed.
- [x] Group expenses: the quick-filter pill row moves into Sort and filter as a collapsible "Quick filters" section (folded, its choice in the header). Below search, pills only for what is applied (sort, show, paid by, dates, quick filters), each tap-to-remove; badge count and Clear stay.
- [x] Live table icon: Fluent's fork and knife on every Live table entry point (owner's pick after the dome); Scan the bill on /split shows a bill.
- [x] Design pass (first round): sheets slide away on every close, Settle up full screen with Record pinned, Segmented sizes to labels with a sliding highlight (48 px), pinned headers 92% with a hairline once scrolled, "Search expenses" placeholder, grouped Settle up amount, dark placeholders, reduced motion keeps short fades, toast exit, activity "$72.00 · ₹6,056.64", Groups "New group" chip, date row shows only the calendar when Today/Yesterday is picked, What's new banner on any tab-bar screen (waits on forms), balances green for money coming to you, scroll position no longer borrowed by a reload.
- [ ] Design pass, rest (from the review): sideways chip rows get an edge fade; long Help titles clamp to two lines; Insights' 1–2% bars look like stubs; group and expense rows truncate at 360 px (allow two lines); dark-mode selected tab needs `ring-white/10`; Activity's "Recently deleted · empty" row when empty; haptics helper (`src/lib/haptics.ts`: save 8 ms, sheet past close 6 ms, error [10,40,10], off with reduced motion); Balances (SettleAll) rows: one layout, amounts in a fixed column, one Remind pill.
- [x] Help: smoother scene motion (pointer glide and press, screen push, sheets over a dim), steps timed by their length, explainers' captions and motion revised, layout at 360 px, Find an expense matching the app, Help prefetched on idle.
- [ ] Help, later: new sections for anything new in 9.0.0 (voice, once built); refresh the screenshots (`npm run help:media`) once the UI settles: Settle up, the Groups header, the date row and the icons all changed since the last run.
- [x] Icons, second pass (owner rejected the Phosphor look, then picked Fluent over MingCute): Fluent Regular / Filled for the tab bar, rows, sheets and the group / expense / settle actions; Settings rows each have their own icon; Quick add is a bot; Profile's Help is a lifebuoy; Profile and Settings rows are Solar duotone painted in the accent's gradient on a soft translucent tile, lines thickened to 2 (owner: Fluent rows looked thin; then: keep the drawings, drop the solid tile); Support is a hand holding a heart, Notifications a bell with a dot, Settings a strong gear with a light middle; Scan → Payment is a phone with a small rupee; Start table's icon is filled; Solar duotone in the accent's gradient for Help, empty screens and notices; Insights is a bar chart; lucide stays for small controls. Outline / Filled and the admin default kept. Built by `npm run icons:art`.
- [ ] Flaky e2e: "receipt photos: the scanned receipt leads the strip…" sometimes sits at the OCR spinner (Tesseract worker, after a fresh `npm ci` / cold Vite cache) and passes on rerun; it fails with or without the latest changes. Make the demo scan deterministic or wait for the worker.
- [ ] Icons, later: lucide feature icons left on less-used screens (admin, merge, chat composer, expense form internals) could move to Fluent when those screens are next touched.

## Simple and Advanced (9.0.0, owner, 22 Oct 2026; table in docs/SIMPLE_MODE.md)

- [x] Mode setting (Settings → Preferences → Mode), synced; auto = Simple unless the account uses Advanced-only features; Simple's detail level is Minimal; Preferences trimmed in Simple; Collect in on for everyone.
- [ ] Mode button in Profile's header (decided): icon only. Simple = Fluent leaf; Advanced = one of rocket, chip (developer-board), brain-circuit, wrench-screwdriver, window-dev-tools, picked at random on each switch to Advanced and kept until the next switch. Switch animation (~0.7 s, both ways): old icon shrinks out, new one pops in filled with a small overshoot then settles to its line, ~10 accent dots (brand/duo) splash out, a faint accent wash spreads from the button over the screen, one short vibration; reduced motion = plain swap. Toast with Undo; aria-label "Mode: Simple". Board: scratchpad switch.html.
- [ ] Pro badge (decided). Earned by finishing Help to 100% (either mode; Simple's smaller Help counts, not advertised). Stored as the date earned on the profile, mirrored to group member records so others see it (rules + test, PLAN.md). Letters: Nunito Black "PRO" traced to an SVG path (no font file). Look: accent gradient (brand → duo) with a slow flow inside the letters plus light passes: an opening sweep / glint (other direction) / sweep, then gaps of 6–9 s, 10–16 s, then 20–40 s (mostly sweeps), one shared clock for every badge, transform-only; Settings → Animations "Pro badge" switch; reduced motion = still gradient. Places:
  - Home header photo: the PRO ring (`・PRO・PRO・` bent onto a true circle, letters ~8% of the photo, tight dots, turning once per 40 s); people without Pro keep today's plain translucent ring.
  - Profile: the PRO ring on the photo + a translucent accent pill with PRO beside the name (not tappable).
  - Members: pill beside the name only, photo unchanged; tapping someone else's opens Help → Earn Pro.
  - 1:1 lists (Groups, Home): the subtext becomes [PRO pill] · Friend.
  - Inside a 1:1: the PRO ring bent along the tile's rounded square (owner confirmed: "premium"). Nothing in the title.
  - Tapping another person's PRO mark (Members pill, list pill, the 1:1 tile or its ring) opens Help → Earn Pro (a short section at the very bottom of Help), only when the viewer isn't Pro themselves; a Pro viewer's tap does nothing.
- [ ] Handshake (decided): replace the 🤝 emoji on 1:1 tiles (every list, the 1:1 card, New group's 1:1 choice). Light mode: the duotone built from Fluent handshake regular (line) over filled (soft layer, ~42%); dark mode: Fluent handshake filled. Accent gradient. Solar's "hand-shake" is a waving hand: not that.
- [ ] Help progress (decided): ring with the percentage inside on the right of Help's header (no label); done sections get a thin accent outline and a tick in the corner; unread ones get an accent dot and no outline. Done = played to the last step, or scrolled to the end of a text section; synced to the profile.
- [ ] Profile and the rest of Settings in Simple (Signing in, payment methods, Animations defaults, Notifications dynamic, Automation, AI features).
- [ ] Scan revamp: one card per kind (Bill, Payment, Statement) with Camera, Photo and an AI toggle (bot icon) in the corner; the toggle hides in Simple.
- [ ] Encrypted groups: show the last status at once and refresh quietly; explainer into Help behind a ? button.
- [ ] Groups and Members in Simple (approvals, Merge, Needs my OK), then the proposed rows once the owner OKs them.
- [ ] Help: progress ring and done marks (synced), steps hold until Next, Simple's sections only, shorter text without dashes; Pro badge at 100% (either mode), shown on large photos, neon flicker only on your own Profile pill.

## Voice and Quick add (owner's decisions, 22 Oct 2026; ships in 9.1.0, after Simple and Advanced)

Engine, free first:
- [ ] The phone's own speech recognition always first, free. `continuous: true`; listening lasts until the person lets go of + (or taps the mic off). Silence alone never ends it.
- [ ] No phone recognition, or microphone permission denied: no mic button in Quick add and no hold-for-voice on + (hold falls back to nothing new), unless AI transcription is on for that person (below).
- [ ] AI transcription (Flash-Lite on audio) only where the phone can't, through a separate **transcription key** set by the admin.

Admin (Admin → AI):
- [ ] A third global key, for transcription only: own model picker (recommended: the current Flash-Lite, e.g. gemini-3.5-flash-lite; 3.1-flash-lite allowed), a Test button, and a check that the key is billed: a free (unbilled) key is refused with an error, a paid one is accepted.
- [ ] Flag: transcription on/off for everyone (off = no AI transcription offered anywhere).
- [ ] Flag: everyone may use the global transcription key.

Person (Settings → Preferences):
- [ ] **Transcription: Native | AI**, a two-way Segmented control. Native (default) = the phone's own recognition, free. AI = the recording goes to Flash-Lite. AI is offered only when the admin flag is on and a key is available to that person (global key allowed, or their own key); otherwise the control shows Native only with the reason. If Native is picked on a phone without recognition, the mic hides (or AI is offered when available).

Person (Settings → AI features):
- [ ] "Transcribe with AI" switch, shown only when the admin flag is on. With the global key allowed, anyone can turn it on; without it, only someone with their own Gemini key.
- [ ] Which key: Automatic (own key first, then the global one; with the global one not allowed, own key only), Own key, Split Now's key.

Quick add screen:
- [ ] Mic is a toggle (tap to start, tap to stop) and also press and hold (speak, let go). Transcribing shows a spinner inside the text box; the text lands in the box and waits: Enter / send runs Quick add.
- [ ] Quick add's AI prompt: the line may be a rough speech transcript (wrong words, no punctuation, numbers as words): clean it up first, then understand it. Same prompt on every model.

Hold + for voice (from any screen with the tab bar):
- [ ] Single tap: as now. Press and hold: + becomes a mic with a short vibration and a soft sound; 4–5 accent bars above it react to the voice; a subtle ripple/glow from the button itself while held (must not spoil today's look). Let go: bars fade, a spinner on + (not tappable until done), then Quick add's result: the screen it opened, or a plain answer.
- [ ] Inside a group, tap still adds an expense; hold becomes voice (the Create sheet there is reached from Home's +, or by voice).
- [ ] Lines Quick add can't act on ("Make me a sandwich"): a clear, friendly answer and what it can do instead.

Teaching it:
- [ ] After the update, a speech bubble rises from + once: "Press and hold + to talk". Dismiss with ✕ or a swipe.
- [ ] Per account, across every device: a flag in the profile (`voiceTried`, rules whitelist + test + PLAN.md) set the first time someone holds + for voice (no need to finish Quick add). Until it's set, every few visits (every 3rd–5th) a "Did you know?" bubble from + with different words, urging "Try it now: press and hold +".

- [ ] Free-first voice summary for Help: a new section (voice), plus Quick add's updated.

## Ideas, not requested (build only if the owner asks)

- The expense form could show the AI's other icons as pills, as New group and open items do.
- Admin tabs are 28 px wide at 320 px screens (above the 24 px minimum, but tight).
