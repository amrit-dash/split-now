# Pending work

What the owner asked for that isn't shipped yet, newest first. Read this at the start of a session;
remove an item when its release merges, and add anything left half-done. Last updated 20 Oct 2026,
after 8.7.3.

## 1. What's new banner rises from the bottom; swipe to dismiss every notification

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

## 2. Smaller follow-ups mentioned earlier (not requested to build)

- The expense form could show the AI's other icons as pills, as New group does.
- Admin tabs are 28 px wide at 320 px screens (above the 24 px minimum, but tight).
