# Pending work

What the owner asked for that isn't shipped yet, newest first. Read this at the start of a session;
remove an item when its release merges, and add anything left half-done.

## Next batch

- [ ] Quick add: "remind Rahul" (opens Remind for that person).

## Left from 9.2.0 – 9.5.0 (check by hand)

- [ ] 9.5.0 private groups: in a real private group, save your profile, then open the group on the phone: Settle up there shows your UPI ID to the others (sealed copy), and Firestore shows only `v1:` tokens in groups/{gid}/profiles/{uid}.
- [ ] 9.5.0 Quick add with AI: `scripts/quick-eval.ts` gave 62–64 of 67 on gemini-3.5-flash-lite (24 Oct); the misses are lines the phone settles first (Which group?, a hotel refund). Re-run after prompt changes.

- [ ] 9.4.0 voice on Android (installed app and Chrome): the mic shows, the first hold asks, words come once (no repeats), no "refused" after allowing. Read Admin → Logs → Voice afterwards.

- [ ] Voice with AI on a real iPhone: do the live words show while AI records (the phone's recognition and the recording share the microphone)?
- [ ] Draw a picture with the new prompt and backdrop rule: a few real pictures (scenes too) come out see-through.

- [ ] Opera GX / Brave: “Use AI for voice” on the can’t-turn-speech-into-text message turns AI transcription on, and the mic then records (no Vosk: owner, 24 Oct 2026, AI voice instead).
- [ ] Scan → Statement with AI off: try real GPay / PhonePe / bank screenshots (the parser is tested on typed text only).
- [ ] The production outage of 22 Oct (every callable 500 before reaching the code, ~21:00–02:40 IST): cause not found; it cleared by itself. Read the Cloud Run logs for that window if it happens again.
- [ ] Multi-group Balances card (someone in several groups) screenshot: the demo has no such person.

## Older

- [ ] Flaky e2e: "receipt photos: the scanned receipt leads the strip…" sometimes sits at the OCR spinner (Tesseract worker, after a fresh `npm ci` / cold Vite cache) and passes on rerun; it fails with or without the latest changes. Make the demo scan deterministic or wait for the worker.
- [ ] Icons, later: lucide feature icons left on less-used screens (admin, merge, chat composer, expense form internals) could move to Fluent when those screens are next touched.

## Voice (shipped in 9.1.0): left to check by hand

- [ ] Hold + on a real Android Chrome and iPhone Safari: recognition starting from the hold (no tap yet on iOS), the level bars while Chrome's recognizer and the meter share the mic, the blip before the first tap, the buzz.
- [ ] `node scripts/voice-probe.mjs` with the new Quick add prompt, and a real recording through `transcribeAi`; Admin → AI → Transcription key Test with a billed and a free-tier key (the billing probe asks an image model for text).

## Ideas, not requested (build only if the owner asks)

- The expense form could show the AI's other icons as pills, as New group and open items do.
- Admin tabs are 28 px wide at 320 px screens (above the 24 px minimum, but tight).
