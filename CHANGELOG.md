# Changelog

Each release is a "Release x.y.z" pull request: it bumps `package.json` and moves the notes from
Unreleased under the new version. Merging it deploys to production and publishes the GitHub
Release (`.github/workflows/release.yml`). Fixes are x.y.Z, new features x.Y.0, breaking changes X.0.0.

## Unreleased

## 8.3.7 — October 2026

- Help: every section now plays its steps on a small animated phone, not only the ten main features: signing in, money received, receipt photos, every private group topic, AI features and more. As it plays, each step it has shown is ticked off.
- Help: the guide no longer replays its cards' pop-in each time you come back to it, and no longer lists a section about Help itself (What's new still links to it).
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
