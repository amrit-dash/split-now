# Pending work

What the owner asked for that isn't shipped yet, newest first. Read this at the start of a session;
remove an item when its release merges, and add anything left half-done.

## Batch 9.0.0 (branch `batch/v9`, release only when the owner says)

- [x] Home: pinned header; the balance moves into it once the card scrolls away.
- [x] Tab bar: Live table replaces Insights (Insights back if liveTables is off); Insights becomes a Profile row; faint accent glow across the bar.
- [x] + inside a group: tap goes straight to Add expense for that group (the group stays changeable: owner left it to us); press and hold opens the Create sheet.
- [x] Create sheet: Quick add first, "or", Add expense, then New group + Scan. Settle up and Live table tiles removed.
- [x] Group expenses: the quick-filter pill row moves into Sort and filter as a collapsible "Quick filters" section (folded, its choice in the header). Below search, pills only for what is applied (sort, show, paid by, dates, quick filters), each tap-to-remove; badge count and Clear stay.
- [ ] Live table icon: rethink (a table with people round it, or a serving dome); the fork and knife is a stand-in.
- [ ] Design pass with the new design skills: motion, polish and UX fixes across screens, alongside the icons.
- [ ] Icons: new modern set for the tab bar; every emoji used as UI chrome (Help, Settings, Profile, notes; not group/expense icons) becomes an icon from one set; Preferences switch Outline / Filled, with an admin default.

## Next: 9.1.0, voice and Quick add (after 9.0.0, same batch habits)

- [ ] A dictation engine that works: live words in the Quick add box as you speak (the phone's own speech recognition where it has one), and a recording sent to Gemini to transcribe where it doesn't (iOS Home Screen app, Firefox), with clear words on why when neither is available.
- [x] Voice probe (22 Oct 2026): Gemma 4 (26B, 31B) refuse audio ("Audio input modality is not enabled"). gemini-3.5-flash-lite: 5/5 synthetic lines right, about 1.5 s, about 90 audio tokens for a 3-second line; 3.1-flash-lite also 5/5, slower. Voice runs on Flash-Lite. Still to try: the owner's own recordings (`-- --clips <folder>`), noisy rooms, Indian English names.
- [ ] Hold + to talk, from any screen with the tab bar: + turns into a mic (vibration, a soft sound), 4–5 accent bars react to your voice above it, release fades the bars and puts a spinner on + itself, which can't be tapped until it's done (then the screen it opened, or a plain answer). This replaces press-and-hold for the Create sheet inside a group.
- [ ] Quick add review: every intent it should handle (expense, payment/settle up, new group, add people, open item, open a screen, use what's on screen), and a clear answer for lines it can't act on ("Make me a sandwich").

## Ideas, not requested (build only if the owner asks)

- The expense form could show the AI's other icons as pills, as New group and open items do.
- Admin tabs are 28 px wide at 320 px screens (above the 24 px minimum, but tight).
