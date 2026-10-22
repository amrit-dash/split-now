# Simple and Advanced

What each screen shows in **Simple**. Advanced is the whole app. Simple only hides: settings keep
their values, background features keep running, and anything that arrives for the person (Inbox
items, approvals waiting on them, captured payments) still shows and can be acted on.

Logic: `src/lib/mode.ts` (tested), `useMode()` / `useSimple()` in `src/hooks/useMode.ts`. Simple's
detail level is When needed (`lookForMode`); Simple's own hides are explicit `useSimple()` checks.

**Every new feature:** ask the owner "Simple or Advanced?" with a recommendation, add its row here,
and give its Help section `simple: true` when Simple shows it.

Status: **decided** = the owner's call (22 Oct 2026). **proposed** = waiting for the owner's OK.

## Decided

| Screen | Simple shows | Simple hides |
|---|---|---|
| Profile: you | Name, photo, mobile number, "pay this number by UPI" (one line), emails | Signing in section; subtext that doesn't carry the layout |
| Profile: how friends pay you | UPI ID, bank transfer, PayPal (international only) | Every other method, "Show more" |
| Profile: header | The mode button (beside Settings): the leaf in Simple, one of five Advanced pictures in Advanced; a tap switches, with Undo | |
| Profile: other rows | Balances, Support, Developer, Help | |
| Settings → Preferences | Mode, default currency, theme, accent, text on accent | Rates refresh, Collect in (on for everyone), dual tone, icons (default), detail level (When needed) |
| Settings → Animations | | Whole section; defaults: burst Medium, spark Medium, glitter Medium, shape Mix, glitter at the bottom |
| Settings → Notifications | The types that apply to what Simple shows | Capture types when capture isn't set up (dynamic) |
| Settings → Automation | | Whole section and every entry point; automations keep running |
| Settings → Encrypted groups | Shown; explainer moves to Help behind a ? button | |
| Settings → AI features | Use AI, free AI (when the admin offers it), Your key and models | Per-feature switches, icons |
| Settings → Data, Admin | As is | |
| Scan | Camera and Photo per kind | The AI toggle (Settings' choice applies) |
| New group, Edit group | Everything else | Approvals section (all off by default) |
| Members | Everything else | Merge, "Needs my OK" switch |
| Live table, private groups | Shown | |
| Help | Simple's sections, the Simple and Advanced section | Sections for features Simple hides |

## Decided: the rest of the app (owner, 22 Oct 2026)

Simple keeps nearly every everyday feature; it differs mostly in Settings and a few rare features.

| Screen | Simple shows | Simple hides |
|---|---|---|
| Home | Everything, including Import from Splitwise on first run | |
| Groups | Import from Splitwise | Personal wallets (every list, picker and form; the wallets stay) |
| Create sheet | Quick add, Add expense, New group, Scan | |
| Group | Chat, Open, Balances, Activity tabs, graph view, sort and filter, trip capture line | Whose-turn chip |
| Group menu | Insights and the rest | Money received, Export CSV |
| Group balances, Balances | Remind and Nudge | |
| Expense form | Every split type, Repeat, Save as an open item, icon picker, Split at the table, currency picker and the converted amount | Expense / Money received switch, editing the exchange rate |
| Expense detail | Everything | |
| Settle up | Read from screenshot, method chips, note | Waive the rest |
| Inbox | Every item, sort pickers, bulk add | Auto-capture promo |
| Insights | Everything | |
| Settings → Data | Everything | |
| Settings → Notifications | Group chat, open items | Capture types when capture isn't set up |

Detail level: Simple uses **When needed** (one short line where it helps), not Minimal, because Minimal hides features Simple keeps (Percent / Shares / Adjust, Settle up's method and note, History, sort pickers). Simple's own hides are explicit `useSimple()` checks.
