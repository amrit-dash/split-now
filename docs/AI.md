# AI features (Gemini)

Split Now can use Google's Gemini models to read:

- **bills and receipts**: line items, taxes, charges, discounts and total (`parseReceiptAi`, kind `receipt`)
- **statement screenshots**: many transactions at once (`parseReceiptAi`, kind `statement`)
- **bank / UPI SMS** that the built-in parser can't read (fallback inside the `capture` webhook)

Everything has a fallback: without AI, bills are read on the phone (Tesseract.js) and SMS keep the built-in parser's result. AI is never required.

## Free AI (Gemma)

Instead of Gemini, an admin can run Split Now's shared AI on **Gemma**, Google's open model. The Gemini API serves it free of charge on the same project key (there is no paid tier for it), so the shared AI costs nothing. In **Admin → AI features**, set "Split Now's AI runs on" to **Gemma (free)**.

- **Same features**: bills, statements, payment screenshots, bank SMS and Quick add all work on Gemma, with the same prompts, the same checks on what comes back, and the same per-person limits and daily budget.
- **Slower**: a bill can take up to a minute. Time limits are longer on Gemma (`budget()` in `functions/src/ai.ts`), except SMS: the capture webhook must answer within 30 s, so those get 20 s.
- **Newest by default**: "Latest Gemma (automatic)" picks the newest general Gemma model the key can list (`gemmaModels` in `shared/ai-config.ts`; the model list is cached for 6 h), so a new Gemma release is used without a deploy. An admin can pin a specific model instead. If the list can't be fetched, `GEMMA_FALLBACK_MODELS` is used. A Gemma request never falls back to a paid Gemini model.
- **Everyone, after they agree**: Gemma ignores the allow-list. Google's terms for unpaid services let Google use what is sent to improve its products and let people at Google read it, and those terms don't allow serving people in the EU, the UK or Switzerland. So nothing goes to Gemma until a person turns on **Use free AI** (`aiFreeOk`) in Settings → AI features, where that is said plainly. Until then the server answers `reason: 'needs_ok'`.
- **Structured output**: Google documents system instructions for Gemma 4 but not JSON mode. `generateJson` sends the schema first; if a Gemma model refuses with a 400, that model switches to plain mode (rules and schema as text, the JSON read out of the answer) for the life of the instance. Reasoning ("thought") parts are ignored.

People's own keys still come first, as below, except on "Automatic" for someone who turned on **Use free AI**: then the free Gemma AI is tried first and their own key is the fallback, so their own quota is kept for when Gemma can't answer (owner decision, Oct 2026). "Only my key" never uses Gemma.

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

In **Settings → AI features → Your Gemini key**, a person pastes their key; the server checks it with Google (by listing models) and stores it in `users/{uid}/secrets/gemini`, which no client can read. The app only ever shows its last 4 characters. They can pick any Flash model their key can use; a retired model falls back to the recommended one (`gemini-2.5-flash-lite`).

## Icons with AI

Open the icon sheet (tap a group's icon, hold an expense's) and search: once words are typed and nothing matches them, or 3 s pass without a pick (`aiRowShown`), the sheet offers **Suggest with AI** (`iconsAi`) for those words only, never the title. The model returns three emoji and up to three small drawn icons, as plain text (an EMOJI line, then the <svg> blocks; `parseIconText`), not JSON: SVG's double quotes inside JSON strings are where small models slip. Gemma can't paint pictures (it writes text), so the drawings are SVG, which is text: the prompt (`functions/src/lib/icon-ai.ts`) asks for a flat, bold icon of 2 to 8 shapes in 2 or 3 hex colours on a 24 × 24 grid, lists the only elements and attributes allowed, and shows two worked examples. Whatever comes back is rebuilt by `shared/svg-icon.ts cleanSvg`: only path, circle, ellipse, rect, line, polyline, polygon and g, with numeric, path-data, hex-colour or keyword values; a script, text, image, link, style, entity or unknown element makes the whole drawing unusable. The app cleans a stored drawing again before showing it, as an image (a data: URL), where SVG can't run anything. It is asked only when the person taps Suggest, never in a private group (the title would leave the phone, and a drawing can't be sealed), and uses the bills allowance. Admin switch: `aiIcons`; per person: Settings → AI features → AI icons. **Draw a picture** sits under it only when a key that pays for pictures is in use; otherwise it isn't shown.

Gemma 4 thinks before it answers, and its thinking counts against the answer's token allowance: on the icon prompts it used all of it and returned nothing. `generateText` asks Gemma for `thinkingConfig: { thinkingLevel: 'minimal' }` (it refuses a `thinkingBudget`) and sends the instruction and the text as one part (a separate title part was read as missing). Checked live in October 2026: picks 10/10 at about 0.6 s, suggestions 4/4 at about 10 s on `gemma-4-26b-a4b-it`; Gemini Flash-Lite 10/10 and 4/4. `generateJson` (bills, Quick add) keeps thinking: its allowance is 8192 and grows on a cut-off answer.

**Automatic icons with AI** (`iconPickAi`). The automatic icon is the app's own rules first (`src/lib/icons.ts`, free and instant). Only when they find no icon for a title ("Toit", "Parasail") and the person stops typing for 1.2 s does the form ask the AI to choose one emoji from the app's own catalogue (`src/lib/icon-pick.ts`), plus the category while it is still Other (an expense) or the type while none was chosen (a group). The answer is one line (`EMOJI 🍽️ CATEGORY food`, `functions/src/lib/icon-ai.ts parsePick`) and is kept only where it names something from the lists sent, so the free Gemma model handles it. Answers are cached per title for the session. The expense stores the pick as `icon` with `iconAuto: true`, so the sheet keeps Automatic chosen and a new description picks again. Never in a private group. Admin switch: `aiIconAuto`; per person: Settings → AI features → AI picks icons (on by default). Uses the bills allowance, counted as `iconPick`.

**Draw a picture** (`iconPictureAi`) sits in the same box: one picture from a Gemini image model. Which one is chosen per key: Settings → AI features → Icons → **Model for pictures** for one's own key (`aiPictureModel`), Admin → AI → Pictures → **Model for pictures** for Split Now's (`config/ai.pictureModel`); both list what that key can draw with (`aiModels` with `kind: 'pictures'`, `pictureModelsFrom`: retired and twin ids left out), with price and speed. The chosen model is tried first, then the recommended ones (`picturePlanModels`; `PICTURE_MODELS`: Nano Banana 2 Lite, Nano Banana 2.1, Nano Banana 2). Prices at Google's default 1K size (October 2026, `PICTURE_MODEL_INFO`): Nano Banana 2 Lite and 2.1 US$0.034, Nano Banana 2 US$0.067, Nano Banana Pro US$0.134; no free tier, and Gemma can't draw (it does draw the SVG icons of Suggest with AI). Every model the key lists is offered, but Recommended (Lite) is the default: it is the cheapest and quickest and drew as clear an icon as the others, since the picture ends up a small icon where a dearer model's detail can't show. The picker marks a model over twice the recommended price as costing more for no difference at icon size (`pictureModelOptions`). The sheet's cost line follows the model the paying key uses, and a drawn picture says which model drew it. Checked live on a paid key: Lite about 3 s, Nano Banana 2 about 8 s, 2.1 about 13 s, Pro about 14 s. Google's refusals are told apart (`pictureRefusal`, `functions/src/lib/gemini.ts`), since each has a different fix: a 402 or "prepayment credits are depleted" is a spent prepaid credit (`picture_credit`: top it up); a 429 whose allowance is `limit: 0` (the free tier), or a billing precondition, is a key without billing (`picture_billing`); any other 429 is a real rate limit that passes (`picture_busy`). On Split Now's key the person hears only that it can't draw now. **Test pictures**, under each Model for pictures picker (`pictureTest` callable; Admin → AI's on Split Now's key, admins only, also before pictures are turned on), draws one billed picture with exactly the chosen model and no fallback, and shows it with the model, the time and the cost, or the refusal with Google's own sentence (`googleMessage`). It shares the key-check limit (20 an hour) and counts as a picture in the admin's usage. It runs on the person's own key whenever they added one, even while the free AI is their default, and the sheet says it is billed to their key. On Split Now's key only when `config/ai` has `pictures` on (also while Gemma reads bills: a key on the free Gemma for text can still be billed, and one without billing gets `picture_billing`), at most `picturesPerDay` per person and within the project's daily budget. The phone shrinks the picture to a small square (`src/lib/icon-picture.ts`, WebP or JPEG, at most 24 000 characters as a data: URL) and saves that as `iconImage`; the full picture is never kept. Never in a private group.

## Voice and transcription

Voice in Quick add (its mic, and holding **+** anywhere with the tab bar) is free first: the phone's own speech recognition (`src/lib/speech.ts`, continuous, restarted when the browser ends a session on its own, so a pause never ends it; it stops when the person lets go or taps the mic off). No recognition, or a refusal (remembered until the microphone permission reads granted again): no mic and no hold-for-voice, unless the person chose AI transcription (`src/lib/voice.ts voiceEngine`).

**AI transcription** (`transcribeAi`) is for people who pick it: Settings → AI features → Voice → Turn speech into text with **Phone | AI** (one setting, `aiTranscribe`). No key choice (owner, 22 Oct 2026): their own key first, then Split Now's transcription key; with neither, AI can't be picked and the screen asks for their own key. The project key is never used for voice (it may be on the free tier, and voice is personal). An old `aiTranscribeKey` value is kept but ignored. The app records a clip (`MediaRecorder`, Opus at 24 kbps, at most 60 s) and sends it as base64; the server checks it against `config/limits.transcribeMaxKb` and has Flash-Lite write it down (`transcribePrompt`, shared/transcribe.ts: digits for numbers, names as heard, the audio untrusted). The words land in Quick add's box and wait for send. Gemma isn't offered: on the Gemini API it refuses audio ("Audio input modality is not enabled", `scripts/voice-probe.mjs`, 22 Oct 2026); gemini-3.5-flash-lite got 5 of 5 spoken lines in about 1.5 s.

**Split Now's transcription key** is a third key, for voice only (`private/geminiTranscribeKey`, sealed like the others, set in Admin → AI → Transcription key; no Secret Manager fallback). It must be billed: Google's free tier may use what is sent, and voice is personal. Saving or testing asks an image model (no free tier) for a couple of words (`probeBilling`, `functions/src/lib/transcribe.ts`): a 429 with `limit: 0` (or a billing precondition) means free tier, and the key is refused; an answer means billed. When no image model says either way the key is kept as "billing not confirmed". Test also has the chosen model hear half a second of silence. Its model is `config/ai.transcribeModel` (Flash-Lite 3.5 recommended, 3.1 allowed). Flags: `aiTranscribe` (transcription with AI for everyone; off, voice is the phone's only) and `aiTranscribeShared` (everyone may use Split Now's transcription key; off, only people with their own key). Allowance: `config/limits.transcribePerDay` per person on Split Now's key (`rateLimits/ai_transcribe_{uid}`), the own-key limits on theirs. Counted as `transcribe_{own,app}` in `stats/ai_{day}`, apart from `app` (the bill-reading key's daily budget). Demo mode has no server: its voice is the phone's, and AI answers that it needs the online app.

**Quick add's AI prompt** (`quickPrompt`) expects the line to be a rough speech transcript (no punctuation, misheard words, numbers as words) and works out what was meant before reading it, the same on every model. A line that records no cost, payment or group gets `unknown`, and the app answers with what Quick add can do (`src/lib/quick-answer.ts`) instead of an empty form.

## Limits and privacy

- Calls are rate-limited per person and key (`rateLimits/ai_*`), and daily usage is counted in `stats/ai_{day}` for admins. App admins (`admins/{uid}`) aren't held to the app's own limits or the daily budget (`allow()` in `functions/src/ai.ts`, owner, 24 Oct 2026); Google's limits on the key itself still apply, and their calls still count.
- Requests use structured JSON output only (no temperature or thinking settings), so they stay compatible as models change.
- Images and SMS text are sent to Google's Gemini API only when AI is on for that person and feature. Nothing is stored by Split Now beyond the parsed result the person saves.
