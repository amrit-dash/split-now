# Changelog

Each release is a "Release x.y.z" pull request: it bumps `package.json` and moves the notes from
Unreleased under the new version. Merging it deploys to production and publishes the GitHub
Release (`.github/workflows/release.yml`). Fixes are x.y.Z, new features x.Y.0, breaking changes X.0.0.

## Unreleased

- **Animations**: glitter is the sparks that linger and flicker out after each burst again, with no extra twinkling dust; Glitter size now sets how big those lingering sparks are, and turning Glitter off ends each burst cleanly.
- **Animations preview**: stays in view under the title while you scroll the settings, and the eye in the top right hides or shows it (remembered on this device).
- **Simplify debts off**: the graph under a group's Balances now opens on the payments as they are, matching the list above it, instead of always on Simplified.
- **Settle up in a group where nobody owes anything** opens the group's Balances with the party-popper celebration ("Everyone's square in …") instead of an empty payment form; Record a payment is still there for money paid outside the app.

## 3.5.0 — October 2026

- **Payments need the recipient's OK** (Edit group, any member can turn it on): a payment someone records as paid to you counts once you confirm it. Until then it shows "Needs OK" and the debt still stands, and Settle up says it's already recorded so nobody pays twice. You get a notification and a card in the Inbox with Confirm and Not received; the person who paid hears your answer. Turning it off makes every payment count at once.
- **Payment screenshots**: when a payment needs an OK, the payer can attach the screenshot in Settle up. When it shows the exact amount going to you, successfully and recently, the payment counts straight away, marked "Screenshot matched", and stays in your Inbox for a week in case it didn't really arrive. The check runs on the server with AI and can be switched off under Settings → AI (and by admins for everyone); then payments wait for your OK, screenshot attached.

## 3.4.0 — October 2026

- **Collect in my currency** (Settings → Preferences): when someone settles a debt in a dollar or euro group with you, they pay you in your own currency at today's ECB rate, with a QR for the converted amount. The amount can be changed: anything within 4% of the exact conversion (a bank's or UPI app's rate) still clears the debt in full, a smaller amount clears only what it is worth (the line under it says how much stays owed), and more than 4% over is refused. The group still counts the payment in its own currency, and the payment shows what was paid ("paid ₹1,045.00").
- **One balance per person on Balances**: with Collect in my currency on, what someone owes you across groups in different currencies shows as one ≈ amount in your currency. Settling it records a payment in each group, and Remind sends one Pay me link for the total.

## 3.3.2 — October 2026

- **Back goes back**: every back arrow returns to the screen you came from, so Edit group → Manage members → back lands on Edit group again. A screen opened from a link or a shortcut goes back to its parent, and after saving an expense, back leaves the group rather than showing it twice.
- **The Create sheet closes before you move on**: adding an expense from the + button (or Quick add) no longer leaves a glimpse of the sheet when you come back.
- **Settle up in a group's Balances** is a round icon button, filled when the payment is yours to make, so the rows stay tidy next to Remind and Nudge.
- **Member photos**: the stacked avatars on groups now overlap evenly, first person in front, so no face hides completely behind its neighbours.

## 3.3.1 — October 2026

- **Row actions keep the row in view**: swiping a person, an expense or a payment no longer slides the row away. Round icon buttons slide in over the amount, so the name and photo stay where they are.
- **More ways to reach them**: press and hold a row (right-click on a computer, or the keyboard's menu key) for a menu that lists the same actions with their full names. On a laptop, a two-finger swipe left on the trackpad opens the row.
- **Expenses in a group**: swipe one, or press and hold it, to edit or delete it (delete has Undo, as on the expense itself).
- **Group Settle up**: with one payment of yours to make or receive it still opens that payment, filled in; with several people to settle with it now opens the group's Balances, where each payment has its own Settle, instead of quietly picking the first.

## 3.3.0 — October 2026

- **Animations settings** (Settings → Animations, kept on this device): one switch for all of them, then fireworks on or off with a burst size and a spark size, glitter (the twinkling dust that drifts down after each burst) on or off with its own size, the colour flow on the Home card, the + button and accent buttons on or off with a slow, normal or fast speed, and the floating circles in the Home card on or off. A live preview at the top shows each change. Your phone's reduce-motion setting still turns them all off.
- **Appearance**: the Dual tone switch now closes the Appearance card instead of sitting between the accent colours and the text colour.
- **For admins**: make someone an admin from Admin → Users (after a confirmation), or remove their admin access. Admins show an Admin badge in the list.

## 3.2.0 — October 2026

The launch release.

- **Koi accent**: a koi coral-orange on a deep pond indigo replaces Lime, which looked the same as Neon. Neon, a highlighter lime with dark text, is new too, and a stored Lime moves to it.
- **Text on accent**: pick white or black text on accent colours, kept per accent; black comes with brighter fills. Dual tone off now stops the drifting patches as well.
- **Your accent on your home screen**: installing the app (Add to Home Screen, Install app) takes the accent's own icon; Chrome offers to update an installed icon when the accent changes.
- **Approvals**: two thresholds per group (needs an OK above one, small edits approved on their own below the other), defaults per currency, and any member may change them and the group currency.
- **Pay me links and live tables**: "I've paid" is always recorded and the host confirms it; guests pay without an account; the tip is split equally and tax and fees by items or equally.
- **Members**: a Members screen with soft remove and swipe actions; Nudge and Remind on Balances, with a share fallback when push is off.
- **Quick add**: in the Create sheet, with AI help for lines the built-in reader can't follow.
- **Auto-capture**: trip capture per person from the group form, several wallets, and AI reading of bank SMS only when you turn it on.
- **Looks**: a calmer tab bar, a redesigned banner and maintenance screen, finer fireworks on bright cards, and a Support the developer card in Profile.
- **Fixes**: currency decimals follow ISO 4217 instead of the device, and inactive tab labels meet contrast.
- **Safer**: security headers on every site, patched dependencies, the code-scanning findings closed, and an App Check switch for admins.
- **Version**: the version you see in Profile and Settings is the app's own (Settings → Data adds the build), not a number set by hand.

## 3.1.1 — October 2026

The first open-source release, under the new name.

- **Split Now**: renamed from Split It, with the tagline "Spending is wise, splitting is free. Split Now!", a second address at freesplit.web.app, and the code public under MIT with contributor docs, issue and discussion forms.
- **New look on launch**: a dark animated splash (the logo pops in, slides up, the tagline follows), a full-bleed Android home-screen icon that matches iOS, and link previews with the app banner.
- **Settle up**: an animated cheque icon on every settle button, settle one person across several groups in one payment, round the payment down or waive the rest.
- **Faster**: one shared live connection per list across screens (no spinner when switching tabs), a lighter first load (self-hosted font, hand-drawn charts instead of a chart library, screens fetched ahead of time), a single OCR worker.
- **Safer**: tighter security rules (field whitelists and size caps, live-table guests limited to their table), personal Gemini keys encrypted at rest, security headers, rate limits on the capture webhook, bank SMS masked before any AI sees them.
- **Easier**: a first-run Home, Remind with a Pay me link and share card, Nudge notifications, duplicate warnings, Quick add by text or voice, budget alerts, leave, archive or remove members, a 3-step auto-capture setup, Inbox bulk add and undo.
- **Fixes**: Insights months in time zones ahead of UTC, split editors that reset after one digit, CSV export with special characters, approvals lost when two people approved at once, sign-out dropping writes still waiting to sync, "All settled up" breaking onto two lines on small Android phones, long names cut short in the greeting.
- **For admins**: a console at /admin for feature switches, maintenance, minimum version, announcements, limits, stats, user blocking and AI settings.
- **For contributors**: Biome lint and format, a CI with type checks, unit, security-rules, functions and end-to-end tests, Dependabot.

## 2.1.1 — October 2026

- **AI features**: Gemini reading for bills, statement screenshots and hard-to-read SMS; per-person own keys, an admin-controlled project key, model choice, limits and on/off switches.
- **Smart scan**: statement import (many transactions at once, flagged by trip dates), a history of the last 10 scans per kind with re-scan detection.
- **Split by items**: its own flow with a live table guests join without an account, portions for shared items, and finishing into a new group.
- **Balances**: one screen by person or by group; settle one person across several groups with one payment.
- **Insights**: animated line, bar and donut charts with collapsible filters; a new animated settle-up graph per group.
- **Inbox**: captured payments to sort plus a log of group activity.
- **Profiles**: member photos everywhere, first names in group expenses.
- **Look and feel**: notched tab bar with a glowing + button, animated balance card, stacked notifications, bottom sheets that drag to close, adaptive greeting, animated cheque settle-up icon.
- Admins can set the version shown in Profile.

## 2.0

- Splitwise import, multi-currency with ECB rates, auto-capture of bank SMS, push notifications, PWA install flow.
