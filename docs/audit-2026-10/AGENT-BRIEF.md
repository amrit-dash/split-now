# Shared brief for audit agents (Split Now / split-it)

Repo: /home/user/split-it (branch claude/codebase-audit-optimization-k2uyfs). READ-ONLY: do NOT edit, create or delete any file inside the repo. You may create files only under docs/audit-2026-10/.

What the app is: "Split Now", a mobile-first installable PWA (React 19, TypeScript, Vite 8, Tailwind v4, React Router 7, Recharts, Tesseract.js) backed by Firebase (Auth, Firestore, Storage, Hosting, Cloud Functions in functions/ on Node 22, FCM push). India-first Splitwise alternative: groups, six split types, debt simplification + debt graph, cross-group netting, UPI-first settle-up with QR, on-device OCR of bills/payment screenshots, Gemini AI reading (bills/statements/SMS), live table split (/t/CODE, anonymous guests), trip mode + bank-SMS auto-capture inbox (iOS Shortcut / MacroDroid -> /api/capture webhook), multi-currency with locked ECB FX, Splitwise CSV import, activity log / edit history / soft delete / disputes / approvals, insights charts, demo mode (localStorage repo when no Firebase env). Source of truth docs: README.md, docs/PLAN.md, docs/AUTO_CAPTURE.md, docs/FIREBASE_SETUP.md.

Layout: src/lib (pure logic, unit tests next to files), src/data (Repo interface + firebaseRepo + localRepo), src/hooks, src/components, src/pages, shared/ (code shared with functions), functions/src, tests/ (Firestore rules tests), firestore.rules, storage.rules.

node_modules may still be installing (check docs/audit-2026-10/npm-ci.log for "functions exit"). Do not run `npm install`. Do not run `vite build` unless your task says so (another agent owns the build). You may run `npx vitest run <file>` and `npx tsc -b --noEmit`-style read-only checks once install is done.

Deliverable: write a Markdown report to the path given in your task. Structure:
1. One-paragraph summary of what you examined and overall verdict.
2. Findings ranked by severity (Critical / High / Medium / Low), each with: title, file:line references, what is wrong, why it matters, and a concrete proposed fix (code-level, specific enough that another engineer could implement it without re-investigating). Tag confidence [Certain]/[Likely]/[Guessing] on non-obvious claims.
3. Things that are already good (brief, so we don't "fix" them).
4. Open questions only if a decision genuinely needs the product owner.
Be concrete and skeptical. Verify claims by reading the actual code, not by assuming from docs. Prefer depth over breadth within your lens. You MAY spawn sub-agents (Agent tool, subagent_type general-purpose or Explore) for sub-areas of your lens and merge their results; give them this same brief and the same read-only rule. Return as your final message a <= 25-line summary of your top findings (the full report lives in the file).
