# R2 — D2 items 1–3 reconciled (done)

Files: functions/src/nudge.ts, src/components/{CreateSheet,StatementImport,AutoCapture,AiSettings,AiScanToggle}.tsx, src/pages/settings/Automation.tsx, src/pages/Login.tsx. No git actions; no package.json changes.

1. nudge.ts: `countStats('nudge', { denied: 1 }, now)` before the rate_limited return; the `sent` counter now also goes through `countStats('nudge', { sent: 1 }, now)` (same stats/nudge_{day} shape), so the direct FieldValue/istDate imports went.
2. Flag gates (hooks stay top-level; the early return sits after the last hook in each file):
   - triggers.ts: no change needed, `budgetAlert()` already starts with `if (!budget || !(await flagOn('budgetAlerts'))) return`.
   - CreateSheet: `useFlag('liveTables')` false hides the "Split by items" tile (3 tiles left in the 2-col grid).
   - StatementImport: `useFlag('statementImport')` false → `return null`. Note for Scan.tsx's owner: the "Statement" Segmented option still shows and its tab is then empty.
   - AutoCapture + Automation: new exported `AutoCaptureOff` (one line "Auto-capture is switched off for everyone right now", keeps data-testid="section-auto-capture"); Automation renders it instead of mounting AutoCapture (no listeners started), AutoCapture also guards itself.
   - AiSettings: the "Bills & statements" row under Advanced shows "Reading bills with AI is switched off for everyone right now" instead of the aiImages switch (master switch untouched: aiSms is a separate flag). AiScanToggle: same line (data-testid="ai-scan-off") instead of the switch, after the demo-mode null.
3. Login: `useAppConfig()` + `signupsOpen(cfg, pathname)`; mode is derived (`canSignUp ? chosen : 'in'`), the toggle is replaced by "Split Now is invite only right now. Ask a friend for their group link to join." (data-testid="signups-closed") when closed. Demo branch and demo-name/demo-start untouched.

Verified: `npx tsc -b` 0 · `npm run typecheck:all` 0 · `npm run check` 0 (37 pre-existing warnings, none in these files) · `npx vitest run` 65 files / 897 tests green · `npm run test:functions` under the emulator lock 2 files / 18 tests green (lock released) · `biome format --write` on the 8 files: nothing to fix.
