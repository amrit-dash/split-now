# 08 · Design system, theming, iconography and app icon

Repo: `/home/user/split-it` (branch `claude/codebase-audit-optimization-k2uyfs`). Read-only audit. Every number below was measured by script over `src/**/*.tsx` + `src/index.css`; contrast ratios were computed from the actual oklch/hex values in `src/index.css` (WCAG 2.x relative luminance).

## 1. Summary

I read `src/index.css` in full, the theme/accent/colour/chart/brand libs, `Aurora`, `AccentPicker`, `Avatar`, `GroupIcon`, `IconPicker`, `Layout`, `Home`, `Login`, `App` (Splash), `Sheet`, `Collapsible`, `Toast`, `CaptureAlert`, `Misc`, `index.html`, `public/favicon.svg` and the generated PNGs, `scripts/generate-icons.mjs`, the PWA manifest in `vite.config.ts`, `public/push-sw.js`, and every `lucide-react` import (42 files). Verdict: the **theming architecture is good and lean** (CSS-variable accents in `@theme static`, pre-paint inline script with a test guarding it, `prefers-reduced-motion` respected, charts deliberately un-themed), but it was never **validated**: two of the eight accents put white text on 2.9–3.6:1 backgrounds, light-mode secondary text uses `slate-400` (2.6:1) in ~40 places, and 197 `text-slate-500` elements have no dark variant (3.9:1 on cards). The **icon layer has sprawled**: 76 distinct Lucide icons, 285 placements, 117 of which are a leading icon on a button that already has a text label, with the same glyph imported under two names and `Sparkles` meaning five different things. The **app icon is the weakest brand asset**: an ambiguous circle-with-lines (reads as a broken peace sign), baked in violet/pink regardless of the user's accent, with a mis-generated maskable variant that shows a visible inner square. Nothing here is a product blocker, but the accent system's promise ("re-theme the whole UI") is broken at the icon, splash and notification layers, and that is exactly where a user notices.

## 2. Findings (ranked)

### HIGH

#### H1. Primary-button text fails WCAG AA on the Amber and Ocean accents (and borders on Rose) — [Certain]
`src/index.css:135` `btn-primary` = `bg-gradient-to-r from-brand-600 to-duo-600 text-white`. The right half of every primary button is `duo-600`. Measured contrast of white on `duo-600`:

| accent | brand-600 vs white | duo-600 vs white | brand-500 vs white (Avatar `color="accent"`, Sparkles tints, focus ring) |
|---|---|---|---|
| violet | #7c3aed **5.70** | #c800de **4.66** | #8b5cf6 4.23 |
| ocean | #155dfc 5.26 | #0092b8 **3.60 ✗** | #2b7fff 3.76 |
| emerald | #007a55 5.37 | #00786f 5.39 | #009966 3.67 |
| rose | #ec003f **4.51 (borderline)** | #e60076 4.54 | #ff2056 3.76 |
| indigo | #4f39f6 6.44 | #0084d1 **4.02 ✗** | #615fff 4.58 |
| saffron | #bb4d00 5.05 | #ca3500 5.23 | #e17100 3.19 |
| amber | #a65f00 4.92 | #d08700 **2.93 ✗✗** | #d08700 **2.93 ✗✗** |
| graphite | #45556c 7.56 | #52525c 7.73 | #62748e 4.77 |

AA for 16px semibold text is 4.5:1. Amber's duo scale is literally Tailwind `amber` shifted so that `duo-600` = `amber-500`; `chip-on`, `Switch`, `Avatar color="accent"` (`Avatar.tsx:30`, initials ≈17.5px bold on brand-500 → duo-600) and the Home hero (`from-brand-700 via-brand-600 to-duo-600`, `text-white/80`) share the problem. The comment at `index.css:48` says lighter hues were shifted "so white text on brand-600 stays readable" — the duo scale was not given the same treatment.
**Fix (choose one):**
1. In the `amber`, `ocean`, `indigo` presets, set `--color-duo-600` to the preset's `duo-700` value and `--color-duo-500` to `duo-600` (i.e. shift the duo scale one more step, exactly as brand was). Amber then ends at #a65f00-ish (≈4.9:1).
2. Or change `btn-primary`/`chip-on`/hero to `from-brand-600 to-duo-700` globally (one line) and re-check the table.
3. Add a vitest that imports the preset block, converts oklch→sRGB (the 20-line converter I used is trivial) and asserts `contrast(white, brand-600) ≥ 4.5 && contrast(white, duo-600) ≥ 4.5` for every preset. That turns the table above into a guard.
Also: the inbox count pill `bg-rose-500 text-white text-[11px] font-bold` (`Home.tsx:91`) is 3.76:1 → use `bg-rose-600`.

#### H2. The maskable icon is generated wrong; the mark itself is ambiguous and ignores the accent system — [Certain]
`public/favicon.svg` (512 viewBox): a rounded square (rx 112 ≈ 22%) filled with a 45° gradient **#7c3aed (violet-600) → #db2777 (pink-600)**; a white ring (r 150, stroke 36); a white vertical bar through the centre (stroke 36, round caps); a shorter white diagonal from the centre to bottom-right (256,256 → 362,362) at 85% opacity. Visually it reads as a peace sign missing an arm, a clock at 4:30, or "Ø". At 48px the 85%-opacity diagonal half-disappears into the pink corner and the mark becomes "circle with a line". Nothing in it says split, money, rupee, UPI or people.

Three concrete defects beyond taste:
- **Gradient mismatch.** The icon's partner colour is pink-600 `#db2777`; the app's default duo is Tailwind fuchsia (`--color-duo-500` ≈ `#e12afb`, `duo-600` ≈ `#c800de`). Splash, Login and the Home card are magenta; the icon beside them is pink. Side by side on the Login screen (`Login.tsx:30`) it is visible.
- **Maskable PNG is broken.** `scripts/generate-icons.mjs:13-18` renders the *whole* icon (background + glyph) at 400px with `rx=0` and composites it onto a flat `#7c3aed` 512 canvas. Result (I viewed `public/pwa-maskable-512.png`): a flat violet frame with a visibly different gradient square inside it. Under Android's circle/squircle mask the inner square's edges show as a hard seam. The glyph should be placed inside the 80% safe zone *on a full-bleed gradient*, not inside a smaller copy of the whole tile.
- **Accent-blind.** All five rasters are baked violet. A user on Emerald sees an emerald splash gradient (`App.tsx:138`) with a violet/pink icon popping in the middle of it.

**Proposed mark — "split coin"**: one white disc cut along the diagonal into two halves that have slid apart. Bold shapes only (nothing thinner than 50/512), no strokes, survives a circle mask, and uses the app's real brand-600 → duo-600 pair so it matches `btn-primary` exactly. I rendered it with the repo's own `sharp` at 512/256/48px and as the maskable derivation (PNGs in `scratchpad/icon/markC-*.png`, `mark-maskable-256.png`): at 48px it reads as two pieces (and faintly as an "S"), not as a "prohibited" sign — the halves are deliberately offset *along* the cut as well as across it, because a disc with a plain diagonal channel (my first variant, `scratchpad/icon/mark-48-zoom.png`) reads as ⃠ at small sizes. Drop-in replacement for `public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c3aed"/>   <!-- brand-600 (violet) -->
      <stop offset="1" stop-color="#c800de"/>   <!-- duo-600 (fuchsia): the same pair as .btn-primary -->
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  <!-- Disc r=150 at (256,256), cut along the bottom-left → top-right diagonal
       (chord (149.93,362.07)–(362.07,149.93)). Each half is pushed 22px away from the cut
       along the normal (→ 62px channel, ≈6px at 48px, 2px at 16px) and slid 28px along the cut
       in opposite directions, so the edges no longer line up and it reads as "split", not "no". -->
  <g id="glyph" fill="#fff">
    <path transform="translate(-2.2 -41.8)" d="M149.93 362.07 A150 150 0 0 1 362.07 149.93 Z"/>
    <path transform="translate(2.2 41.8)"   d="M362.07 149.93 A150 150 0 0 1 149.93 362.07 Z"/>
  </g>
</svg>
```
If a currency cue is wanted later, it belongs in marketing, not the icon — the app is multi-currency and a ₹ would be wrong for every non-INR group.

**Generator fix** (`scripts/generate-icons.mjs`): derive the maskable from the same SVG by (a) `rx="112"` → `rx="0"` and (b) wrapping the glyph: replace `<g id="glyph"` with `<g id="glyph" transform="translate(256 256) scale(.8) translate(-256 -256)"` — the gradient stays full-bleed, the glyph lands inside the 80% safe zone. Drop the `sharp({create…})` composite and the flat `#7c3aed` background. Keep `apple-touch-icon` as `rx=0` + `flatten` (iOS masks itself). Add a 96px monochrome glyph for `shortcuts[].icons` (currently all three shortcuts reuse the app icon — Android renders them as three identical tiles).

#### H3. Light-mode `text-slate-400` is used for *text*, including the tab bar labels — [Certain]
`slate-400` on white = **2.63:1**, on `slate-50` = 2.51:1. It is fine for decorative icons (chevrons, search glyph) but it is used as text in 36 lines across 21 files plus the inactive tab labels in `Layout.tsx:55` (`text-[11px] font-semibold … text-slate-400`). The same class in dark mode is 7.5:1, so the author probably only checked dark. Worst offenders: `ExpenseDetail.tsx` (4), `GroupDetail.tsx`, `ExpenseForm.tsx`, `AutoCapture.tsx` (3 each), `Login.tsx:73,78` ("New here? Create an account", "Splitting a bill at a table?" on ink-950 are fine — those two are dark-only, exclude them).
**Fix:** rule — `text-slate-400` is for icons only; text that is secondary uses `text-slate-500 dark:text-slate-400`. For the nav: `text-slate-500 dark:text-slate-400` (4.77:1 light). A grep-based lint (`grep -nE 'text-slate-400' | grep -v 'size='`) in CI keeps it that way.

#### H4. Dark-mode parity gap: 197 `text-slate-500` elements have no `dark:` variant — [Certain]
Only 12 of 209 `text-slate-500` occurrences carry `dark:text-slate-400`. `slate-500` on `ink-950` = 4.13:1, on an `ink-900` card = **3.91:1**, inside an `ink-800` input = 3.58:1. Most are `text-xs`/`text-sm` captions (fails AA). Examples: `GroupDetail.tsx:92,95,112`, `Home.tsx:158`, `CaptureAlert.tsx:52`, `Inbox.tsx`, every `label`-less caption. Conversely `dark:text-slate-600` for chevrons (`GroupRow.tsx:44`, `Inbox.tsx:88`, `Profile.tsx:193`) is 2.46:1 — acceptable only because they are decorative.
**Fix:** stop spelling the pair by hand. Add two utilities in `index.css` and migrate by search-and-replace:
```css
@utility text-muted  { @apply text-slate-500 dark:text-slate-400; }
@utility text-faint  { @apply text-slate-400 dark:text-slate-500; } /* icons / hints only */
```
Then `text-slate-500` → `text-muted` everywhere (the 12 that already have the pair collapse to one class). This also fixes the 9 `bg-white` lines without a dark counterpart where it matters (`SplitBill.tsx:141`, `Scan.tsx:118` progress bars are fine; `AccentPicker.tsx:63` `ring-offset-white` has a dark variant; `Login.tsx:57` Google button is intentionally white).

### MEDIUM

#### M1. Icon sprawl: 76 distinct Lucide icons, 217 import slots, 285 placements; 117 are decoration on labelled buttons — [Certain]
Full inventory (files · placements):

- Used everywhere, keep: `Check` 15·29, `Plus` 14·19, `Trash2` 12·15, `X` 12·13, `ChevronDown` 7·7, `ChevronRight` 7·8, `Loader2` 6·11, `Copy` 5·12.
- Navigation set (keep, 5): `Home`, `Users`, `Plus`, `BarChart3`, `User`.
- Same glyph, two names (lucide 1.52 aliases, verified against the installed package): `CheckCircle2` (AutoCaptureSetup, CaptureGuest) **=** `CircleCheck` (Table); `BarChart3` = `ChartColumn`; `XCircle` = `CircleX`; `PlusSquare` = `SquarePlus`; `Loader2` = `LoaderCircle`; `Trash2` = `Trash`. Harmless at runtime but it is why the inventory reads 76.
- Near-duplicates competing for one meaning: `Share` (iOS share-sheet glyph, InstallBanner/NotificationSettings) vs `Share2` (GroupDetail, Table ×5); `Settings` (GroupDetail) vs `Settings2` (AutoCaptureSetup); `RotateCcw` (restore) vs `Undo2` (Capture undo) vs `RefreshCw` (test key / refresh rates) vs `Repeat` (recurrence); `FileUp` / `ImageUp` / `ImagePlus` / `Download` for "pick a file"; `Camera` / `ScanLine` / `QrCode` for "scan".
- **Semantic mismatch:** `QrCode` is used for "Split a bill by items" / "Split by items" / "Start table" (`CreateSheet.tsx:26`, `ExpenseForm.tsx:87,415`, `Scan.tsx:153`, `SplitBill.tsx:237`) — the QR is how guests *join*, not what the feature *is*. Use `Receipt`/`ReceiptText` (already imported in Table.tsx) and reserve `QrCode` for the actual QR actions (SettleUp, Table host button, GroupDetail invite).
- **`Sparkles` means five things** (8 files): AI (AiScanToggle, AiSettings, StatementImport, Profile "AI features"), the app update banner (UpdatePrompt:55), cross-group netting (Friends:100 "Net out"), name-based type suggestion (IconPicker:70), and demo mode (Login:48). Reserve it for AI; update → `RefreshCw`; "Net out" → no icon (the chip label is enough) or `ArrowRightLeft` (already the settle glyph); suggestion chip → no icon; demo → none.
- **Single-use icons that are pure illustration** (remove or fold into text): `Apple`, `BatteryCharging`, `Info`, `Activity`, `Zap`/`Pause` (AutoCapture header + toggle), `Smartphone` in `<summary>` headings, `HandCoins`, `Link2`, `Receipt`, `BookOpen`, `FolderInput`, `EyeOff`, `CopyPlus`, `CheckCheck`, `History`, `Wallet`, `Palette`, `Moon`/`Sun`/`SunMoon` inside a *labelled* segmented control, `ArrowDown` (SettleUp separator), `Flag` 4 uses in Trust (keep one: the "Disputed" badge).
- **Leading icon on a labelled button** — 117 placements of the pattern `<Icon size={18} aria-hidden /> Label`: `Check` ×13 ("Save", "Add expense", "Record", "Approve", "Finish", "Join group", "Save changes"), `Plus` ×11, `Copy` ×7, `Camera` ×5, `Users`/`KeyRound`/`Download` ×4, `UserPlus`/`Trash2`/`Share2`/`QrCode`/`LogIn`/`ImageUp`/`Flag` ×3, and 24 more. A `btn-primary` reading "✓ Save" adds nothing a user can act on, costs 18px of a 44px row, and multiplies the inventory. The heaviest files are `AutoCaptureSetup.tsx` (18 distinct icons), `Profile.tsx` (16), `GroupDetail.tsx` (14), `Table.tsx` (14), `ExpenseForm.tsx` (13).

**Rule for when an icon is allowed** (put it in `docs/PLAN.md §5`):
1. The icon is the *only* label (icon-only button with `aria-label`), **or**
2. it carries *state* (checked/unchecked box, spinner, warning/error, dispute flag, recurring marker), **or**
3. it disambiguates *siblings in a grid of equal tiles* (CreateSheet tiles, Collapsible section headers, the tab bar), **or**
4. it depicts a *platform glyph the user must find on their device* (iOS `Share`, `PlusSquare` in install instructions).
Otherwise a button with a text label gets no icon. One glyph per meaning; one name per glyph.

**Concrete removal list** (≈95 placements, 76 → ~48 icons, no behaviour change):
- Strip the leading icon from every `btn-primary`/`btn-secondary`/`btn` that has a text label, *except* the FAB and the three `Groups.tsx:20-22` icon-only header buttons. Files: all 42; mechanical regex `<(Check|Plus|Users|LogIn|UserPlus|Download|Send|ArrowRight|KeyRound|Bell|Wallet|Home|Inbox|HandCoins|Link2|Save|Camera|ImageUp|FileUp|Copy|Share2|Receipt|RotateCcw|CheckCheck|Trash2|LogOut|X|QrCode|ScanLine|Pencil|Settings2|Undo2|Sparkles|RefreshCw|ShieldCheck|BellOff) size=\{1[0-9]\}[^/]*/> ` followed by a capital letter or `{`.
- Delete imports: `Apple`, `BatteryCharging`, `Info`, `Activity`, `Zap`, `Pause`, `Smartphone`, `HandCoins`, `Link2`, `BookOpen`, `FolderInput`, `EyeOff`, `CopyPlus` (use `Plus`), `CheckCheck`, `History`, `Wallet`, `Palette`, `Moon`, `Sun`, `SunMoon`, `ArrowDown`, `Undo2` (→ `RotateCcw`), `Settings2` (→ `Settings`), `CheckCircle2` (→ `CircleCheck`), `XCircle` (→ `CircleX`), `PlusSquare` (→ `SquarePlus`), `ImagePlus` (→ `ImageUp`), `Share2` in Table (→ `Share` only where it is the iOS glyph; otherwise the labelled "Share" button needs none).
- `Loader2` ×11 → the existing `Spinner` component (`Misc.tsx:41`); one spinner, one size system.
- Keep but narrow: `Sparkles` → AI only; `QrCode` → QR only; `Flag` → the Disputed badge only.
- After this the realistic floor is ~48 icons / ~190 placements, and `AutoCaptureSetup` drops from 18 to ~7.

#### M2. The accent system: worth keeping, but trim it — [Likely]
Cost side is low: ~60 lines of CSS, 90 lines of TS, one test, a 10-line pre-paint script. What it costs is *consistency*:
- Two presets collide with the app's semantic colours. `pos`/`neg` (`index.css:147-149`) are emerald/rose. On the **Emerald** accent "you are owed" is the same green as every button and link; on **Rose** "you owe" is the brand colour. The one place colour carries meaning (money direction) loses it for two of eight users.
- **Amber** cannot pass contrast with white text (H1) without becoming brown.
- The duo toggle doubles the QA matrix (16 looks) for a setting most users will never find; `data-duo="off"` also silently changes `GroupIcon`, `IconPicker`, `Avatar accent`, hero, FAB — all fine, but nobody will test 16 combos.
- The preset list exists **three times**: oklch scales in `index.css`, hex swatches `from/to/meta` in `accent.ts:20-29`, and the hex map in `index.html:27`. `accent.test.ts:112` guards html↔ts but nothing guards css↔ts; `from`/`to` are hand-converted hex copies of the CSS.
- `--color-brand-vivid` is defined for all eight presets (`index.css:45,54,59,…,85`) and **used nowhere** in the repo (grep over src, index.html, css). Dead token.
- Nothing downstream follows the accent: icons, splash PNG, manifest `theme_color`, notification icon, member colours, category colours (the last two are correct — user data must not re-colour).
**Recommendation:** keep accents; ship 5 — Violet (default), Ocean, Indigo, Saffron, Graphite. Drop Emerald and Rose (semantic clash) and Amber (contrast). Make duo a fixed partner per preset and delete the toggle (`DUO_KEY`, `setDuo`, `data-duo` block, the switch in `AccentPicker.tsx:76-92`) — or keep it hidden behind the admin flag if someone loves it. Delete `brand-vivid`. Make the swatches read the CSS instead of hex copies: change `:root { &[data-accent='ocean'] {…} }` to a plain `[data-accent='ocean'] {…}` selector (matches `<html>` *and* a swatch `<button data-accent="ocean">`), then `style={{ background: 'linear-gradient(135deg, var(--color-brand-600), var(--color-duo-500))' }}` and drop `from`/`to` from `ACCENTS`. Keep `meta` (the pre-paint script needs hex before CSS loads) and extend the existing test to assert `meta === brand-700` by parsing `index.css`.

#### M3. Motion and GPU budget: nine infinite animations with `will-change`, five `blur-3xl` layers, 11 `backdrop-blur` surfaces — [Likely]
`Aurora` card (Home) = 3 blurred blobs (`blur-3xl`, 60–90% of the card) + 3 bubbles, all `infinite` with `will-change: transform` (`index.css:173-179`) → 6 compositor layers permanently animating at 60fps on the first screen. The FAB (`Layout.tsx:45`) spins a full-bleed conic gradient at `-inset-1/2` for as long as the app is open, on **every** tabbed screen. Login adds two more `blur-3xl` 384px discs. On the ₹10–15k Android phones this product targets, continuous blur + transform layers are the classic cause of jank in scrolling lists and of a warm phone. Reduced motion is honoured (global `0.01ms` rule, `index.css:155`), but that only helps users who set the OS flag.
**Fix:** keep the *look*, stop the *loop*: (1) FAB: static conic or a single `pop` on mount; the 8-second spin is invisible under a 28px plus anyway. (2) Aurora card: render the three blobs statically (they already blend well) and animate only `blob-a`, or run the animation 2 iterations then stop (`animation-iteration-count: 2`). (3) Add `@media (update: slow), (prefers-reduced-data: reduce)` to the reduced-motion block. (4) Drop `will-change` (the browser promotes animated transforms on its own; forced layers on 6 blurred elements cost memory). (5) Consider `backdrop-blur-xl` → `backdrop-blur-md` on the sticky `PageHeader` and tab bar; the difference is invisible at 85% opacity.

#### M4. First-paint / splash chain shows three different brands in two seconds — [Certain]
Sequence on a cold launch, light mode: **OS launch screen** (manifest `background_color` `#0b0a14` ink + violet/pink PNG + name) → **in-app `Splash()`** (`App.tsx:136`: `from-brand-700 to-duo-700` *accent* gradient, same violet PNG `animate-pop`-ing in again) → **Home** (`slate-50`) or **Login** (ink-950 + two brand blobs). Dark → saturated gradient → white, with the icon animating twice. On a non-violet accent the second screen is e.g. emerald with a violet icon. `theme_color` is static violet; `apple-mobile-web-app-status-bar-style="black-translucent"` puts *white* status-bar text over the light `slate-50` Home on iOS ([Likely] — needs a device check; `black-translucent` is only safe when the top of every screen is dark).
**Fix:** `Splash()` → `bg-ink-950` (matches the OS splash exactly so the hand-off is invisible) with the mark as **inline SVG** using `fill="var(--color-brand-600)"`/`var(--color-duo-600)` so it follows the accent, no `animate-pop` (the OS already animated it in). `Login` keeps ink-950 (consistent). Change `apple-mobile-web-app-status-bar-style` to `default` and let `theme-color` drive it, or give Home/`PageHeader` a dark safe-area band. `Loading()` (`Misc.tsx:45`) is a brand-500 ring — fine.

#### M5. Notifications: colour PNG as `badge`, default title "Split It" — [Certain]
`public/push-sw.js:20-21` sets `icon: '/pwa-192.png', badge: '/pwa-192.png'`. Android renders `badge` as an alpha-only monochrome glyph in the status bar; a full-colour rounded tile becomes a white square blob. The fallback title at line 15 is `'Split It'` while `APP_NAME` is `'Split Now'` (`brand.ts`).
**Fix:** generate `public/badge-96.png` (white glyph on transparent — the two half-discs from the proposed mark, no background) in `generate-icons.mjs` and point `badge` at it; title fallback `'Split Now'`. Also use this file for the three manifest `shortcuts[].icons`.

#### M6. Typography: numbers are mostly tabular but not everywhere; sub-12px text is common; Inter is render-blocking and not offline — [Certain]
- `tabular-nums` is applied 57 times — good — but amounts are rendered via `formatMoney` in 22 files and several have none: `Trust.tsx` (3 amounts, 0 tabular), `TableFinish.tsx` (2/0), `CaptureGuest.tsx` (2/0), `AutoCaptureSetup.tsx` (2/0), `CaptureAlert.tsx` (1/0), `SettleUp.tsx` (6/1), `GroupDetail.tsx` (12/7). For a money app the simplest correct answer is global: `body { font-variant-numeric: tabular-nums; }` in `@layer base` (Inter ships `tnum`), then delete the 57 class instances. Dates and counts align too; prose is unaffected in practice.
- 23 placements of `text-[11px]` / `text-[10px]` (`AutoCaptureSetup` 6, `Trust`, `AutoCapture`, `GroupDetail` 2 each, the tab labels). 10px bold badges are OK; 11px body copy with `slate-500` is not. Floor at `text-xs` (12px) except for badges.
- Inter is loaded from Google Fonts with 5 weights (`index.html:17`), render-blocking, `display=swap` (FOUT on every cold start), and the service worker has no `runtimeCaching` for `fonts.gstatic.com` (`vite.config.ts:56-59` only caches Tesseract) → an **installed, offline PWA falls back to system-ui**. Fix: self-host `Inter` variable woff2 (`@fontsource-variable/inter`, ~100KB, one file, all weights) imported from `index.css`; it then precaches with `**/*.woff2`, which is already in `globPatterns`. Remove the two `preconnect`s and the stylesheet link.
- Scale is sane (13 size classes, 491 uses, `text-sm` 213 / `text-xs` 179 dominate) and weights are consistent (semibold 156, bold 58, medium 51, extrabold 22). No finding there.

#### M7. Token hygiene: utilities are good, but sizes/radii/shadows are ad hoc and `!important` is the size system — [Certain]
- Radii: 12 variants / 257 uses — `rounded-2xl` 104, `rounded-full` 91, `rounded-xl` 33, `rounded-3xl` 15, `rounded-lg` 7, five one-offs (`rounded-[2rem]` ×3 for hero/sheet, `rounded-md`, `rounded-sm`, `rounded-tl-md`). Three "big surface" radii coexist (card 3xl, hero/sheet 2rem, tile 2xl). Define `--radius-card: 1.5rem; --radius-sheet: 2rem; --radius-control: 1rem;` in `@theme` and use `rounded-card` etc.
- Shadows: 10 variants / 34 uses, six of them bespoke brand tints (`shadow-brand-600/25|30|40`, `shadow-brand-900/30|40`). One `--shadow-glow` token.
- `!` overrides: `!py-2` 31, `!min-h-0` 24, `!py-2.5` 12, `!px-3` 8, plus `!px-2/!px-4/!mb-0/!bg-white/10/!text-white/!h-4 !w-4` ≈ 85 total. 24 `!min-h-0` means `btn` lacks a small size. Add `@utility btn-sm { @apply min-h-9 px-3 py-2 text-sm; }` and `@utility input-sm`, then delete the overrides.
- `.card` carries `--graph-bg` (`index.css:115-117`) for `DebtGraph` only — move it to `@theme` as `--color-surface` / `dark` override and use it everywhere `bg-white dark:bg-ink-900` is spelled (the pair appears ~40×).
- Scrollbar hiding is implemented twice: `@utility scrollbar-none` (`index.css:161`) *and* a global `.overflow-x-auto { scrollbar-width: none }` (`index.css:197-198`). The global one also hides scrollbars on desktop for anything horizontally scrollable, including tables in Insights. Keep the utility, delete the global rule.
- Hard-coded colours in TSX: 13 distinct / 21 uses. `'#999'` fallback ×4 (`ExpenseDetail.tsx:106,118`, `ExpenseForm.tsx:434`, `GroupDetail.tsx:171`) → `colorFor(0)` or `OTHER.light`; `Insights.tsx:52-54` tooltip `#0b0b0b`/`#fff`/`#1c1a2b` and axis greys → `var(--color-ink-800)` etc. via `getComputedStyle` or CSS classes on the tooltip; `DebtGraph.tsx:53` `#64748b` → slate token. `QrCode.tsx` `#fff`/`#0b0a14` are **correct** (QR must never be themed). `Login.tsx` Google-logo hex is a third-party mark — correct.
- `.input` sets 16px to stop iOS zoom, but `text-sm` is appended to an input in `IconPicker.tsx:60`, `AiSettings.tsx:154`, `AdminAi.tsx:66` → 14px → iOS zooms on focus. Remove `text-sm` from those three (or make `input-sm` keep `font-size:16px` and shrink padding only).

### LOW

#### L1. `index.html` / manifest gaps — [Certain]
No `<meta name="color-scheme" content="light dark">` (form controls and scrollbars stay light in dark mode until Tailwind's `dark:[color-scheme:dark]` applies after CSS load); no `id`, `lang`, `dir`, `screenshots` in the manifest (Chrome's richer install sheet needs `screenshots`); shortcuts reuse the app icon. Add `id: '/'`, `lang: 'en-IN'`, 2 phone screenshots, badge glyph for shortcuts.

#### L2. Two icon languages — [Certain]
Lucide for chrome; emoji for categories (12), group icons (43 + any typed), empty states (`Empty emoji=…`), greeting, Live badge, "Approved 👍" toasts, `🗓️` date row (`GroupDetail.tsx:109`). The user-content uses (group/category/greeting) are right. The chrome uses (`🗓️` in a data row, `✨` in "all settled up", `👍` in toasts) should be Lucide or nothing, for one visual voice and because emoji render differently per OS.

#### L3. Lucide default `strokeWidth` is 2 but the app mixes 2 / 2.2 / 2.6 / 3 — [Certain]
`Layout` 2.2/2.6, `Check` badges 3, `Repeat` 3 at 10px. Pick one body width (2) and one "small/bold" width (2.5) as named constants.

## 3. Dynamic app icon — what is actually possible, and what to build

What the user asked for ("a dynamic icon") maps to four different mechanisms:

| Surface | Can it change at runtime? | Notes |
|---|---|---|
| Browser tab favicon (desktop Chrome/Edge/Firefox) | **Yes, fully** — swap `<link rel="icon">` `href` to a `data:image/svg+xml` string | Safari desktop ignores SVG favicons and uses the PNG/ICO ([Likely]); mobile browsers don't show favicons |
| Android home-screen icon (installed PWA / WebAPK) | **No, not per user.** Fetched from the manifest at install; Chrome re-checks the manifest every few days and re-mints the WebAPK if the icon hash changed ([Likely]) — same for all users | Only lever: per-accent manifests chosen *before* install (`<link rel=manifest href=/manifest-ocean.webmanifest>`) |
| iOS home-screen icon | **Never** after Add to Home Screen; must delete and re-add | `<link rel=apple-touch-icon>` *is* read at add-time, so an accent-matching PNG can be set before the user adds |
| **App badge** (`navigator.setAppBadge(n)`) | **Yes** — Chrome/Edge desktop + Android installed PWAs, iOS 16.4+ Home Screen web apps (requires notification permission on iOS) ([Likely]); also callable from the service worker on push | This is the only truly dynamic home-screen signal on the web |

**Recommendation — implement, in this order:**

1. **App badge = things that need you** (`toSort` in `useInbox`: pending captures + expenses awaiting your approval; *not* unread activity, so the number stays honest). Client side, mounted once in `Layout`:
```ts
// src/lib/badge.ts
type N = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
export function setBadge(n: number) {
  const nav = navigator as N
  if (!nav.setAppBadge) return
  ;(n > 0 ? nav.setAppBadge(n) : nav.clearAppBadge?.() ?? Promise.resolve()).catch(() => {})
}
// Layout.tsx — one subscription for the whole app (Home already pays for useAllGroupData)
const box = useInbox(data)
useEffect(() => { if (!box.loading) setBadge(box.toSort) }, [box.loading, box.toSort])
```
Service-worker side, so the badge appears while the app is closed (`public/push-sw.js`, inside the push handler):
```js
if (self.navigator.setAppBadge && data.badge !== undefined) {
  const n = Number(data.badge); event.waitUntil(n > 0 ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge())
}
```
and in `functions/src/push.ts:30` add `badge: String(pendingCount)` to the data record (the capture function already writes the capture doc; a `count()` aggregate over `users/{uid}/captures where status == 'pending'` is one extra read). `Inbox.tsx` already records `inboxSeenAt`; call `setBadge(toSort)` there too so sorting clears it immediately. ([Guessing] whether `useAllGroupData` is shared between Home and Layout or opens a second listener set — if it is not cached, compute the Layout badge from `usePendingCaptures()` alone and let Home add approvals.)

2. **Accent-tinted favicon on desktop.** In `applyAccent()` (`accent.ts:69`), after setting the attribute:
```ts
const cs = getComputedStyle(document.documentElement)
const svg = MARK_SVG.replace('__A__', cs.getPropertyValue('--color-brand-600').trim()).replace('__B__', cs.getPropertyValue('--color-duo-600').trim())
document.querySelector<HTMLLinkElement>('link[rel="icon"]')!.href = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
```
where `MARK_SVG` is the proposed mark with `__A__`/`__B__` stop placeholders (oklch strings are valid SVG `stop-color` in Chrome/Firefox). Skip when `getComputedStyle` returns empty (pre-CSS). Cheap, visible, and the same string can render the in-app `Splash()`.

3. **Do not** build per-accent manifests/apple-touch-icons now: 8 × 4 PNGs, install-time-only, fragile across Chrome versions, invisible to most users. Revisit if accents are trimmed to five and users ask.

## 4. Already good (do not "fix")

- Accent architecture: `@theme static` + `[data-accent]` overrides + `var()`-backed utilities is the right way to do runtime theming in Tailwind v4; the inline pre-paint script (`index.html:19-33`) avoids any flash, and `accent.test.ts:97-120` guards the html↔ts preset map.
- `prefers-reduced-motion` global clamp plus `motion-reduce:` on the five transitions that matter; `Collapsible` grid-rows animation is the correct technique.
- `chartPalette.ts`: fixed category→slot, CVD-safe, light/dark steps, deliberately *not* accent-themed, `useIsDark` via MutationObserver — exemplary.
- `pos`/`neg` semantic utilities; `card`/`input`/`label`/`btn*`/`chip*` as `@utility` with dark variants baked in; 16px input base for iOS; `safe-top/bottom`, `--nav-h` tokens; the `nav-notch` radial mask is clever and cheap.
- `AccentPicker` is a real radiogroup with roving tabindex and arrow keys; `Switch` is `role=switch`.
- `Avatar` handles photo failure, `referrerPolicy`, async decode; QR is never themed.
- Typography weights are disciplined; `tabular-nums` already applied in the places users compare numbers most (Home hero, lists).
- Ink scale (`#0b0a14 → #2a2740`) is a tinted dark, not grey — reads as intentional and matches the violet brand.

## 5. Open questions for the product owner

1. Are **Emerald and Rose accents** a requirement? They collide with the owed/owe colours; I recommend dropping them (or renaming/shifting to Teal and Coral with hues ≥ 30° away from emerald-500 / rose-500).
2. Is the **Dual-tone toggle** a feature anyone asked for, or an experiment that shipped? Recommend removing it from the UI (keep CSS plumbing if cheap).
3. Brand mark direction: the proposed "split coin" is neutral and works in every currency. If the owner wants an India-first signal (₹), it must be a *second* mark (e.g. in marketing), not the app icon.
4. Badge semantics: pending captures + approvals (recommended) vs everything in the Inbox including unread activity.
