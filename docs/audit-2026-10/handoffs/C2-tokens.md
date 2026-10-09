# Design tokens and rules (C2) — for every track's files

Measured against WCAG 2.x on the actual palette (see reports 08 and 15). Apply in the files you own.

## Text colour
- **Secondary text** → `text-muted` (slate-600 light / slate-400 dark: 7.6:1 and 7.5:1 on cards). Replace every `text-slate-500` and `text-slate-500 dark:text-slate-400` pair used for words or numbers.
- **`text-slate-400` is never text.** It stays only on decorative glyphs that carry no meaning (search magnifier, chevrons, the drag handle). If a `text-slate-400` string says something ("settled up", a date, "not involved"), it becomes `text-muted`.
- Money direction: `pos` / `neg` utilities only (emerald-700 / rose-700 light, 400 dark); never `text-emerald-600` / `text-rose-600` on text (3.7:1 / 4.5:1 borderline).
- Warnings: `text-amber-700 dark:text-amber-300`, not amber-600.
- On brand gradients: `text-white/90` minimum (`/75`–`/85` fail on brand-600).
- Badges with white text: `bg-rose-600`, not rose-500.

## Accents
- Five presets: violet (default), ocean, indigo, saffron, graphite. Emerald / Rose (they are the owed / owe colours) and Amber (no 4.5:1 with white) are gone from `src/lib/accent.ts` and `src/index.css`. `--color-brand-vivid` no longer exists; use `brand-600`.
- White text passes AA on `brand-600` **and** `duo-600` of every preset (`accent.test.ts` guards it), so `btn-primary`'s `from-brand-600 to-duo-600` is safe. Don't lighten gradient ends below 600 under white text.

## Size and targets
- 12px floor for anything that says something: `text-xs`, not `text-[10px]`/`text-[11px]` (badges that repeat visible text may stay `text-[0.6875rem]`).
- Tap targets ≥ 44px: icon buttons `flex h-11 w-11 items-center justify-center rounded-full` (use `-m-2`/`-mr-2` to keep the layout tight); chips `min-h-10`; `btn-sm` exists for small text buttons (`min-h-9`).
- Inputs keep 16px (index.css forces it on touch); don't add `text-sm` to `.input`.

## Icons (report 08's rule)
An icon is allowed when (1) it is the only label (then `aria-label`), (2) it carries state (spinner, check, flag, repeat marker), (3) it tells equal tiles apart (CreateSheet tiles, tab bar, section headers), or (4) it is a platform glyph the user must find on their device. Otherwise a labelled button gets **no leading icon** (`Save`, `Add`, `Record`, `Approve`, `Restore`…). One glyph per meaning: `Sparkles` = AI only; `QrCode` = an actual QR; `ReceiptText` = split by items; `RotateCcw` = restore; `Trash2` = delete. Always `aria-hidden` on decorative icons (lucide does it by default unless you pass an aria prop).

## Copy
- Glossary: Add expense · Record a payment / Settle up · Split by items · Live table · Captured payment · Capture key · Scan · Needs your OK · Flagged. No exclamation marks, no emoji in toasts or labels (emoji only where the user chose it: group icon, category).
- Errors: `toast(errText(e), 'err')` from `src/lib/errors.ts`, never `(e as Error).message`.
- Destructive, non-restorable actions: `const ok = await useConfirm()({ title, message, confirmLabel, tone: 'danger' })`; restorable ones keep the Undo toast.

## Page chrome
- `usePageTitle('Title')` from `src/lib/brand.ts` once per page (document.title = "Title · Split Now"; screen readers announce it on route change). Pass the entity name once loaded, `undefined` while loading.
- Dates: `formatDate(iso)` / `formatDate(ts, 'month')` / `formatDateTime(ts)` from `src/lib/locale.ts` (cached, local-date safe) instead of `new Date(x + 'T00:00').toLocaleDateString(...)`.
- Loading: `Skeleton` / `ListSkeleton` / `CardSkeleton` from `src/components/Skeleton.tsx` for list and card screens; `Loading` only for truly indeterminate work.
- Lists of things are `<ul>/<li>` (or `<section aria-label>` cards); headings in order (one `h1` per page, `h2` for sections).
