# Simple and Advanced

What each screen shows in **Simple**. Advanced is the whole app. Simple only hides: settings keep
their values, background features keep running, and anything that arrives for the person (Inbox
items, approvals waiting on them, captured payments) still shows and can be acted on.

Logic: `src/lib/mode.ts` (tested), `useMode()` / `useSimple()` in `src/hooks/useMode.ts`. Simple's
detail level is Minimal (`lookForMode`), so everything behind `useShows(2)` / `<Detail min={2}>`
is already hidden there.

**Every new feature:** ask the owner "Simple or Advanced?" with a recommendation, add its row here,
and give its Help section `simple: true` when Simple shows it.

Status: **decided** = the owner's call (22 Oct 2026). **proposed** = waiting for the owner's OK.

## Decided

| Screen | Simple shows | Simple hides |
|---|---|---|
| Profile: you | Name, photo, mobile number, "pay this number by UPI" (one line), emails | Signing in section; subtext that doesn't carry the layout |
| Profile: how friends pay you | UPI ID, bank transfer, PayPal (international only) | Every other method, "Show more" |
| Profile: other rows | Balances, Support, Developer, Help | |
| Settings → Preferences | Mode, default currency, theme, accent, text on accent | Rates refresh, Collect in (on for everyone), dual tone, icons (default), detail level (Minimal) |
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

## Proposed (from the screen inventory)

| Screen | Simple hides | Why |
|---|---|---|
| Home | Import from Splitwise on first run | Niche |
| Groups | Import from Splitwise, Personal / New wallet | Niche; wallets are their own idea |
| Create sheet | Quick add | Power feature (see the open question) |
| Group | Chat button, Open tab, Activity tab, Graph view, Sort and filter, trip capture line, whose-turn chip | Power or noise; chat and activity notifications still arrive |
| Group menu | Money received, Insights, Export CSV | Power |
| Group balances | Nudge (Remind stays) | Push nudges are extra |
| Expense form | Expense / Money received switch, currency picker and rate, Percent / Shares / Adjust / By items, several payers, Repeat, Save as an open item, icon picker, Split at the table offer | Equally and Exact cover most bills |
| Expense detail | Add again, Flag, History, icon change | Power |
| Settle up | Read from screenshot, method chips, note, pay in another currency, waive the rest | Already hidden in Minimal, plus two more |
| Balances | Nudge | As in the group |
| Inbox | Sort pickers, auto-capture promo, bulk add | Every item still shows |
| Insights | The screen (and its Profile row) | Power |
| Data | Export, Import from Splitwise | Power |
| Notifications | Group chat, open items | Their features are hidden |

## Open questions for the owner

- **Quick add**: hide in Simple, or keep it as the one-line way in? Voice (9.1.0) lives on Quick add and on press-and-hold +, so hiding it also keeps voice out of Simple.
- **Expense currency**: a Simple person on a trip abroad can't add an expense in another currency. Keep the currency picker in Simple?
