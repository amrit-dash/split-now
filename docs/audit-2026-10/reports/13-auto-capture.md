# 13 — Auto-capture / SMS pipeline, end to end

## 1. Summary

I read the whole pipeline: `docs/AUTO_CAPTURE.md`, the shared parser (`shared/sms-parse.ts` + tests), the filters (`shared/capture-filters.ts`), the webhook (`functions/src/capture.ts`, `lib/capture-core.ts`, `lib/request.ts`, `lib/ids.ts`, `lib/time.ts`, `lib/trips.ts`, `lib/prefs.ts`, `lib/ratelimit.ts`, `ai.ts`, `lib/gemini.ts`, `push.ts`), the client (`src/lib/capture.ts`, `capture-settings.ts`, `sms-setup.ts`, `pending.ts`, `inbox.ts`, `hooks/useInbox.ts`, `pages/AutoCaptureSetup.tsx`, `Capture.tsx`, `CaptureGuest.tsx`, `Inbox.tsx`, `Share.tsx`, `components/AutoCapture.tsx`, `CaptureAlert.tsx`, `public/share-target-sw.js`, `data/firebaseRepo.ts` capture methods, `App.tsx` inbox claim), the capture parts of `firestore.rules`, and all tests (unit, emulator, rules). I ran the existing suites (142 unit tests pass) and wrote a 39-case probe of realistic Indian SMS under `scratchpad/parser-probe/` (`node --experimental-strip-types probe.ts`). **25 of 39 probes fail on the current parser.** I then applied the fixes proposed below to a scratchpad copy of the parser (`parser-probe/patched/sms-parse.ts`, diff in `parser-probe/sms-parse.patch.diff`): the probe goes to **0 failures** and the repo's own 54 parser tests still pass (`probe-before.txt`, `probe-after.txt`).

Verdict: the architecture is sound and unusually well thought through (token model, idempotent ids, 200-for-handled statuses, masking, activity log, per-trip pause), and the happy-path formats of the big banks parse well. But (a) the parser is brittle outside the exact test strings — common wordings ("Rs500", "ATM withdrawal of", "Debit Card XX1234 Rs.500", "Payment of Rs made to", "Dr Rs"), self-transfers (UPI Lite) and collect requests slip through or are dropped, and merchant extraction produces junk ("CRED", "Autopay Mandate", "Raise A Dispute", "PAYTMQR5C5KJ"); (b) the Android share-sheet text path bypasses the SMS parser entirely and stores unmasked SMS text, OTPs and credits as captures; (c) the Gemini fallback ships unmasked, sometimes personal, SMS to Google by default; (d) the wizard and docs tell users that debits outside a trip "wait in the Inbox" when the default setting drops them; (e) the 36 KB wizard is not something a non-technical friend will complete. None of this is a security hole; it is a reliability and trust problem for the feature the app leads with.

---

## 2. Findings

### HIGH

#### H1. Parser misses or mangles common real-world SMS (25/39 probes) — `shared/sms-parse.ts`

Proven by `scratchpad/parser-probe/probe.ts` (before) and `probe-patched.ts` (after). Each row is a realistic message; "Got" is the current parser.

| # | Message (abridged) | Got | Should be | Root cause |
|---|---|---|---|---|
| A1 | `Rs500.00 debited from A/c XX1234 … -SBI` | amount **missing** → `unparsed` (HTTP 422) | 50000 | `AMOUNT_RE` uses `\bRs\b\.?` (line 39): no word boundary between `s` and `5` |
| A3 | `Transaction of 250.00 INR debited …` | amount missing | 25000 | no amount-first pattern |
| A6 | `You have spent 25.00 USD on your HDFC Bank Card …` | **INR 2500** | USD 2500 | `BARE_AMOUNT_RE` (line 41) assumes INR; no amount-first currency |
| C1 | `Rs.500.00 sent to you by RAHUL SHARMA via UPI` | **debit** (would be captured) | credit | `DEBIT_RE` matches `sent`; `CREDIT_RE` has no "sent to you" |
| C2 | `ATM withdrawal of Rs 2,000.00 from your A/c … Avl Bal …` | **balance** | debit | `DEBIT_RE` has `withdrawn` but not `withdrawal`; falls through to `BALANCE_RE` |
| C3 | `Thank you for using your HDFC Bank Debit Card XX1234 for Rs.1,500.00 at BIG BAZAAR …` | **balance** | debit, Big Bazaar | no debit verb; card + amount pattern absent |
| C4 | `Payment of Rs.1,200.00 made to BESCOM via BillDesk …` | **unknown** (422) | debit, Bescom | `made at` is in `DEBIT_RE`, `made to` is not |
| C5 | `Rs.2,000.00 debited from A/c XX1234 for UPI Lite top-up` | debit (captured as ₹2,000 expense) | self-transfer, drop | no transfer class |
| C7 | `Your txn of Rs.25,000.00 at CROMA … has been converted to EMI` | debit (a second ₹25,000 capture) | notice, drop | `txn of` matches; no EMI-conversion notice rule |
| C8 | `Transaction alert: Debit Card XX1234 Rs.500.00 at BIG BAZAAR …` | **balance** | debit | no verb |
| C9 | `A/c XX1234 Dr Rs.500.00 on 07-10-26 UPI/P2M/…/SWIGGY` | **balance** | debit, Swiggy | `\bdr\.?(?=\s+(?:from|to|of|for))` (line 296) requires from/to/of/for after Dr |
| C10 | `RAHUL SHARMA is requesting Rs.500.00 from you on Google Pay` | unknown | request | `REQUEST_RE` lacks "is requesting" |
| C11 | `Rs.1,200.00 requested by zomato@hdfcbank via UPI. Approve …` | unknown | request | lacks "requested by" |
| M1 | `… towards UPI AutoPay mandate for SPOTIFY` | merchant **"Autopay Mandate"** | Spotify | `cleanMerchant` has no generic-word check; no `for NAME` candidate |
| M2 | `… towards CREDIT CARD BILL PAYMENT` | merchant **"CRED"** | Credit Card Bill Payment | `brandFor` prefix match for keys ≥ 4 letters (line 195): `credit…` starts with `cred` |
| M3 | `… to A/c XX5678. Ref … Call 18002662 to raise a dispute` | merchant **"Raise A Dispute"** | none | `to …` candidate scans the safety trailer |
| M4 | `… to VPA paytmqr5c5kj9@ptys` | merchant **"PAYTMQR5C5KJ"** | none (QR id) | `merchantFromVpa` QR rule needs 5+ digits; new Paytm ids are mixed alnum |
| M5 | `… to VPA paytm.s1ab2c3d@pty` | **"S1AB2C3D"** | none | same |
| M6 | `… Info: UPI-628112345678-ZOMATO LTD.` (HDFC, no VPA) | merchant missing | Zomato | `bestToken` leaves `UPI-` after digit removal, so the `^UPI$` exclusion misses it |
| M8 | Amex: `… on your AMEX card ** 61005 at BLUE TOKAI on 7 October 2026 at 20:15 IST. Not you?` | merchant **"Ist"**, bank none | Blue Tokai, American Express | time-candidate regex (line 267) swallows `IST.`; Amex not in bank lists |
| M9/B1–B4 | Canara, Union, Indian Bank, RBL, SBI Card (`VM-SBICRD` → "SBI") | bank missing / wrong | named | `BANK_SENDERS`/`BANK_NAMES` (lines 146–157) cover 14 issuers; `SBICRD` matches `/SBI/` |

Also observed (not counted above): `INDIGO PAINTS` → "IndiGo", `APOLLO TYRES` → "Apollo", `DISTRICT 7 CAFE` → "District" (prefix matching is too eager); `cafecoffeeday.hsr@icici` → "Cafecoffeeday HSR" (acceptable); `zerodhabroking@hdfcbank` → "Zerodhabroking" (users will add "zerodha" as an ignore word, fine).

**Why it matters.** Every `unparsed` is a 422 to the phone automation and a "Couldn't read the amount" row; every misclassification is either a silently lost payment (C2/C3/C8/C9) or a bogus "You spent ₹2,000 at Payment — add to Goa?" push (C1/C5/C7). Merchant junk lands directly in the expense description.

**Fix (verified; full diff in `scratchpad/parser-probe/sms-parse.patch.diff`, 18 edits, repo suite still green):**

```ts
// amounts
const AMOUNT_RE = new RegExp(`(₹|\\bINR|\\bRs(?![a-z])\\.?|\\b(?:${FOREIGN})\\b)\\s*\\.?\\s*(${NUM})`, 'gi')
const AMOUNT_AFTER_RE = new RegExp(`(?<![\\d.,])(${NUM})\\s*(INR|Rs\\.?|${FOREIGN})\\b`, 'gi')  // "25.00 USD", "250.00 INR"
// in findAmount(): after the AMOUNT_RE loop, run the same NOT_TXN_BEFORE-guarded loop over AMOUNT_AFTER_RE, then BARE_AMOUNT_RE.

// classification
export type SmsKind = … | 'transfer' | 'unknown'
const REQUEST_RE = /\b(?:requested (?:money|payment|rs|inr|₹)|has requested|is requesting|requesting (?:money|payment|rs|inr|₹)|requested by|requests? (?:rs|inr|₹)|collect request|payment request|request(?:ed)? (?:for|of) (?:rs|inr|₹)|sent you a (?:payment )?request)/i
const TRANSFER_RE = /\b(?:(?:to|added to|loaded (?:to|in)|top[- ]?up(?: of| to)?)\s+(?:your\s+)?UPI Lite\b|UPI Lite\s+top[- ]?up|own (?:account|a\/c)|self[- ]transfer|added to (?:your )?wallet)\b/i
const NOTICE_RE = /\bconverted (?:to|into) (?:an? )?EMI\b|\bEMI conversion\b/i
const DEBIT_RE = /\b(?:debited|debit(?:ed)? (?:of|for|by)|spent|withdrawn|withdrawal|deducted|sent|paid|charged|purchase(?:d)?|txn of|transaction of|used (?:at|for|on)|done at|made at|made to)\b|\btxn(?: of)?(?=\s*(?:₹|inr\b|rs\b))|\bdebit(?=\s*(?:₹|inr\b|rs\b))|\bdr\.?(?=\s*(?:from|to|of|for|₹|inr\b|rs\b))|\b(?:debit|credit|atm) card\b(?:(?!due|statement|bill|limit|[.;])[^])*?(?:₹|inr\b|rs(?![a-z])\.?)\s*\.?\s*\d/i
const CREDIT_RE = /\b(?:credited|received|deposited|refund(?:ed)?|cashback (?:of|credited)|added to (?:your )?(?:wallet|a\/c|account)|sent to you|paid you|transferred to you)\b/i
// classify(): after FAILED_RE →  if (TRANSFER_RE.test(text)) return 'transfer'; if (NOTICE_RE.test(text)) return 'reminder'
// ("sent to you" works because the credit match index equals the debit index, so `d < c` is false and it falls to credit.)

// merchants
for (const [k, v] of Object.entries(BRANDS)) if (k.length >= 5 && key.startsWith(k)) return v   // was 4: kills CRED/IKEA/UBER prefix hits
const NOT_MERCHANT = /^(?:you|your|u|the|a\/c|ac|acct|account|card|block|report|dispute|raise|register|visit|approve|decline|unsubscribe|stop|know|check|avoid|mobile|bank|beneficiary|self|us|customer|date|behalf|ur|hold|rs\.?|inr)\b/i
const DESCRIPTIVE = new Set([...GENERIC, 'autopay', 'mandate', 'emandate', 'charges', 'bill', 'transfer', 'txn', 'self', 'via', 'using', 'thru'])
const TRAILER_RE = /\b(?:Not you|Not u\b|If not|Call\s*\d|SMS\s+BLOCK|To block|Report (?:fraud|at)|Dispute\?)/i
// cleanMerchant(): after the prefix strip add .replace(/^\d[\d\s*#-]*\s+(?=[A-Za-z])/, '') and, before the brand lookup,
//   if (s.toLowerCase().split(/[^a-z]+/).filter(Boolean).every((w) => DESCRIPTIVE.has(w))) return undefined
// bestToken(): .map((p) => p.replace(/^[\s-]+|[\s-]+$/g, ''))          // "UPI-" → "UPI" so the exclusion fires
// findMerchant(): const text = input.split(TRAILER_RE)[0].replace(/\b(?:Mr|…)/g, '')   // never read the safety trailer
//   time candidate: /\d{1,2}:\d{2}(?::\d{2})?(?:\s*IST\b)?\.?\s+(?!IST\b|Avl\b|Bal\b)([A-Za-z][A-Za-z0-9 &'.-]+?)\s+(?:Avl|Not you|Bal)\b/i
//   add after the `on` candidates:
//   const forRe = new RegExp(`\\bfor\\s+(?!rs\\b|inr\\b|₹|a\\s|an\\s|the\\s|your\\s|upi\\b|txn|transaction|payment|dispute|security)(.+?)(?=\\s+${STOP}\\b|\\s*[.,;(]|$)`, 'gi')
// merchantFromVpa(): strip ^(?:upi|paytm|bharatpe|rzp|phonepe|gpay)(?=[a-z]{3,}) and change the filter to
//   .filter((t) => t.length >= 2 && !GENERIC.has(t) && (!/\d/.test(t) || brandFor(t)))   // mixed alnum ids are QR ids, not names

// banks: prepend to BANK_SENDERS (order matters: SBICRD before /SBI/)
[/SBICRD|SBICARD/i, 'SBI Card'], [/AMEX/i, 'American Express'], [/CANBNK|CANARA/i, 'Canara Bank'], [/UNIONB|UBOI/i, 'Union Bank'],
[/INDBNK/i, 'Indian Bank'], [/BOIIND/i, 'Bank of India'], [/IOBCHN|IOBNET/i, 'Indian Overseas Bank'], [/CENTBK/i, 'Central Bank of India'],
[/UCOBNK|UCOBK/i, 'UCO Bank'], [/IDBI/i, 'IDBI Bank'], [/RBL/i, 'RBL Bank'], [/DBSBNK|DBS\b/i, 'DBS Bank'], [/HSBC/i, 'HSBC'],
[/SCBANK|STANC/i, 'Standard Chartered'], [/CITI/i, 'Citi'], [/BNDHNB|BANDHN/i, 'Bandhan Bank'], [/JUPITR|JUPITER/i, 'Jupiter'],
[/EPIFI|FIMNEY/i, 'Fi'], [/NIYO/i, 'Niyo'], [/SLICE/i, 'slice'], [/ONECRD|ONECARD/i, 'OneCard'], [/JIOPBL|JIOPAY/i, 'Jio Payments Bank'],
[/FINOPB/i, 'Fino Payments Bank'], [/EQUITS|EQUITAS/i, 'Equitas'], [/UJJIVN|UJJIVAN/i, 'Ujjivan'], [/SIBLTD/i, 'South Indian Bank'],
[/KTKBNK/i, 'Karnataka Bank'], [/KVBANK|KVBLTD/i, 'KVB'], [/CSBBNK/i, 'CSB Bank'], [/DCBBNK/i, 'DCB Bank'], [/JKBANK/i, 'J&K Bank'],
// and the matching BANK_NAMES (American Express|\bAmex\b, \bSBI (?:Credit )?Card\b before \bSBI\b, \bCanara\b, Union Bank, Central Bank, \bIndian Bank\b,
// Indian Overseas|\bIOB\b, Bank of India|\bBOI\b *after* Union/Central, \bUCO Bank\b, \bIDBI\b, \bRBL\b, \bDBS\b, \bHSBC\b, Standard Chartered, \bCiti(?:bank)?\b, …)
```
Exact sender IDs beyond the ones already in the file are [Guessing] (they are DLT header suffixes; verify against real SMS). The bank *names* in text are [Certain].

Also add the 39 probe strings to `shared/sms-parse.test.ts` so coverage stops being "the strings the author typed"; the test table format already supports it. And add `'transfer'` to `interpret()`'s non-debit branch (it already returns `not_a_debit` for any kind other than `debit`/`unknown`, so no change is needed there, but the log text "Ignored: not a debit (OTP, credit or alert)" should mention transfers).

Coverage summary (asked for explicitly): handled today — HDFC, ICICI, SBI, Axis, Kotak, Yes, IDFC First, IndusInd, PNB, BoB, AU, Federal, Paytm PB, Airtel PB, generic credit-card "spent … at", UPI VPAs, lakh grouping, `₹/Rs/INR` prefix forms, dd-mm-yy / dd-Mon-yy / yyyy-mm-dd / "Oct 07, 2026" dates. Not handled — Canara, Union, Indian Bank, BOI, IOB, Central, UCO, IDBI, RBL, DBS, HSBC, SC, Citi, Amex, SBI Card (mis-attributed to SBI), Bandhan, Jupiter/Fi/Niyo as brands (Federal is detected only if named), slice/OneCard, Jio/Fino PB; "Rs500" (no separator); amount-first currency; UPI Lite top-ups (captured as spend); UPI Lite payments *are* fine; RuPay-credit-on-UPI is fine ("spent … via UPI to vpa"); Apple Pay/Google Wallet do not produce SMS in India (card SMS covers the tap) — nothing to parse. Collect requests: two of the three common phrasings are missed. OTP filtering is good (including the "never share OTP" trailer). Declined/failed/reversed: good. EMI/autopay reminders ("will be debited"): good; EMI *conversion* notices: bad (C7).

#### H2. Android share-sheet text path bypasses the SMS parser, masking, classification and dedupe — `src/lib/capture.ts:278-296`, `src/pages/Share.tsx`

`captureFromSharedText()` uses `parsePaymentScreenshot` + `findAmounts` (the OCR parser), never `parseBankSms`. Proven with an esbuild bundle (`scratchpad/parser-probe/share-bundle.mjs`):

```
Rs.250.00 debited from a/c 50100123456789 … to VPA swiggy@icici …  → merchant "VPA", note = full text incl. "50100123456789" and the balance
Rs.500.00 credited to HDFC Bank A/c XX1234 from VPA rahul@okicici   → a ₹500 capture at "HDFC Bank"  (a credit!)
482913 is your OTP to complete the transaction of Rs.840 at Swiggy   → a ₹840 capture at Swiggy      (an OTP!)
```
No `ref`, so sharing the same SMS twice duplicates it, and `note` (≤ 200 chars, `line 294`) stores the unmasked text while the webhook path masks (`capture-core.ts:88`). Docs §5 promise "Text containing an amount … becomes a capture", which is exactly the problem. [Certain]

**Fix.** In `captureFromSharedText`, run `parseBankSms(text)` first: if `kind === 'debit'` build the draft from it (`amount`, `currency`, `merchant ?? 'Payment'`, `date`, `ref` → `sanitiseRef('sms_' + ref)`, `note: maskSms(text, 200)`, `card: bank + account`); if `kind` is anything else but `unknown`, return a typed rejection so `Share.tsx` can say "That's a credit/OTP, not a payment"; only fall back to the OCR parser for `unknown`. Always `maskSms` the note.

#### H3. Gemini fallback sends unmasked SMS (including non-bank SMS) to Google by default — `functions/src/capture.ts:106-116`, `functions/src/ai.ts:233-244`

- `prefs.aiSms` defaults to `true` (`shared/capture-filters.ts:29`, `resolveUserAi` in `shared/ai-config.ts:74`).
- The trigger is `(!it.ok && it.reason === 'unparsed') || (it.ok && !it.parsed.merchant)`: so a *successfully parsed* debit with a QR-code payee also goes to Gemini — the settings copy "Only messages the built-in reader misses go to Gemini" (`src/components/AiSettings.tsx:98`) is not true. [Certain]
- `readSms(uid, req.text)` → `text.slice(0, 1000)` is the raw body: full account numbers, balances, names, and — because the on-phone filters are loose (next finding) — personal SMS like "Dinner at 8? Bring Rs 500" which classify as `unknown` and are forwarded to Gemini. The `SMS_PROMPT` even frames every input as "a bank or UPI SMS from India".
- The server-side stored copy is masked; the copy sent to a third party is not. Nothing in the wizard's Privacy section or `docs/AUTO_CAPTURE.md §3.5` mentions Gemini.

**Fix.** (1) Send `maskSms(req.text)` (accounts, cards, balances already stripped; refs kept). (2) Only call the AI when the message looks like a bank message: `ACCOUNT_REF_RE.test(text) || findBank(text, sender) || /\bUPI\b|VPA|IMPS|NEFT/i.test(text)`; drop the "debit without merchant" trigger or restrict it to when `vpa` is undefined and no `at/to` phrase exists. (3) Either default `aiSms` to `false` for the SMS feature or make the wizard's Privacy block say "Messages the app can't read are sent to Google Gemini (off in Profile → AI)". (4) Add a unit test for `handleCapture` with an injected `readSms` (it is injectable at `capture.ts:86` but no test uses it — `grep handleCapture` hits only the implementation).

#### H4. Wizard and docs say outside-trip debits "wait in the Inbox"; the default drops them — `src/pages/AutoCaptureSetup.tsx:92`, `docs/AUTO_CAPTURE.md §3.1/§3.2`, `functions/src/capture.ts:143`

Default `outsideTrips: false` (`functions/src/lib/prefs.ts:26`) → `reject('outside_trip')`, nothing stored. But the scope option the wizard pre-selects reads *"All my trips — Matches any trip whose dates include the payment. Debits outside every trip wait in the Inbox, without a notification."* and §3.2 says "A debit outside every trip still lands in the Inbox, but without a push", §3.1 "An unscoped debit outside every trip is saved but only pushes…". §3.6 and `AutoCapture.tsx:224` describe the real behaviour. A friend who sets this up outside a trip window will send a test, see "Not captured (outside_trip)", and conclude it is broken. [Certain]

**Fix.** Make the copy conditional on `prefs.outsideTrips` (the wizard already watches prefs): "…Debits outside every trip are ignored. Want them in the Inbox? Turn on *All bank & UPI payments* below." Fix §3.1/§3.2 of the doc to match §3.6. Better product fix: default `outsideTrips: true` when the user has **no trip with dates at all** (today the feature captures nothing for such users and the wizard still lets them finish).

#### H5. The 36 KB wizard is not completable by a non-technical friend — `src/pages/AutoCaptureSetup.tsx`

What a user must do today (iOS, shared Shortcut path): read a 5-step page; pick a scope; create a key; copy it; tap "Add Shortcut"; paste the key into an import question; go to Shortcuts → Automation → Message; set *Message Contains* to **a single space** ("iOS needs one field filled"); toggle Run Immediately; turn off Notify When Run; pick Run Shortcut → "Split Now SMS"; expand it; set Input = Shortcut Input; come back; tap a test button that only tests the backend (`TestSender` POSTs from the browser, `AutoCaptureSetup.tsx:415`); read a "sender field" explainer; read an "If it doesn't fire" list. Android: install MacroDroid; create a macro; add a trigger; find the regex toggle; paste a 110-character Java regex; add an HTTP action; paste a JSON body; verify magic-text highlighting; read a battery-saver section per OEM; read "Body without JSON". That is 20–30 taps across three apps with four copy/paste round-trips. The step-5 "You're set" summary and the keys list, privacy block and footer link are a second screen's worth of text. [Certain]

What can be automated / what must stay manual, and the proposed flow, are in §5 below (it is a product proposal, not a one-line fix).

### MEDIUM

#### M1. On-phone filters are loose in one direction and narrow in the other — `src/lib/sms-setup.ts:62,176-177`, `docs/AUTO_CAPTURE.md §3.3`

- `ANDROID_FILTER_REGEX` forwards any SMS with `inr` or `rs <digit>` or `₹<digit>`: probe shows *"Hey! Dinner at 8 tonight? Bring Rs 500 for the cake."*, *"Mera number save kar lo, Rs 200 bhejna hai"* and Zomato COD notices are FORWARDED (then sent to Gemini, H3). The explanatory copy says "OTPs and personal messages never leave the phone" — personal messages with an amount do. [Certain]
- The manual iOS path uses `DEBIT_KEYWORDS = ['debited', 'spent', 'sent Rs']`: it never fires for Paytm/PhonePe-bank "Paid Rs…", HDFC card "Txn Rs.840.00 On…", AU "Debit INR…", IndusInd/Kotak "has been used for INR…", BoB "Rs.450.00 Dr. from…", Axis "INR 250.00 debited" (fires; fine), ATM "withdrawn" — i.e. five of the 28 formats in the parser's own test table. [Certain]

**Fix.** Android/shared-Shortcut regex: require a bank marker as well as an amount: `(?is)^(?!.*\b(otp|one[- ]time|verification code|password)\b)(?=.*\b(a/c|ac|acct|account|card|upi|vpa|imps|neft|bank|atm)\b).*(debited|debit|dr\.?|spent|paid|sent|withdraw|used for|txn|purchase|inr\s*\d|rs\.?\s*\d|₹\s*\d).*$` — tested mentally against the 28 repo samples (all contain a/c, card, UPI or bank) and against the three personal strings (none do). Add "Paid", "Txn Rs", "used for", "Dr." to `DEBIT_KEYWORDS` for the manual iOS path, or (better) drop the manual path from the wizard and ship only the shared Shortcut (§5).

#### M2. Scoped key silently turns into an all-trips key when the group is deleted or left — `functions/src/capture.ts:124-137`

`scopeId` is set from the token, `loadGroup` returns `undefined` when `memberUids` no longer contains the user (or the doc is gone), and the code falls into the `else` branch: the payment is matched against *all* trips and, with `outsideTrips` on, stored unsorted. The comment says "a group you're no longer in is ignored", which is the opposite of what a user who created a "Goa only" key expects. The wizard shows such keys as "Group no longer available" (`AutoCaptureSetup.tsx:168`) but they keep working. [Certain]

**Fix.** `if (scopeId && !scoped) return reject('outside_trip', parsed)` (or a new `reason: 'bad_scope'` mapped to 200 with log text "Ignored: this key's trip no longer exists — create a new key"). Add an emulator test: token scoped to a group the user left.

#### M3. Inbox card ignores the server's `suggestedGroup`; prompt and card can disagree — `src/pages/Inbox.tsx:125-126` vs `src/pages/Capture.tsx:88`

`CaptureCard` computes `rankGroupsForCapture(groups, c).best` only; the webhook writes `suggestedGroup` (the scoped group, or `pickTrip`'s choice which uses tightest-window→recency, no currency tie-break, `functions/src/lib/trips.ts:30-34`). A capture from a key scoped to "Goa" whose date also falls in a tighter "Wedding" window shows "Add to Wedding" on the card and pre-selects "Goa" on the prompt. [Certain]

**Fix.** In `CaptureCard`: `const best = c.suggestedGroup && groups.some((g) => g.id === c.suggestedGroup) ? c.suggestedGroup : rankGroupsForCapture(groups, c).best`. Align `pickTrip` with `rankGroupsForCapture` (add the currency tie-break) or document the difference.

#### M4. Duplicate suppression without a reference is a one-minute window keyed on the merchant string — `functions/src/lib/ids.ts:13-18`

Card alerts have no ref (HDFC card, Axis card, IndusInd, Kotak card samples all parse with `ref: undefined`). The id becomes `(uid, amount, currency, merchant, minute-of-receivedAt)`. Two different automations (or MacroDroid + a Tasker profile, or iOS "debited" + "spent" automations both matching one SMS) that deliver across a minute boundary create two captures; conversely two genuine ₹100 coffees at the same till inside one minute collapse into one. `receivedAt` is only sent by the wizard's test, so in practice this is the server clock. [Certain]

**Fix.** Hash the masked text instead: `sha(uid + '|txt|' + maskSms(text).toLowerCase().replace(/\s+/g,' '))` when there is no ref (identical SMS ⇒ identical id regardless of timing; two real purchases produce different SMS because the time or balance differs). Keep the ref-based id when a ref exists.

#### M5. `captureInbox` (iOS Apple Pay REST path) has no rate limit and the claim loop is unbounded — `firestore.rules:160-180`, `src/data/firebaseRepo.ts:719-733`

Rules can only check the token exists; anyone holding a leaked key can write unlimited ≤300-byte docs. `claimInbox` then `getDocs` *all* of them on every visibility change and issues one batch per doc. With 10k docs that is 10k reads + 10k writes + 10k deletes per app open, on the victim's bill, with no cap and no "revoke this key" prompt. Also `fire()` is fire-and-forget (`firebaseRepo.ts:78-80`), so `moved` is reported before any commit succeeds. [Certain] (Threat requires a leaked token; tokens live in the user's Shortcut, so Low likelihood, Medium impact.)

**Fix.** `limit(50)` on the claim query and loop until empty with a hard cap of e.g. 500 per session; batch 100 ops per `writeBatch`; await the commits. Longer term, route this path through the same Cloud Function (`/api/capture` already accepts `amount/merchant/ts/ref` structured fields and rate-limits per token), and retire the REST write — the docs themselves note App Check would require this anyway (§7).

#### M6. Masking leaves short account numbers, phone numbers and names in the stored `raw` — `shared/sms-parse.ts:363-374`

Probe: `A/c 1234567` (7 digits) is not masked (the keyword rule needs ≥ 9 digits: `(\d{5,})(\d{4})`); `your mobile 9876543210` is not masked (10 digits < 13); `To RAHUL SHARMA` stays. Account numbers at PSU banks are 11–16 digits (masked), but co-operative/older accounts can be 7–8. The user's own mobile number is PII. [Certain]

**Fix.** Keyword rule → `(\d{3,})(\d{4})\b` (mask anything ≥ 7 digits after a/c|card); add `(?:mobile|mob|ph|phone|number)\s*[:.-]?\s*\+?\d{10,12}` → `XX` + last 4; consider masking `To/From <NAME>` for P2P (keep it in `merchant`, which the user sees, but not in `raw`). Also: `raw` and `note` have no retention — captures that are `assigned`/`dismissed` keep the masked SMS forever. Add a scheduled job (the daily reminder function exists) to strip `raw` from captures older than 90 days or delete `dismissed` ones after 30.

#### M7. `writeLog` pays ~30 document reads per webhook call — `functions/src/capture.ts:75`

`col.orderBy('at','desc').offset(CAPTURE_LOG_KEEP).limit(20).select().get()`: Firestore bills the skipped documents of an `offset` as reads [Certain: Firestore pricing, "offset … you are charged a read for each skipped document"]. Each captured or rejected SMS therefore costs 1 write + ~30 reads + the trimming deletes. Not a correctness bug, but it is the most expensive line in the function and runs on every request.

**Fix.** Trim only every Nth call (e.g. when `Math.random() < 0.1`) or keep a tiny counter on `users/{uid}` and trim when it passes 40; or let the client delete beyond 30 when it renders "Recent activity".

#### M8. `CaptureAlert` drops an alert when a second capture arrives — `src/components/CaptureAlert.tsx:26-31`

The effect on `[captures]` picks the first unseen pending capture and `setCurrent(fresh)` even while another is showing; the first is marked `shown` and never shown again. Two UPI payments in quick succession (very common: autopay + lunch) ⇒ one banner. Also `APP_START` is compared against the *server's* `createdAt` — fine for the webhook, but captures claimed from `captureInbox` get a client `createdAt` and always pop. [Certain]

**Fix.** Keep a queue: push unseen ids, show the head, advance on dismiss/timeout; or show "2 new payments — sort them?" linking to `/inbox` when more than one is pending.

### LOW

- **L1. Doc/code drift inside `docs/AUTO_CAPTURE.md`.** §3.1 says `card = bank + last 4 digits` and "Credits, refunds, OTPs … are `not_a_debit`" (true), but §3.2/§3.1 "lands in the Inbox" (H4), §5 "Text containing an amount becomes a capture" (H2), §3.5 says nothing about Gemini (H3), and "Tests: `functions/src/lib/capture-settings.test.ts`" exists but `functions/src/capture-settings.test.ts` named in this task does not. The "Each user (≈ 90 seconds)" claim in the Shortcut section is optimistic by a factor of five.
- **L2. Anonymous (table-guest) users can create capture tokens** — `firestore.rules:144-147` only requires `signedIn()`; the rest of the app treats anonymous users as guests. Add `request.auth.token.firebase.sign_in_provider != 'anonymous'`.
- **L3. Test coverage gaps.** Emulator test uses one HDFC string; no test for scoped-key-with-left-group (M2), AI fallback (H3), `paused`/`below_min`/`ignored` end-to-end, `text/plain` with quotes, or the `captureInbox` claim. `shared/sms-parse.test.ts` has 28 debit samples, all author-written; add the probe strings.
- **L4. `transactionDate` accepts an SMS date up to 366 days in the future** (`functions/src/lib/time.ts:31`) so a bank typo ("07-10-27") files a 2027 expense that matches no trip and vanishes as `outside_trip`. Tighten to +7 days (the only legitimate future case is the wizard's test for an upcoming trip, which could pass `receivedAt` inside the window instead).
- **L5. `rateLimits/{hash}` docs are never deleted** — one per token forever (plus `ai_*` docs per user). Add a TTL field and a Firestore TTL policy.
- **L6. `senderId` keeps anything ≤ 24 chars** including "Mom" or a phone number; fine, but `findBank` then only sees the text. Not a bug — noting that the "sender" plumbing buys almost nothing on iOS (the Shortcut sends the whole body) and could be dropped from the UI explanation entirely (one fewer paragraph).
- **L7. "Send a test" tests the server, not the automation** (`AutoCaptureSetup.tsx:401-423`); the result card says "Captured ₹250 at Swiggy" and a user will reasonably believe their phone is set up. See §5 for the replacement.
- **L8. `interpretResponse` treats any 2xx non-JSON as "not deployed"** (`sms-setup.ts:139`), which is right for the SPA fallback; but a 500 HTML error page from Hosting gives "The server answered 500" with no retry hint. Minor.

---

## 3. Already good (don't "fix" these)

- Token model: 140-bit random id as the secret, `allow update: if false`, owner-only list/delete, scoped tokens validated against membership at creation, bearer/`?t=`/body token all accepted. Rate limit per token in a transaction. `bad_token` = 401, handled outcomes = 200 so automations never retry, `unparsed` = 422 to surface it.
- Idempotency via `ref.create()` + ALREADY_EXISTS → `duplicate` is race-safe; same-id move from `captureInbox` to `captures` is retry-safe.
- Order of checks (token → rate limit → paused → parse → filters → scope → dedupe → store + push) is right, and the activity log never stores SMS text.
- `maskSms` on the stored copy, `raw` capped at 500 chars, `card` is bank + last 4 only.
- `matchIgnoreWord` is Unicode-aware with word boundaries and escaped regex characters; `normaliseIgnoreWords` dedupes case-insensitively; rules mirror the limits.
- OTP detection handles the "never share your OTP" trailer and the leading-code form; future-tense "will be debited" is rewritten before debit detection; promos need no account reference to be promos.
- Date handling: Indian dd-mm order, glued dates ("07Oct26", "07OCT2026"), IST via `Intl` in `istDate`, SMS date preferred over receipt date within a sane window.
- The in-app simulated webhook for demo mode uses the same shared parser and writes the same log rows.
- Inbox triage basics are solid: one-tap "Add to {trip}" that lands in a pre-filled expense form, "Not shared" with Undo toast, "Recently handled" with restore/delete, badge counts via `useInbox`, a default tab that jumps to Updates when nothing is to sort, and an empty state that links to setup.
- The capture prompt (`Capture.tsx`) honours `suggestedGroup`, shows the FX note when currencies differ, offers Personal / Not shared / Decide later, and "Nothing is added until you save".
- `CaptureAlert` steps aside for the update banner and hides itself on `/capture` and `/inbox`.

---

## 4. Open questions for the product owner

1. **Default for `outsideTrips`.** Should users with no dated trip get "All bank & UPI payments" on by default (so the feature does *something* for them), or should the wizard refuse to finish until a trip has dates? Today it finishes and then drops everything.
2. **Gemini by default for SMS.** Is sending (masked) bank SMS to Google acceptable as an opt-out default, or should the SMS fallback be opt-in (images can stay opt-out)? This is a privacy-posture decision, not an engineering one.
3. **Retire the Firestore-REST Apple Pay path?** It exists for iOS Transaction automations, which do not fire for UPI/card taps in India. Keeping it costs a second write path with its own rules, no rate limit, and a 60-line "Advanced" section in Profile.
4. **Ship the shared Shortcut and a MacroDroid template as first-class assets** (they need an owner's iPhone/Android once). Without them the wizard cannot be simplified below ~10 manual steps.

---

## 5. Proposed onboarding (answering "drastically simpler")

**What can be automated**
- Key creation and copying: create the unscoped key automatically the first time the user opens the wizard; copy it to the clipboard when they tap *Install* (so the iOS import question is a long-press → Paste).
- Scope: default to *All my trips*; move "one trip only" under *Advanced*. One key per user, not per scope.
- Android: host the owner-exported `.macro` template and, at download time, string-replace the placeholder token inside the JSON on the client (`fetch(template).then(t => t.replace('PASTE_KEY', token))` → Blob → `<a download>`), so the user imports a file that already contains their key and the server URL. MacroDroid import is "Macros → ⋮ → Import" [Likely: MacroDroid docs; the schema is undocumented but we only replace a string inside an exported file, we do not generate one].
- Verification: replace the browser-side "Send a test" with a live *Waiting for your phone…* state that watches `captureTokens/{token}.lastUsedAt` and `captureLog` (both already exist) and flips to "Your phone forwarded a message at 14:32 — you're done" the moment anything arrives. Tell the user how to trigger a real message: "Send ₹1 to a friend on UPI, or ask them to text you *Rs.1 debited test*."
- Platform detection (already done), battery-saver instructions narrowed to the detected OEM only (UA gives Samsung/Xiaomi/etc. coarsely), everything else behind "Other phones".

**What must stay manual** (platform rules): on iOS, creating the Message automation (Apple does not allow sharing automations) and pasting the key into the import question; on Android, installing MacroDroid, granting SMS permission, importing the macro, and the battery exemption.

**Proposed flow (3 screens, no step numbers)**

Screen 1 — *Turn on auto-capture*
> **Catch your payments automatically.**
> When your bank texts you about a payment, your phone sends that text to Split Now. We ask "add this to your trip?" — nothing is added until you say yes.
> OTPs, credits and balance alerts are ignored. Account numbers are masked before anything is saved.
> [ Set up on this iPhone ]  /  [ Set up on this Android ]
> (small) Takes about 3 minutes. Works with any bank that sends SMS.

Screen 2 (iOS) — *Two things to do in Shortcuts*
> **1. Add the Split Now shortcut.** Tap *Add Shortcut*. When it asks for your key, long-press the box and tap *Paste* — we've already copied it.
> [ Add Shortcut ]
> **2. Make it run on every bank SMS.** In Shortcuts, tap *Automation* → *+* → *Message*. Leave *Sender* as it is, type a single space in *Message Contains*, choose *Run Immediately*, then *Next* → *Run Shortcut* → *Split Now SMS* → *Done*.
> (illustrated with the existing MockRow component, one mock, nothing else)
> [ I've done both ]

Screen 2 (Android) — *Install MacroDroid, import one file*
> **1.** [ Get MacroDroid ] (free)
> **2.** [ Download your Split Now macro ] — then in MacroDroid: *Macros* → ⋮ → *Import* → pick the file → allow SMS.
> **3.** Settings → Apps → MacroDroid → Battery → *Unrestricted* (so your phone doesn't stop it tomorrow).
> [ I've done this ]

Screen 3 — *Waiting for your phone…* (live)
> We'll light this up the moment your phone forwards a message. To try it now, pay anyone ₹1 on UPI.
> ○ Waiting…  → ● **Got it: ₹1 to Rahul, 14:32.** Auto-capture is on.
> Only payments dated during a trip are kept. [ Keep every payment instead ]  ·  Change this later in Profile → Auto-capture.

Everything else on today's page (scope picker, sender explainer, regex, JSON body, "Body without JSON", keys list, privacy details, the five-item summary) moves to Profile → Auto-capture → *Advanced*.

---

## 6. Inbox and CaptureAlert UX notes (brief)

- Inbox: good bones (see §3). Two concrete improvements beyond M3/M8: show the parsed bank/VPA line under the merchant ("HDFC ••1234 · swiggy@icici") so a junk merchant is still recognisable; and add a "Personal" quick action on the card (today it is only on the prompt), since "not shared" and "mine" are the two most common one-tap outcomes.
- CaptureAlert: 20-second auto-dismiss with no trace is fine only because the Inbox badge persists; make the dismiss *X* also mark the capture as "seen" so the same alert does not reappear on reload (it won't today only because `APP_START` resets — a side effect, not a design).
- The prompt headline "You spent ₹2,000 at Payment — is this a group expense?" reads badly whenever the merchant is missing; use "You paid ₹2,000 (UPI) — …" when `merchant === 'Payment'`.

---

## 7. Security / privacy of SMS bodies — what is stored where

| Where | What | Masked? | Retention |
|---|---|---|---|
| `users/{uid}/captures/{id}.raw` | SMS text ≤ 500 chars | yes (accounts ≥ 9 digits, grouped cards, balances; **not** 7–8-digit accounts, mobile numbers, names — M6) | forever, incl. after assigned/dismissed |
| `users/{uid}/captures/{id}.note` (share path) | shared text ≤ 200 chars | **no** (H2) | forever |
| `users/{uid}/captureLog` | result, amount, merchant, trip name, device | n/a (no text) | newest 30 |
| `captureTokens/{token}` | uid, label, groupId, lastUsedAt | n/a | until revoked |
| Gemini (Google) | full SMS ≤ 1000 chars when unparsed or merchant missing | **no** (H3) | Google's terms |
| Cloud Functions logs | errors only; no SMS text (`logger.error('capture failed', e)`) | n/a | GCP default |
| Phone → server transport | HTTPS; token in body/header; iOS also sends the whole SMS as `sender` (dropped server-side) | — | — |
| Rejections (`not_a_debit`, `outside_trip`, `paused`, `below_min`, `ignored`, `unparsed`) | nothing stored except the log row (amount/merchant for parsed ones) | — | — |

Nothing in the client logs SMS text (`console.warn('Dropping unreadable capture', d.id, d.data())` in `firebaseRepo.ts:729` prints an inbox doc, which has no SMS text). The wizard's Privacy block is accurate for the webhook path and silent about the share path and Gemini.
