# Pending work

What the owner asked for that isn't shipped yet, newest first. Read this at the start of a session;
remove an item when its release merges, and add anything left half-done. Last updated 20 Oct 2026,
after 8.7.2.

## 1. Icons for open items (half-built, on branch `claude/zen-faraday-77auqp`)

**Asked:** the New/Edit open item sheet, opened from a group's Open tab and from the chat's
Open item tool (both use `src/features/open-items/OpenItemSheet.tsx`), should have what expenses
and groups have: the full icon list, Suggest with AI, Draw a picture, and the automatic AI pick
with its other good fits as suggestion pills.

**Done so far** (commit "WIP: icons for open items", on top of 8.7.2; unit tests 2199 pass, lint
and format pass):
- `OpenItem` gains `icon`, `iconAuto`, `iconSvg`, `iconImage`; `src/lib/open-items.ts`
  (`openItemEmoji`, input/new/edit/clean), `expense-draft.ts` and `nl-expense.ts` (a claimed item's
  icon carries into the new expense), with unit tests;
- `firestore.rules` openItems whitelist and `isEdit`, rules tests in `tests/firestore.chat.test.ts`
  and `tests/firestore.vault.test.ts`; private groups seal the icon (`vault-fields.ts`,
  `shared/vault-convert.ts`) and never take a drawn icon or picture;
- `OpenItemSheet`, `OpenItemsTab`, `chat/Message.tsx`, `ExpenseEditor.tsx`, `localRepo`,
  `firebaseRepo`, Help, CHANGELOG (under Unreleased), docs, an e2e test.

**Still to do:**
- review the diff (the agent stopped mid-run on a spend limit, before its own review);
- run `HTTPS_PROXY= https_proxy= npm run test:rules`,
  `HTTPS_PROXY= https_proxy= env -u GEMINI_API_KEY npm run test:functions` and the full e2e suite;
- check the sheet at phone width (icon button, category control, suggestion pills, "Picking an
  icon…");
- release as 8.7.3: version, CHANGELOG section (move the Unreleased line), What's new entry
  (link `open-items` or the Help section it changed), then PR, CI, squash-merge.

## 2. What's new banner rises from the bottom; swipe to dismiss every notification

**Asked (with a screenshot of Home):** the "Updated to 8.7.2 · See what's new" banner sits at the
top of Home (`src/components/WhatsNewBanner.tsx`, placed in `src/pages/Home.tsx`). Instead:
- the page loads, then about a second later the banner rises from behind the bottom tab bar into
  the spot above it, the same place and animation as the "New version ready" banner
  (`src/components/UpdatePrompt.tsx`: `fixed inset-x-3 bottom-[var(--lane)]`, the `rise`
  keyframes in `src/index.css`); only on Home, never covering forms; it must not overlap the update
  banner or the install banner (they already hide each other through `html[data-update-ready]`);
- **swipe to dismiss for all notifications**: the What's new banner, the New version banner (swipe
  = Later), the install banner (`src/components/InstallBanner.tsx`) and the toasts
  (`src/components/Toast.tsx`; each toast, and the collapsed stack's front one). Horizontal swipe,
  with the card following the finger and a threshold; keep the ✕ buttons for keyboard and
  screen readers; respect `prefers-reduced-motion`. Put the gesture maths (threshold, velocity,
  direction) in a pure tested function in `src/lib`.

Nothing built yet.

## 3. Smaller follow-ups mentioned earlier (not requested to build)

- The expense form could show the AI's other icons as pills, as New group does.
- Admin tabs are 28 px wide at 320 px screens (above the 24 px minimum, but tight).
