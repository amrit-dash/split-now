# Pending work

What the owner asked for that isn't shipped yet, newest first. Read this at the start of a session;
remove an item when its release merges, and add anything left half-done.

## Batch 9.1.1 (owner: release straight after 9.1.0)

- [ ] Flaky e2e: "receipt photos: the scanned receipt leads the strip…" sometimes sits at the OCR spinner (Tesseract worker, after a fresh `npm ci` / cold Vite cache) and passes on rerun; it fails with or without the latest changes. Make the demo scan deterministic or wait for the worker.
- [ ] Icons, later: lucide feature icons left on less-used screens (admin, merge, chat composer, expense form internals) could move to Fluent when those screens are next touched.

## Voice (shipped in 9.1.0): left to check by hand

- [ ] Hold + on a real Android Chrome and iPhone Safari: recognition starting from the hold (no tap yet on iOS), the level bars while Chrome's recognizer and the meter share the mic, the blip before the first tap, the buzz.
- [ ] `node scripts/voice-probe.mjs` with the new Quick add prompt, and a real recording through `transcribeAi`; Admin → AI → Transcription key Test with a billed and a free-tier key (the billing probe asks an image model for text).

## Ideas, not requested (build only if the owner asks)

- The expense form could show the AI's other icons as pills, as New group and open items do.
- Admin tabs are 28 px wide at 320 px screens (above the 24 px minimum, but tight).
