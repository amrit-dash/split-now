# Handover: local session → cloud session (22 Oct 2026)

Read once at the start of the cloud session, move anything still useful into `docs/PENDING.md`
or `CLAUDE.md`, then **delete this file in your first commit** (`git rm docs/HANDOVER.md`). It
holds no secrets; it is only context.

## Where things are

- **Production:** 8.8.1 (released 22 Oct 2026: shaded magenta backgrounds keyed out of drawn
  pictures). `main` = production.
- **Batch:** `batch/v9`, the next release, **9.0.0** (the owner chose the major). 25+ commits on
  top of `main`, all checks green at the branch tip (lint, typecheck:all, 2270 unit tests, rules,
  88/88 e2e). Not released: the owner says "release" when the batch is ready.
- **Stray branch:** `origin/batch/v9-yikjey` was made by an earlier cloud attempt; it is fully
  contained in `batch/v9` (checked with `git merge-base --is-ancestor`). Delete it:
  `git push origin --delete batch/v9-yikjey`. Delete any other `claude/*` or `*-<random>`
  branch the cloud made only after checking it's contained in `batch/v9` or `main`; if it has
  commits of its own, tell the owner what they are instead of deleting.
- **Your working branch:** if the harness gives you a branch of its own, merge `origin/batch/v9`
  into it first, and push your work back to `batch/v9` (`git push origin HEAD:batch/v9`) after
  each commit, so `batch/v9` stays the one batch branch.

## What's in the 9.0.0 batch (already built)

See `CHANGELOG.md` → `## Unreleased` for the person-facing list. In short:
- Home's header is pinned; the balance moves into it once the card scrolls away.
- Tab bar: Home, Groups, +, **Live table** (was Insights), Profile; Insights is a Profile row;
  a faint accent wash on the bar (no line on its edge: owner disliked it).
- **+ inside a group** goes straight to Add expense for that group; press and hold opens the
  Create sheet (this hold becomes **voice** once voice is built, see below).
- Create sheet: Quick add first, "or", Add expense, New group + Scan.
- Group expenses: Sort and filter has a folded Sort by and a sideways Quick filters row;
  applied sorts/filters show as removable pills (with small icons) under the search.
- Icons overhaul (see CLAUDE.md "Icons"): Fluent for UI, Solar duotone for Help and the
  Profile/Settings rows, lucide for small controls; Outline/Filled preference + admin default.
- Help revamp: smoother scene motion, tighter explainer captions, explainer animation fixes,
  layout at 360 px, Help prefetched on idle and precached.
- Design fixes: sheets slide away, Settle up full screen, sliding Segmented, stronger pinned
  headers, What's new banner on any tab-bar screen, balances colours, scroll memory fix, and more.
- Two-tone icons on colour: the current tab (Outline style) and icons inside accent buttons get a soft fill under the line (`DUO` in `scripts/icon-art.mjs`, `.icon-duo` in index.css, `tabIconLook`); the tab bar is 98% opaque so buttons don't show through.
- App icon: larger, bolder mark. Sign-in install bar: button beside the words on wide screens.

## What's left for 9.0.0 (owner's open asks)

1. **Voice + Quick add** — fully specified in `docs/PENDING.md` ("Voice and Quick add"). The
   owner was going to describe **one more feature** first and then let you decide whether voice
   ships in 9.0.0 or 9.1.0. Ask them for that feature before starting voice. Key decisions:
   - Free first: the phone's own speech recognition (`src/lib/speech.ts`, set `continuous: true`,
     listen until release). No recognition or no mic permission → no mic UI, unless AI
     transcription is on for that person.
   - AI transcription only through a **third admin key** for transcription (model picker,
     recommended gemini-3.5-flash-lite, Test button, refuse an unbilled key), admin flags for
     "transcription on" and "everyone may use the global key". No Whisper, no Groq, no self-hosting.
   - Preferences: **Transcription: Native | AI**. AI features: Transcribe with AI + which key
     (Automatic = own key first, then global; own only when global isn't allowed).
   - Quick add mic: tap toggle and press-and-hold; spinner inside the box while transcribing;
     the text waits for Enter. Quick add's AI prompt must expect rough transcripts and clean
     them first. "Make me a sandwich"-style lines get a friendly "here's what I can do".
   - Hold + anywhere: vibration + soft sound, + becomes a mic, 4–5 accent bars react to the
     voice above it, a subtle ripple from the button (don't spoil today's look); release: bars
     fade, spinner on + (not tappable), then Quick add's result (the screen it opened, or an answer).
   - Teaching: a speech bubble from + once after the update; a per-account `voiceTried` flag
     (profile doc, rules whitelist + test + PLAN.md) set on the first hold; until set, a
     "Did you know?" bubble every 3rd–5th visit.
   - Help: a new voice section; Quick add's section updated.
2. **Help screenshots:** `npm run help:media` once the UI settles (Settle up, Groups header,
   date row, icons all changed).
3. **Design pass, rest:** listed in PENDING ("Design pass, rest").
4. **Icons, later:** lucide feature icons left on admin, merge, chat composer and the expense
   form internals; move to Fluent when those screens are touched.

## How the owner likes to work (beyond CLAUDE.md)

- Short, plain replies; they often send screenshots with red boxes. Fix what's boxed and
  check the same thing everywhere else it appears.
- They want to see visual changes before they're everywhere: boards with options, then
  screenshots at 360 px in light and dark and at least two non-violet accents.
- They rejected two icon sets (Phosphor, MingCute) before Fluent; they love the Solar duotone
  Help art in the accent gradient. Don't hard-code violet anywhere.
- They like parallel work ("fire sub-agents on the side") for big independent pieces.
- Release: only when they say "release"/"ship"; then follow CLAUDE.md's release steps
  (version 9.0.0, CHANGELOG section, What's new entry linked to Help ids, full checks, PR,
  squash-merge, watch the Release workflow, sync `main`, clear PENDING).

## Keys and secrets

None in the repo. The local session used `.env.voice.local` (gitignored) for the voice probe;
the cloud container has no Gemini key unless the owner adds one to the environment. Never
paste or ask for keys in chat.
