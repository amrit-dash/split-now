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
- [ ] Design pass with the new design skills: motion, polish and UX fixes across screens, alongside the icons.
- [ ] Help: smoother scene motion (pointer, step transitions, sheets), every scene and line matching 9.0.0's UI, and new sections for anything new.
- [x] Icons, second pass (owner rejected the Phosphor look, then picked Fluent over MingCute): Fluent Regular / Filled for the tab bar, rows, sheets and the group / expense / settle actions; Settings rows each have their own icon; Quick add is a bot; Profile's Help is a lifebuoy; Profile and Settings rows are Solar duotone in white on an accent-gradient tile (owner: Fluent rows looked thin); Solar duotone in the accent's gradient for Help, empty screens and notices; Insights is a bar chart; lucide stays for small controls. Outline / Filled and the admin default kept. Built by `npm run icons:art`.
- [ ] Icons, later: lucide feature icons left on less-used screens (admin, merge, chat composer, expense form internals) could move to Fluent when those screens are next touched.

## Voice and Quick add (owner's decisions, 22 Oct 2026; 9.0.0 or 9.1.0 decided after the owner's next feature)

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
