# 01 — Data layer, Firestore model, read/write efficiency

Repo: `/home/user/split-it` @ `claude/codebase-audit-optimization-k2uyfs` (HEAD 7be583c). Read-only audit. `npx tsc -b --noEmit` passes; `vitest` on `src/lib/fx.test.ts`, `src/lib/recurrence.test.ts`, `src/data/seed.test.ts` passes (59 tests).

## 1. Summary

I read `src/data/{repo,firebaseRepo,localRepo,index}.ts`, `src/hooks/{data,auth,useInbox,useFx}.ts(x)`, every page/component that subscribes (Home, Groups, Friends, Insights, Inbox, Scan, GroupDetail, ExpenseDetail, ExpenseForm, GroupForm, Capture, Join, SettleUp, Table/TableFinish, CaptureAlert, Trust, StatementImport, ImportGroup, AutoCapture*), the lib helpers the repo delegates to (`trust`, `activity`, `recurrence`, `fx`, `capture`, `balances`, `money`, `push`, `inbox`, `id`), `firestore.rules`, `firestore.indexes.json`, `firebase.json`, the Cloud Functions that touch the same collections (`capture`, `reminders`, `triggers`, `push`, `lib/ids`, `lib/ratelimit`) and `docs/PLAN.md` §4.0–4.3.

Verdict: the data layer is well-structured (one `Repo` interface, batched writes with activity entries in the same batch, trust fields re-derived from the stored copy, idempotent ids for recurring/inbox, careful rules). The cost problem is architectural, not a typo: **every dashboard-type screen subscribes to every expense and every settlement of every group the user is in, the subscriptions live in the page (not the shell) so each tab switch tears down and re-creates 2N+ listeners, and nothing is paginated or summarised.** A user with 10 groups and 1,000 expenses pays ~1,400–1,500 billed reads on a cold open and holds every document in memory and re-derives all balances on every change. There is also one real lost-update path (concurrent approvals wiped by a full-document `set`), one hang (`watchCaptures` never calls back behind a captive portal), and offline sign-out silently discards queued writes. No composite indexes are needed today (every query is single-field), so `firestore.indexes.json` being empty is correct.

## 2. Findings (ranked)

### HIGH

#### H1. Subscription fan-out: Home/Groups/Friends/Insights/Inbox/Scan each subscribe to *all* expenses + settlements of *every* group, per page mount
- `src/hooks/data.ts:188-229` (`useAllGroupData`), consumers at `src/pages/Home.tsx:22`, `Groups.tsx:9`, `Friends.tsx:29`, `Insights.tsx:21`, `Inbox.tsx:27`, `Scan.tsx:20`. `useInbox` (`src/hooks/useInbox.ts:15`) adds `useRecentActivity(ids, 30)` → `src/hooks/data.ts:129` one `watchActivity(limit 30)` listener per non-personal group.
- `firebaseRepo.ts:439-445` `watchExpenses` and `:554-560` `watchSettlements` are **unfiltered, unlimited** `onSnapshot(collection(...))` calls.

What happens, with evidence:
1. **Per app open, cold cache** (fresh install, or after any sign-out, because `signOut` calls `clearIndexedDbPersistence`, `firebaseRepo.ts:233-234`). Reads for a user with N groups, M expenses total, S settlements total, C captures, A activity entries: `watchGroups` N + `watchCaptures` C (all captures ever, never pruned) + Σ expenses M + Σ settlements max(S, N) (a listen that returns 0 docs still bills 1) + activity min(30·N_shared, A) + `ensureProfile` `getDoc` 1 (`:132`) + `watchProfile` 1 + `watchPrefs` 1 + `claimInbox` `getDocs` ≥1 (`:722`, runs on every foreground, `App.tsx:62-68`) + fx 0–1. Example N=10, M=1,000, S=100, C=50, A≥300: **≈ 1,460 reads per cold open** [Certain, from the code; the "0 docs = 1 read" rule and the per-listen minimum are Firestore pricing rules, [Likely] as to exact billing]. Plus 1 write per open per device (`refreshPush` → `saveToken` re-sets `pushTokens/{id}.lastSeen`, `src/lib/push.ts:70-85`).
2. **Warm cache** (same device, same session or next session before sign-out): `persistentLocalCache` keeps resume tokens, so re-listening bills only changed documents (plus the minimum per listen if the target was released >30 min ago) [Likely]. But the SDK still opens 2N+N+3 listen streams again and every hook flashes a `fromCache` snapshot first.
3. **Listeners are torn down and re-created on every route change.** `useAllGroupData` is a page-level hook; `Layout` (`src/components/Layout.tsx`) renders `<Outlet/>` without any data provider. Switching Home → Groups → Home unmounts and remounts 2N expense/settlement listeners and N activity listeners each time. Within the Firestore SDK a target whose last listener is removed is released; the next `onSnapshot` re-establishes it (new stream, new `fromCache` → server snapshot cycle). This is CPU + latency churn on the phone every tab tap, and, after the 30-minute window, billed re-reads.
4. **Duplicate client listeners on identical queries**: `CaptureAlert` in the shell (`src/components/CaptureAlert.tsx:20-21`) holds `useCaptures()` and `useGroups()` for the whole session; every page then adds its own `useGroups()` (via `useAllGroupData`) and `Inbox`/`ExpenseForm`/`Capture`/`AutoCaptureSetup` their own `useCaptures()`. The SDK coalesces identical queries into one server target (no extra billed reads) [Certain for `@firebase/firestore` `EventManager`], but each `onSnapshot` call re-maps and re-sorts the whole doc list and triggers its own React state update per snapshot. `GroupDetail`'s `useActivity(group.id)` (limit 50, `GroupDetail.tsx:240`) and `useRecentActivity` (limit 30) are *different* queries on the same collection → two targets, 80 docs read where 50 would do.
5. **Re-computation**: every snapshot of any group calls `setExp(p => ({...p,[id]: e}))`; the `useMemo` at `data.ts:224-228` depends on the whole `exp`/`set` maps, so `computeGroupData` (netBalances + pairwiseDebts + simplifyDebts + pending/disputed filters) re-runs for **all N groups** on every change in any one of them. Home then re-flattens and re-sorts all expenses for "recent" (`Home.tsx:59-62`) on each render.
6. **No pagination anywhere**: expenses, settlements, captures are full-collection listens. `docs/PLAN.md` §4 assumes "hundreds, not millions", but `bulkImport` (`firebaseRepo.ts:625-644`) happily writes a 5-year Splitwise history (thousands of rows) into one group, which every member then downloads in full on every cold open, for the rest of the group's life.
7. **Snapshot metadata is ignored**, so the "wait until every group reported once" guard (`data.ts:221-226`) is satisfied by the *empty cached* first snapshot on a new device: Home can render "You're all square" / an empty Recent list for a beat before the server snapshot arrives. (`watchCaptures` is the only place that checks `metadata.fromCache`, `firebaseRepo.ts:671`.)

Why it matters: read cost scales with total history, not with what the screen shows; battery/CPU churn on every tab switch; the 50k reads/day free tier is reachable by one active family (10 members × 3 opens/day × 1,500 = 45k) once the cache is cold (shared devices, sign-outs, iOS evicting IndexedDB), and the app holds O(M) documents in memory on a phone.

Proposed fix (two phases, both concrete):

**Phase 1 — client only (1–2 days): a refcounted subscription store + hoist the all-groups data into the shell.**

`src/data/store.ts` (new):
```ts
import type { Unsub } from './repo'
interface Entry<T> { refs: number; value?: T; meta?: SnapMeta; listeners: Set<(v: T, m?: SnapMeta) => void>; unsub: Unsub; release?: ReturnType<typeof setTimeout> }
export interface SnapMeta { fromCache: boolean; hasPendingWrites: boolean }
const entries = new Map<string, Entry<unknown>>()
const LINGER_MS = 5 * 60_000   // keep a released listener alive across tab switches
export function subscribeShared<T>(key: string, start: (cb: (v: T, m?: SnapMeta) => void) => Unsub, cb: (v: T, m?: SnapMeta) => void): Unsub {
  let e = entries.get(key) as Entry<T> | undefined
  if (!e) {
    const entry: Entry<T> = { refs: 0, listeners: new Set(), unsub: () => {} }
    entries.set(key, entry as Entry<unknown>)
    entry.unsub = start((v, m) => { entry.value = v; entry.meta = m; entry.listeners.forEach((l) => l(v, m)) })
    e = entry
  }
  if (e.release) { clearTimeout(e.release); e.release = undefined }
  e.refs++; e.listeners.add(cb)
  if (e.value !== undefined) cb(e.value, e.meta)          // replay last value synchronously
  return () => {
    e!.listeners.delete(cb); e!.refs--
    if (e!.refs === 0) e!.release = setTimeout(() => { e!.unsub(); entries.delete(key) }, LINGER_MS)
  }
}
export function clearSharedStore() { entries.forEach((e) => { e.unsub(); if (e.release) clearTimeout(e.release) }); entries.clear() }  // call on sign-out
```
Then in `src/hooks/data.ts` every hook becomes a one-liner over it, e.g.
```ts
export function useAllExpenses(groupId?: string) {
  const [list, setList] = useState<Expense[] | null>(null)
  useEffect(() => groupId ? subscribeShared(`expenses/${groupId}`, (cb) => repo.watchExpenses(groupId, cb), setList) : undefined, [groupId])
  return list
}
```
`useExpenses`/`useSettlements` derive `liveItems` with `useMemo` from the shared list instead of a second listener. Add `meta` to the `watch*` callbacks (`cb(docs, { fromCache: s.metadata.fromCache, hasPendingWrites: s.metadata.hasPendingWrites })`; pass `{ includeMetadataChanges: false }`, the first server snapshot still differs in `fromCache`) and make `useAllGroupData` treat a group as "loaded" only when `!meta.fromCache || !navigator.onLine`.

Hoist: create `GroupDataProvider` (context) mounted once in `AppRoutes` (around `<Layout/>`, `src/App.tsx:95`), holding today's `useAllGroupData` body; pages call `useGroupData()`; `Scan` (outside Layout) can keep using the hook, it hits the same store. `useRecentActivity` should diff ids like `useAllGroupData` does instead of restarting all listeners when the key changes (`data.ts:126-131`), and `GroupDetail`'s `useActivity(group.id)` should reuse the same `limit` so it shares the target.

**Phase 2 — per-group summary documents (server-maintained), so list screens read N docs instead of M.**

`groups/{gid}/meta/summary` = `{ net: {memberId: cents}, counted: number, pendingForUid: {uid: n}, lastActivityAt, lastExpense: {id, description, amount, date}, version }`. Maintained by a 2nd-gen `onDocumentWritten('groups/{gid}/expenses/{eid}')` / settlements trigger in `functions/src/` that applies the *delta* between `before` and `after` with `FieldValue.increment` inside a transaction (1 read + 1 write per change; dedupe by `event.id` stored in `summary.applied[eventId]` trimmed to the last 50). The delta rule is exactly `countedExpenses` (`src/lib/trust.ts:58`) + `isBalancedExpense` (`src/lib/balances.ts:12`), which depend only on the doc and `group.members`/approval settings — move those two helpers to `shared/` so client and function agree. Membership changes (placeholder claimed → approver appears) are the one case a delta can't see: handle by a full recompute in `dailyReminders`, which **already reads every group's expenses and settlements once a day** (`functions/src/reminders.ts:23-27`), so writing the summary there is free. Rules: `summary` readable by members, no client writes. Then Home/Groups/Friends/Inbox badge read `watchGroups` + N summary docs; `Insights` and `GroupDetail` keep the full listen but paginate: `query(expenses, orderBy('date','desc'), limit(100))` with `startAfter` (single-field order, no composite index), trashed items via `where('deletedAt','>', 0)` (single field). `Friends` needs `rawDebts` per group; store `debts` (≤ members² entries) in the summary too, or compute from `net` when `group.simplify` is on.

Quantified effect for the example above: cold open ≈ N + N + C' + 30·N ≈ 370 reads (vs ~1,460), and O(N) memory instead of O(M); warm tab switches 0 new streams.

#### H2. Lost update: a concurrent approval/flag is wiped by `saveExpense`'s full-document `set`
- `firebaseRepo.ts:446-455`: `prev` comes from `getDocFromCache`, `next = prepareExpenseSave(prev, …)`, then `batch.set(r, next)` (full overwrite). `prepareExpenseSave` copies `approvals`/`dispute` from the *cached* `prev` (`src/lib/trust.ts:88-101`).
- Rules explicitly allow a normal edit to *remove* approvals keys (`firestore.rules:331-338`, "may only remove approvals").

Scenario: member B approves (`approvals.B = true`, a field-path update) while A has the edit form open with a stale cache (A offline, or B's write not yet delivered). A saves a description change → A's `set` carries `prev.approvals` without B → B's approval is silently deleted and the expense goes back to pending; the activity entry's `before` snapshot is also taken from stale cache so History can show a wrong "X → Y". Same for `dispute` if A's cache predates B's flag (rules do forbid *changing* `dispute` in a normal edit, so that case is rejected server-side and A's whole batch is undone with a permission toast — a confusing failure for a legitimate edit) [Certain from code; the race needs two devices].

Fix: edits must not overwrite trust maps. In `saveExpense`, when `prev` exists write with `batch.update(r, data)` where `data` = the non-trust fields that changed (compute with the same `changedSettings`-style diff used for groups, `src/data/repo.ts:293-300`) plus `updatedAt`, and never include `approvals`/`dispute`/`deletedAt`/`deletedBy`; when the money changed, clear others' approvals with explicit `FieldPath('approvals', uid) → deleteField()` for each uid in `prev.approvals` (rules allow removals), so a concurrent approval that lands after the cache snapshot survives. Keep `set` only for creates. Mirror in `localRepo.saveExpense` (merge rather than replace). Also use `getDoc` (server, with a 2 s cache fallback) for `prev` when online so the History `before` is accurate.

#### H3. `watchCaptures` can hang the Inbox/ExpenseForm forever when the device looks online but Firestore is unreachable
- `firebaseRepo.ts:664-676`: `if (s.empty && s.metadata.fromCache && navigator.onLine) return` — the callback is never invoked until a server snapshot arrives. `navigator.onLine` is true behind captive portals, DNS failures, blocked `firestore.googleapis.com`, or a paused backend. Then `useCaptures()` stays `null` → `Inbox.tsx:36` renders `<Loading/>` forever; `ExpenseForm.tsx:68` blocks on `captureId && !captures` (deep links from the capture alert); `AutoCaptureSetup` passes `[]` (fine).
- Demo repo calls back immediately with `[]` (`localRepo.ts:361`), so demo users never see this.

Fix: keep the heuristic but bound it: start a 4–6 s timer on subscribe; if no server snapshot by then, deliver the cached (possibly empty) list and keep listening; also deliver immediately when the cached list is non-empty (already the case). Expose the state via the `SnapMeta` from H1 so the Inbox can show "Checking for new captures…" instead of a bare spinner.

### MEDIUM

#### M1. Offline sign-out silently destroys queued writes
- `firebaseRepo.ts:225-239`: `if (online()) await waitForPendingWrites(…)` else skip; then `terminate(db)` + `clearIndexedDbPersistence(db)` + `location.reload()`. Every `fire()`d batch that has not reached the server (expense just added on the train, settlement recorded in a basement) is deleted with the IndexedDB cache, no warning, no error channel entry [Certain]. The UI told the user "Expense added ✅" (`ExpenseForm.tsx:294`).

Fix: before clearing, check for pending writes (`waitForPendingWrites` with a short race; if it does not resolve and `!online()`, there are pending writes) and either refuse with "You have N unsynced changes — connect before signing out" or sign out of Auth but *keep* persistence and clear it on the next online start (store a `splitit-clear-cache-for=<uid>` flag in localStorage and honour it in `createFirebaseRepo` after `waitForPendingWrites`). Same multi-tab failure (`:235-237`) leaves the previous user's data readable on a shared device; surface it as a toast rather than `console.warn`.

#### M2. The group document is a hot, fanned-out document: every expense/settlement write bumps `groups/{gid}.updatedAt`
- `firebaseRepo.ts:452, 461, 470, 493, 566, 575, 584, 593, 621, 641` all `batch.update(groupRef, { updatedAt })`. The only consumer of the field is the sort in `watchGroups` (`:292`) and `rankGroupsForCapture` (`src/lib/capture.ts:262`).
- Effect: +1 write per save (rules evaluate `validMembershipChange` — four map diffs — on each), the group doc (members map, the largest doc) is re-delivered to **every member's** `watchGroups` listener on every expense anyone adds (N−1 extra reads per write, plus re-sorting and re-rendering every list that depends on `groups`), and a busy group hits the ~1 write/s/doc soft limit during a live table hand-off or a statement import (`StatementImport.tsx:138-142` saves sequentially, each bumping the group) [Certain for the write amplification; Likely for contention].

Fix: drop the bump from expense/settlement writes; order groups client-side by `max(lastExpense.date, group.updatedAt)` (Home already has every expense; after Phase 2 use `summary.lastActivityAt`). Keep the bump for settings/membership writes only.

#### M3. `deleteGroup` is an N+1 server scan with no error handling at the call site
- `firebaseRepo.ts:368-408`: `getDocs` of three subcollections (server), then **one awaited `getDocs(commentsCol)` per expense** (`:382`) → a 1,000-expense group costs ≥2,000 reads and ~1,000 sequential round trips (minutes on mobile), then activity beyond 448 entries is orphaned (documented at `:400-401`). Offline, `getDocs` rejects and `GroupForm.tsx:219-224` has no `try/catch` → unhandled promise rejection, the sheet stays open, no toast.

Fix: move deletion server-side: a callable `deleteGroup({ groupId })` in `functions/src/` that checks `createdBy == auth.uid`, then `admin.firestore().recursiveDelete(groupRef)` (handles comments, activity, profiles, unlimited size) and deletes receipts via `bucket.deleteFiles({ prefix: 'receipts/<gid>/' })`; the client deletes only the group doc + invite in one batch (rules already allow creator delete) so the UI responds instantly and the function cleans up (trigger `onDocumentDeleted('groups/{gid}')` instead of a callable if you prefer zero client coupling). Until then: wrap `remove()` in try/catch and parallelise the comment fetches in chunks of 20.

#### M4. Unbounded per-user `captures` collection, fully listened, never pruned
- `firebaseRepo.ts:664-676` listens to all captures; `Inbox.tsx:49` shows only `.slice(0, 15)` of handled ones; nothing deletes `assigned`/`dismissed` captures; the webhook creates one per bank SMS (`functions/src/capture.ts:150`). A trip-mode user accrues hundreds per year, every one re-read on each cold open by `CaptureAlert` (shell) and the Inbox.

Fix: split the listen: `where('status','==','pending')` (single-field, no index) for the shell/Inbox badge, and a `limit(15)` `orderBy('updatedAt','desc')` query with `where('status','!=','pending')` for the Handled list — that one needs a composite index `(status, updatedAt desc)`; add it to `firestore.indexes.json`. Add a TTL policy (`expireAt` field set to `updatedAt + 90 d` on assign/dismiss; enable Firestore TTL on `users/*/captures.expireAt`) so handled captures disappear server-side for free.

#### M5. Demo/Firebase parity gaps that bite someone moving from demo to Firebase
[Certain, from reading both repos]
1. `localRepo.updateCapture`/`purgeExpense`/`purgeSettlement`/`bulkImport` **throw** synchronously on not-found / not-permitted (`localRepo.ts:366, 233, 309, 340`); Firebase resolves immediately and reports later through `onError` (`fire`, `firebaseRepo.ts:78-80`). UI code like `Inbox.tsx:73` (`.catch(toast)`) and `Trust.tsx:242` therefore shows an error toast in demo but a success toast followed by "the change was undone" in Firebase.
2. `localRepo.deleteExpense`/`deleteSettlement` are no-ops on an already-trashed item (`:214, :290`); Firebase re-writes `deletedAt/deletedBy` (rules allow it, `firestore.rules:265-271`), which changes *who may purge* (`canPurge`) to the second deleter.
3. `localRepo.joinGroup` returns the group id when already a member (`:190`); Firebase's rules reject (`!(uid() in before.memberUids)`, `firestore.rules:195`) and `joinGroup` throws "permission" after the commit — `Join.tsx:25-29` masks this by redirecting from `useGroups()`, but only after the groups listener has reported.
4. `watchCaptures` initial behaviour (H3): demo fires `[]` at once; Firebase withholds.
5. `localRepo.getInvite` resolves personal groups' codes (`:184`); Firebase never writes an invite doc for `type === 'personal'` (`firebaseRepo.ts:307`).
6. `localRepo.saveRecurringOccurrences` silently returns when the template is gone (`:332`); Firebase fails the whole batch and toasts "Adding recurring … you don't have permission" / not-found.
7. `localRepo.flagExpense` silently returns when the caller isn't a member (`:242`); Firebase throws (`:506`).
8. Demo `watch()` re-serialises every subscribed selection with `JSON.stringify` on every commit (`localRepo.ts:83-93`): with Home's 2N+ listeners and a few hundred expenses, each live-table tap costs O(listeners × data) on the main thread — invisible in Firebase mode, so demo-mode perf complaints are not representative.

Fix: make the demo repo mirror Firebase's error channel (resolve, then `errors.emit('write', …)` from a microtask) for the four throwing methods, add the `deletedAt` guard to Firebase's `deleteExpense`/`deleteSettlement` (`if (e?.deletedAt) return`), and put a parity test in `src/data/` that drives both repos through the same script (create group → add → trash → trash again → purge by a non-deleter) and compares observable results and error-channel events.

#### M6. Error channel semantics: `fire()` resolves before the server answers, and several call sites treat the resolved promise as confirmation
- `firebaseRepo.ts:78-80` + the interface comment `repo.ts:65-69`. This is a deliberate offline-first choice and the rejection *does* reach `App.tsx:43` as a toast; but:
  - `Trust.tsx:44-52` `.then(() => toast('Deleted …', { Undo }))` fires on local apply; a later rejection (e.g. the group creator already purged it) shows "Deleted" then "Deleting expense: you don't have permission (the change was undone)" and the Undo button then *restores* nothing.
  - `joinGroup` (`:432-436`) returns the group id after 8 s even if the commit later fails; the user lands on "Group not found".
  - `errorChannel.on` replays early errors to the **first** subscriber only (`repo.ts:322-325`); in React StrictMode (`main.tsx:19`) the App effect subscribes, unsubscribes and resubscribes, so a sign-in-redirect failure (`firebaseRepo.ts:60`) is delivered to the subscription that is immediately removed → lost in dev builds only.
  - `ensureProfile(u).catch(console.error)` (`:180`) and `attachReceipt`'s background upload (`:526-546`) are the only writes that go to `console` instead of the channel; `catchUpRecurring` and trash purging (`data.ts:54, 94, 99`) use `console.warn` too.

Fix: keep the pattern but (a) give `RepoError` a stable `opId` and let `fire()` return a `{ local: Promise<void>; server: Promise<void> }` pair so optimistic toasts can downgrade themselves when `server` rejects; (b) replay `early` to every subscriber for the first 10 s rather than draining on first `on`; (c) route the three `console.warn` background writes through `errors.emit('write', …)` with a `silent` flag (log only) so they are at least countable.

#### M7. `firestore.indexes.json` is empty — correct today, but add field overrides and the one composite you will need
- Every client query is single-field or equality (`watchGroups` array-contains `:289`, `watchActivity` `orderBy(createdAt)` `:600`, `watchHistory` `where(targetId)` `:608`, `captureTokens`/`captureInbox` `where(uid)` `:695, :722`); server queries likewise (`functions/src/capture.ts:75, :135`). No composite index is missing [Certain].
- Missing *optimisations*: single-field auto-indexing covers every field, including ones never queried that are large or map-shaped: `expenses.splitInput` (nested items/arrays → many entries), `expenses.notes`, `activity.summary/before/after`, `captures.raw`, `pushTokens.token/ua`, `tables.items/participants/claims`, `groups.members`. Each adds index entries on every write (storage + write latency, not billed reads).
- `functions/src/capture.ts:75` uses `.offset(30).limit(20)` to trim `captureLog`; Firestore **bills the skipped 30 documents as reads on every webhook call** [Certain per Firestore pricing]. Use `orderBy('at','desc').limit(1).offset(0)` + keep a counter in the user doc, or simply `startAfter(cursorAt)` where the cursor is the 30th doc from a `limit(31)` query (31 reads once, no skipped billing), or a TTL field instead of trimming.

Fix: `"fieldOverrides": [{ collectionGroup: "activity", fieldPath: "before", indexes: [] }, …]` for the fields above (keep `createdAt`, `targetId`, `date`, `status`, `uid`, `memberUids`); add `{ collectionGroup: "captures", fields: [{status, ASC}, {updatedAt, DESC}] }` when M4 lands.

### LOW

#### L1. Two different "today" functions → off-by-one date keys west of UTC
- `src/lib/id.ts:13-16` `todayISO()` is local-date; `src/lib/fx.ts:120` `isoToday()` is UTC-date. `useTodayRates` (`src/hooks/useFx.ts:15`) passes the local date into `getRate`, which clamps and compares against the UTC date (`fx.ts:199-201, :124`). For a user in UTC−x after local evening (local D, UTC D+1) the local "today" is treated as a *past* date: the lookup goes to `fxRates/D` and `refreshFx(D)` instead of `latest`, and the cache marks it "past, keep forever" (`fresh()`), so a rate fetched before ECB's 16:00 CET publication can be pinned as final for that day on that device. India (UTC+5:30) is unaffected except 00:00–05:30 local where the opposite (harmless) clamp applies. Also the `activity` feed and `unread` count compare `createdAt` from *other devices' clocks* with this device's `seenAt` (`src/lib/inbox.ts`, `useInbox.ts:20`). Fix: one `todayISO()` (local, as the product treats dates) and have `fx.ts` take `today` as a parameter from callers; consider `serverTimestamp()` for `activity.createdAt` (rules would need `is timestamp`).

#### L2. `DEFAULT_APPROVAL_THRESHOLD = 10_000` minor units regardless of currency
- `src/lib/trust.ts:11` ("A$100.00") and `firestore.rules:324` (`10000`). That is ₹100 for INR groups (the primary market), ¥10,000 for JPY, BHD 10.000. Product decision, but the comment and the India-first positioning disagree. Fix: derive the default from `minorDigits(currency)` (e.g. 100 major units) on both sides, or always store an explicit `approvalThreshold` when `requireApproval` is turned on (GroupForm already does, `GroupForm.tsx:194`), and make the rule default match.

#### L3. `saveProfile` reads the group list from cache, then falls back to a server query, then fans out N+1 writes
- `firebaseRepo.ts:244-272`. Correct, but on a device where the user has never loaded Groups (fresh install → Profile first) the cache query is empty-but-successful (`getDocsFromCache` resolves with 0 docs rather than throwing), so **no group profile docs are updated** until the next save after the groups have been cached [Certain — `@firebase/firestore` `getDocsFromCache` resolves with an empty `QuerySnapshot` for an uncached query and never rejects, so the `catch` fallback to `getDocs` at `:259-261` is dead code in that case]. Fix: `getDocs(q)` first when `online()`, cache otherwise.

#### L4. `ensureProfile` does a server `getDoc` on every auth-state callback and can trigger a profile fan-out write
- `firebaseRepo.ts:130-149`: 1 server read per app open (`getDoc`, not cache-first), and if the Google photo URL changed (Google rotates these) it calls `saveProfile` → N+1 writes. Use `getDocFromCache` with server fallback, and compare `photoURL` ignoring the `=s96-c` size suffix.

#### L5. `useRecentActivity` restarts every listener when the group set changes
- `src/hooks/data.ts:123-133`: `key` changes → cleanup unsubscribes all N, effect resubscribes all N (and `setFeeds({})` blanks the Inbox "Updates" for a frame). Diff ids like `useAllGroupData` does.

#### L6. `uid()` encoding wastes entropy but is safe
- `src/lib/id.ts:1-4`: 10 random bytes → base-36 pairs → 16 chars, i.e. 8 bytes / 64 bits of entropy per id; collisions inside one group are negligible. `inviteCode()` 31⁸ ≈ 8.5e11 with a best-effort uniqueness probe (`firebaseRepo.ts:155-169`; skipped offline, 1.5 s race). Fine; just noting there is no cryptographic requirement beyond unguessability of invite codes and capture tokens (28 chars from 32 symbols = 140 bits, `capture.ts:214-218`).

#### L7. `CaptureAlert` effect has a stale-closure `current`
- `src/components/CaptureAlert.tsx:26-31` reads `current` inside an effect keyed only on `[captures]` (eslint-disabled); the "clear when handled elsewhere" branch can act on a stale `current`. UI-only. Use a functional `setCurrent((cur) => …)`.

## 3. Already good (don't "fix")

- One `Repo` interface with both implementations sharing the pure helpers (`activityCtxFor`, `prepareExpenseSave`, `prepareOccurrence`, `draftToCapture`, `errorChannel`) — most behaviour differences are at the edges, not in the core maths.
- Activity entries are written **in the same batch** as the change (`log(batch, …)`), create-only by rules, with a bounded `summary` and compact `before/after` limited to tracked fields (`src/lib/activity.ts:28, :42-57`). No unbounded blobs in activity docs.
- Deterministic ids where concurrency matters: recurring occurrences `<templateId>_<date>` enforced by rules (`firestore.rules:283-292`), inbox → captures same id (`:727-728`), webhook capture id hashed from bank ref (`functions/src/lib/ids.ts`), `ref.create()` for ALREADY_EXISTS detection (`capture.ts:150-153`).
- Batch limit headroom (450) with correct ordering for rule dependencies (`bulkImport`, `deleteGroup` comments-after-expenses, invite in the last batch); `purgeExpense` handles comment overflow.
- `useAllGroupData` diffs group ids and sorts the key so `updatedAt` re-ordering does not resubscribe (`data.ts:193-215`); the module-level `attempted`/`purged` sets stop the recurring catch-up and trash purge from looping across duplicate listeners.
- Every hook returns its unsubscribe from `useEffect`; `useTodayRates` guards its promise with a `live` flag; `watchPrefs` handles the async SDK load race (`push.ts:135-145`). I found no listener leak and no state-update-after-unmount path.
- `flagExpense`/`approveExpense` use `FieldPath` updates on the caller's own key only, matching the `ownKeyOnly` rule; `joinGroup` is a blind field-path update validated by `isJoining`.
- `watchCaptures` is the one place that reasons about `fromCache` (server-written data) — the right instinct, just needs a timeout (H3).
- `firestore.indexes.json` being empty is correct for the current query set; the rules tests under `tests/` cover trust fields, FX, import, tables, push and hardening.

## 4. Open questions for the product owner

1. Is "sort groups by last activity" worth a write per expense and a group-doc fan-out to every member (M2), or is client-side ordering by latest expense acceptable?
2. Should imported Splitwise history be first-class (paginated, summarised server-side — Phase 2 of H1), or capped (e.g. last 24 months) at import time?
3. On sign-out while offline (M1): refuse, warn, or keep the cache until the writes sync? (Privacy on shared devices vs. losing the user's data.)
4. Should handled captures expire (90 days via Firestore TTL, M4)?
