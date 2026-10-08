# 04 — Pure domain logic (src/lib) correctness audit

## 1. Summary

I read every module in scope (money, splits, balances, simplify, fx, recurrence, trust, activity, import-splitwise, export, statement, table, categories, filter, inbox, recents, profileSummary, greeting, locale, id, payments, qr, ocr-parse, capture, capture-settings, groupTypes) plus the callers that decide whether a lib edge case is reachable (ExpenseForm, hooks/data.ts, Friends, Insights, firebaseRepo/localRepo write paths, firestore.rules). The repo's own lib suite is green: `npx vitest run src/lib` → 31 files / 517 tests pass, and it stays green under `TZ=Asia/Kolkata`, and `TZ=America/Los_Angeles LANG=de_DE.UTF-8`, so there is no hidden time-zone or locale flakiness in the tests themselves. I then wrote 14 adversarial reproduction scripts under `scratchpad/repro/` (run with `cd scratchpad/repro && TZ=Asia/Kolkata npx vitest run --reporter=verbose --silent=false`; outputs saved in `out-ist.txt`). The arithmetic core is solid: `allocate` kept `sum(result) === total` over 600k randomized cases including ₹1 crore totals with 1e9-paise weights, recurrence date math is UTC-based and survives DST/leap/month-end, FX re-allocation is cent-exact, and Splitwise reconstruction preserves nets to the cent. The real defects are at the edges: a time-zone bug that mis-buckets the Insights monthly chart for every Indian user, recurring occurrences carrying the template's `receiptPath` so purging an occurrence deletes the template's receipt image, itemized splits that silently lose items assigned to departed members (writing an unbalanced expense that balances then ignore), negative shares accepted by exact/itemized inputs, and a CSV round-trip that drops rows for legal-but-awkward member names. Overall verdict: core maths correct; fix the two High items before the next release, the Mediums soon.

Repro files: `scratchpad/repro/01-allocate … 14-perf-warm.test.ts` (harness: `vitest.config.ts` with `@` aliased to `/home/user/split-it/src`, `node_modules` symlinked).

## 2. Findings

### HIGH

#### H1. Insights monthly series is keyed by the UTC month of a local-midnight Date → off-by-one month and current month dropped for every user east of UTC (all of India) — [Certain]
- `src/pages/Insights.tsx:203-205`
  ```ts
  for (let d = new Date(start); d <= now; d.setMonth(d.getMonth() + 1)) {
    const k = d.toISOString().slice(0, 7)          // UTC month of local 00:00 on the 1st
    series.set(k, { label: d.toLocaleDateString(appLocale(), { month: 'short' }), value: 0 })
  ```
  `start` is `new Date('yyyy-mm-01T00:00')` = local midnight. In IST that instant is 18:30 UTC of the previous day, so `k` is the previous month while `label` is the local month. Rows are then bucketed by `e.date.slice(0,7)` (a plain calendar month), so July's spend lands in the bucket labelled "Aug", and the current month has no bucket at all.
- Repro `09-insights-tz.test.ts` (verbatim copy of the loop): under `TZ=Asia/Kolkata` → `2026-06→Jul:0, 2026-07→Aug:100, 2026-08→Sept:200, 2026-09→Oct:300`, total bucketed 600 of 1000; under `TZ=UTC` → correct (1000 of 1000). Any positive-offset zone (IST, SGT, AEST…) is affected; negative offsets are unaffected.
- Why it matters: the monthly chart on the Insights page shows wrong numbers under wrong labels and omits the month people most want to see, for the primary user base.
- Fix: build the key from local parts and never go through `toISOString()` for a calendar key:
  ```ts
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  for (let d = new Date(start); d <= now; d.setMonth(d.getMonth() + 1)) series.set(key(d), { label: …, value: 0 })
  ```
  Also `:176` (`cutoff`) and `:200` (`first` default) use `now.toISOString().slice(0,10)` (UTC day) while expense dates are local calendar days — use `todayISO()` / `addDaysISO(todayISO(), -days)` from `@/lib/id` / `@/lib/recents` for consistency. Add a unit test for `compute()` (extract it to `src/lib/insights.ts`) that runs with a fixed `now` and asserts bucket keys equal the row months.

#### H2. Recurring occurrences inherit the template's `receiptPath`; purging an occurrence (or attaching a receipt to it) deletes the template's receipt image — [Certain] on mechanism, [Likely] on frequency
- `src/lib/recurrence.ts:126-136` `makeOccurrence` strips `recurrence` and `receiptUrl` but not `receiptPath`:
  ```ts
  const { recurrence: _r, receiptUrl: _receipt, ...rest } = template
  ```
  `src/lib/trust.ts:115-118` `prepareOccurrence` doesn't strip it either. Repro `05-recurrence.test.ts`: occurrence keys include `receiptPath = receipts/g/t1-abc.jpg`, `receiptUrl = undefined`.
- Consumers: `src/data/firebaseRepo.ts:474-477` `purgeExpense` deletes `e.receiptPath ?? storagePathFromUrl(e.receiptUrl)`; `:536-545` `attachReceipt` deletes `old = e.receiptPath` after uploading a new one. `useTrash` (`src/hooks/data.ts:89-100`) auto-purges trashed items after 30 days, so the path is: user trashes a generated copy of "Rent" (template has a lease photo) → 30 days later the template's Storage object is deleted → template shows a broken image. Attaching a photo to an occurrence does it immediately.
- The occurrence also inherits `importedFrom` and `original` (locked FX rate from the template's date) — the latter is a product decision (see Open questions), the former is harmless.
- Fix: `const { recurrence: _r, receiptUrl: _u, receiptPath: _p, ...rest } = template` in `makeOccurrence`; strip `receiptPath` in `prepareOccurrence` as defence in depth (it is also used by `bulkImport`); extend `recurrence.test.ts` "copies the split but not the recurrence or receipt" to assert `receiptPath` is undefined.

### MEDIUM

#### M1. Itemized split silently drops an item whose members all left the group, and the unbalanced expense is saved — [Certain]
- `src/lib/splits.ts:84-88`: `allocate(it.amount, memberOrder.filter((m) => it.members.includes(m))…)` — when no item member is in `memberOrder` the weights are empty, `allocate` returns `{}` and the item's amount vanishes; the tax/tip `extra` is still computed from the full `itemTotal`, so the result sums to `total − orphanAmount`. No `SplitError`.
- `src/pages/ExpenseForm.tsx:243-247, 254-258` saves `preview.splits` with no `sum === amount` check; `firestore.rules:315-316` can only check key membership, not sums; `src/lib/balances.ts:19-28` then drops the whole expense with a `console.warn`. Net effect: an expense that is listed but contributes nothing to anyone's balance, with no UI signal.
- Reachable: `removeMember` (`firebaseRepo.ts:350-369`, `localRepo.ts:164`) has no guard on referenced expenses, so re-saving any itemized expense that had an item assigned only to the removed member does this. Repro `02-splits.test.ts`: items `[600→a, 400→z]`, order `[a,b]` → `{a:600}`, sum 600 ≠ 1000.
- Fix (lib): in the itemized branch
  ```ts
  const ms = memberOrder.filter((m) => it.members.includes(m))
  if (!ms.length) throw new SplitError(`“${it.name || 'An item'}” is assigned to someone who left the group`)
  ```
  and add a final invariant at the end of `computeSplits` (cheap, catches every future regression): `if (Object.values(out).reduce((a,b)=>a+b,0) !== total) throw new SplitError('The split doesn’t add up to the total')`. Fix (form): in `save`, `if (sum(money.splits) !== money.amount || sum(money.paidBy) !== money.amount) return toast(...)`. Consider blocking `removeMember` while the member is referenced (other lens).

#### M2. Negative shares are accepted in exact and itemized splits — [Certain]
- `src/lib/money.ts:61-71` `parseMoney` accepts a leading `-`. `src/pages/ExpenseForm.tsx:654` (exact) and `:740` (item amount) feed it straight into `splitInput`; `src/lib/splits.ts:48` filters `v !== 0` (not `v < 0`), and item amounts aren't checked at all. `isBalancedExpense` accepts negative integers. Repro `02-splits.test.ts`: `exact {a:1500, b:-500}` on a ₹10 bill paid by c → saved; pairwise shows `a→c 1500` and `c→b 500` (the payer "owes" b).
- Why it matters: a stray "-" typed into an exact field produces reversed debts that look like a settlement direction bug later; nothing in the UI flags it. Balances remain internally consistent, which is why it's Medium not High.
- Fix: in `computeSplits`: exact → `if (entries.some(([, v]) => v < 0)) throw new SplitError('Amounts can’t be negative')`; itemized → `if (items.some((it) => it.amount < 0)) throw new SplitError('Item amounts can’t be negative')` (if refund lines are wanted, model them as a discount, i.e. `total < itemTotal`, which already works). Harden `isBalancedExpense` to require `v >= 0` in both maps (see L1), and mirror in `functions/src/lib/balances.ts:23-24`.

#### M3. CSV export → import round trip drops rows for legal member names (";" or leading = + - @) — [Certain]
- `src/lib/export.ts:60-63` writes multi-payer cells as `"Name 12.00; Name 3.00"`; `src/lib/import-splitwise.ts:446-456` `parsePaidBy` splits on `;` and requires each piece to match `^(.*\S)\s+(-?[\d.,]+)$` → a member named `O'Neil; Jr` breaks every multi-payer row they're in. `export.ts:20` prefixes any cell starting with `= + - @` with `'`, including header names; `import-splitwise.ts:437-441` applies `unformula` to the Paid-by cell but not to the header, so a member named `=1+1` (or `+91…`, or `@handle`) never matches.
- Repro `07-csv.test.ts`: 3 of 5 expenses skipped ("who paid / shares don’t add up to the amount, skipped"), so the "re-import our own export" feature loses data with only a warning list. Names ending in digits (`Sam 2`), names with commas/quotes, emoji, duplicates (`Sam, Sam, Sam (2)` → `Sam (2) (2)`) all survive.
- Fix: (a) `const members = uniqueNames(memberCols.map((i) => unformula(rows[0][i])))` in `parseSplitItRows`; (b) parse the multi-payer cell against the known names instead of splitting on `;`:
  ```ts
  const parsePaidBy = (raw: string, amount: Cents) => {
    const exact = byName.get(raw.toLowerCase()); if (exact) return { [exact]: amount }
    const out: Record<string, Cents> = {}
    const re = /(.+?)\s+(-?[\d.,]+)(?:;\s*|$)/g   // "name amount;" segments; name may contain ';'
    let m: RegExpExecArray | null, consumed = 0
    while ((m = re.exec(raw))) { const who = byName.get(m[1].trim().toLowerCase()); if (!who) return null; out[who] = (out[who] ?? 0) + parseAmount(m[2], currency); consumed = re.lastIndex }
    return consumed === raw.length && Object.keys(out).length ? out : null
  }
  ```
  (c) add round-trip tests with `;`, `=`, `+`, trailing digits and duplicate names (the existing round-trip test uses friendly names only).

#### M4. Balance maths is recomputed for every group on any snapshot, and `pairwiseDebts` runs `allocate` per (expense × share) even for single-payer expenses — [Certain] on measurements, [Likely] on device impact
- `src/hooks/data.ts:224-228` `useAllGroupData` → `groups.map((g) => computeGroupData(...))` inside one `useMemo` keyed on the whole `exp`/`set` maps, so a snapshot in any group recomputes all groups. `src/lib/balances.ts:58-64` allocates per share; `countable()` is run three times per group (net, pairwise, totals).
- Measured (Node 22, warm, `14-perf-warm.test.ts`, 5 000 expenses × 25 members, 85 % single-payer): `pairwiseDebts` 72.6 ms, `netBalances` 18.5 ms, `simplifyDebts` 14.4 ms, whole `computeGroupData` maths 83 ms per snapshot (cold run: ~370 ms). `groupCsv` 158 ms cold. A mid-range Android phone is typically 3–5× slower, so one large group costs ~250–400 ms of main-thread work per incoming write, times the number of groups on Home/Friends/Insights.
- Fix: (1) single-payer fast path: `if (payers.length === 1) { addDebt(debtor, payers[0][0], share); continue }`; (2) compute `countable()` once per group and pass the filtered list to net/pairwise/totals (or export a `balanceSet(expenses, settlements)` that returns all three); (3) memoize per group (`useMemo` per `g.id` keyed on `exp[g.id]`, `set[g.id]`, `g`) rather than mapping all groups; (4) `simplifyDebts` re-sorts both arrays every iteration (`O(n² log n)`) — fine at 25 members, but a single sort + two indices would make it `O(n log n)`.
- Everything else is linear and fine at 5k: `descriptionHistory` 23 ms cold, `filter` 26 ms, `suggestDescriptions` worst case 13 ms.

#### M5. `allocate` / `shares` accept non-finite weights and produce `NaN` splits that are then written — [Certain] on lib behaviour, [Likely] on reachability
- `src/lib/splits.ts:8` filters `w > 0` only; `Infinity` passes (`Infinity > 0`), `exact = abs*w/sum` → `NaN`. `src/pages/ExpenseForm.tsx:697` `set(parseFloat(e.target.value) || 0)` accepts `"1e308"`/`"Infinity"` from the shares text input; two such members overflow the sum. Repro `02-splits.test.ts`: `shares {a:1e308,b:1e308}` → `{a:NaN,b:NaN}`. The form's `paidSum === amount` check passes, Firestore stores `NaN` numbers, balances ignore the expense.
- Fix: `const positive = weights.filter(([, w]) => Number.isFinite(w) && w > 0)` in `allocate`; clamp shares in the UI to a finite range (e.g. 0–999). Add a test.

### LOW

#### L1. `isBalancedExpense` accepts negative `paidBy` entries, making `netBalances` and `pairwiseDebts` disagree — [Certain]
- `src/lib/balances.ts:12-16` only checks integers and sums; `pairwiseDebts:59` drops `v <= 0` payers, so a `{a:150, b:-50}` payer map nets b at −50 but produces no pairwise debt for b (repro `03-balances.test.ts`). Not reachable from the form (`ExpenseForm.tsx:235` filters `> 0`) or import; only another client / tampering. Fix: require `v >= 0` in both maps; mirror in `functions/src/lib/balances.ts:23-24`.

#### L2. Exact-split error message hardcodes two decimals — [Certain]
- `src/lib/splits.ts:50`: `(sum / 100).toFixed(2)` → "Amounts add up to 10.00, not 12.00" for ¥1000 vs ¥1200 (repro 02). Fix: throw with the raw cents and let the form format with `formatMoney(…, cur)`, or pass `currency` into `computeSplits`.

#### L3. OCR `parseDate` accepts impossible dates and they reach stored expense/capture dates — [Certain]
- `src/lib/ocr-parse.ts:63` `valid()` allows `d <= 31` for any month: `30/02/2024 → "2024-02-30"` (repro 11). `ExpenseForm.tsx` `applyReceipt` does `setDate(p.date)`; `capture.ts:113` falls back to `parseDate` so `30/02/2024` becomes a capture date too (the ISO branch at `:108-112` correctly rejects `2024-02-30`). Downstream, `new Date('2024-02-30T00:00')` displays as 1 Mar and recurrence from that anchor gives `weekly → 2026-03-09`. Fix: reuse the `Date.UTC` round-trip check from `import-splitwise.ts:validDate`.

#### L4. Editing a foreign-currency multi-payer expense shows reconstructed, not typed, payer amounts — [Certain]
- `src/lib/fx.ts:265-267` `toOriginal` re-allocates converted paise back to the original currency: typed THB 60.00/40.00 → shown 59.95/40.05 (repro 04). Re-saving is a fixed point (no balance drift, verified), so it's cosmetic, but it looks like the app changed the numbers. Fix: persist the typed original-currency `paidBy` (e.g. `original.paidBy`, rules allow-list it) and fall back to `toOriginal` only for old docs.

#### L5. `getRate` can throw on a malformed cache entry despite "Never throws" — [Certain]
- `src/lib/fx.ts:133,135,139-140` dereference `entry.rates[...]` without checking `entry.rates` exists; `readCache()` only guards JSON parsing. A stored `{ "2026-01-01|INR": {} }` throws `TypeError` out of `cachedRate` → `getRate` (`:201`) → the expense form's `.then` never runs and `fxLoading` sticks. Fix: `const ok = (e): e is CacheEntry => !!e && typeof e === 'object' && !!e.rates && typeof e.rates === 'object' && (opts.stale ? true : fresh(e, date))`.

#### L6. Amount parsers turn junk into wrong amounts instead of rejecting it — [Certain]
- `src/lib/money.ts:63` strips every non-`[\d.,-]` char first: `"1e5" → ₹15.00`, `"1_000" → ₹1,000`. `src/lib/import-splitwise.ts:134-150` and `src/lib/capture.ts:81-95` accept `"2.5.3" → 253.00`, `"1,,2" → 12.00`, `"1,2,3" → 123.00` (table in repro `06-money.test.ts`). `parseMoney("1.000,50")` returns `NaN` (safe) while the other two parse it as 1000.50 — three different grammars for the same user-facing concept. Fix: in `parseMoney`, reject (NaN) if the input contains letters other than a leading currency code; in the other two, reject more than one `.` once commas are gone, and consider routing all three through one `parseDecimal(raw, currency, { allowNegative })`.

#### L7. `suggestDescriptions` is O(H·|starts|) — [Certain, minor]
- `src/lib/recents.ts:159-160` `!starts.includes(s)` inside a filter. 13 ms worst case at 5k; use a `Set`.

#### L8. `QrCode` has no guard against `encodeQr` throwing — [Certain], currently unreachable
- `src/lib/qr.ts:146` throws above 213 bytes (version 10-M). `isUpiId` (`payments.ts:45`) allows a 164-char VPA, which yields a 282-byte `upi://` link → throws (repro 08). `SettleUp.tsx:239` pre-checks with try/catch (`qrOk`), and the invite/table links are short, so only `src/components/QrCode.tsx:7` is brittle. Fix: catch in `QrCode` and render a "too long to show as QR" fallback; cap VPA at 64 chars in `isUpiId` (NPCI VPAs are far shorter in practice).

#### L9. Hand-edited far-future `nextDate` makes `dueOccurrences` scan 100 000 iterations on every snapshot — [Certain], tamper-only
- `src/lib/recurrence.ts:104` linear `while` → 72 ms per template per snapshot in Node (repro 05), for every member. Only reachable by a direct write (the form always sets `nextDate` ≤ one period ahead). Fix: compute `n` arithmetically (weekly/fortnightly from the day difference, monthly/yearly from the month difference, then adjust ±1) and keep the loop only as a bounded fallback; have rules validate `recurrence.nextDate` format.

#### L10. Splitwise import edge rows — [Certain]
- `src/lib/import-splitwise.ts:331-334` `isTotals` treats any row whose description contains "total" and has an empty Cost as a totals row, and `:383` takes the *first* such row as the group totals: a "Total Sports gear" expense with a blank cost poisons `totals`/`totalsMatch` and is dropped (repro 13). Prefer `^total balance$`, take the last match, and only fall back to `/total/i && !cost` when no exact row exists.
- `:352-361` a row that nets to zero only after the drift repair ends with `nets = {}` → `reconstruct(cost, {}, …)` → an expense with empty `paidBy`/`splits` that rules accept and balances ignore. Re-check `Object.keys(nets).length` after the repair and count it in `zeroRows`.

#### L11. Activity: an `until`-only change logs "repeat monthly → monthly" — [Certain]
- `src/lib/activity.ts:96-99` `recurrenceLabel` ignores `until`. Fix: `until ? \`${label} until ${formatDate(until)}\` : label`.

#### L12. Nits (no action required unless convenient)
- `src/lib/id.ts:10` `b % 31` over 256 byte values → slight modulo bias in invite codes (A–H get 9/256 vs 8/256); rejection-sample if you care.
- `src/lib/balances.ts:5,24` `countable()` keeps module-level state and `console.warn`s inside otherwise pure code; return the rejected ids instead and let the hook warn once.
- `src/lib/simplify.ts:12` tie-break uses `localeCompare` (ICU, case-insensitive: `a < B`) while `pairwiseDebts` uses `<` (code units: `B < a`); both deterministic on one runtime, just inconsistent.
- `src/lib/payments.ts:56` `encodeURIComponent` leaves `'` unencoded in `pn`/`tn` (`pn=D'Souza`); some UPI apps are picky — `.replace(/'/g, '%27')`.
- `src/lib/capture.ts:97` with `currency = 'JPY'` a decimal amount is rounded (`"12.50" → 13`) rather than rejected as `parseMoney` does.

## 3. Test results and performance

- Repo suite: `npx vitest run src/lib` → 31 files, 517 tests, all pass; identical under `TZ=Asia/Kolkata` and `TZ=America/Los_Angeles LANG=de_DE.UTF-8 LC_ALL=de_DE.UTF-8`.
- Repro suite: 14 files, 46 tests (all written to pass while *printing* the behaviour; `02` and `03` assert the bugs). Key outputs are quoted above.
- Perf (Node 22, 5 000 expenses × 25 members, warm averages): countedExpenses 1.4 ms, netBalances 18.5 ms, pairwiseDebts 72.6 ms, simplifyDebts 14.4 ms, groupCsv ~158 ms (cold), descriptionHistory 23 ms (cold), filter 26 ms (cold). Nothing is O(n²) over expenses; see M4 for the per-snapshot recomputation.

## 4. Determinism and purity

- All clocks are injectable (`trashedItems(now)`, `fmtAgo(now)`, `greeting(now)`, `draftToTable(now)`, `activity ctx.now`, `setFxEnv({ now })`); `Date.now()` only appears as defaults. Date-only math uses `Date.UTC`/string compares (recurrence, statement, capture windows, import validDate, addDaysISO) — correct.
- Two different "today"s coexist: `todayISO()` (local calendar day, used for expense dates/recurrence) and `fx.isoToday()` (UTC day, used only as the cache key/clamp). That's internally consistent; the only leak of UTC into calendar logic is Insights (H1) and its `cutoff`.
- ICU-dependent expectations: `locale.test.ts:68-81` (`₹1,00,000.00`, `'7 Oct'`), `money.test.ts:68-75`, `activity.test.ts` (`A$80.00` via `currencySymbol('AUD','en-IN')`). They pass on Node 22 / ICU 77 but are the first thing that will break on an ICU data update (en-IN short September is already `Sept`). Consider pinning assertions with regexes or `formatToParts`.
- `countable()`'s module-level `warned` set is the only hidden state in the lib.

## 5. Highest-value missing tests (per module)

- **splits**: itemized item whose members all left (M1); negative exact / item amounts (M2); `allocate` with `NaN`/`Infinity`/zero/duplicate-id weights (M5); property test `sum(allocate(t, w)) === t` over random inputs (the repro has one); percent at 99.9995 / 100.0005; itemized discount (`total < itemTotal`); exact error for JPY (L2).
- **balances/simplify**: property test "sum of pairwise debts per member equals `netBalances`" over random expenses (would have caught L1); settlement larger than the debt; settlement involving a departed member; negative `paidBy` rejected; dedicated `simplify.test.ts` (≤ n−1 transfers, nets preserved, non-zero-sum input, tie order).
- **fx**: corrupt cache entry shape (L5); `toOriginal` round trip (L4); zero-share conversions keep members; `expectedEcbDate` around 16:59/17:00 Berlin across DST; `getRate` for a future date on a weekend.
- **recurrence**: `makeOccurrence` strips `receiptPath` (H2); invalid/short ISO throws; `until` equal to an occurrence; 120-cap together with `until`; far-future `nextDate` bound (L9).
- **trust**: amount edited below threshold stays pending (document or change); placeholder-only charged expense counts immediately; editor keeps own approval after a money change; `daysLeftInTrash` boundaries.
- **activity**: `until`-only recurrence change (L11); amount change with unchanged original; single→multi payer wording; 480-char clip with multibyte text.
- **import-splitwise / export**: round trip with `;`, leading `=`/`+`/`@`, trailing digits, triple duplicate names, negative share, multi-payer (M3); "Total …" description with blank cost (L10); drift-to-empty row; JPY/BHD round trip; `detectDateOrder` when every day ≤ 12.
- **statement/table**: `findDuplicate` ±1 day across a month boundary; `computeTableTotals` with a discount larger than the items; `draftToTable` when zero-amount items are dropped (the `diff` changes).
- **money/capture/ocr-parse**: `1e5`, `1_000`, `1.000,50`, `2.5.3`, Devanagari digits (L6); impossible dates (L3); JPY with decimals in captures; EU amounts in `findAmounts`.
- **qr**: no decode round trip exists (only size/finder checks in `table.test.ts:238`). Add `jsqr` as a dev dependency and decode `encodeQr` output for versions 1, 5, 7 and 10 (≥7 exercises the version-info bits). I compared the implementation line-by-line with Nayuki's reference (capacity table, RS generator, interleave, format/version bits, zig-zag, masks) and found no divergence, but an executable check is cheap insurance.
- **id**: `todayISO` under a fixed TZ; `uid`/`inviteCode` length and alphabet.
- **payments**: apostrophe/`&`/non-Latin `pn`; max-length VPA vs QR capacity (L8).

## 6. Things that are already good (don't "fix")

- `allocate` (largest remainder) kept `sum === total` across 600 000 randomized cases including ₹1 crore totals, 1e9 weights and 2-dp percent weights; the `+1e-9` floor epsilon never pushed `left` negative because `left` is derived from the floors.
- Recurrence math is pure UTC: Jan 31 → Feb 29 → Mar 31 → Apr 30, Feb 29 yearly → Feb 28/28/28/29, weekly across the AU DST change — all correct; deterministic ids; idempotent catch-up; batch size (≤121 writes) under Firestore's 500.
- `convertExpense` converts once and re-allocates payers/splits exactly; re-saving a converted expense is a fixed point; `convertMinor` handles 0/2/3-decimal pairs correctly.
- Splitwise `reconstruct` preserves every member's net to the cent; drift repair, cost-too-small and negative-cost rows are handled with warnings; `parseCsvRows` handles BOM, CRLF/CR/LF, embedded newlines, `""`, and `;`/tab delimiters.
- Trust semantics are centralised and correct: trashed → never counted; pending → listed but excluded; disputed → counted; approvals survive renames and reset on money changes except the editor's.
- The split editor receives `fg` (group with the entry currency), so exact/adjust/item amounts are parsed in the currency being typed — the JPY-in-an-INR-group case works.
- `SettleUp` pre-checks `encodeQr` before rendering the QR; `firestore.rules` require integer positive amounts for expenses and settlements; `functions/src/lib/balances.ts` mirrors `isBalancedExpense`.
- No tests depend on wall-clock time or host TZ/locale in a way that flakes (verified in three environments).

## 7. Open questions for the product owner

1. Should `requiresApproval` clear when an expense is edited below the threshold? Today a ₹200 expense that was once ₹20 000 stays out of balances until everyone approves (`trust.ts:94`, "never cleared").
2. Settlements larger than the debt flip the direction (an "advance"). Intended, or should `SettleUp` warn/clamp?
3. Should occurrences of a foreign-currency recurring template re-rate on their own date instead of inheriting the template's locked `original.rate`?
4. Should removing a member be blocked (or should their shares be reassigned) while expenses still reference them? That is what makes M1 reachable.
