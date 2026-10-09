# AI features (Gemini)

Split Now can use Google's Gemini models to read:

- **bills and receipts**: line items, taxes, charges, discounts and total (`parseReceiptAi`, kind `receipt`)
- **statement screenshots**: many transactions at once (`parseReceiptAi`, kind `statement`)
- **bank / UPI SMS** that the built-in parser can't read (fallback inside the `capture` webhook)

Everything has a fallback: without AI, bills are read on the phone (Tesseract.js) and SMS keep the built-in parser's result. AI is never required.

## Which key is used

For each request the server (`functions/src/ai.ts`, rules in `shared/ai-config.ts`) tries, in order:

1. **The person's own key**, if they saved one and their "Which key" setting isn't "Only Split Now's key".
2. **The project key**, if `config/ai` allows that person (everyone, or listed emails) for that feature.
3. **Nothing**: the app falls back as above.

Each person can turn AI off entirely, or per feature (bills & statements / SMS), in **Profile → AI features**.

## Setting up the project key

1. Get a free key at <https://aistudio.google.com/apikey>.
2. Store it in Secret Manager as `GEMINI_API_KEY`:
   ```bash
   firebase functions:secrets:set GEMINI_API_KEY
   ```
3. Deploy the functions: `firebase deploy --only functions`.
4. Make yourself an admin: create a document `admins/{yourUid}` (any content) in the Firestore console. Admins are managed only in the console; no client can write that collection.
5. In the app, **Profile → Admin · AI features**: choose who may use the project key (off / everyone / only listed emails), which features, the model and per-person limits. Admins can also set a different project key from the app (stored server-side in `private/geminiAppKey`, which no client can read); removing it falls back to `GEMINI_API_KEY`.

The project key is **off** until an admin turns it on.

## Users' own keys

In **Profile → AI features → Your Gemini key**, a person pastes their key; the server checks it with Google (by listing models) and stores it in `users/{uid}/secrets/gemini`, which no client can read. The app only ever shows its last 4 characters. They can pick any Flash model their key can use; a retired model falls back to the recommended one (`gemini-2.5-flash-lite`).

## Limits and privacy

- Calls are rate-limited per person and key (`rateLimits/ai_*`), and daily usage is counted in `stats/ai_{day}` for admins.
- Requests use structured JSON output only (no temperature or thinking settings), so they stay compatible as models change.
- Images and SMS text are sent to Google's Gemini API only when AI is on for that person and feature. Nothing is stored by Split Now beyond the parsed result the person saves.
