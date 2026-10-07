# Auto-capture: trip mode and the capture inbox

Goal: when you tap your phone to pay during a trip, Split It should ask *"You spent A$12.50 at Cafe — is this a group expense?"* without you opening the app and typing it in.

Split It is a PWA, so this works differently from a native app. This page explains the limits, the setup on iPhone and Android, and the contract that every capture path uses.

**Split It never adds an expense on its own.** Every capture lands in the **Inbox** as *pending*, and you confirm it (pick a group, *Personal*, or *Not shared*) before anything is saved.

---

## 1. Why a web app can't just read your payment notifications

- **iOS** gives no third-party app, native or web, access to other apps' notifications or to Wallet transaction history. The only supported hook is the Shortcuts app's **Transaction** automation (iOS 17+), and it can run only a fixed set of actions.
- **Android** lets *native* apps read notifications through `NotificationListenerService`. A PWA (even an installed WebAPK) runs in the browser sandbox and cannot. Automation apps such as Tasker or MacroDroid *can* read them, and can then open a Split It link.
- **Bank data** (open banking / CDR in Australia) needs a server and an accredited data provider. That's Phase 2/3; see §6.

So Split It gives every automation a single door: a **capture**, sent either as a URL (`/capture?...`) or as a signed-out write to the Firestore `captureInbox` collection.

## 2. Trip mode

A group can have an optional **start date** and **end date** (Group → Settings → *Trip dates*). Either one can be left open.

- While today is inside the window, the group shows a **Live trip** badge on its row and detail page.
- New expenses default to the live trip.
- A capture whose date falls inside a trip window lists that group first and pre-selects it. If several trips match, the one with the shortest window wins, then a matching currency, then the most recently active. If no trip matches, nothing is pre-selected.

## 3. iPhone (iOS 17+): Apple Pay Transaction automation

What iOS supports:

- The **Transaction** trigger fires for **Apple Pay / Wallet taps only**: not physical card swipes or inserts, and not most online or in-app payments.
- You can set the automation to **Run Immediately**, so there's no confirmation banner.
- **Known issue:** on some iOS 18 builds the automation fires late (seconds to minutes) or only once the phone is unlocked. The capture still arrives with the right merchant and amount. The date is today unless you send `ts`.
- **Open URL opens Safari, not the installed app.** Home-screen web apps on iOS have storage separate from Safari, so in Safari you are usually signed out. That's why the main iOS path below writes in the background and doesn't open anything.

### 3a. Recommended: silent background capture (no app opens)

1. In Split It, open **Profile → Auto-capture → Create a capture key**. The app shows your personal **URL** and **Body** with copy buttons.
2. On the iPhone, open **Shortcuts → Automation → + → Transaction**. Choose your cards and the merchant categories you want, then pick **Run Immediately**.
3. Add a **Format Date** action: *Current Date*, format **ISO 8601**, include time.
4. Add a **Text** action and paste the **Body** from step 1. Replace each placeholder with the variable of the same name from the Transaction trigger: `[Amount]` → *Amount*, `[Merchant]` → *Merchant*, `[Card or Pass]` → *Card or Pass*, `[Formatted Date]` → *Formatted Date*.
5. Add **Get Contents of URL**:
   - URL: the **URL** from step 1 (`https://firestore.googleapis.com/v1/projects/<projectId>/databases/(default)/documents/captureInbox?key=<webApiKey>`)
   - Method: **POST**
   - Headers: `Content-Type` = `application/json`
   - Request Body: **File** → the *Text* from step 4
6. Turn the automation on. The next time you pay with Apple Pay, the payment appears in Split It's **Inbox** (with a badge on Home) the next time you open the app.

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

### 3b. Fallback: Open URL (asks you straight away)

Use **Open URL** instead of steps 3–5, with the link from *Profile → Auto-capture → Open URL*:

```
https://<host>/capture?v=1&raw=[Amount]&merchant=[Merchant]&card=[Card or Pass]&src=ios-shortcut&t=<key>&u=<uid>
```

Safari opens. If you're signed in there, you get the "is this a group expense?" prompt. If not, the `t` + `u` parameters let the page save the payment to your inbox without signing in. Without a key, the page keeps the link (localStorage) and files it as soon as you sign in.

## 4. Android

1. **Share sheet (Web Share Target).** Install Split It from Chrome (*Install app*). Then **Share** a payment screenshot, receipt photo, or a bank message's text to **Split It**:
   - **Images** open the **Scan** screen and are OCR'd on the device (receipt or payment screenshot).
   - **Text** containing an amount (e.g. *"You paid $12.50 to Cafe Luna"*) becomes a capture and opens the prompt. Text without an amount offers *Add expense* or *Scan*.
   - Web Share Target is **Android-only** (Chrome/Edge/Samsung Internet on an installed PWA). iOS doesn't support it.
2. **Tasker / MacroDroid / Automate.** Trigger on a Google Wallet or bank-app notification, pull out the amount and merchant (e.g. with a regex on the notification text), then **Open URL**:
   ```
   https://<host>/capture?v=1&amount=%amount&merchant=%merchant&src=android-auto&ref=%notification_id
   ```
   On Android the installed WebAPK opens in-scope links, so this goes straight into the app, where you're signed in. Passing `ref` means the same notification is never filed twice.

## 5. URL contract (`/capture`, v=1)

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

## 6. Data model and security

```
users/{uid}/captures/{id}     ← the inbox the app shows (owner-only)
  amount (int cents > 0), currency?, merchant, date, ts?, source, card?, raw?, note?,
  suggestedGroup?, status: pending|assigned|dismissed, groupId?, expenseId?, createdAt, updatedAt

captureTokens/{token}         ← token = 28 random chars (≥ 24 enforced)
  uid, createdAt              ← created/listed/revoked by the owner only

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
- Inbox entries wait until you next open the app. There's no push notification yet (that needs FCM plus a Cloud Function).
- The Firestore web API key in the URL is public by design. Security lives in the rules. Enable App Check before launch, but note that App Check would block REST writes from Shortcuts, so `captureInbox` would need an exemption or a Cloud Function endpoint.

## 7. Web Share Target implementation note

An *image* share target must be `POST multipart/form-data`, and a static site can only receive that in its service worker. We keep vite-plugin-pwa's `generateSW` and add a small handler with `workbox.importScripts` (`public/share-target-sw.js`). It parks the image in Cache Storage and redirects to `/scan?shared=1`, or forwards text to `/share?title=&text=&url=`. Until the service worker is installed (the very first visit), a share POST would hit Hosting and fail, but you can't share to an app that isn't installed, so in practice the service worker is always there.

## 8. Later phases (need Cloud Functions → Blaze plan)

- **Open banking (CDR).** An aggregator such as **Basiq** (about A$0.50 per connected user per month, plus a platform fee) would deliver card transactions by webhook. A function would write them to `users/{uid}/captures`. This covers physical card swipes and online payments that Apple Pay automations miss.
- **Email forwarding.** A per-user address (e.g. `u_xxx@in.splitit.app`) that parses e-receipts and bank alerts into captures, with `src=email`.
- **Push notifications.** FCM "New payment to sort" when a capture arrives.
