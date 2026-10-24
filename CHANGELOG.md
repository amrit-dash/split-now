# Changelog

Each release is a "Release x.y.z" pull request: it bumps `package.json` and moves the notes from
Unreleased under the new version. Merging it deploys to production and publishes the GitHub
Release (`.github/workflows/release.yml`). Fixes are x.y.Z, new features x.Y.0, breaking changes X.0.0.

## Unreleased

- Settle up in your own currency for a group in another one (Pay in ₹ instead) now offers the trip’s exchange rate as well as today’s: **Trip** uses the rate on the day the trip ended (its end date, or its last expense), **Today** today’s. A Trip group starts on the trip’s rate, so a fall in the dollar after you’re back no longer shrinks what friends pay you back; the line under it says how much the other rate would differ, Balances, settling with someone across all your groups, and Remind’s Pay me links use each trip’s own rate too (settling across groups has the same Trip rates / Today choice), so one debt never shows two amounts; the payment says which day’s rate it used (“paid ₹5,280 at the 6 Oct rate”). Before, it always used today’s rate.
- New group and Edit group: a group in another currency than yours (before its first expense) suggests keeping it in yours, with a Use ₹ button. Costs added in the other currency then keep their own day’s rate, so what people owe never drifts with the exchange rate.

## 9.5.0 — October 2026

- Admin → AI: removing the project or transcription key is a small bin at the right of the section's heading, and asks first, instead of a third button beside Test; “Use another key” is now “Replace key”, on one line; with no transcription key, the line says just that.
- The launch screen's logo is in your accent colour from the first frame, like the app icon (it was always violet).
- The Turn on notifications banner and a reminder's card keep their buttons on one row under the text, instead of wrapping onto two lines on a phone; a reminder's notifications button now says Get notified.
- Quick add reads much more on your phone, free and without AI: “they paid” or “he got the bill” (the person named paid), uneven parts (“Rahul owes 400”, “60/40 with Meera”, “Rahul 2 shares”, “Rahul 30%”, “hotel 6000 Priya 4000”), “everyone except Rohan”, payments back, and full names (“Rahul Verma” is never the group’s other Rahul). When it isn’t sure it asks instead of guessing: which group, which Rahul, who paid, or whether to add someone the group doesn’t have (or leave them out). Only what your phone can’t read goes to Quick add with AI. A line from Home naming someone in none of your groups starts a 1:1 with them.
- Quick add with AI keeps a line in the group you’re in (it sometimes moved “paid Rahul 500 back” into your 1:1 with Rahul), and a full name or “lunch for Rohan” is read the way it was meant.
- Add expense: the switch at the top reads **Money spent** / **Money received** (it said Expense / Money received), so the two read as a pair.
- Scan: the AI switch in the Bill and Statement cards shows in Simple mode too, so you can choose AI reading there without going to Settings.
- Quick add: one spinner while it works, beside the status words at the top of the card; the box and the send button no longer spin as well.
- Private groups: your name, photo link and payment details (like your UPI ID) are now encrypted in the copy each private group keeps of your profile, and reach it once you open the group on your phone. Before, saving your profile put a readable copy into private groups too. Nothing readable is accepted there any more, even from an older version of the app.
- Profile photo: the actions are icons only (camera, picture, Google, bin), set apart from your photo by a thin line, with more room above them and above the centred line under them.
- Messages (like “Photo updated”) now float just above a sheet that takes half the screen or less, instead of covering its buttons; over a taller sheet they stay at the bottom as before.
- Sign in: the Install Split Now banner sits at the bottom of the screen, clear of the home bar, instead of right under the last button; the sign-in buttons and Join a live table have more room around them.
- New group: the Group and Personal choices at the top have icons in the same style as 1:1 friend's handshake (a team and a wallet), and in Simple mode the two choices share the row equally. Before, Group and Personal were emoji beside the drawn handshake, and in Simple the two tiles took two thirds of the row with an empty gap.
- Scan: Bill, Statement and Payment now end the same way. Each card says under its buttons who reads the picture (“Read by Google Gemini” or “Read on this phone”), and changes as soon as you switch AI in the corner; each tab ends with what happens next (“Nothing is added until you pick a group”, or for a statement, until you tick payments and tap Add), in Simple too. Before, only Statement said who reads it, only Bill and Payment had the closing line, and a bill could still go to AI after AI was switched off on another device.
- Quick add with AI understands more: “they paid” or “he got the bill” makes the person named the payer (before, “lunch with Rahul 1762, they paid” became an open item or was paid by you); “with Rahul” splits it between you and Rahul only, not the whole group; “Rahul owes 400”, “Rahul 700, rest me”, “60/40”, percentages and shares come out as exact amounts (before, uneven parts were dropped for an equal split); “everyone except Rohan” leaves Rohan out and keeps you in.
- Quick add: “paid Rahul 500 back” or “Priya paid me 300” opens Settle up filled in, instead of a new expense.
- Quick add outside a group (Home, holding + elsewhere): the people you name choose the group, the smallest one that has them all (a 1:1 for one person); when two fit equally it asks “Which group?”; when none has them, it offers a new group, a 1:1 for one person. Inside a group, or after picking one in the chip, the line stays there.
- Quick add sends a line to AI only when your phone can’t read it for certain; before, a line with an amount and known names was always read on the phone, and someone else paying, uneven parts or a payment back came out wrong.
- Profile: a new name, photo or badge reaches all your groups straight away, and a new member's photo shows as soon as they join. Before, each group only caught up when that person next opened the app, so friends could see an old name or no photo in a new group.

## 9.4.0 — October 2026

- Profile: in Simple, the New version ready row is its title alone, like the rows around it (it showed a line of subtext).

- Voice: works again on phones where the mic had vanished. Before, one “refused” answer from the browser hid the mic and hold-to-talk for good, and on Android that answer also came when the permission prompt took the press, or when the phone's own recogniser (a second app) held the microphone next to an AI recording; holding + then opened the Create sheet. Now the mic always shows where voice can work, and a refusal says how to allow it.
- Voice: a first hold that only answered the browser's microphone prompt shows “Allow the microphone when asked. Then hold + and speak.”, then “Microphone on” once allowed, instead of “Didn’t catch that” or “refused”. A blocked microphone says where to allow it (the site's settings, or the app's permissions on Android).
- Voice with AI on Android: the recording has the microphone to itself (the live words beside it were Google's app on the same microphone, which could leave the recording silent and the next press refused).
- Voice on Android: the phone's own recognition has the microphone to itself. Before, the bars above + opened a second microphone stream next to Google's recogniser, which could stop it hearing or make it report the microphone as refused.
- Voice on Android: words aren't repeated any more (Chrome there sends earlier words again with later ones, and “dinner dinner 1200” could come out).
- Voice in Chrome, Edge and Safari: a bad connection no longer marks the browser as having no speech service, which hid the mic for a week. Phones marked that way by an earlier version get their mic back.
- Voice in Opera and Brave: the on-device recogniser is tried with time limits, so a hold can't hang waiting on a browser that never finishes setting it up.
- Voice: the microphone is opened again after a moment when another app had it, and with plain settings when the phone rejects the speech ones.
- Admin → Logs has a Voice kind: each voice failure with the browser's own code, the engine, the microphone permission and what the browser supports, so a phone's problem can be read instead of guessed.

- Create: Quick add is always at the top of the sheet. Before, the Minimal look (Settings → Preferences) hid it behind a small “Quick add” link under the tiles, which looked like something to turn on first.
- Quick add: a little more room between the group's picture and “Into” in the group chip.
- Profile photo: one compact row, your photo on the left and Camera (on a phone), Choose, Google and Remove beside it. Before, it was a tall sheet with the actions listed under a big photo.
- Simple: Add expense has the Expense / Money received switch at the top in every group, as in Advanced. Before, Simple hid it. The group menu's Money received stays an Advanced item.
- Home: the whole settle up circle on the balance card takes a tap. Before, its lower half sat under the amount line, so a tap on the bottom of the cheque often did nothing.

## 9.3.1 — October 2026

- Your PRO, DEV or PRO DEV badge now shows beside you in a group's Members. Before, the group's security check ran out of its step allowance on most groups (a few people with photos were enough) and refused the update, so the badge, and a new name or photo, never reached the group.
- Profile photo: Choose photo, Remove photo and Use Google photo work again. Before, the save also wrote to every group you were ever in, and one in Recently deleted refused it, so the whole save was undone: you saw “Photo updated”, then “Something went wrong”, and nothing changed.
- Profile: the PRO or DEV pill sits centred on your name's line (it sat a little high).

## 9.3.0 — October 2026

- Voice with AI shows your words as you talk again: the phone's own recognition runs alongside, only to show them, and AI's text replaces them when you let go (if AI hears nothing or fails, the phone's words are kept). Before, with AI chosen the pill and the Quick add box stayed empty until AI answered. With Phone chosen nothing goes to AI, as before.
- The first time + works something out after you talk, a tip says you can double tap + to stop it.

- Quick add: “Working it out…” and “Reading your line…” show in the card's top-right corner with a spinner; an answer sits under the box in a tinted panel with a lightbulb, a problem (microphone, transcription) in a red one with an alert icon, both shorter. Before, they were plain grey text or a toast. The tips and answers rising from + have an icon in front too.
- Simple mode: the Create sheet keeps a short line under Quick add, Add expense, New group and Scan.

- Help: a tick appears at the top of a section once it counts. A section counts when its steps are played, it is read down to its end, and you've stayed a few seconds; finishing the steps alone is no longer enough. “What to know” has more room before its dots and between the lines.
- Sheets close in one smooth slide when you tap outside them. Before, the sheet rose again for a moment before it went.

- Edit group: a picked icon (emoji, drawn icon or picture) is saved at once, with “Icon saved”. Before, leaving without Save lost it; the rest of the form still waits for Save.

- Settings → Encrypted groups: help is a round **?** in the corner instead of the lifebuoy.
- Preferences → Mode: choosing Advanced (or Simple) keeps the switch under your finger; the rows that appear or go above it no longer make the page seem to jump.

- Draw a picture: the background is found by what a painted backdrop is (one flat colour, all the way round the picture) instead of fixed shares, so a white, cream or grey backdrop the model painted instead of magenta is removed too, while a sky, grass or a colour of the picture running off the edge stays; only background joined to the edges goes. On iPhone, pictures stay see-through down to 56 px before falling back, which put white squares behind them. The prompt asks for a simple vector-style illustration (an object or a small scene) with magenta showing all round it.
- Pictures and drawn icons are bigger: three quarters of a group's tile (a friend's photo still fills a 1:1's), and 1.5× an emoji's size elsewhere (they were about half the tile).
- Profile: the badge is the ring round your photo, and a small pill beside your name when there's room for both. When your full name and the pill don't fit, your first name stands with the pill; when even that doesn't fit, your whole name keeps the line and the ring alone says it.
- Draw a picture: Draw another keeps the earlier pictures for the same words in a row under it, so you can go back to the better one. Before, each new picture replaced the last, and typing in the search or closing the sheet threw a picture away, though each one was paid for. They stay until you close the app.
- Group icon: the AI rows share one layout, what it is on the left and a round redo on the right (Suggest again, Draw another), and the drawn picture is bigger.
- Sheets sit on top of the on-screen keyboard: typing in the icon search no longer pushes the AI buttons under it.
- The “Use the whole screen” card no longer shows on a launch where iOS reports the screen wrongly for a moment: it needs two readings, and a launch that reads right marks the install fine for good.

## 9.2.0 — October 2026

- Admin → AI → Transcription key: after **Save & check** the screen shows the saved key with Test, Use another key and Remove straight away. Before, it said “Transcription key saved” but went back to the empty paste box for up to a minute, because the status came from a server copy that hadn't heard of the save yet (the project key had the same lag).
- Admin → AI: the Bills and Bank SMS switches say they only stop Split Now's key paying (people's own keys keep working), and the matching Flags say they switch the feature off for everyone, each pointing to the other.
- AI features (and Admin → AI): **Test** sits beside Model for pictures, and the test picture appears at the end of that row (tap it to see it bigger), with one line under for the cost and the result. Before, a Test pictures button sat alone under a paragraph.
- Settings → AI features → Voice is one choice, **Phone | AI**, instead of a switch plus “Which key”. AI always uses your own Gemini key first, then Split Now's transcription key; with neither, it tells you to add your own key.
- Scan → Payment shows a screenshot with a tick (the payment confirmation you upload) instead of a phone with a rupee on it.
- Balances: each row's group is a small chip on its own line under the amounts, with room above it, and keeps its full name beside three buttons on a small phone (it was squeezed under the amount and cut to “Goa …”). Someone you share several groups with shows the total, then one chip and amount per group.
- Help: a section is ticked only once you've played its steps to the end (or read to its end) and stayed on it a few seconds. Rushing through no longer fills the ring towards Pro, and **Up next** no longer ticks the next section the moment it opens. Earn Pro's stamp card shows it: a ring goes round the next slot before its stamp lands.
- Voice in Opera, Opera GX, Brave and other browsers without Google's speech service: Split Now now switches to the browser's own on-device speech recognition (set up once) and your words show as you talk. Before, voice failed there and the mic then disappeared, as if you had refused the microphone. Where a browser has no recogniser at all, it says so and points to Transcribe with AI.
- New group and Edit group: the types are one sideways row of chips, faded at the edge where there's more, with the chosen one in view. Before, nine tiles in a grid of three took most of the card.
- Icons: Sort and filter (in a group, Insights' Filters and the private group preview) is a funnel, not the sort lines it shared with the sort pill. Help → What Split Now does shows the shared pot from its story, a bag with a rupee (it showed Support the developer's hand and heart).
- Group → Sort and filter: **Sort by** is a dropdown that shows your choice, instead of a fold of six radio buttons that pushed the filters down and showed under the sheet's title while scrolling.
- Talk to add: while you hold +, a pill above it shows five round, centred bars that grow up and down with your voice, then your words as they're heard, wrapping onto more lines as you go (the rings that spread from + are gone). Slide your finger away to cancel ("Let go to cancel"), and double tap + to stop it while it works. The tips and answers that rise from + are wider, in a soft wash of your accent, with ✕ centred and a gap above +. On iPhone, speaking no longer opens the microphone twice: that could ask for it twice and leave the phone hearing nothing ("Didn't catch that").
- Settings → Animations → **Badges** has two switches: **Turning ring** (the ring round a photo or a 1:1) and **Shine** (the light over the badge beside a name), for PRO, DEV and PRO DEV alike. Before, one switch called Pro badge did both. Your old choice carries over to both.
- Scan → Statement works without AI: with AI off or not available, your phone reads the screenshots and lists the payments for you to pick. Before, it stopped with “Statement import needs AI”. The AI switch in a Scan card’s corner is now a round brain button with “AI on” / “AI off” beside it, inside the card’s edge (it was a bot pill pushed into the corner).
- Help: the step controls are three round buttons of one height (back, play, next, which turns into start again on the last step), steps and captions sit centred with room before their dot or number, and every section ends with **Up next**, the following section in the guide, so you can read on without going back each time.
- Voice transcription has one home: Settings → AI features → Voice (Transcribe with AI), in Simple and Advanced. Before, the same setting was also in Preferences as Native / AI.
- Balances: **Pay** is a round icon button like the others on the row (the filled one, in your accent, showing a rupee note instead of a paper plane), a 1:1 says "1:1" under the amount instead of repeating the person's name, and the totals at the top no longer break across lines on a small phone.
- Profile: your PRO or DEV badge is the ring round your photo alone; the pill beside your name is gone. It said the same thing twice and was bigger than your name. Others still see the pill next to your name in Members and lists.
- Help: **Talk to add** is now one of the main features, and in Advanced so is asking for an OK on changes, so the main features fill even rows in both modes (10 in Simple, 12 in Advanced). Before, one card sat alone on the last row.
- Members: a PRO, DEV or PRO DEV badge sits after the status line ("Joined · DEV"), so the name keeps its whole line; and "gets back" / "owes" sits small above the amount, so long names and statuses aren't cut short. Before, the badge sat beside the name and the wide amount squeezed both.

## 9.1.1 — October 2026

- Rows of chips that scroll sideways (split types, filters, suggestions, Help's explainers, photos) fade softly at the end that has more, so a cut-off chip reads as "scroll for more". Before, the last chip was simply sliced at the screen edge.
- Long titles in Help's cards and lists wrap to a second line instead of running off or being cut to one line.
- Insights: a category or group worth 1–2% gets a short bar you can see, with its exact amount beside it. Before, it was a tiny stub that looked like a glitch.
- Long group names and expense descriptions take two lines in your lists on a narrow phone. Before, they were cut after a few words.
- Dark mode: the current tab in the tab bar has a soft glow in your accent, so you can tell where you are at a glance.
- A group's Activity says "Recently deleted · empty" in a quiet line when there's nothing to restore. Before, it was a full button that opened an empty sheet.
- A short buzz when an expense or payment saves, when you pull a sheet down to close it, and a double buzz with an error, on phones that vibrate. Off when your phone asks for less motion.
- Balances: every row is one line with the same layout: the name, then the amount, then the group, with Remind, Nudge and Record payment (or Pay) as icon buttons on the right. Amounts line up down the list, and a long group name or the amount in its own currency no longer gets cut off on a small phone. Before, rows with Remind moved the amount, so amounts zig-zagged.
- New group's types are a grid of three across, each with its picture above the name, so twelve types fill four even rows. Before, they wrapped as chips and Other sat alone on the last line.
- Two new group types: **Family** and **Sports**, each with its own icons, and the name picks them too ("Sharma family", "Sunday football"). Before, these groups had to be Other.
- Three new expense categories: **Subscriptions**, **Education** and **Pets**. The category follows the words: Netflix and Spotify are Subscriptions, school fees and Udemy are Education, the vet and pet food are Pets. Before, streaming was filed under Entertainment and the rest under Other, Shopping or Health. A Splitwise import maps Pets and Education to the new ones.

## 9.1.0 — October 2026

- **Talk to add.** Press and hold **+** and say what you paid ("dinner 1200 with Rahul, I paid"), then let go: + turns into a mic with a short buzz and a soft sound, your accent's bars move with your voice, and Quick add opens the form filled in (or answers, if it can't act on what you said). Inside a group a tap still adds an expense; holding is for talking, and the Create sheet is Home's +. Your phone does the listening, free, and it keeps listening through pauses until you let go. On a phone without speech recognition nothing changes. A bubble from + teaches it until you've tried it once.
- Quick add's mic is a toggle (tap to start, tap again to stop) or hold it while you talk. Your words wait in the box until you send them. Before, it stopped at the first pause.
- Quick add answers a line it can't act on ("Make me a sandwich") with what it can do, instead of opening an empty expense form. Quick add with AI now expects rough speech (no punctuation, misheard words, numbers said as words) and cleans it up before reading it.
- Settings → Preferences → Voice → **Transcription**: Native (your phone, free) or AI (the recording goes to Google's Flash-Lite to be written down), when the admin offers it and a key is available to you; otherwise Native alone, with the reason. Settings → AI features → Voice has the same switch (Transcribe with AI) and which key it uses. While AI writes a recording down, a spinner sits in Quick add's box.
- Admin → AI → **Transcription key**: a separate key for voice only, with its own model (Flash-Lite 3.5 recommended, 3.1 allowed) and a Test. A free-tier key is refused. Two new switches in Flags → AI (Transcription with AI; Everyone may use Split Now's transcription key) and two limits in Limits → Voice (the biggest recording; recordings per person per day).

## 9.0.0 — October 2026

- New icons for settings: a group's settings button is a set of toggles, so it no longer looks like the app's Settings; Profile's Settings gear has a clean, even circle in the middle, and it and the mode button are bigger and sit closer together. Before, both were the same gear and its middle looked off.
- Settings → Preferences: Mode (Simple or Advanced) is now the last section, and its Advanced option shows the same picture as Profile's mode button.
- Simple: a group chat's About sheet shows what the chat is and how to use it, without the settings underneath (the bell at the top still mutes).
- Help and the screens you open most (a group's chat, money and members, Settle up, Scan, Inbox) now load quietly in the background after the app opens, so the first tap on them doesn't wait.
- The install offer on the sign-in screen keeps **Install** on the same row as its words on every phone; its line is shorter (“Add to Home Screen first”) and wraps beside the button when it must. Before, on an iPhone the button dropped under the words.
- Shorter, plainer explanations across the app: the lines under settings, switches and screens say the same in fewer words, and where a title already said it all the line is gone and the title carries it (like **Add my bank payments here** on a trip, **New expenses with you** in Notifications). Warnings about money, privacy and deleting keep every fact. The detail levels have clearer names: **Explain everything**, **Short tips**, **Titles only** and **Tips behind (i)** (they were Full, When needed, Minimal and Tooltip).
- Finish every section of Help and its ring turns into a tick, with a **Congratulations** banner to claim your **Pro** badge. It stays yours even when Help grows; new sections just bring the ring back.
- Help has three new explainers under How it works, drawn like the jar in What Split Now does: a captured payment is a parcel with no name on it that goes through a door (a group, or just you) only when you pick one, and you can tap the doors yourself; Simple is a small pocket knife with two tools that grows into the full Swiss knife in Advanced and folds back down; and Collect in my currency pours $, € and ₹ glasses one by one into a jug measured in ₹. Earn Pro is a café stamp card: each finished section presses a stamp in, a full card says Congratulations, and turned over its back is your photo with the PRO ring and the badge by your name. Splits add up tears a real-looking ₹100 note (frame, numerals, security thread, watermark) into three. How balances work no longer starts and ends on the same level beam: it tips as Asha pays, shows who owes, and levels when they pay. The pictures no longer throw sparkles.
- Help's Simple and Advanced section plays its steps: the leaf in Profile turning into Advanced's picture with its accent burst, Undo, and Preferences → Mode. Help and What's new has a step for the progress ring and ticks; Scan's scene shows the new card with Camera, Photos and the AI button in its corner; Set up encrypted groups mentions the Help button at the top of Encrypted groups.
- Help's pictures move more quietly: the pointer fades back after it taps so you see what changed, pop-ins no longer bounce, coins turn slower, and charts, tags and shadows use your accent's colours in every accent and in dark mode instead of fixed violet, amber and green. What's new in the Help scene is tapped on the right tab, and scene buttons lost their leftover emoji.
- Help shows how far you are: a ring with the percentage at the top, a tick and an outline on sections you've finished, a dot on the ones you haven't read. It follows you to your other devices. Steps now wait for you: each one holds until you tap **Next** (or **Play** to run through). Before, they moved on by themselves and looped.
- Scan: Bill, Payment and Statement share one card, each with **Camera** and **Photos** (Statement can now take a photo of a printed statement too). Read with AI is a bot button in the card's top-right corner (on Bill and Statement; payment screenshots are read on the phone, so Payment has none, and Simple leaves it to Settings). Before, it was a switch row under the Bill card only, Statement had a single Choose screenshots button, and Statement was hidden in the Minimal look.
- Help is shorter and plainer: one short line per step and tip, simple words. It shows only what your mode has, so Simple's guide leaves out features Simple hides. Before, long sections repeated themselves and talked about settings Simple doesn't show. A new last section, Earn Pro, says how to earn the Pro badge.
- Settings → Encrypted groups opens straight away with what it last knew and updates a moment later. Before, it said “Checking…” for a few seconds on every visit. Its explainer moved into Help: the **?** at the top opens it, and back returns here.
- **Simple and Advanced** (Settings → Preferences → Mode). Simple shows the everyday app with fewer settings and shorter text; Advanced shows everything, as before. New accounts start in Simple; if you already use captured payments, approvals or changed how the app looks, you start in Advanced. Switching only hides things: what you set up keeps working.
- A mode button at the top of Profile, beside Settings: a leaf in Simple, and in Advanced a rocket, chip, brain, tools or dev tools picture, new each time you switch. A tap switches mode with a short pop and a burst of your accent's colours (Undo in the message puts it back); with reduced motion or Animations off it just swaps. Before, the mode was only in Settings → Preferences.
- In Simple: Settings leaves out Animations, Automation, the per-feature AI switches and Signing in; Profile offers UPI ID, bank transfer and PayPal; groups have no approvals, Merge, whose-turn chip, Money received or Export CSV; there are no personal wallets, and Import from Splitwise lives only in Settings → Data; Settle up has no Waive the rest; and only the lines that stop a mistake stay under titles. Everything you set before keeps working.
- Collect in your currency is now on for everyone who hasn't turned it off.
- **Pro badge**: finish Help and you're Pro. Your photo on Home and Profile gets a slowly turning PRO ring, a PRO pill sits by your name on Profile, and the people in your groups see the pill beside your name in Members, on your 1:1 in their lists ("PRO · Friend") and as a ring round your tile inside your 1:1. Tapping someone else's PRO opens Help on how to earn it (if you're Pro yourself, it does nothing). Settings → Preferences → Show my Pro badge turns it off for everyone and back on, and Settings → Animations → Pro badge stops its shine and turning. The people who run Split Now show DEV the same way (PRO DEV when they're Pro too); those marks aren't links.
- 1:1s show a handshake icon in your accent's colours instead of the 🤝 emoji, on every tile and in New group's 1:1 friend choice.
- Swiping a notice away with a mouse works every time. Before, a short drag that sprang back selected some of its words, and the next drag on them did nothing.
- Two-tone icons where they sit on colour: the tab you're on (in the Outline style) and the icons inside accent buttons have a soft fill under their line, like the Help lifebuoy. Groups uses three people side by side (before, two overlapping people looked cut off). The tab bar is a little more solid, so a bright button scrolling under it no longer shows through.
- Icons: Profile and Settings rows keep their two-tone drawings, now in your accent's colours on a soft tile with firmer lines; Support the developer is a hand holding a heart; Notifications is a bell with a dot; the Settings gear is strong with a light middle. Quick add is a plain bot, Scan → Payment shows a phone with a small rupee on it, and Start table has a filled fork and knife. Claim is a hand holding a note, the note strong and the hand lighter.
- Help's How it works explainers have shorter, livelier captions and tips, and smoother pictures: the balance beam settles level before it tips, the payment count climbs as the tangle draws, the rounded shares visibly round, and a private group's key reaches the phone only after the pattern. Each part now stays until its picture has finished, plus a moment. Before, some parts moved on mid-animation and the words ran long.
- Help's played steps: the pointer glides to each part and presses it (a ring spreads and the part lights up as it lands), sheets rise over a dimming screen, and a new screen pushes the old one aside. Each step stays as long as its words take to read. With reduced motion, Play now works too, as a plain crossfade. Before, the pointer jumped, and every step got the same time.
- Help on a small phone: the picture is shorter and the step being shown is written under it, so it reads without scrolling. The pointer no longer draws over the pinned header, and the dots beside steps and tips sit level with their first line.
- Help: Find an expense shows the sort-and-filter button (with its count) beside the search, as the app does. Before, its picture showed a labelled row.
- Help opens faster: it is fetched in the background while you use the rest of the app, and kept for later visits.
- After an update, **Updated · What's new** shows on whichever screen the app opens on (updating from Profile reloads on Profile), a second after it loads. Before, it showed only on Home, so it was easy to miss. On Add expense, Settle up and other forms it waits for the next screen with the tab bar.
- Settle up is full screen, like Add expense, with **Record** pinned at the bottom. Before, the tab bar and + sat over the form and the Record button was hidden under them.
- Settle up's amount reads "4,500.00" with its currency symbol at the same size, as on Add expense. Before, it showed "4500.00" beside a small symbol.
- Sheets slide down when they close, however they close (✕, Escape, tapping outside, Done). Before, only a drag animated and every other way made them vanish at once. A short flick down now closes one too.
- Switches between a few choices (the group's tabs, Sort, Preferences): one highlight slides to the option you pick, each option is easier to tap, and with four options each one fits its name. Before, "Expenses" spilled past its highlight.
- Pinned headers are a little more solid, with a thin line under them once the page has scrolled, so what scrolls under them doesn't show through.
- Group search says **Search expenses**, so it fits on a small phone. Before, it was cut to "Search expenses and r". It still finds notes.
- Dark mode: the empty amount and the description on Add expense are easier to read.
- Reduce motion: sheets and notices fade out quickly instead of vanishing.
- Notices fade and drop slightly as they go.
- Activity: a foreign-currency amount reads "$72.00 · ₹6,056.64". Before, it was "($72.00 (₹6,056.64))", brackets inside brackets. Older entries show the new way too.
- Groups: **New group** at the top is a labelled button. Before, a round + there looked like a second copy of the tab bar's +.
- Add expense: with Today or Yesterday picked, the date box shows just its calendar, so the date isn't said twice ("22 Oct" beside Today).

- Sign-in screen: Install Split Now puts its button beside the words where there's room (a computer, a wide phone) and under them only on a narrow phone, with the ✕ at the top corner. Before, the button always sat under the words, which looked out of place on a computer.
- Group balances: suggested payments that come to you are now green, and only the ones you pay are red. Before, every row was red, even money owed to you.
- Opening a link or reloading no longer jumps the new screen to where another screen was scrolled.
- Icons: a new icon set, one look per job. The tab bar, Profile, Settings, sheets and the buttons on a group, an expense and Settle up use one refined set (Fluent) with matching outline and solid versions; Help's cards and rows, empty screens and notices use larger two-tone pictures painted in your accent's own colours. Insights is a bar chart now, Live table a fork and knife, Quick add a little assistant bot, Help in Profile a lifebuoy, and the Profile and Settings rows show Help's two-tone pictures in white on a tile of your accent's gradient, with a clear picture each (tuning knobs for Preferences, a magic wand for Animations, a shield with a keyhole for Encrypted groups, a cloud folder for Data, money moving both ways for Balances). Small arrows, ticks and close buttons stay simple lines. Group and expense icons, categories and AI pictures stay as they are. Before, these places mixed thin line icons with emoji, and the first redraw looked out of place.
- Settings → Preferences → **Icons**: Outline (line icons) or Filled (solid icons), and Help's pictures follow it too; Default follows what Split Now sets, which an admin picks in Admin → App. The tab you are on is always solid, so it stands out in either style. It follows you to your other devices.
- Live table: the Scan the bill card shows a bill, so it no longer repeats the tab's icon.
- Auto-capture: clearing Recent activity says "Activity cleared", and the copy buttons on capture keys are read out as "Copy capture key" again. Before, both read out an internal name.

- App icon: the logo inside the icon is larger and bolder, so it reads clearly in the Dock, on the Home Screen and in the browser tab. Before, it looked small inside its tile, most of all on a Mac. Reinstall or wait for the browser to refresh an installed icon.
- Sheets: the title and ✕ stay at the top while a long sheet scrolls. Before, they scrolled away with it.
- Group expenses: Involving me and the category chips moved into **Sort and filter** as **Quick filters**, and Sort by starts folded, showing the order picked. Under the search, a pill with a small icon shows each sort or filter that's on ("Biggest first", "Paid by Rohan", "2 Oct – 4 Oct"); tap one to turn it off. Before, a row of chips always sat under the search.

- Tab bar: **Live table** has its own tab where Insights was, and Insights opens from **Profile**. The bar has a faint wash of your accent colour. (With live tables switched off, Insights keeps the tab.)
- Inside a group, **+** opens Add expense for that group straight away; press and hold it for the Create sheet. Before, it always opened the sheet first.
- Create sheet: **Quick add** comes first, then Add expense, New group and Scan. Settle up (on every group and on Home's balance card) and Live table (now in the tab bar) left the sheet.

- Home: the greeting, Inbox and your photo stay at the top while the page scrolls under them. Once the balance card has scrolled away, the line above your name says the balance (tap it for Settle up). Before, the whole header scrolled off.

## 8.8.1 — October 2026

- AI pictures: the magenta background is now removed even when the model shades it, and from gaps inside the picture (between the lenses of glasses, a mug's handle), so the picture fills its icon. Before, a shaded background stayed and the picture sat small on a magenta square. A pink part of the picture next to the background is no longer worn away.

## 8.8.0 — October 2026

- Group chat: after picking someone from the @ list, the next letters you type go where the cursor is. Before, on a busy phone the first letter could land at the end of the message ("@Rohan or the cabf").

- AI pictures: Draw a picture now gives an icon with no background, sized to fill its tile like an emoji. Before, it sat small on a white square that showed up against dark tiles. Pictures drawn earlier keep their square until drawn again.

- AI pictures: Draw a picture prices now show in your own currency, with Google's dollar price after ("about ₹2.81 (US$0.03)"), in the icon sheet, Settings → AI and the model pickers. Before, they were in US dollars only.

- Updates: after **Later** on New version ready, Profile now shows a **New version ready** row to update whenever you like. Before, Later hid it until the app was next reopened.

- Home: Recent activity (or Recent expenses) starts folded and opens smoothly with a tap on its title. A number beside the title says how many entries are new since you last opened it, counting only what others did.

- Screens with the tab bar leave a little more room at the bottom, so the last card or button (an expense, Record on Settle up) no longer sits right against the + button.

## 8.7.5 — October 2026

- Notices: the ✕ on the Updated banner, Install Split Now and toasts sits closer to the right edge and to its button, so the button (What's new, Install, Undo) moves right and the card reads as one row.

## 8.7.4 — October 2026

- Home: the "Updated" banner no longer sits at the top of the page. A moment after Home opens it rises from behind the tab bar into the spot above it, where New version ready shows, with the version and **What's new**. It waits while the New version, install or capture banner is showing.
- Swipe to close: every floating notice can be swiped sideways to close it: the Updated banner, New version ready (same as Later), Install Split Now (same as Don't ask again) and the small messages above the tab bar. A short drag springs back; the ✕ buttons still work.

## 8.7.3 — October 2026

- Open items: an open item now has its own icon, as an expense does, from the group's Open tab and from the chat's Open item tool. Tap the icon for every icon, search, Suggest with AI and Draw a picture; the icon follows the title, and when the app can't tell, AI picks one and offers its other good fits under the title. The category has its own row. Claiming an item keeps its icon on the new expense. Before, an open item only showed its category's emoji.
- Help: a new Open items section, with steps and a picture: writing one down, its icon, who might have paid, and claiming it.

## 8.7.2 — October 2026

- New group: AI now offers every icon it rates as a good fit (75 out of 100 or more), best first, instead of one second choice. The best becomes the icon; picking another keeps the rest on offer.
- New group: choosing a type after the name gave the icon no longer replaces it. The type's icon is offered beside it instead ("✈️ Trip icon · use it"). If you choose a type while AI is still picking, the type's icon shows until AI's answer arrives.

## 8.7.1 — October 2026

- New people need my OK: it can't be turned off while someone is waiting to be let in. Edit group says how many are waiting, with a link to the Inbox. Before, turning it off left their requests hidden.
- While it's on, only the person who made the group adds people. Before, anyone in the group could add someone by email, and that account was linked straight in without the OK.
- While it's on, the invite link no longer carries the names you added to the group. Nobody picks a name there; you match them when you let them in.
- Switching the setting off in Admin → Flags now only hides the switch. Groups that already have it on keep working. Before, people opening their invite could neither join nor ask.

## 8.7.0 — October 2026

- Groups: the person who made a group can turn on **New people need my OK** (Edit group → Approvals). The invite link, old ones included, then shows **Ask to join** instead of joining; they get a notification and let each person in, as someone new or as a name already in the group, or decline, from Inbox → Asking to join. Turning it off lets people join from the link again. Before, anyone with the link of an ordinary group joined straight away.
- Inbox → Asking to join: each request shows the person, the group with its icon, and how long ago they asked.

## 8.6.10 — October 2026

- Admin: on a phone the section tabs are icons, with the open tab's name beside its icon; on a wider screen every tab shows its name.

## 8.6.9 — October 2026

- Edit group: renaming a group now picks a fitting icon as New group does: the app's own icons first, then AI ("Picking an icon"), with AI's second icon offered and **Keep** to go back to the old one. The type isn't changed, and a drawn picture or an icon you chose on that screen is never replaced. Before, renaming left the icon as it was.
- Admin: the seven section tabs sit in one even row on a phone, each an icon over its name, instead of two uneven rows.

## 8.6.8 — October 2026

- Private groups: anyone in one who can't open it yet is now named in the group itself, under its header, with **Give it its own pattern**. This covers every way in, not just adding someone or letting them in: people added by email whose account was linked later, people in a new private group from the start, and people in a group when it was made private.
- Make private: when people in the group have no universal pattern, it starts on **Its own pattern**. Choosing Universal pattern says who would be locked out, before you confirm.

## 8.6.7 — October 2026

- Private groups: when you add someone, or let them in, who hasn't set up private groups, and the group has no pattern of its own, the app says they can't open it yet and offers to give it one now, to tell them in person. Before, they were let in and stayed locked out with no hint why.
- A private group's Private group sheet names anyone in it who can't open it yet, with **Give it its own pattern**. Removing a group's own pattern warns who it would lock out.
- New group and Import: the suggestions under the name ("Or 🐝 · use it", "Looks like a trip ✈️ · use it") show their whole text and scroll sideways when there are several, instead of being cut off.

## 8.6.6 — October 2026

- Private groups now start off. Turn them on in Settings → Encrypted groups; until then, New group and a group's menu don't offer to make one private. Anyone can still add you to a private group whether or not you've turned them on: it opens with its pattern and your passkey as before.
- If you already have a universal pattern or made a private group, private groups stay on for you.
- In a private group you were added to, its Private group sheet offers to turn private groups on, for making your own.

## 8.6.5 — October 2026

- The automatic icon with AI picks the emoji that fits best, not just one of the app's own: "honey" gets 🍯, "bees" 🐝, "Sri Lanka bees" 🐝 or 🇱🇰. Before, it could only choose from the app's list, so for "bees" or "honey" it gave a category but no fitting icon.
- New group: AI's pick is applied, and a second icon is offered under the name ("Or 🇱🇰 · use it").
- When Draw a picture isn't offered, the icon sheet says why: it needs your own Gemini key, or Split Now's key with pictures turned on. For an admin, it points to Admin → AI.

## 8.6.4 — October 2026

- Delete my account also removes your block record, your nudge and payment-check counters, and any account merged into yours earlier.
- Help: Delete your account now has steps and a picture that walks through them, like the other sections.
- Private groups: the Passkey row keeps its ＋ once you have one, so a phone your synced passkey doesn't reach can add its own. The pattern row shows how many tries are left after a wrong pattern. After too many it says "Locked" and until when, instead of "Ready".
- Help's auto-capture explainer no longer flashes a ring at the filter.
- Admin: the section tabs wrap onto two rows on a phone instead of hiding Logs and Insights off the edge.

## 8.6.3 — October 2026

- Icons: when Suggest with AI, Draw a picture and the automatic AI pick aren't available, the icon sheet now says why, with a link to AI features. The reasons it names: AI is off, AI icons are off, the free AI isn't agreed to yet, no Gemini key is added, the shared key isn't open to your account, or you're offline. Before, the buttons just weren't there.
- Icons with AI no longer need bill reading switched on. With Bills & statements off, Suggest with AI used to show and then refuse, and the automatic pick quietly did nothing. Now only the AI icons and AI picks icons switches count.
- New group: a name the app doesn't recognise keeps the icon you have, instead of going back to ✈️. While AI picks one, "Picking an icon" shows under the name.
- Settings → AI features shows the Icons section even when AI icons are switched off for everyone, saying so.

## 8.6.2 — October 2026

- Help: the auto-capture explainer is redrawn. Messages arrive on a phone, a light scans them, and only the bank alert goes through the filter, turning into a captured payment in your Inbox with Split, Personal and Not shared. The rest stay locked on your phone. Before, the last picture ran off the bottom of its frame and a ring floated over a sieve.
- The Simplify debts and Splits add up explainers no longer touch the edges of their frame while they play.

## 8.6.1 — October 2026

- A screen you open now starts at the top. Before, it kept the scroll from the screen before it: a Help section opened from low down on the guide started at its steps, under its picture and title, and looked like another section.
- Back and the phone's back gesture put each screen where you left it: how far down the page, and how far along Help's How it works row.
- Help keeps your search: back from a result returns to the results. Back from a section you reached through a link goes to the section you came from.
- A group that's gone, and the email link page, go back to Groups and Profile rather than to a screen that can't show anything.

## 8.6.0 — October 2026

- Private groups: one setup card in all three places, Settings → Encrypted groups, New group → Private group and Group ⋯ → Make private. It has a row for your passkey, the pattern and the encryption key, each saying where it stands (Added, Ready or Needed), with an icon button beside it. Add a passkey and Face ID comes up right there. Set or change a pattern without leaving the screen.
- When you make a group private, pick what it **opens with**: everyone's universal pattern, or a pattern just for this group that you share in person. You no longer have to go to Settings first.
- A private group always needs a pattern to open it and a passkey. The button to make it private waits until both are ready, and the server refuses a private group made without them. Removing a group's own pattern needs your universal pattern, so you can't lock yourself out.
- One passkey covers all your groups: it proves it's you, and the pattern is what can differ from group to group.

## 8.5.2 — October 2026

- Continue with Google now always asks which Google account to use. Before, signing out and back in (in the installed app above all) went straight back to the account used last, with no way to pick another. Pick an account from the list, or Use another account to add one.

## 8.5.1 — October 2026

- Delete my account: when your last sign-in is older than 5 minutes, the screen asks you to confirm it's you, right there. Sign in again with Google, or have a sign-in link emailed to you that brings you back to the screen. Before, an email account had to sign out and back in. If the link opens in your browser rather than the installed app, you can delete your account there.

## 8.5.0 — October 2026

- Delete my account (Settings → Data). Before anything changes, it shows what happens to each of your groups and what's still in the way. It can't go ahead while you owe or are owed money in a shared group, an expense of yours still needs an OK, a repeating expense still includes you, or you're an admin.
- Your Personal wallet and any group where nobody else has an account are deleted with your account.
- In groups shared with others, the expenses stay so the balances still add up, and your name there becomes "Deleted account". A group you made passes to the next person in it with an account.
- Your profile, photo, capture keys and captured payments, added emails, Pay me links and their screenshots, and live tables are deleted, and your sign-in goes last.
- For your safety it needs a sign-in from the last 5 minutes: Google asks again, and an email account is asked to sign in again. You type DELETE to confirm.
- Help has a new section, Delete your account.

## 8.4.3 — October 2026

- Help: the six How it works explainers are redrawn. The shared pot is a glass jar that fills and drains, balances sit on a spring-loaded seesaw, Simplify debts untangles real arrows into three payments, a ₹100 note tears into three shares with the leftover paisa, a private group is a safe with its key, and auto-capture is a sieve over your messages. Each follows your theme and accent, and stays still when Reduce motion is on.

## 8.4.2 — October 2026

- Behind the scenes: React 19.3.1 and the latest fixes to the testing and deploy tools. Nothing changes in how the app looks or works.

## 8.4.1 — October 2026

- Help's screenshots now match your app: each one comes in light and dark and in every accent colour, and shows the one you're using. They were all light and violet before. They're retaken from the current screens too, so Add expense, Receipt photos and Money received show today's receipt row.
- The examples use Bob’s Bar and Toit instead of a made-up restaurant name, in Help's scenes, the AI icons explanation in Settings → AI features, and the README.

## 8.4.0 — October 2026

- Help is complete: every part of Split Now has a section, with an animated scene or picture, steps or captions, what to know, and a Try it button. This release adds the last eleven. Auto-capture: sorting a captured payment, choosing which payments are captured, capture keys, and Apple Pay with Share to Split Now. Getting started: finding your way around Home, and tracking your own spending. Settings: theme, accent and detail level; your currency and Collect in my currency; animations; your profile, sign-in and emails; and installing the app, using it offline and updating.

## 8.3.15 — October 2026

- Help: Balances and settling up has nine more sections with steps you can play: reminding someone with a Pay me link, nudging, settling up across all your groups, recording cash, part payments and waivers, confirming a payment made to you, adding your UPI ID, weekly settle-up reminders and your Inbox. Settings gains choosing your notifications.

## 8.3.14 — October 2026

- Help: thirteen more sections with steps you can play. Adding expenses: editing, deleting and adding an expense again; getting back a deleted expense or payment; repeating expenses; comments and flags; category, date and notes; another currency; Split by items; several payers; approving an expense; finding an expense. Receipts: Live table. Groups: moving a group from Splitwise. Settings: exporting a group as a spreadsheet.
- Help: in a played scene, the pointer now also finds a quiet line of text (it missed those before, as in unlocking a private group).

## 8.3.13 — October 2026

- Help: Groups and people now has eleven more sections, each with steps you can play: inviting people, joining with a link, adding people who aren't on Split Now, merging two entries for one person, editing a group, asking for an OK on big expenses and payments, a group budget, trips and other group types, archiving, leaving or deleting a group, removing someone, and the group chat.
- Help: in a played scene, the pointer now also finds a row in a list (it missed those before).

## 8.3.12 — October 2026

- Help: How it works, at the top of the guide, explains six ideas with an everyday picture that moves as you read, instead of a list of taps: what Split Now does (a shared pot), how balances work (a seesaw), fewer payments to settle (untangling arrows), why splits always add up (₹100 three ways), what a private group hides (a locked box with the amounts on its label), and how auto-capture picks payments (a filter). Each plays on its own, or tap a line to jump to it.

## 8.3.11 — October 2026

- Settings → AI features is split into titled sections: Reading bills and screenshots, Bank SMS, Quick add and Icons, each with its own switches, then Your key and models (which key, Split Now's AI, your own Gemini key and its model). Model for pictures and Test pictures now sit under Icons. Before, everything but the main switch was under one Advanced panel.
- Admin → AI is split the same way: Feature switches, Project key, Engine and model, Who can use it and how much, What Split Now's key pays for, Pictures for icons, and Today.

## 8.3.10 — October 2026

- Draw a picture says why Google refused, and what to do: the key's prepaid credit has run out (top it up), the key has no billing (image models have no free tier), or Google is limiting pictures for a minute (wait). Before, all three read as no billing. On Split Now's key it says only that pictures aren't available right now.
- Test pictures: under Model for pictures, in Settings → AI features → Advanced for your own key and in Admin → AI → Pictures for Split Now's, a button draws one picture with exactly the chosen model, with no fallback to another. It shows the picture, the model, how long it took and what it cost, or why Google refused in its own words. It says first that the picture is billed, about US$0.03 with the recommended model.

## 8.3.9 — October 2026

- Private groups: an open private group shows an open padlock on its row in Groups. Tap it to lock that group straight away, without opening it. The padlock on a group's own page shows open too, in the accent colour, while the group is unlocked.

## 8.3.8 — October 2026

- Receipt photos in Add expense are one row: the scanned receipt comes first with a scan badge in its corner, then up to four attached photos, five in all. The separate scanned-receipt row and its Rescan button are gone, and the crosses are smaller.
- Tap any photo in the row to see it full screen.
- Scanning again when there is a scanned receipt asks first: a new scan replaces the receipt and fills in its details again. Crossing out the scanned receipt keeps what it filled in.
- The same picture isn't added twice. Attaching a photo that is already attached, or that is the scanned receipt, says so instead, and scanning the same receipt again says its details are already in the form.

## 8.3.7 — October 2026

- Help: every section now plays its steps on a small animated phone, not only the ten main features: signing in, money received, receipt photos, every private group topic, AI features and more. As it plays, each step it has shown is ticked off.
- Help: the guide no longer replays its cards' pop-in each time you come back to it, and no longer lists a section about Help itself (What's new still links to it). In What's new, the newest release has a Latest badge.
- Help: thirteen sections also have a screenshot of the real screen, under See a screenshot. It is plainly a picture: framed and labelled Screenshot, nothing in it can be tapped, and the step you're on is lit by dimming the rest. The screenshots load only when you open them, and stay available offline once seen.

## 8.3.6 — October 2026

- Draw a picture: choose the image model. With your own Gemini key, Settings → AI features → Advanced has Model for pictures, listing the image models your key can use with what a picture costs and how quick it is (Nano Banana 2 Lite, the default, about US$0.03 and 3 seconds; Nano Banana 2 about US$0.07; Nano Banana Pro about US$0.13). The recommended one stays the default: a picture is shrunk to a small icon, so a dearer model looks no better, and those say so. Admins choose the model for Split Now's key in Admin → AI → Pictures. If the chosen model fails, the recommended one is tried. The icon sheet's cost line follows the model in use, and a drawn picture says which model drew it.
- Draw a picture on Split Now's key now works whenever an admin turns pictures on, also while the free Gemma reads bills. Before, it was offered only on Gemini. The key needs billing either way.

## 8.3.5 — October 2026

- Help: Profile → Help is a guide to Split Now. Search it, or open a feature to read what to know about it. The ten main features (creating a group, adding an expense, ways to split, settling up with UPI, scanning a bill, Quick add, private groups, icons, auto-capture and Insights) each have steps you can play: a small phone shows each step, and a pointer taps what to tap. Tap a step to jump to it, or use Try it to go there in the app.
- What's new: a tab in Help lists every release of version 8, newest first, in a few lines each, and each line opens the part of the guide about it. Releases since you last looked on this phone are marked New. After an update, a banner says which version you're on, with See what's new. An admin can turn the banner off.

## 8.3.4 — October 2026

- Icons with AI on Split Now's free AI: Suggest with AI and AI picks icons came back empty every time, because the free model spent its whole answer thinking. It now answers straight away: suggestions arrive in about 10 seconds instead of timing out, and the automatic pick in under a second.

## 8.3.3 — October 2026

- Icons: tapping a group's icon now opens every icon, like holding it. The small "type an emoji" bar is gone: it saved the form when you pressed Enter and didn't search. In the icon sheet, Enter picks the first icon found and never saves the form.
- Icons with AI: Suggest with AI now shows up once you search, when nothing matches your words or after 3 seconds without a pick, and it asks about your words only. Draw a picture shows only when a key that pays for pictures is in use, and is hidden otherwise.
- Icons with AI: when the app can't tell the icon from a title (for example "Parasail" or a restaurant's name), Automatic now asks AI to pick one of the app's own icons, and the category or group type while you haven't chosen one. It works on Split Now's free AI. The expense keeps Automatic chosen, so a new description picks again. Turn it off in Settings → AI features → AI picks icons. It is never used in private groups.

## 8.3.2 — October 2026

- Icons with AI: Suggest with AI and Draw a picture now use the words typed in the icon sheet's search when there are some, for example "anchor" on a ferry expense, and the title otherwise. They work before a title is typed, and a search with no icons points to Suggest with AI.
- Icons with AI: Suggest with AI on the free AI failed on many titles with "AI didn't answer". It now asks for a plain answer that the free models get right, and keeps every icon it can read even if one drawing is broken. It also has more time to answer. When Draw a picture is refused because the Gemini key has no billing (image models have no free tier), it now says so instead of "You've used today's AI limit".

## 8.3.1 — October 2026

- Private groups: a right pattern on a lock button now brings up Face ID or the passkey after 0.7 s instead of 1.5 s. Pressing a lock button, or holding an icon, now fills the button from within its own shape instead of drawing a ring around it. Held long enough, the fill completes and the icon takes the brand colour, and it pops back when you let go.
- Icons: when Draw a picture can't be offered, the icon sheet now says why instead of hiding it. Pictures need your own Gemini key (about US$0.03 a picture, billed to it), and you're pointed to Settings → AI features. The cost note only shows when your own key would pay. With nothing typed yet, Suggest with AI says what it needs. Right-clicking an icon a second time opens the sheet again.

## 8.3.0 — October 2026

- Receipt photos: an expense now keeps its scanned receipt plus up to four attached photos (a card slip, a second page, a screenshot). Scan reads a bill and keeps it as the scanned receipt, and a new scan replaces it. Attach adds photos without reading them, several at once, and is disabled once four are attached. On the expense screen, the photos sit in one folded row ("Scanned receipt · 2 attached"). Opened, each is labelled Scanned or Attached and opens full screen, where the arrows, ← → or a swipe move between them. You can replace the scanned receipt, remove an attached photo (after a confirm), or add one while there's room. None of this changes the amount. In private groups the attached photos are encrypted like the receipt, and photos picked in the form come back after a reload.

## 8.2.0 — October 2026

- Icons with AI: Draw a picture. Press and hold an icon to get a picture from Google's image model as well as the emoji and drawn icons. With your own Gemini key it is offered even while Split Now's free AI is what you use, and the sheet says it is billed to your key (about US$0.03 a picture). On Split Now's key it is offered only when an admin turns on pictures, and only while the shared key runs Gemini, never Gemma, with a few a day per person. The picture is shrunk on your phone to a small icon before it's saved. It is never offered in private groups, and turning a group private removes its pictures.

## 8.1.4 — October 2026

- Private groups: while you set a pattern, each tap now shows as · and each long press as –, in order, so you can check it before saving. The lock buttons that take the pattern still show nothing of it.

## 8.1.3 — October 2026

- Icons with AI: press and hold an icon, then Suggest with AI. From the title it offers three emoji and up to three small drawn icons, and a drawn one shows wherever the app draws icons (text, like notifications, keeps the emoji). It runs on Split Now's free AI (Gemma) or your own key, only when you tap it, and never in a private group. Turning a group private removes its drawn icons. Every drawing is checked so only plain shapes and colours get through. The admin switch is Icons with AI; for each person it is Settings → AI features → AI icons.

## 8.1.2 — October 2026

- Private groups: after a wrong pattern on a lock button you can draw the right one straight away, on the same screen. Presses made while the last try is still being checked used to be lost, so the retry failed too and you had to leave and come back. Each press on the lock button now shows it was felt: the button sinks, and a ring closes in while you hold. Every press looks the same, so the screen still gives nothing of the pattern away.

## 8.1.1 — October 2026

- Add expense: Expense or Money received now sits right above the amount. Scan is the scan icon at the end of the description and still reads the bill. Attach, beside Today and Yesterday, keeps a receipt photo without reading it. An expense has one photo: once there is one, Attach is disabled and the photo gets its own row with a thumbnail, Replace and remove, and a scan over it says it replaced it. A photo Scan can't read now stays attached instead of being dropped.
- Expense screen: the receipt is folded into one row with a small thumbnail; tap to show it, tap the photo to open it full screen (tap again for full size), Replace it, or Add a receipt photo to an expense without one. None of these change the amount.
- Icons: an expense now shows an icon for what it was for, not only its category (Pizza 🍕, Ferry ⛴️, Kayaking 🛶), from about 190 sets of words that need no network. Group names pick a telling icon too (Ski trip 🎿, Sunday cricket 🏏), with over 100 group icons. Press and hold an icon (or right-click it) to search every icon or type any emoji; on Add expense a tap is still the category, and the category sheet has Choose an icon. An expense's icon can be changed from its own screen and set back to Automatic. While held, the icon sinks and a ring closes in, so you can see the hold working. In a private group the chosen icon is encrypted like the description.

## 8.1.0 — October 2026

- Changing your universal pattern now asks for the current one first, and setting, changing or removing a group's own pattern asks for a pattern that already opens the group. Before, Face ID or the passkey alone was enough, and anyone holding your unlocked phone can add a passkey.
- Stop using private groups: Settings → Encrypted groups, at the bottom. It deletes your universal pattern and passkeys, and the app stops offering to make private groups. It works once no private group you made is left (turn private off, delete or leave it). Private groups other people made still open with their own pattern. Start using private groups puts it all back.
- A new private group can get its own pattern as it's made (New group → Private group → Its own pattern).
- Private groups: choose how long they stay open without activity (Settings → Encrypted groups → Auto-lock, 1 minute to 1 hour, or Only when the app closes), and per group in its Private group sheet. Turn off Lock when I leave the app to keep them open while you switch apps or windows; with Only when the app closes as well, they lock only when the app is closed, reloaded or restarted (a restart always locks them). Both are kept on that device. Mouse moves, the wheel and typing now count as activity too, so a group no longer locks while you're reading with a mouse.
- Passkeys run on SimpleWebAuthn 14, which includes its fix to certificate revocation checks during passkey sign-up.
- The sign-in screen's glow no longer shows a hard dark edge in Safari and the installed app on a Mac.
- Admin → Logs: an opened entry wraps its long lines (stack traces, URLs) instead of scrolling sideways.

## 8.0.0 — October 2026

- Private groups open with your own universal pattern now. Set it once in Settings → Encrypted groups, along with a passkey. Then tap and long-press it on a lock button: the one on the Groups screen opens every private group you're in, the one inside a group opens just that group. There is no pattern screen and nothing shows the pattern going in or being wrong; it's checked after a short pause. Face ID or your passkey is asked for only after the pattern is right. Turn off Follow the sequence to have only the number of taps and long presses count. A group can also have its own pattern (Group ⋯ → Private group), which opens only that group. Patterns set in 7.1 keep working as the group's own.
- Private groups stay out of sight while locked: on the Groups screen and inside the group they keep the same layout as any group, with a lock for the icon, animals for the people, and scrambled letters, digits and symbols for every name, word and amount (encrypted words show as their own ciphertext; amounts use your currency's symbol). Inside, nothing works but the lock button. Home never includes private groups and says so; Balances counts one only while it's open, with a line and a lock button for the rest. Group pickers leave locked private groups out.
- Turn any group you made into a private group, or back: Group ⋯ → Make private. Everything in it is encrypted, its name, its people's names, expenses, notes, comments and chat, and everyone in it is told. A private group's name, emoji and people are encrypted too now, and nothing outside it names it: notifications say only what kind of thing happened, and invites, Pay me links and Remind messages say "A private group".
- Private groups keep photos again: receipts and payment screenshots are encrypted on your phone before they're uploaded, and opened on the phones of people in the group. The Scan tab reads a bill on your phone first when you have private groups, and only uses the AI once you pick a group that isn't private.
- Joining a private group takes its creator's OK: its invite (an old link too) offers Ask to join, the creator is told and lets them in from the Inbox, as someone new or as a person already in the group, or declines (one request at a time, a day before asking again). Only the creator adds people to a private group, and can add someone they're in another group with straight away.

## 7.2.0 — October 2026

- Admin → Logs: the server's logs (every function, filter by level, function, time, words or an account or group id, open an entry to see everything it carries and copy it) and errors reported from people's phones (crashes, unexpected errors and refused saves). A screen that crashes now shows "This screen hit a problem" with Reload instead of a blank page.
## 7.1.0 — October 2026

- Private groups: turn on Private group when you make a group. Descriptions, notes, comments, chat and open items are encrypted on your phone, and the group opens with a pattern of taps and long presses that everyone in it shares, plus Face ID or your passkey. Too many wrong patterns lock it for a while. It locks again when you leave the app or after 5 minutes idle; while locked its amounts don't show anywhere and its notifications say only that something happened. Anyone in the group can change the pattern. Photos and AI reading aren't available in private groups yet.
## 7.0.0 — October 2026

- Money received has its own screen in a group (from Balances or the ⋯ menu): what the group spent, what came back and the real cost, and for each person their share, their part of the money received, their real cost and how much they owe or get back before and after it. Settle up already uses the amounts after money received.
## 6.5.0 — October 2026

- Money received: when someone gets a refund or reimbursement that belongs to the group, add it with the new Expense / Money received switch in Add expense. Choose who received it and share it the same ways as an expense; whoever received it then owes the others their part. It doesn't count as spending in totals, budgets or Insights. Quick add understands "Rahul received 1000 refund" and "I got back 500", and Splitwise refunds import as money received.
## 6.4.0 — October 2026

- Deleting: when someone deletes an expense you're in, you get a notification with a link to restore it. A group someone else deleted shows in your Inbox with Restore, and Recently deleted is on the Groups tab at every detail level.
- Nothing in Recently deleted can be deleted for good in its first 7 days, so everyone has a week to see a delete and undo it. The screen says when Delete forever opens.
## 6.3.4 — October 2026

- Admin: the tabs fit a phone's width without scrolling, Admin opens on App, and the usage numbers (Overview, now Insights) are the last tab, loaded only when you open it. Detail level is a dropdown.

## 6.3.3 — October 2026

- Group chat: the send arrow is centred in its button, and the button sits evenly inside the message box's corner, however tall the message grows.

## 6.3.2 — October 2026

- Group chat: the header matches the group screen (same height, back button in the same place) with a bigger group picture, and Send sits inside the message box, on its bottom edge as the message grows.

## 6.3.1 — October 2026

- Sign-in screen: offers to install Split Now straight away, so you can install first and sign in once (on iPhone the Home Screen app has its own sign-in).
- Turn on notifications: the card now shows only in the installed app. In a browser you see just the install offer, not both.

## 6.3.0 — October 2026

- Turn on notifications: once you're in a group, a card on Home and in Settings asks to turn on notifications, with step-by-step help for your phone or browser (adding the app on iPhone first, or allowing them again if they were blocked). Close it and it stays away in that place.

## 6.2.7 — October 2026

- Installed app on iPhone: no more empty strip at the bottom of the screen. The app now uses a solid status bar, which iOS 26 sizes to the whole screen. iOS only picks this up when the app is added to the Home Screen again; a card on Home shows how, once.

## 6.2.6 — October 2026

- Group chat: opening the keyboard jumps to the latest message, so it shows right above the message box.
- Installed app on iPhone: the message box is no longer cut off at the bottom after the keyboard closes (a 6.2.5 change pushed it into the strip iOS keeps), and the app asks iOS for the full screen back once the keyboard has gone.

## 6.2.5 — October 2026

- Installed app on iPhone: the tab bar and the group chat's message box reach the bottom edge of the screen again after the keyboard has been open, with no dark band under them.

## 6.2.4 — October 2026

- Installed app on iPhone: no more dark band at the bottom of the screen after the keyboard has been open, in the group chat or anywhere else. iOS kept part of the screen after the keyboard closed until the app was quit; the app now takes it back.

## 6.2.3 — October 2026

- Group chat on iPhone: no more empty band under the message box after the keyboard closes, and none on the screen you go back to. The message box sits closer to the bottom edge, with no gap between it and the keyboard while typing.

## 6.2.2 — October 2026

- Group chat: the message box sits on the bottom of the screen again. On iPhone it could stop partway up, with empty space below it, after the keyboard had been open.

## 6.2.1 — October 2026

- Inbox → Recently handled: Clear all sits beside the arrow and shows only while the list is open (just the bin icon on narrow phones).

## 6.2.0 — October 2026

- **Group chat updates are system messages**: each expense, payment or change of people in the group shows on the left as its own update, with an icon for what it's about, so it never looks like someone talking. Three or more in a row fold into one line ("5 updates" and the latest) that opens to show them all. Readable on the narrowest phones.
- **About this chat is tidier**: what the chat is sits in one highlighted card, the how-tos (tools, tags, replies) fold away under How to use it, and the switches are grouped under Your settings, with explanations that follow your detail level.
- **Lines under menu options are consistent**: in a list of options, every option has a short line under it or none does, whatever the detail level. A line saying why an option is greyed out (like "Settle up first") always shows.
- **Inbox → Recently handled → Clear all** removes every handled payment at once, with Undo.

## 6.1.1 — October 2026

- For admins: Admin → AI names what Split Now's key pays for. The box is headed "What Split Now's key pays for", and its switches read **Bills, statements, Quick add and chat** (payment screenshot checks count there too) and **Bank SMS**. A line says these only stop Split Now's key paying (people with their own key keep using AI) and points to Flags → AI to turn a feature off for everyone.

## 6.1.0 — October 2026

- **Who edited an expense**: an expense now says who changed it last, as well as who added it ("Added by Ananya on 7 Oct · edited by Rahul on 8 Oct"). An edit by someone other than the person who added it always shows, in every detail level. Adding a receipt photo later counts as an edit. The group's activity log already showed who made each change; now the expense itself keeps it too.
- **No more notifications about your own edits**: when an edit means an expense needs everyone's OK again, the notification says who changed it ("Rahul changed Dinner · needs your OK again") and never goes to the person who made the change.
- Merging two people in a group records whoever carried out the merge as the editor of the expenses it changed.
- For admins: every edit must now name the person making it (the rules check it), so edits from apps older than 6.1.0 are refused. After this deploys, set Admin → App → Minimum version to 6.1.0 (Use this build) so older apps update first.

## 6.0.0 — October 2026

- **Appearance follows your account**: theme, accent colour, dual tone, text on accent, the animations and the detail level are saved to your account, so the app looks the same on the web and on the installed app on your phone. The newest change wins. Notifications and auto-capture setup stay on each device.
- **Choose how much the app explains**: Settings → Preferences → Detail level. Full (as today), When needed (one short line under each option), Minimal (titles only, keeping the lines that stop a mistake, and fewer optional sections) or Tooltip (every explanation behind a small (i) beside its title). Every explanation in the app now has a short version. An admin sets the default for everyone (App default), and you can pick your own.
- For admins: Flags & app is now two tabs. **App** has maintenance, update required, the announcement, sign-ups and the new **Detail level**. **Flags** puts the feature switches in sections (AI, Adding expenses, Groups, Payments and reminders, Capture and import), each saying how many are on, with chips to jump between them. Limits is in sections too, and the AI tab links to its switches.
- For admins: Stop announcement has a red outline.
- The QR shared bill is called **Live table** everywhere you start one (the + sheet, Scan), so it no longer shares a name with **Split by items**, the split in Add expense.
- Groups: the Balances button left the header (Balances is on Home and in the + sheet); Import stays.
- **Approvals in one place**: in New group and Edit group, big-expense approval (with its amount and small-edit allowance) and payment approval sit together under **Approvals**, which says what's on while closed ("Off", "Expenses over ₹2,000 · payments"). Merging people needs my OK stays on Members.
- **Needs your OK notifications**: Settings → Notifications has a Needs your OK switch (on). A big expense waiting for your approval, a payment for you to confirm, and an edit that needs your OK again all come under it, so turning off New expenses or Someone pays you back no longer hides them. An edited expense that needs your OK again now sends a notification (before, it only showed in the Inbox).

## 5.0.0 — October 2026

- Adding another email with a sign-in link now always brings in the groups waiting for that email. Before, a group that linked the address in the background at the same moment could end up pointing at an account that no longer exists, or the email was offered as a merge instead of simply added.
- **1:1 notifications, invites and Pay me links name the right person**: every notification about a 1:1 is titled with the other person, for each of you (before, your friend's said their own name). A 1:1 invite says who it's from ("Amrit wants to split expenses with you") instead of the friend's own name, old invites included, and its share message no longer says “Join Meera” to Meera. Pay me links in a 1:1 show the payer your name, and show you theirs.
- **AI for chat suggestions, if you want it**: ⓘ in a group chat has Use AI for suggestions (off by default, and only when an admin allows it under Admin → Flags: Chat suggestions with AI). When the built-in rules find nothing, it asks AI after you pause typing; a little slower, and it uses your AI allowance.
- Groups: the 1:1 section is called 1:1 with friends, and each one says Friend under the name (also in Add expense's group picker).
- **1:1 friends are the friend**: a 1:1 shows as the other person to each of you (you see Priya, Priya sees you), with their photo (or initials) on the same rounded tile as group icons and a small 🤝, on every screen. There's no name or icon to set, no members row, and Invite goes away once they've joined.
- **Groups hides what's long settled**: groups and 1:1s you've been square in for over a week drop out of the list; the eye in the header (or the line under the list) shows them again. Recently settled ones stay. Personal wallets always show.
- **A better group chat**: a solid header that stays put with a mute bell and an ⓘ, a faint wallpaper, your messages in a softer shade of your accent, the time and tick under each message, and cards (open item, Pay me, expense) that stand on their own with their own colour. The intro note only shows until the first message, and an updates pill leads with the latest update and its time.
- **Group chat tools**: Settle up asks everyone or chosen people, and each person gets one button for exactly what they owe you (or sees you're square). Balances shows who owes whom, live. Pay me can ask chosen people. Type / for the tools, @ to tag someone or @everyone (tags reach people who muted the chat), and lines like “can everyone settle up?” or “we had lunch for ₹600” offer the right tool (on the phone, nothing sent until you tap; switch it off in ⓘ).
- **Reply, edit and delete in the chat**: swipe a message right to reply, or press and hold for Reply, Copy, Edit and Delete. Only the author edits or deletes.
- The group's settings button is now a settings icon, and its sheet no longer repeats Group chat, Mute chat and Sort and filter (they're on the chat and the list).
- Inbox: Mark all read is an icon button and only shows on Updates.
- Fields no longer zoom the page when the keyboard opens (the chat box was 15px), and the app no longer scrolls a field to the middle of the screen, which could push it out of view.
- Sheets have room at the bottom in a phone's browser, not only in the installed app.
- An expense's “Added 11 Oct” sits on the same line as who paid and the date when it fits.
- New group shows your photo, and the photos of people you pick from your other groups. Add people has more room between search and adding someone new.
- Profile: How friends can pay you has the same icon tile as the other rows.

## 4.3.0 — October 2026

- **Sign in without a password**: Continue with Google, or type your email and tap Email me a sign-in link. Opening the link signs you in, or makes your account the first time, with no password and no separate confirming step. New accounts are asked once what friends should call them. Accounts that used a password sign in the same way, with a link to their email.
- **Emails go through Firebase only**: confirming a new email account and adding another email now use Firebase's own links instead of 6-digit codes, so no outside email service is needed. Profile → Emails → Add another email sends a link to that address; opening it adds the email (or offers to merge the account it already has). Admin → Email is gone.
- For admins: Admin → Users no longer has Link now; linking by email happens on its own.

## 4.2.0 — October 2026

- **A cleaner sign-in screen**: Continue with Google comes first; email has its own button that opens Sign in and Create account, with clear messages under each field and a show-password eye. Joining a live table with its code is its own button.
- **Email accounts confirm their address with a 6-digit code** sent by email, typed or pasted once. Accounts made before this are asked the next time they open the app. Google accounts don't need it.
- **More than one email on your account**: Profile → Emails → Add another email, confirmed with a code. Groups that add you by any of your emails reach this one account. If that email already had its own Split Now account, you can merge it in: its groups, Pay me links and tables move over.
- **Guests keep what they did**: someone who joined a live table or paid a Pay me link without an account and then signs up (or signs in) keeps it, and the group their payment was for shows up for them.
- People added to a group by an email whose account wasn't confirmed yet now get the group as soon as they confirm it.
- For admins: Admin → Email connects the service the codes go out through (Brevo or Resend).
- **One person, one entry in a group**: adding someone who's already in the group (same account or email) says so instead of adding them twice. Someone added twice (by name and by email, say) can be merged: press and hold them on Members → Merge, pick who they really are, see where they'll stand, and everything they paid or owe moves over. Split Now suggests a merge only when it's sure: an email that belongs to someone already in the group, or two accounts of yours that were in the same group. Anyone in the group can accept or dismiss it; it never guesses from names.
- **Merges that move money onto someone wait for them**: merging into someone who has an account needs their OK (unless it's you), so nobody's balance changes behind their back. The group's creator can also turn on "Merging people needs my OK" on Members for every other merge. A request is a card in the group chat that mentions the person, a notification, and an item in their Inbox to OK or decline.
- **@mentions in the group chat**: type @ and pick someone. They're highlighted in the message and get a notification even if they muted the chat.

## 4.1.0 — October 2026

- **Added by email, in the group at once**: someone added to a group by their email sees it straight away when they already have an account (and gets a notification); people who sign up later get the group when they first sign in with that email. Admins can link people in older groups from Admin → Users → Link now.
- Settings → Animations no longer runs wider than the screen on narrow phones, and long rows of options like Glitter shape fit better.
- Settings → Animations: the Glitter shape options are now a small picture of each shape (Mix stays a word), so the row fits any phone.
- Profile: on narrow phones the payment section is titled How to pay you, so it stays on one line.
- Inbox: a Mark all read button in the header, shown while there are unread updates.
- A group's member faces show how many more people there are as small text beside them (+2), not in a circle of its own that hid behind the faces.

## 4.0.0 — October 2026

- **Open items**: a new Open tab in each group for things the group spent that nobody has added yet, like "lunch on 2 Oct, who paid?". Type one line ("lunch 290 2nd Oct Cafe Blue") and it fills in the details. Name who might have paid and they get a notification. Whoever paid taps Claim: Add expense opens filled in, paid by them and split equally, ready to change. Delete the expense later and the item comes back to Open. If you read bills with AI, the line is also read with AI and offered as a second suggestion when it finds more. Quick add knows open items too: "lunch Oct 2 Cafe Blue, who paid?" or "maybe Priya paid for the ferry" opens the open item filled in, in the right group, for you to check and add.
- **Group chat**: every group has a chat just for money, from the chat icon on the group. Ask who paid, post an open item anyone can claim from the chat, send a Pay me with a Pay button, or add an expense and its card shows up there. Day headers, times, an unread line, and the group's expenses as small updates between messages. People who join later see the whole chat. No photos.
- Notifications: new **Group chat** and **Open items** switches, and **Mute chat** for one group in its ⋯ menu.
- Quick add reads dates: "Oct 2", "2nd Oct", "2/10", "last Friday", "3 days ago". A date's day number, a year, a time ("2:30"), "10%" or a phone number is never taken for the amount, and "290/-", "Rs. 290" and "1,20,000" read correctly.
- Settings shows the right number of notification types turned on.
- **Sort and filter** a group's expenses: the ⇅ button next to search, or Sort and filter in the ⋯ menu. Sort by the date spent, the date it was added, or the amount; show only expenses or only payments, only what one person paid, or a range of days.
- The date something was added now shows where it helps: on an expense ("Added by Ananya on 7 Oct, 6:45 pm · edited 8 Oct"), on a row added days after it was spent, and on open items.

## 3.10.2 — October 2026

- Admin → Flags & app: the minimum version and the announcement's end date each sit on a full-width row with a proper button beside them (Use this build, Stop announcement), which drops to its own line on a phone.
- A note shows when your changes haven't reached the server yet: "Saving…" if a save is slow, and offline, how many changes are waiting on this phone. Closing the tab while something is unsent asks first.
- In Admin, Back leaves the console instead of stepping back through the tabs you opened.
- AI on Automatic with **Use free AI** turned on tries the free AI first and your own key only if it can't answer, so your key's quota lasts longer.
- AI features screen: the rows now name the AI that will actually read for you, so with **Use free AI** off they no longer say Gemma. The main switch is now **Use AI**, since it covers bills, bank SMS, Quick add and payment screenshots, and the screen says when **Use free AI** has no effect because you chose **Only my key**.

## 3.10.1 — October 2026

- Adding an expense saves straight away. It used to wait up to a second and a half for the server first, and Add all and statement imports waited that long for every expense.
- On narrow phones the group's Settle up button reads Settle, so it stays on one line.
- Creating a group no longer waits for the server before it opens.
- Initials avatars are solid, so overlapping ones don't show through each other.
- The group budget bar is tidier: the percentage used sits above the bar, and what's left (or a warning with an icon when you're close to or over the budget) on one line under it.

## 3.10.0 — October 2026

- People are called by their first name everywhere in a group, and in pushes and activity. Two people who share a first name get a last initial, like Rahul S. and Rahul K., and full names only when even that would clash. Members still shows the full name underneath.
- Install Split Now from Profile any time, on a phone or a computer, even after closing the install banner. It shows the right steps for your browser.
- **Free AI with Gemma**: an admin can now run Split Now's AI on Gemma, Google's open model, which Google serves free of charge. It reads everything Gemini does (bills, statements, payment screenshots, bank SMS and Quick add) but more slowly. Each person turns on **Use free AI** in Settings → AI features first. The switch explains that Google may use what is sent to improve its products and that the free service isn't for people in the EU, the UK or Switzerland. By default it uses the newest Gemma model, so it moves to a newer one when Google releases it. Admins can also pick a specific model.
- **AI settings say where your data goes**: on Split Now's Gemini key, bills go from Split Now's servers in Mumbai to Google's paid Gemini API. When no AI is available, the screen says so and points to adding your own Gemini key.

## 3.9.0 — October 2026

- Links you share now preview properly in chats: an invite says who invited you and to which group, a Pay me link says who asked you to settle up (never the amount), and a live table says where the bill is from, each with its own picture.
- Inbox: clear an update with ✕ or Clear all (with Undo). It's hidden for you on every device, and nobody else's history changes.
- Inbox: sort Updates by newest, oldest or group, and To sort by newest, oldest or biggest amount. Your choice is remembered on this device.
- Inbox: Updates load a page at a time, with Show older for the rest, so a busy Inbox stays quick.
- Handled captured payments are tidied away after 30 days.
- Quick add works before you have any groups, on Home and in the + sheet. Name a trip and who's in it, or just a friend, and the group is set up for you to check first.
- Quick add with AI can set up a group from a line like "Create a group for my Bali trip with Rahul, Priya and Subramaniam", then opens Add expense in it.
- Add expense with no groups yet now has a ✕ to go back.
- Admins can set the Updates page size, the live updates per group, how long Recently deleted keeps things, and how long handled captures are kept.

## 3.8.0 — October 2026

- **Glitter is a flash of light**: as each firework burst fades, a quick flash of small lights goes off where it was, some bigger, some brighter, then gone. Glitter size sets how big they are, and the new **Glitter shape** picks Mix, Dots, Streaks, Stars or Curls. **Twinkle** is a separate setting, off by default: some sparks pulse as they fade.
- **Gold and Graphite have real dual tones**: Gold now runs from gold into deep bronze, and Graphite from slate into charcoal, with white or black text.
- **Security fixes**:
  - A deleted group is fully read-only. Nothing can be added or changed inside it until someone restores it.
  - A group's delete date can't be made up, so a group always gets its 30 days in Recently deleted.
  - A recorded payment can't be edited afterwards, so an approved payment stays as it was approved.
  - Only a group's creator can import payments that skip the recipient's OK.
- **Payments need the recipient's OK** now depends on the setting when a payment is recorded. Turning the setting off later doesn't let a payment that's waiting for an OK count.
- **Pay me links**:
  - A deleted group's links go on hold until it's restored.
  - If a payment can't be recorded, both people are told why instead of seeing "recorded".
  - A part payment no longer marks a bigger request paid.
- **Leaving a deleted group** is possible without restoring it for everyone.
- **Settle up across groups** shows payments you already recorded that are waiting for an OK, and doesn't net against a group where payments need an OK.
- **Archived groups** come back when an edit leaves you owing money, and leaving a group clears your archive.
- **Payment screenshots**: the check needs the recipient's first name or UPI ID, a shared surname isn't enough, and only the payer, the recipient or the group's creator can delete a screenshot.
- The party confetti follows the All animations switch, and the last day in Recently deleted reads "until the end of today".

## 3.7.0 — October 2026

- **Safe delete for groups**: deleting a group moves it to **Recently deleted** (on Groups) for 30 days instead of wiping it. Everyone in it is told, and any of them can restore it with one tap; after 30 days it's gone for good. The confirmation lists any payments still open. Only the person who created a group can delete it, unless they've left it, in which case anyone in it can once everyone is settled up. The creator can still delete a group forever straight away from Recently deleted.

## 3.6.0 — October 2026

- **Archive is personal**: archiving a group now puts it away only for you, and only once you're square in it, so it never hides money you owe or are owed. A new expense or payment that involves you brings it back by itself. Groups archived before stay archived for everyone until someone unarchives them, which brings them back for that person only. Reminders now go out for archived groups too, so nobody misses a payment they're owed.
- **Glitter is back as it was**: the soft, translucent sparks of all sizes that hang around a burst for a moment after it are the original look again with Glitter on. Glitter off now ends each burst without them, and Glitter size (Tiny, Small, Medium, Big) sets how big those hanging sparks and their glow are. 3.5.2 had dimmed them away by mistake.

## 3.5.2 — October 2026

- **Glitter you can see**: with Glitter on, a burst's sparks now stay visible and flicker gently once they have slowed, then fade out; with it off they are gone as soon as the burst finishes spreading. Glitter size now sets the size of those lingering sparks whatever the spark size, and has a new **Tiny** option, so Big sparks can leave fine glitter.

## 3.5.1 — October 2026

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
