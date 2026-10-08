# A1 — Data layer, Firestore efficiency, domain-logic correctness: done

## What changed (files)

New
- `src/data/store.ts` (+ `store.test.ts`, 8 tests) — shared, refcounted live-query store: one repo listener per key, synchronous replay of the last value to late subscribers, 5-minute linger after the last subscriber leaves (tab switches reuse open listeners), failed queries (`meta.error`) dropped and restarted on the next subscribe, `clearSharedStore()` on sign-out.
- `src/lib/simplify.test.ts` (5 tests) — nets preserved, ≤ n−1 transfers, deterministic ties, random property.

Hooks
- `src/hooks/data.ts` — rewritten on `useSyncExternalStore` + the store. Same exported names and return shapes (`useGroups`, `useCaptures`, `usePendingCaptures`, `useGroup`, `createGroup`, `catchUpRecurring`, `useAllExpenses`, `useExpenses`, `useAllSettlements`, `useSettlements`, `useTrash`, `useActivity`, `useHistory`, `useRecentActivity`, `useComments`, `myMemberId`, `memberOrder`, `GroupData`, `computeGroupData`, `useAllGroupData`). New: `useCapturesMeta()`, `ACTIVITY_LIMIT`, `GroupDataCtx`, `useAllGroupDataImpl(enabled)`. `computeGroupData` memoised per group on the identity of (group doc, expenses array, settlements array, uid); `countable()` runs once per group and feeds all balance functions; malformed expenses are reported once from the hook, not the lib. The all-groups view counts a group as loaded only when its lists are server-confirmed, non-empty, failed, or the device is offline, with a 4 s grace period so an unreachable backend doesn't hold Home forever. `catchUpRecurring` runs in exactly one place (the shared expenses listener). `useRecentActivity` subscribes per group id (no restart of the others when the set changes) and shares the group's Activity-tab entry (`ACTIVITY_LIMIT = 50` for both; the Inbox used 30).
- `src/hooks/groupData.tsx` — `GroupDataProvider` computes the all-groups view once and provides it; `useAllGroupData()` reads the context (falls back to its own subscription outside the provider).
- `src/hooks/auth.tsx` — `clearSharedStore()` whenever the signed-in uid changes or signs out.
- `src/hooks/useInbox.ts` — uses the shared activity limit.
- `src/lib/fresh.ts` — `watchGroupSettled` passes the snapshot meta through (behaviour unchanged; its tests untouched and green). `markCreated` / `isFresh` / `rewatchWhileFresh` / `createGroup()` flow preserved as the ADDENDUM requires.

Repo contract
- `src/data/repo.ts` — `SnapMeta` (`fromCache`, `hasPendingWrites`, `error?`) and `Watch<T>`; every `watch*` callback takes an optional meta second argument; documented write semantics (fire-and-forget vs. the methods that wait), sign-out behaviour, `deleteGroup` rejecting, double-trash no-ops; `AiUnavailable` / `ReceiptAiResult` / `AiUnavailableReason` exported and `readReceiptAi` returns `{ unavailable: true, reason }` when the server declines (matches B's `src/lib/ai.ts`); `errorChannel` replays early errors a tick later to whoever is still subscribed (StrictMode no longer swallows a sign-in redirect failure).
- `src/data/firebaseRepo.ts` —
  - list watchers (`groups`, `expenses`, `settlements`, `activity`, `history`, `comments`, `captures`, `captureTokens`) use `includeMetadataChanges: true`, report meta, and reuse the previous array when only metadata changed (no re-render / recompute for pending-write acks);
  - `saveExpense`: edits are `batch.update` with only the changed fields (+ `updatedAt`), `deleteField()` for removed ones, and `approvals` touched only when the money changed (whole-map replace with the editor's own key or `deleteField()`), so a flag/approval that landed after this device's copy survives; `prev` comes from the server when it answers within 1.5 s (accurate History "before"), else the cache; creates still `set`;
  - `watchCaptures`: delivers the cached (maybe empty) list after 5 s when the server hasn't answered, flagged `fromCache`;
  - `signOut`: never clears IndexedDB while writes are pending (offline, or not acknowledged within 5 s) — signs out, keeps the cache, shows a warning toast, reloads; cleared as before when everything synced;
  - `saveProfile`: server list of groups first when online (3 s), cache fallback (the cache resolves empty for a never-run query);
  - `ensureProfile`: cache-first read, Google photo compared without its `=s96-c` size suffix;
  - `firebase/storage` lazy-imported on first upload/delete (receipt, avatar, deleteGroup);
  - `deleteGroup`: rejects offline with a readable message; comment listing 20 expenses at a time in parallel; receipts filtered to `receipts/<gid>/`;
  - `attachReceipt` / `purgeExpense` / `deleteGroup` only ever delete a receipt whose path starts with `receipts/${groupId}/`;
  - `deleteExpense` / `deleteSettlement` are no-ops on an already-trashed item; `joinGroup` returns at once when the cached group already lists the user.
- `src/data/localRepo.ts` — watchers report `{ fromCache: false, hasPendingWrites: false }`; `updateCapture` (missing), `purgeExpense`/`purgeSettlement` (not allowed), `bulkImport` (missing group) resolve and report through `onError` like Firebase; `flagExpense` by a non-member throws like Firebase; `getInvite` ignores personal groups; `updateCapture` removes `undefined` fields like Firebase's `deleteField()`.
- `src/data/seed.ts` (+ test) — demo dates are local calendar days.

Domain logic
- `src/lib/splits.ts` — `allocate` ignores non-finite weights and scales huge ones (no NaN for 1e308 shares); `computeSplits(total, type, input, order, currency?)` rejects negative / non-finite exact amounts, percentages, shares, item amounts and adjustments, an item whose members all left the group, and ends with a sum + integer invariant (all `SplitError`); exact-amount message formatted in `currency` when given. Tests: +7.
- `src/lib/balances.ts` — `isBalancedExpense` requires `v >= 0`; `countable()` is pure and returns `{ ok, rejected }`; single-payer fast path in `pairwiseDebts`. Tests: +5 (incl. pairwise-vs-net property for single-payer, bounded for multi-payer).
- `src/lib/simplify.ts` — sorted once, remainders re-inserted (O(n log n)); same results.
- `src/lib/recurrence.ts` / `src/lib/trust.ts` — occurrences and imported rows strip `receiptPath` as well as `receiptUrl` (tests extended); new `expenseEditPatch(prev, next)` + `TRUST_FIELDS` (4 tests).
- `src/lib/import-splitwise.ts` — header member names un-formula'd; multi-payer "Paid by" cells read name-by-name against the known names (names with ";" or trailing digits survive). Test: round trip with `O'Neil; Jr`, `=1+1`, `+91 Sam`, `@handle`, `Sam 2`, duplicate `Sam`s → 0 rows skipped, balances exact.
- `src/lib/fx.ts` — `isoToday()` is the local calendar day (via `localISODate`), matching `todayISO()`; documented why. `src/lib/id.ts` — `todayISO` documented as the one "today".
- `src/lib/table.test.ts` — assignment-in-expression fixed (E's request).
- `src/lib/activity.ts` — the two date one-liners use A2's cached `formatDate(v, 'day')` (same output; A2's perf request).

## What I verified
- `npx tsc -b`: exit 0 at my finish (other tracks' in-flight errors came and went during the session; none in my files at any point after the fix of my own `latest()` typing).
- `npx vitest run`: 800 tests, 796 passing; the 4 failures are in `functions/src/lib/functions.test.ts` and `functions/src/lib/gemini.test.ts` (B's files, mid-edit). Every file I own is green; new/extended suites: store (8), simplify (5), splits (+7), balances (+5), trust (+4), recurrence (+1 assertion), import-splitwise (+1), seed (+1).
- Firestore SDK semantics checked in `node_modules/@firebase/firestore` before relying on them: `onSnapshot` raises the initial cached snapshot only when the cache has results or the client is offline; the cache→server sync transition fires only with `includeMetadataChanges: true`; `docChanges()` without options excludes metadata-only changes (so "no doc changes → reuse the array" is sound).
- `npx biome lint` on my files: 0 errors; 9 remaining warnings are all `useIterableCallbackReturn` on pre-existing `forEach((r) => batch.delete(r))` lines (repo style) and one `useExhaustiveDependencies` on the intentional mount-only cleanup effect.

## Deliberately left out, and why
- Dropping the `groups/{gid}.updatedAt` bump on every expense write (01 §M2): it changes the Groups sort order (an owner question in the report, Q1). Left as is.
- Splitting the captures listen (pending vs. handled) and a TTL (01 §M4): needs a composite index + TTL policy (B owns `firestore.indexes.json`); the hang fix (H3) covers the user-visible problem.
- Cutting `deleteGroup` down to "group doc + invite" (plan: once B's server-side recursive delete exists): no B handoff arrived during my window; the full client path keeps working with or without the trigger. One-line change for the lead when the trigger is live (see A1.md → B).
- Skipping the invite write on self-leave: no B handoff; the `if (m.uid === me())` guard is described in A1.md if the rule needs it.
- `readStatementAi` still returns `null` when unavailable: C3's StatementImport reads `r.statement` directly, so passing the reason through would show the wrong copy until that screen checks `unavailable` (A1.md → C3).
- `getRate`'s `fx.ts` `today` parameter injection (01 §L1 second half): the local-day fix removes the mismatch; the signature is unchanged for the callers.
- `errorChannel` opId / `{ local, server }` promise pair (01 §M6a): a bigger contract change across every write call site; not in the deliverables.
- `src/lib/ai.ts` boundary (`import { repo }`): B's file.

## Decisions the owner should know
- A page can now show empty lists briefly for a group whose server listen was refused and retried (fresh group): same as before, now via `meta.error`; nothing new to the user.
- The all-groups view waits up to 4 s for the server to confirm an *empty* cached list before showing "all settled"; non-empty cached data shows immediately, and offline devices never wait.
- Activity feeds load 50 entries per group (was 30 for the Inbox, 50 for the group tab) so both screens share one listener. Cold-open reads go up by 20 per group; tab switches and GroupDetail opens no longer re-read anything.
- Sign-out while writes are queued keeps the offline cache on the device (with a warning) instead of deleting the queued writes. On a shared device that means the previous user's cached data stays in IndexedDB until they sign in again and it syncs; the app itself can't show it to another account.
- Edits now use the server's copy of the expense as "before" when it answers within 1.5 s; saving an edit can take up to 1.5 s longer on a slow network (still resolves locally first for the write itself).
