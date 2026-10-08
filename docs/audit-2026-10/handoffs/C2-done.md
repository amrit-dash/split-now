# C2 — done (app shell, Home, Groups, Insights, Friends, design system, icons)

## Icon pipeline (lead owns the design; this is the generator)
`scripts/generate-icons.mjs` finished and run against the current `public/favicon.svg` (the original mark). Re-run after any redesign with:

```
npm run icons          # = node scripts/generate-icons.mjs
ICON_BG='#rrggbb' npm run icons   # override the maskable field (default: --color-brand-700 read from src/index.css)
```

It assumes only: a `<rect … rx="…"/>` background as the first shape after `</defs>`, then the mark; two `<stop stop-color>`s in the gradient (the runtime tint swaps those). Outputs in `public/`: `pwa-192.png`, `pwa-512.png` (full tile), `pwa-maskable-512.png` (mark alone, centred on a flat brand-700 field, scaled so its bounding-box diagonal is ≤ 80% of the width: measured 409 px ≤ 409.6, flat corners, no inner square), `apple-touch-icon.png` (180, square corners, no alpha), `badge-96.png` (white silhouette on transparent: background rect removed, fills/strokes forced white, masks/clipPaths untouched) and `pwa-mono-512.png` (same silhouette, for `purpose: 'monochrome'`; A2 wires it into the manifest, see C2.md #3). Runtime: `applyIconTint()` in `src/lib/accent.ts` fetches `/favicon.svg` once and sets a tinted data: URL on `<link rel="icon">` for the active accent (brand-600 / duo-600 from computed CSS); called from `applyAccent()`, Layout and Login. `tintIconSvg()` is pure and tested, including against the shipped favicon.

## Files changed (all mine)
- `src/lib/accent.ts` (5 presets, favicon tint), `src/lib/accent.test.ts` (oklch→sRGB converter; guards: CSS blocks complete, retired presets gone, index.html map, hex copies = CSS, white on brand-600/duo-600 ≥ 4.5:1 for every preset, scales monotonic, favicon has two stops)
- `src/index.css` (emerald/rose/amber removed; ocean/indigo duo scales shifted one step so duo-600 passes 4.5:1 under white; `--color-brand-vivid` removed; `will-change` dropped from the Aurora utilities; `.aurora-paused`; `'Inter Fallback'` in `--font-sans` per A2)
- New pure libs + tests: `src/lib/insights.ts` (period/basis parsing, local-date month and week bucketing with no Date-object keys, year labels across a boundary, previous-period total + `deltaPercent`, paid vs share, "with people", budget run-up), `src/lib/friends.ts` (per-person net across groups, `?filter=` parsing), `src/lib/chartGeometry.ts` (donut arcs, monotone cubic path, nice ticks, scales)
- New `src/components/charts/` (`Donut`, `AreaChart`, `Bars`, `useWidth`): hand-rolled SVG/HTML, tooltips on pointer, text alternatives (aria-label words, sr-only table, printed values on bars). `recharts` is no longer imported anywhere in `src` (lead removes the dependency).
- `src/components/Layout.tsx` (`<main id="main">` + skip link + Suspense inside the content area, route-change focus, `aria-label="Main"`, tab labels `text-muted`/12px, app badge = captures to sort + approvals via A2's `setBadge`, favicon tint), `CreateSheet.tsx` (Add expense first and primary, glossary copy, `ReceiptText` for Split by items; FAB keeps opening it, `nav-create` kept), `Aurora.tsx` (smoke blend kept; pauses off-screen / hidden tab), `AccentPicker.tsx` (5 × 44px swatches, shared `Switch`), `GroupIcon.tsx` (decorative), `GroupRow.tsx` (12px direction labels, Archived pill, members count for AT), `IconPicker.tsx` (no Sparkles, 16px emoji field, 36px dismiss), `DebtGraph.tsx` (debts spelled out in the aria-label), `Trust.tsx` (errText, useConfirm for purge, icon rule, glossary pills "Flagged" / "Needs OK")
- Pages: `Home.tsx` (first-run card with create / import / join-with-code; one greeting line + the computed subline as the headline; hero tiles → `/friends?filter=`; People section; skeletons; `formatDate`; badge split to-sort vs unread dot), `Groups.tsx` (shared empty states, Archived collapsible, header = Friends + New group), `GroupDetail.tsx` (Expenses · Balances · Activity; graph collapsed under Balances; ⋯ menu with Edit / Invite / Insights / Export CSV / Archive / Leave / Delete; Settle up secondary when settled; Remove member on zero balance (creator); Leave group (non-creator, zero balance) → `repo.removeMember`; `methodLabel()` feature-detected; BudgetBar progressbar; compact auto-capture row; errText; usePageTitle), `GroupForm.tsx` (Switches, "More options" collapsible with currency/budget/dates/simplify/approval and a summary, inline `role="alert"` validation with focus, `MoneyInput` for budget/threshold, useConfirm + try/catch on delete, `groupTypeOf` safety, "in N expenses" instead of a hidden remove button; kind selector / chips / people search / email add kept), `Friends.tsx` (shared lib, Everyone / Owe you / You owe filter in the URL, new-user empty state, busy state, errText), `Login.tsx` (labels, autocomplete/inputMode/enterKeyHint, demo form submits on Enter, `demo-name`/`demo-start` testids, errText fallback), `Join.tsx` (radiogroup, errText, dead-end has Go home, usePageTitle), `Insights.tsx` (new charts, `?p=`/`?b=` in the URL, basis hidden for personal, delta subline, budget card, With people card, archived groups out of "All groups")
- `public/*.png` regenerated; `scripts/generate-icons.mjs`.

## Verified
- `npx tsc -b`: 0 errors in my files (the 3 current errors are C3's `StatementImport.tsx` against A1's new `readStatementAi` contract).
- `npx vitest run`: 54 files, 813 tests green (my new tests: accent 15, insights 14, friends 7, chartGeometry 13).
- `npx biome check` on all my TS/TSX + the script: clean after `biome format --write` on my own files only (E's #10 `valueOf` renamed). `src/index.css` shows 33 Biome *parse* diagnostics on Tailwind v4 at-rules, not lint (noted to E).
- E's Playwright smoke suite against my tree in demo mode: 7/7 passed.
- Screenshot pass (Pixel 7, light and dark, demo data, scratchpad/shots/*.png): Login, Home, Groups, GroupDetail expenses/balances/graph/menu, Insights all-groups and single group (budget + paid vs share), GroupForm, Friends, Create sheet, delete-group confirm → first-run Home/Groups, empty Friends/Insights. No page or console errors.
- Icons: maskable field corner = `#6d28d9`, mark bbox 111–400 px (diag 409 ≤ 409.6), badge 96×96 RGBA white-on-transparent, apple-touch 180×180 RGB.

## Deliberately left out, and why
- `data-testid="nav-add"` on the FAB: the addendum keeps `nav-create` and the Create sheet; one element cannot carry two testids, and the primary tile already has `create-expense`.
- Long-press / direct-to-/add on the FAB, Aurora reduction, dual-tone toggle removal, Login's dark surface: owner's decisions (requests 11–16, addendum).
- No `text-faint` utility: `text-slate-400` stays only on decorative glyphs; everything that says something is `text-muted`.
- Insights "settle-up nudge" and year-in-review cards (06 M5 3–4): phase 2.
- Capture ranking / reminders skipping archived groups: A1 / B code (noted in C2.md #8).
- Swapping `useAllGroupData` in Layout for a lighter subscription: A1's shared store makes it free; if the store lands differently, `AppBadge` is a 6-line component to adjust.

## Decisions the owner should know
- **Accents trimmed to five** (violet, ocean, indigo, saffron, graphite). Emerald and Rose were the same hues as owed/owe amounts; Amber could not pass 4.5:1 with white text. A stored retired accent silently becomes Violet. Ocean and Indigo gradients end slightly darker than before (their duo-600 is the old duo-700) so white button text passes everywhere; a test now enforces this for any future preset.
- **Archive** is a plain `group.archived` flag any member can toggle from the ⋯ menu (Undo in the toast). Archived groups stay readable, are listed under "Archived" on Groups, and are excluded from the Home totals, People, Friends, Insights "All groups" and the app badge. B must allow the key in the rules whitelist (C2.md #5).
- **Leave group** is in the ⋯ menu for non-creators with a zero balance; the creator sees why they cannot leave. The self-leave Firestore batch issue (09 H3) is A1's/B's to close; until then the button surfaces the error as a toast.
- **Remove member** from Balances is creator-only and only at a zero balance (the rules allow exactly that); GroupForm still only removes people who appear in no expense, now with "in N expenses" shown instead of a vanished button.
- **"Flagged" / "Needs OK"** replace "Disputed" / "Pending" in the pills (glossary). Data and rules unchanged.
- **Insights "4 weeks"** replaces "30 days": four full weeks so no bucket is a two-day stub, labelled by the week's first day. Months are keyed by the calendar month on the expense, so October spend in IST now lands in October.
- The **desktop favicon follows the accent**; home-screen icons are minted from the generated PNGs at install time and cannot follow it (report 08 §3).
