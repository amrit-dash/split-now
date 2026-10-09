# Auto-capture: trip mode and the capture inbox

Goal: when you pay during a trip, the app asks *"₹450 at Zomato: add to Goa trip?"* without you opening it and typing the expense in.

The primary path is **bank/UPI debit SMS → phone automation → webhook → push notification** (§3). Apple Pay Shortcuts, capture links and the Android share sheet (§4–§6) remain as secondary/advanced paths. All of them use the same inbox.

**Nothing is ever added as an expense on its own.** Every capture lands in the **Inbox** as *pending*, and you confirm it (pick a group, *Personal*, or *Not shared*) before anything is saved.

---

## 1. Why a web app can't just read your payment notifications

- **iOS** gives no third-party app, native or web, access to other apps' notifications or to Wallet transaction history. The supported hooks are the Shortcuts app's **Message** automation (incoming SMS, used by §3) and **Transaction** automation (Apple Pay taps, §4), both iOS 17+ with *Run Immediately*.
- **Android** lets *native* apps read notifications through `NotificationListenerService`. A PWA (even an installed WebAPK) runs in the browser sandbox and cannot. Automation apps such as MacroDroid or Tasker *can* read them, and incoming SMS, and forward them to the webhook (§3).
- **Bank data** (open banking / CDR in Australia) needs a server and an accredited data provider. That's Phase 2/3; see §9.

So Split Now gives every automation a single door: a **capture**, sent either as a URL (`/capture?...`) or as a signed-out write to the Firestore `captureInbox` collection.

## 2. Trip mode

A group can have an optional **start date** and **end date** (Group → Settings → *Trip dates*). Either one can be left open.

- While today is inside the window, the group shows a **Live trip** badge on its row and detail page.
- New expenses default to the live trip.
- A capture whose date falls inside a trip window lists that group first and pre-selects it. If several trips match, the one with the shortest window wins, then a matching currency, then the most recently active. If no trip matches, nothing is pre-selected.

## 3. Primary flow: bank/UPI SMS → webhook → push

In India almost every card and UPI payment produces a debit SMS within seconds (*"Rs.450.00 debited from a/c XX1234 on 07-10-26 to VPA zomato@icici (UPI Ref No 6281…)"*). That covers physical cards, online payments and UPI. Apple Pay doesn't (it barely exists in India), so the SMS is the main signal and the Apple Pay Shortcut (§4) is secondary.

```
debit SMS ──► iOS Shortcut "Message" automation / MacroDroid "SMS Received"
          ──► POST https://<host>/api/capture  {token, text, sender, device}
          ──► Cloud Function: verify token → parse SMS → trip window check → dedupe
          ──► users/{uid}/captures/{id} (pending) + FCM push "₹450 at Zomato: add to Goa trip?"
          ──► tap → /capture/{id} prompt → expense form (nothing is saved without you)
```

The in-app wizard is **Profile → Auto-capture → Set up SMS auto-capture** (`/settings/auto-capture`, or `/settings/auto-capture?group=<id>` from a trip's page). It walks through five steps: scope, key, phone setup, test, and a summary of your current capture settings with a link back to **Profile → Auto-capture** (`/profile#auto-capture`), where the settings in §3.6 live.

### 3.1 Webhook contract (v1)

Served by a Cloud Function behind a Hosting rewrite. The client in `src/pages/AutoCaptureSetup.tsx` and `src/lib/sms-setup.ts` is built against exactly this.

- **URL:** `https://<host>/api/capture` (alias `/api/sms`), method **POST**.
- **Body (JSON):**

  | Field | Required | Meaning |
  |---|---|---|
  | `token` | yes | `captureTokens/{token}` doc id |
  | `text` | yes | raw SMS body |
  | `sender` | no | e.g. `AX-HDFCBK` |
  | `receivedAt` | no | ISO 8601 timestamp |
  | `groupId` | no | restrict to one trip (normally unnecessary: a scoped token already names its group) |
  | `device` | no | `ios` · `android` · `other` |

  Also accepted: `application/x-www-form-urlencoded` or `text/plain` bodies (the whole body is `text`), and the token as `Authorization: Bearer <token>` or `?t=<token>`.
- **Success:** `{ ok: true, captureId, parsed: { amount /* minor units */, currency, merchant?, direction: 'debit', ref?, date }, matchedGroupId?, pushed }`
- **Rejection:** `{ ok: false, reason }` with `reason` one of `bad_token`, `not_a_debit`, `unparsed`, `outside_trip`, `duplicate`, `rate_limited`, `bad_request`, and the user-filter reasons `paused` (capture paused, or the matching trip paused), `below_min` (INR debit under the user's minimum) and `ignored` (matched an ignore keyword); see §3.6.
- **HTTP status:** 200 for success and for `not_a_debit` / `outside_trip` / `duplicate` / `paused` / `below_min` / `ignored` (handled; automations must not retry), 401 `bad_token`, 429 `rate_limited`, 400 `bad_request` (also 405 for a non-POST), 422 `unparsed` (looked like a bank message but no amount could be read, or an unclassifiable message), 500 `{ ok: false, reason: 'server_error' }` on an internal error.
- **Structured fields** (instead of, or on top of, `text`): `amount` (decimal, e.g. `840.00`), `currency`, `merchant`, `ts`, `ref`, with the same meaning as the `/capture` URL contract (§6). Structured values win over what the SMS parser found.

**Backend behaviour** (`functions/src/capture.ts`, region `asia-south1`):

- **Parser:** `shared/sms-parse.ts` (also used by the client via `src/lib/sms-parse.ts`, including the demo simulation). Credits, refunds, OTPs, balance alerts, promos, EMI/bill-due reminders, "will be debited" notices, collect requests and failed / declined / reversed transactions are `not_a_debit`. Covers HDFC, ICICI, SBI, Axis, Kotak, Yes, IDFC First, IndusInd, PNB, BoB, AU, Federal, Paytm Payments Bank, Airtel Payments Bank and credit-card spend alerts; amounts with ₹/Rs/INR, commas and lakh grouping; merchants from the VPA (`swiggy@icici` → Swiggy, `q123@ybl` → none), `at …`, `to …`, `Info:` and `UPI/P2M/…/NAME` narrations.
- **Date:** the SMS date if within 60 days before / a year after receipt, else `receivedAt`, else now, in Asia/Kolkata.
- **Rate limit:** 60 requests/hour and 300/day per token (`rateLimits/{hash}`, server-only).
- **Idempotency:** capture id = `sms_` + hash of (uid, bank ref), or of (uid, amount, merchant, minute received) when there's no ref.
- **Stored:** `users/{uid}/captures/{id}` in the normal Capture shape, `source` `sms-ios` / `sms-android` (`sms` for `device: other`), `card` = bank + last 4 digits, `raw` = the SMS with account/card numbers and balances masked (≤ 500 chars). The token gets `lastUsedAt`.
- **Order of checks:** token → rate limit → *paused* → parse (`not_a_debit` / `unparsed`) → *minimum amount* → *ignore keywords* → scope / trip match (trips with `captureOff` are skipped) → *outside trips* setting → dedupe → store + push. Every outcome after the rate limit except `bad_request` is written to the activity log (§3.6), and the token's `lastUsedAt` is set for every request that reaches a user.
- **Push:** a trip match sends *"You spent ₹840 at Swiggy — add to Goa Trip?"* (opens `/capture/{id}`). An unscoped debit outside every trip is saved but only pushes (*"Unsorted payment"*) if the user turned on *Payments outside a trip* in Profile → Notifications (off by default).
- **App Check is not required** on this endpoint (Shortcuts/MacroDroid can't produce a token); the capture token and rate limit protect it.

The wizard's *Send a test* step treats a 404/405 or a non-JSON reply as **"Backend not deployed yet"**. In demo mode it simulates the function locally (`simulateWebhook` + `parseSmsDemo` in the page module, which uses the shared parser in `src/lib/sms-parse.ts`).

### 3.2 Keys and scope

```
captureTokens/{token}   uid, createdAt, groupId?, label?
```

- **Scoped key** (`groupId` set): the function accepts only SMS dated inside that group's `startDate..endDate` (inclusive; a missing end is open-ended). Anything else returns `outside_trip` and is **not stored**. The wizard won't create a scoped key for a group without trip dates and links to *Edit group* instead.
- **Unscoped key** ("All my trips"): the payment is matched against all of the user's trips whose window contains the SMS date (same ranking as §2). A match is stored with `suggestedGroup` and triggers a push. A debit outside every trip still lands in the Inbox, but **without a push**.
- Rules (`firestore.rules`): the owner may create a key with only `uid`, `createdAt`, an optional `groupId` (string ≤ 64, and a group the owner is a member of) and `label` (string ≤ 60). Keys can't be updated; revoke and recreate. Tests in `tests/firestore.rules.test.ts`.
- One key per scope. The Apple Pay path in §4 uses the unscoped key.

### 3.3 iPhone setup (iOS 17+)

**About `sender`.** The shared Shortcut sends `sender` = the whole **Shortcut Input**, because iOS doesn't expose the Message trigger's *Sender* property to a shortcut run from an automation. The server ignores any `sender` that isn't a short sender ID (`senderId()` in `functions/src/lib/request.ts`: at most 24 characters, two spaces, no amounts, `₹`, `@`, `Rs` or `INR`), so users can leave it as it is. Trade-off: the bank is then read from the SMS text, which almost every bank alert includes; for the rare alert that doesn't name the bank the capture has no bank label. Users who'd rather send less can delete the `sender` row from *Get Contents of URL*; nothing else changes. The wizard explains this under *About the "sender" field*.

Option A, if the owner has published the shared Shortcut (`VITE_IOS_SHORTCUT_URL`): tap **Add Shortcut** in the wizard and paste the key when Shortcuts asks (import question). Then create the automations in steps 1–2 and 6 below, each running that shortcut.

Option B, manual:

1. **Shortcuts → Automation → + → Message.**
2. Sender: *Any*. **Message Contains:** `debited`. Choose **Run Immediately** (and switch off *Notify When Run* if your iOS version offers it). Next → **New Blank Automation**.
3. Add **Get Contents of URL**. URL: `https://<host>/api/capture`. Show More → Method **POST**, Request Body **JSON**.
4. Add Text fields: `token` = your key, `text` = **Shortcut Input**, `sender` = Shortcut Input → *Sender* (optional), `device` = `ios`.
5. Done. (Alternative: a **Text** action holding the JSON body from the wizard's *Copy JSON body*, with `[Shortcut Input]` replaced by the variable, passed as Request Body **File**. The JSON fields above are safer, because Shortcuts escapes quotes for you.)
6. Repeat for `spent` and `sent Rs`. *Message Contains* takes one string, so each keyword needs its own automation.

### 3.4 Android setup (MacroDroid)

The wizard shows a **Get MacroDroid on Google Play** button: on Android it opens the Play Store app directly with an intent URL
(`intent://details?id=com.arlosoft.macrodroid#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=…;end`, falling back to the web listing), elsewhere `https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid`. Package id verified against the Play listing ("MacroDroid - Device Automation", ArloSoft).

1. **Macros → +** (Add Macro), name it "Split Now SMS".
2. **Trigger → Call/SMS → SMS Received**: *Any Number*; message content **Contains**, tick **Enable regex**, and paste the on-phone filter (copy button in the wizard, `ANDROID_FILTER_REGEX` in `src/lib/sms-setup.ts`):
   ```
   (?is)^(?!.*\b(otp|one[- ]time|verification code|password)\b).*(debited|spent|paid|sent\s*rs|withdrawn|inr|rs\.?\s*\d|₹\s*\d).*$
   ```
   This is the same filter as the iPhone Shortcut's two *Match Text* steps in one pattern: a negative lookahead drops anything mentioning an OTP / password, then a debit word or an amount is required. `(?is)` = case-insensitive, dot matches newlines (Java regex). Anchored with `.*` at both ends so it behaves the same whether MacroDroid does a full match or a find. Grant the SMS permission.
   *Fallback* when a MacroDroid version has no regex option: *Contains* `debited`, plus two more SMS Received triggers for `spent` and `sent Rs` (any trigger runs the macro). The server still rejects OTPs and credits (`not_a_debit`).
   Why the trigger filter rather than an *If* clause with *Text manipulation*: it is one field instead of three actions, and the macro then never runs (or touches the network) for other SMS.
3. **Action → Connectivity → HTTP Request**: POST `https://<host>/api/capture`, body content type `application/json`, body = the wizard's *Copy JSON body*:
   ```json
   { "token": "<key>", "text": "[sms_message]", "sender": "[sms_number]", "device": "android" }
   ```
   `[sms_message]` / `[sms_number]` are MacroDroid magic text; re-insert them with the magic text (…) button if they don't highlight. If quotes in an SMS ever break the JSON, use `https://<host>/api/capture?t=<key>` with a `text/plain` body of just `[sms_message]`.
4. **Constraints:** none. Save and make sure the macro is enabled.
5. **Battery optimisation:** exempt MacroDroid, or the phone's battery saver will stop it after a day or two. Xiaomi/Redmi/POCO: Autostart on + Battery saver *No restrictions*. Samsung: Battery *Unrestricted* and remove from *Sleeping apps*. Oppo/Realme/OnePlus: *Allow background activity* + Auto launch. Vivo/iQOO: *Background power consumption → Allow* + Autostart. (Menu names vary; dontkillmyapp.com has per-phone guides.) Then check *Recent activity* in Profile → Auto-capture after the next payment.

Tasker equivalent: *Event → Phone → Received Text* (content filter) → *Net → HTTP Request* POST with `%SMSRB` (body) and `%SMSRF` (sender).

If the owner exports a working macro (`.macro` file, MacroDroid → Export) and hosts it, set `VITE_ANDROID_MACRO_URL` and the wizard shows a **Download MacroDroid template** button. MacroDroid has no "import question", so users still paste their key into the HTTP Request body after importing.

[Likely] The *SMS Received* trigger's regex option is evidenced by MacroDroid's macro schema (`sms_content`, `exact_match`, `enable_regex` in ruby-macrodroid's IncomingSMSTrigger) rather than official docs; UI labels can differ between versions, hence the fallback.

### 3.5 Privacy

- The phone automation sends only SMS that match a debit keyword. OTPs, credits and balance alerts are rejected (`not_a_debit`) and not stored.
- The function stores only the parsed fields (amount, currency, merchant, date, reference, sender ID) plus the SMS text with long digit runs (account, card and phone numbers) **masked to their last 4 digits**. The unmasked text isn't kept.
- `outside_trip` rejections store nothing, nor do `paused`, `below_min` and `ignored`.
- The activity log (§3.6) keeps only the outcome, amount, currency, merchant, trip name and device of each request, never the SMS text, and only the newest 30 entries.
- The capture id is derived from the UPI/bank reference, so the same SMS arriving twice (two automations, retries) returns `duplicate`.
- The key is a bearer secret that can only add pending items to its owner's inbox. Revoke it in the wizard's *Your keys* list.

### 3.6 Capture settings and the activity log

**Profile → Auto-capture** (`src/components/AutoCapture.tsx`) holds the settings; they are stored with the push preferences in `users/{uid}/settings/notifications` (client `src/lib/push.ts` + `src/lib/capture-settings.ts`, server `functions/src/lib/prefs.ts`, shared pure logic in `shared/capture-filters.ts`). Writes merge, so the Notifications and Auto-capture sections never overwrite each other. Defaults keep the original behaviour.

| Key | Default | Effect in the webhook |
|---|---|---|
| `capturePaused` | `false` | Master switch. While on, every request answers `{ ok: false, reason: 'paused' }` (HTTP 200) and nothing is stored. |
| `outsideTrips` | `false` | "What gets captured": only debits dated inside a trip, or all debits (the rest land in the inbox unsorted). |
| `minAmount` | `0` | Paise. INR debits below it → `below_min`. Foreign-currency spends are always kept (the field is set in rupees). Max ₹1,00,000. |
| `ignoreWords` | `[]` | Up to 20 strings (≤ 40 chars). Case-insensitive, whole-word match against the SMS text and the merchant ("SIP" matches `NACH/SIP/…`, not "gossip"; spaces match any whitespace) → `ignored`. Suggestions: SIP, mutual fund, rent, credit card bill, EMI, insurance. |

**Per-trip pause:** `groups/{id}.captureOff: true` (the switch on the group's *Trip auto-capture* card, or the *Trips* list in Profile → Auto-capture). Any member may flip it (rules require a boolean) and it applies to everyone in the trip. `pickTrip` skips paused trips; a scoped key for a paused trip, or an unscoped debit dated only inside paused trips, gets `paused` and is not stored, even with *All bank & UPI payments* on.

**Notifications consistency:** *Payments outside a trip* in Notifications is disabled (with an explanation) unless *All bank & UPI payments* is chosen, and both capture toggles are disabled while capture is paused.

**Activity log:** for every request it processes after the token and rate-limit checks, the webhook appends `users/{uid}/captureLog/{autoId}` = `{ at, result, amount?, currency?, merchant?, groupName?, device }` with `result` one of `captured`, `duplicate`, `outside_trip`, `not_a_debit`, `unparsed`, `paused`, `below_min`, `ignored`, then deletes entries beyond the newest 30 (best-effort, in the same invocation). No SMS text is stored. Rules: owner read/delete, no client writes. Profile shows the last 10 as **Recent activity** ("Ignored: outside trip dates", "Captured for Goa", relative time) with *Clear activity*, plus a "Last received …" line per key from `captureTokens/{token}.lastUsedAt`. In demo mode the wizard's simulated webhook writes the same entries to localStorage.

Tests: `functions/src/lib/capture-settings.test.ts`, `src/lib/capture-settings.test.ts`, rules in `tests/firestore.capture-settings.test.ts`.

### 3.7 Research findings (Oct 2026)

Confidence tags: [Certain] primary source / hard evidence, [Likely] multiple consistent secondary sources, [Guessing] inference that hasn't been verified on a device.

**iOS Shortcuts "Message" automation**
- A *Message* personal automation trigger exists with **Sender** and **Message Contains** filters [Certain]. Since **iOS 17**, Message, Email, Wi-Fi and Bluetooth automations support **Run Immediately** without a confirmation tap [Certain: Cassinelli, MacStories iOS 17 review]. iOS 17 forced a "ran your automation" notification. iOS 18 adds a *Notify When Run* toggle that can be switched off [Likely].
- The **Sender** filter only accepts contacts/phone numbers, so it **can't target alphanumeric bank sender IDs** like `AX-HDFCBK`. **Message Contains works for them**, and is the documented workaround [Likely: Apple Developer Forums thread 705659; Indian expense trackers such as Xyra use "Message Contains Rs/INR/debited"].
- **Shortcut Input** is the received message. Passed as text it gives the message body, and the variable exposes a *Sender* property [Likely; not verified on a device for every iOS build].
- *Message Contains* takes a single string with no OR, so one automation per keyword is needed [Likely].
- Only SMS/iMessage/RCS in the **Messages** app trigger it. Bank-app push notifications and WhatsApp don't [Certain].
- In India, Messages' built-in filter is **on by default** and sorts unknown senders into **Transactions/Promotions** [Certain: Apple support 125068]. Whether the Message automation still fires for SMS filed under *Unknown Senders → Transactions* isn't documented. Indian tracker apps report it working with default settings [Guessing/Likely]. The wizard tells users to check the filter if it doesn't fire. Third-party SMS filter extensions have had iOS 18 issues [Likely: Apple Developer Forums 764561].
- Known iOS 18 reliability issue: some automations fire late or only once the phone is unlocked [Likely].
- **Distribution:** a shortcut (not an automation) can be shared as an **iCloud link**. **Import Questions** (Shortcut → Setup → Add New Question) clear a field and ask the importer for it, which is how users paste their key [Certain: Apple Shortcuts user guide]. Automations can't be shared, so every user creates the trigger themselves.
- **A `.shortcut` file can't be generated by the website and installed:** iOS 15+ imports only signed files, and signing needs macOS `shortcuts sign --mode anyone` on a file the Shortcuts app produced [Likely: eclecticlight, macscripter, dev.to write-up]. So the owner builds the shortcut once on an iPhone/Mac and publishes its iCloud link (`VITE_IOS_SHORTCUT_URL`).

**Android**
- **MacroDroid** free tier is ad-supported and limited to **5 macros** [Likely: XDA, Play listing]; one macro with three triggers is enough here. It has an **SMS Received** trigger with content filter (contains/exact/regex) [Certain: macro JSON fields `sms_content`, `option`, `enable_regex` in ruby-macrodroid docs], an **HTTP Request** action with custom body, and SMS **magic text** `[sms_message]` / `[sms_number]` [Likely].
- Google Play policy allows SMS permissions for the **"Device automation"** use case (subject to review) [Certain: Play policy 10208820]. MacroDroid's SMS Received trigger survived the 2019 crackdown, but MacroDroid lost `READ_SMS`/`WRITE_SMS` (inbox access) [Likely: MacroDroid forum]. Receiving SMS is what we need.
- Macros export/import as **`.macro` JSON files** (Macros tab → Import) and through MacroDroid's in-app template store [Likely]. The schema is internal and undocumented (UUIDs, class names), so we **don't generate one from the web**: an untested generated file could import broken. The owner exports a tested macro and points `VITE_ANDROID_MACRO_URL` at it.
- **Tasker** (paid) offers *Received Text* with `%SMSRB`/`%SMSRF` and an HTTP Request action [Likely]. **AutoNotification** can react to bank-app notifications instead of SMS when a bank only pushes in-app [Likely].

Sources: matthewcassinelli.com/automations-run-immediately-shortcuts-notifications · macstories.net/stories/ios-and-ipados-17-the-macstories-review/12 · developer.apple.com/forums/thread/705659 · developer.apple.com/forums/thread/764561 · support.apple.com/en-in/125068 · support.apple.com/guide/shortcuts/apdf330fd3a0/ios (import questions) · xyratrack.in/docs/iphone-automation · eclecticlight.co/2021/10/19/getting-started-with-shortcuts-1-basics · macscripter.net/t/signing-saved-shortcut-files/77766 · dev.to/eugeniya_ivanova_4a58eadc/i-tried-to-build-an-apple-shortcut-from-code-apple-said-no-four-times-4l5d · support.google.com/googleplay/android-developer/answer/10208820 · rubydoc.info/gems/ruby-macrodroid (IncomingSMSTrigger) · tapatalk.com/groups/macrodroid/farewell-to-these-features-t5698.html · xda-developers.com/automate-your-device-for-free-with-macroadroid · github.com/BespredeL/MacroDroid

---

# Advanced / secondary paths

## 4. iPhone (iOS 17+): Apple Pay Transaction automation

What iOS supports:

- The **Transaction** trigger fires for **Apple Pay / Wallet taps only**: not physical card swipes or inserts, and not most online or in-app payments.
- You can set the automation to **Run Immediately**, so there's no confirmation banner.
- **Known issue:** on some iOS 18 builds the automation fires late (seconds to minutes) or only once the phone is unlocked. The capture still arrives with the right merchant and amount. The date is today unless you send `ts`.
- **Open URL opens Safari, not the installed app.** Home-screen web apps on iOS have storage separate from Safari, so in Safari you are usually signed out. That's why the main iOS path below writes in the background and doesn't open anything.

### 4a. Silent background capture (no app opens)

1. In Split Now, open **Profile → Auto-capture → Create a capture key**. The app shows your personal **URL** and **Body** with copy buttons.
2. On the iPhone, open **Shortcuts → Automation → + → Transaction**. Choose your cards and the merchant categories you want, then pick **Run Immediately**.
3. Add a **Format Date** action: *Current Date*, format **ISO 8601**, include time.
4. Add a **Text** action and paste the **Body** from step 1. Replace each placeholder with the variable of the same name from the Transaction trigger: `[Amount]` → *Amount*, `[Merchant]` → *Merchant*, `[Card or Pass]` → *Card or Pass*, `[Formatted Date]` → *Formatted Date*.
5. Add **Get Contents of URL**:
   - URL: the **URL** from step 1 (`https://firestore.googleapis.com/v1/projects/<projectId>/databases/(default)/documents/captureInbox?key=<webApiKey>`)
   - Method: **POST**
   - Headers: `Content-Type` = `application/json`
   - Request Body: **File** → the *Text* from step 4
6. Turn the automation on. The next time you pay with Apple Pay, the payment appears in Split Now's **Inbox** (with a badge on Home) the next time you open the app.

The body looks like this (Firestore REST "typed value" format):

```json
{
  "fields": {
    "token":    { "stringValue": "<your capture key>" },
    "uid":      { "stringValue": "<your user id>" },
    "raw":      { "stringValue": "[Amount]" },
    "merchant": { "stringValue": "[Merchant]" },
    "card":     { "stringValue": "[Card or Pass]" },
    "ts":       { "stringValue": "[Formatted Date]" },
    "src":      { "stringValue": "ios-shortcut" }
  }
}
```

`raw` is the amount exactly as iOS gives it (e.g. `A$12.50`, or `12,50 €`). The app parses it into cents and works out the currency when it files the capture. If you'd rather send cents yourself, replace `raw` with `"amount": { "integerValue": "1250" }`.

Tips: if a merchant name contains a double quote it will break the JSON, which is rare. If *Merchant* is empty the write is rejected, so use an **If** action to substitute a fallback such as "Apple Pay".

### 4b. Fallback: Open URL (asks you straight away)

Use **Open URL** instead of steps 3–5, with the link from *Profile → Auto-capture → Open URL*:

```
https://<host>/capture?v=1&raw=[Amount]&merchant=[Merchant]&card=[Card or Pass]&src=ios-shortcut&t=<key>&u=<uid>
```

Safari opens. If you're signed in there, you get the "is this a group expense?" prompt. If not, the `t` + `u` parameters let the page save the payment to your inbox without signing in. Without a key, the page keeps the link (localStorage) and files it as soon as you sign in.

## 5. Android: share sheet and notification automations

1. **Share sheet (Web Share Target).** Install Split Now from Chrome (*Install app*). Then **Share** a payment screenshot, receipt photo, or a bank message's text to **Split Now**:
   - **Images** open the **Scan** screen and are OCR'd on the device (receipt or payment screenshot).
   - **Text** containing an amount (e.g. *"You paid $12.50 to Cafe Luna"*) becomes a capture and opens the prompt. Text without an amount offers *Add expense* or *Scan*.
   - Web Share Target is **Android-only** (Chrome/Edge/Samsung Internet on an installed PWA). iOS doesn't support it.
2. **Tasker / MacroDroid / Automate.** Trigger on a Google Wallet or bank-app notification, pull out the amount and merchant (e.g. with a regex on the notification text), then **Open URL**:
   ```
   https://<host>/capture?v=1&amount=%amount&merchant=%merchant&src=android-auto&ref=%notification_id
   ```
   On Android the installed WebAPK opens in-scope links, so this goes straight into the app, where you're signed in. Passing `ref` means the same notification is never filed twice.

## 6. URL contract (`/capture`, v=1)

| Param | Required | Meaning |
|---|---|---|
| `v` | no | Contract version. Only `1` is accepted, and it's assumed if omitted. |
| `amount` | **yes**\* | Decimal amount: `12.50`, `A$12.50`, `1,234.56`, `12,50`. The sign is ignored. |
| `raw` | no | Original amount string. Used when `amount` is missing (\*either is required). |
| `currency` | no | ISO 4217 code. Otherwise inferred from `amount`/`raw` (`A$`, `€`, `NZ$`, `USD`…). |
| `merchant` | **yes** | Up to 100 characters. Becomes the expense description. |
| `ts` | no | ISO 8601 timestamp with offset. The date is taken as written. |
| `date` | no | `yyyy-mm-dd` (alias for `ts`). Default: today. |
| `src` | no | `ios-shortcut` · `android-auto` · `share` · `email` · `manual` (default). Aliases: `source`, `applepay`, `android`, `tasker`… |
| `card` | no | Card label only (e.g. "Amex"). Never send card numbers. |
| `note` | no | Free text, shown in the prompt and used as the expense note. |
| `ref` | no | Idempotency key (`[A-Za-z0-9_-]`, 4–64 characters). Used as the capture's document id, so reopening the same link doesn't duplicate it. |
| `group` | no | A groupId to pre-select, overriding the trip-date match. |
| `t`, `u` | no | Capture key and its owner's uid. Used only when the page is opened signed out (writes to `captureInbox`). |

Choosing a group opens the expense form with the amount, description (merchant), date and note filled in, *you* as the payer, and an equal split among all members. You can change anything before saving.

## 7. Data model and security

```
users/{uid}/captures/{id}     ← the inbox the app shows (owner-only)
  amount (int cents > 0), currency?, merchant, date, ts?, source, card?, raw?, note?,
  suggestedGroup?, status: pending|assigned|dismissed, groupId?, expenseId?, createdAt, updatedAt

captureTokens/{token}         ← token = 28 random chars (≥ 24 enforced)
  uid, createdAt, groupId?, label?   ← created/listed/revoked by the owner only

captureInbox/{id}             ← signed-out drop box for Shortcuts
  token, uid, merchant, amount? (int > 0) | raw (string), currency?, ts?, src?, card?
```

Rules (see `firestore.rules`, tested in `tests/firestore.rules.test.ts`):

- **captures**: read/write only by `uid`. `amount` must be a positive integer and `status` a known value.
- **captureInbox create** needs no auth, but `captureTokens/{token}` must exist **and** belong to the `uid` on the document. Keys are whitelisted, field types and lengths are checked, and there must be either an integer `amount > 0` or a `raw` string.
- **captureInbox read/delete** is limited to the signed-in owner (`resource.data.uid == auth.uid`). Nobody can update.

**Inbox design.** We put `uid` on each inbox doc (in addition to the brief's `token, amount, merchant…`) so that the owner's query `where uid == me` can be proved safe by the rules engine. A rule that looked up the token for each document can't be evaluated for list queries. Each time the app comes to the foreground it **moves** the user's inbox docs into `users/{uid}/captures` (same id, so a retry can't duplicate) and deletes them.

**Tradeoffs.**
- The key is a bearer secret, stored in the Shortcut. Anyone who has it can add pending items to your inbox. They can't read anything, and nothing is saved as an expense without you. Revoke and recreate the key in Profile if it leaks.
- A uid isn't secret, but the token check means it's useless without the key.
- Inbox entries from this REST path wait until you next open the app. Push notifications come with the SMS webhook (§3).
- The Firestore web API key in the URL is public by design. Security lives in the rules. Enable App Check before launch, but note that App Check would block REST writes from Shortcuts, so `captureInbox` would need an exemption or a Cloud Function endpoint.

## 8. Web Share Target implementation note

An *image* share target must be `POST multipart/form-data`, and a static site can only receive that in its service worker. We keep vite-plugin-pwa's `generateSW` and add a small handler with `workbox.importScripts` (`public/share-target-sw.js`). It parks the image in Cache Storage and redirects to `/scan?shared=1`, or forwards text to `/share?title=&text=&url=`. Until the service worker is installed (the very first visit), a share POST would hit Hosting and fail, but you can't share to an app that isn't installed, so in practice the service worker is always there.

## 9. Later phases (need Cloud Functions → Blaze plan)

- **Open banking (CDR).** An aggregator such as **Basiq** (about A$0.50 per connected user per month, plus a platform fee) would deliver card transactions by webhook. A function would write them to `users/{uid}/captures`. This covers physical card swipes and online payments that Apple Pay automations miss.
- **Email forwarding.** A per-user address (e.g. `u_xxx@in.splitit.app`) that parses e-receipts and bank alerts into captures, with `src=email`.
- **Push notifications.** FCM "New payment to sort" when a capture arrives.

## Publishing the shared iPhone Shortcut (owner, once)

Research (Oct 2026, see sources in the research notes) — what is possible on iPhone:

| Piece | Possible? | Notes |
|---|---|---|
| Share the **Shortcut** via iCloud link | Yes [Certain] | The user's key is asked for by an **Import Question on a Text action** (questions can't target values inside a JSON body) [Likely]. |
| Create/share the **automation** | No [Certain] | Each user creates it once. |
| **One** automation for all SMS | Yes, with a workaround [Likely] | Sender = Any Sender + Message Contains = a single **space** (iOS requires one field; "Contains" takes one plain phrase, no OR/regex). |
| Filter on the phone | Yes [Certain] | **Match Text** (ICU regex, case-insensitive) + **If … has any value** + **Stop This Shortcut**. Non-debit SMS and OTPs never leave the device. |
| Generate/sign a Shortcut from our server | Not worth it now | Needs `shortcuts sign` on a logged-in Mac (not hosted CI) or RoutineHub's HubSign (sends every user's key to a third party). No public API to create iCloud links. |
| Bank SMS filtered into "Transactions" | [Likely] fires | Indian apps rely on it; **test on a real phone**. |

### Owner: build "Split Now SMS" (standalone, in the Shortcuts tab)

1. **+** → name it exactly **Split Now SMS** (the in-app test button uses this name).
2. Shortcut details (ⓘ): **Receive** *Text* and *Messages* (any input). If there's no input: **Stop and Respond**.
3. **Text** action containing `PASTE_KEY` (this becomes the key).
4. **Text** action containing the **Shortcut Input** variable (gives the message body). If the picker offers it, choose *Shortcut Input → Content*.
5. **Match Text**: pattern `(?i)\b(otp|one[- ]time|verification code|password)\b` in the step-4 Text → **If** *Matches* **has any value** → **Stop This Shortcut** → **End If**.
6. **Match Text**: pattern `(?i)(debited|spent|paid|sent\s*rs|withdrawn|inr|rs\.?\s*\d|₹\s*\d)` in the step-4 Text → **If** *Matches* **does not have any value** → **Stop This Shortcut** → **End If**.
7. **Get Contents of URL**: `https://split-now.web.app/api/capture`, Method **POST**, Request Body **JSON**:
   `token` = step-3 Text, `text` = step-4 Text, `device` = `ios`, `sender` = **Shortcut Input** (the whole input: iOS doesn't expose the message's *Sender* to a shortcut run from an automation, and the server drops a `sender` that isn't a short sender ID, see §3.3; the row can also be deleted).
8. ⓘ → **Setup** → **Add Question** → choose the step-3 **Text** field → "Paste your Split Now key (Profile → Auto-capture)". Turn off *Show in Share Sheet*.
9. Run it once with sample text (iOS asks to allow split-now.web.app). Then **Share → Copy iCloud Link** → send to the lead, who sets `VITE_IOS_SHORTCUT_URL` and redeploys.
10. Revoke any key that was baked into an earlier shared link.

### Each user (≈ 90 seconds)

1. In Split Now: Profile → Auto-capture → copy your key → **Add Shortcut** (iCloud link) → paste the key.
2. Shortcuts → **Automation → + → Message** → Sender *Any Sender*, Message Contains a single **space** → **Run Immediately**, *Notify When Run* off → **Next**.
3. **Run Shortcut → Split Now SMS**, expand it, set **Input = Shortcut Input** → **Done**.
4. Tap **Test the Shortcut on this iPhone** in the app; then check a real bank SMS (including one in *Transactions*).

iOS 16 and older: the toggle is *Ask Before Running* (turn it off) instead of *Run Immediately*.
