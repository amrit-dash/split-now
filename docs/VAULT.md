# Private groups (vault)

A private group keeps its words away from everyone who isn't in it: the server, a database export,
a console reader and someone looking at a phone it's locked on. Flag `vaults` (Admin → Flags →
Groups); on by default like every flag, server-enforced in the `vault` callable.

## What people see

- **Settings → Encrypted groups** (only while the flag is on): a status card (passkey, universal
  pattern, server key) and the two things that open private groups:
  - a **passkey** (Face ID, a fingerprint or the screen lock). Synced passkeys (iCloud Keychain,
    Google Password Manager) work on a person's other devices too, and the group keys live on the
    server, so uninstalling the app or a new phone loses nothing;
  - a **universal pattern**: at least 6 taps and long presses, mixed, entered twice. **Follow the
    sequence** on: the order matters; off: only how many taps and how many long presses.
- **New group → Private group** (a switch beside More options) needs a universal pattern first.
  Chosen when the group is made, or later by its creator (below); no client write changes `vault`. The phone
  that made it gets its key at once (`create`), so it opens straight away.
- **The lock button is the pattern pad** (`src/features/vault/PatternLock.tsx`). There is no pad
  screen: the pattern is tapped and long-pressed on the lock icon itself, and nothing on screen
  changes or says a pattern exists, and nothing buzzes. The pattern is sent after 1.5 s without a
  press. Fewer than 6 presses are a
  stray tap and never reach the server (`shouldSend`), unless the group has its own, shorter
  pattern. A right one brings up Face ID or the passkey (made on the spot on a site with none
  yet); a wrong one does nothing at all; someone with no pattern set up gets the
  setup prompt. The passkey is asked for only after the server says the pattern is right.
  - **Groups screen** (top right) and **Balances**: the universal pattern opens every private group
    the person is in; once all are open, the Groups button locks them all.
  - **Inside a locked group** (top right): the universal pattern or the group's own one, opening only
    that group.
- **A group's own pattern** (Group ⋯ → Private group): optional, any length, the same sequence switch.
  It opens only that group, for anyone in it who knows it, even someone with no universal pattern.
  Anyone in the group who can already open it (with their universal pattern or its own) can set,
  change or remove it, after their passkey. 7.1's group patterns are kept as the groups' own.
- **A new group's own pattern** can be chosen as it's made (New group → Private group → Its own
  pattern), entered twice; it goes to the server with the group's first key (`create`). Later it is
  changed from the group's menu, as above.
- **Stop using private groups** (Settings → Encrypted groups, at the bottom). Only once no live
  private group they made is left (turned off, deleted or left: `blocksStopping` in
  shared/vault-convert.ts); others' private groups don't count. It asks for the current universal
  pattern and the passkey, then deletes the pattern and every passkey, and sets `off` (and
  `users/{uid}.privateGroupsOff`, which the app reads). After that the app offers no private group:
  no switch on New group, no Make private, no lock on the Groups screen, and the server refuses
  `create` and `convert` on. A private group someone else made still opens inside, on its lock
  button, with its own pattern (Face ID makes a new passkey on the spot); one with no own pattern
  stays locked for them, silently, until its creator gives it one. Wrong tries are kept. Setting a
  universal pattern again (Start using private groups) turns it all back on.
- **Changing a pattern takes one that opens it.** The universal pattern changes only after the
  current one, and a group's own after the universal pattern or the group's own; a wrong one counts
  as a wrong try. A passkey alone is never enough, because anyone holding the unlocked phone can
  add one (it is the phone's own screen lock). There is no reset: a forgotten universal pattern
  stays until the person remembers it, and a group's own pattern can still be changed by anyone in
  the group who can open it.
- **Wrong patterns** (universal or a group's, counted together per person, on the server): 5 tries,
  then 15 minutes, doubling with each further wrong one, up to a day.
- An open group **locks again** when the app goes to the background, after its idle time, on
  sign-out and on a reload. The lock button in the group's header locks it at once. Taps, clicks,
  pointer moves, the wheel, keys, typing and scrolling count as activity, for every open group.
  The idle time is `tuning.vaultLockMinutes` (Admin → Limits → App, 1–60, default 5) unless the
  person chose their own in Settings → Encrypted groups (Lock after: 1 min to 1 hour, or Never), or
  one for a group in its Private group sheet. With Never and Lock when I leave off, only closing,
  reloading or restarting the app (the keys live in memory), signing out or the lock button lock them. **Lock when I leave the app** (on by default) can be turned
  off, for a laptop: then only the idle time locks them, checked again the moment the app is back
  in front. These choices stay on the device (localStorage `sn-vault-lock`,
  src/lib/vault-lock-prefs.ts); nothing about them is secret.
- **Home never shows private groups**, open or locked: not in the totals, the people, the recent
  list or the feed; the card says "Doesn't include private groups".
- **While locked, it looks scrambled** (`src/lib/vault-scramble.ts`): a lock for its icon, animals
  for its people, and scrambled letters, digits and symbols for every text and amount. Encrypted
  words show as their own token (`sealedLook`: the ciphertext's characters, about as long as the
  text); what has no token yet (the group's and people's names) and amounts (never encrypted, the
  server needs them) are made up from an id, so they don't flicker. Amounts carry the viewer's own
  currency symbol, never the group's, and always a non-digit, so none reads as a real balance. On
  the Groups screen and in Recently deleted, and inside it: the same layout as an open group (card,
  people, Settle up and Invite, the tabs, search, the list), all inert except the lock button,
  with "Private group" as the page title.
- **Balances** (/settle) and settling across groups count a private group only while it's open; a
  line says how many aren't included and opens them. Group pickers (Add expense, Scan, captures,
  live tables) leave locked ones out (`usePickableGroups`). Nothing of a locked group is in the
  Inbox or Insights. Its pushes say only "Something new in this private group".

## What is encrypted

On the phone, with the group's data key (`src/lib/vault-fields.ts`): expense descriptions, notes,
item names and flag reasons; payment notes and flag reasons; comments and their authors' names;
chat messages, their authors' names and the snippet a reply quotes; open items' titles and notes.
In the group document (`src/data/vault-repo.ts`): its name, its emoji and every person's name in it.
Activity lines and history quote those as tokens, so they're encrypted too. The fields and their
caps are one list, `shared/vault-convert.ts`, which the phones and the server share.

Readable to the server, on purpose: amounts, splits and who paid (balances, reminders, nudges,
budget alerts and the rules' checks need them), dates, categories, people's account ids and the
emails a placeholder was added by (linking accounts needs them). The app hides amounts while the
group is locked. An activity line's actor is the writer's account name as the phone had it.

Outside the group nothing names it (`shared/names.ts` PRIVATE_GROUP_NAME): pushes say only what
kind of thing happened, with "Split Now" as the title (`privateGroupNote`: "You have a balance to
settle in a private group.", "Rahul sent you a nudge about a private group.", "A private group has
reached 80% of its budget."); its invite (readable to anyone with the link) is "A private group"
with a lock and no people; a Pay me link and a Remind message say "A private group", with no emoji.

## Turning an existing group private, or back

Its creator, from Group ⋯ → Make private (or Private group → Turn off private), after a passkey
and with a universal pattern set (vault op `convert`). The server does it, since the rules let no
one rewrite other people's comments, chat or the append-only activity: it marks the group private
first (from then on no phone without the key can write to it), makes its key, seals every
document's words (`shared/vault-convert.ts` sealDoc; the same token code as the phones,
`shared/vault-crypto.ts`), then a second pass for anything written meanwhile, renames its invite,
and tells everyone in it. Turning it off opens every token (openDoc), marks it plain, opens once
more, deletes its key and names the invite again. Only text changes, so no update trigger fires
(they react to money, approvals and deletes). Demo mode does the same over its own copy.

Photos: receipts and payment screenshots are sealed on the phone after downscaling
(`shared/vault-crypto.ts` sealBytes: "SNV1", a random IV, AES-256-GCM with the group bound in)
and stored as usual; the app downloads the bytes and opens them itself (`repo.photoUrl`, blob URLs
forgotten when the group locks), which needs the bucket's CORS (`storage.cors.json`, applied by the
deploy; docs/FIREBASE_SETUP.md). People's photo links in the group are tokens like their names. The
server's AI check never reads a private group's screenshot; the payee checks it. A Pay me link's
screenshot (from a payer with no account) can't be sealed and stays as it is.

Not in private groups: the AI doesn't read their bills or chat (Scan in Add expense uses the phone's
own reader, chat suggestions use the built-in rules only); merchant memory doesn't learn from them.
The Scan tab, for someone with private groups, reads on the phone first (nobody knows yet which
group the bill is for) and lets the AI read it only once a group that isn't private is picked;
locked private groups aren't offered there.

## Who gets in

Nobody joins a private group from its invite, an old link included (`firestore.rules` isJoining
refuses it). The invite page says only "A private group" and offers **Ask to join** (vault op
`requestJoin`): the server records the request in `groups/{gid}/joinRequests/{uid}`, their name
sealed with the group's key, and tells its creator, who sees it in the Inbox under **Asking to
join** and lets them in, as someone new or into one of the group's placeholders, or declines
(`decideJoin`, after their passkey). One request per person at a time; after a decline, a day
before they may ask again (`functions/src/lib/join-core.ts`). Until they're let in they read
nothing of the group.

Only its creator adds people (the rules refuse anyone else's placeholder): by name or email, as
in any group (an email that matches an account links as usual), or directly someone they're
already in another group with, who is in at once (`addContact`). Demo mode has one person, so
asking to join answers that it needs the online app.

## How it works

- **Data key**: 32 random bytes per group, made by the `vault` callable when the group is made or first opened,
  stored only sealed with the `VAULT_KEK` secret (AES-256-GCM, `functions/src/lib/seal.ts`) in
  `vaultKeys/{groupId}`, which no client can read or write. Deleting the group for good deletes it
  (`onGroupDeleted`), and nothing that was encrypted can be opened again.
- **Patterns**: never stored; scrypt hashes with their own salt, peppered with the KEK so a copy of
  the database alone can't be brute-forced (`functions/src/lib/vault-core.ts`). With the sequence off
  the pattern is sorted before hashing, so only the counts matter. The universal one is in
  `users/{uid}/secrets/vault` with the person's wrong tries; a group's own one in `vaultKeys/{groupId}`.
  A KEK rotation keeps working: the old hash still opens, and is stored again with the newest key.
- **Passkey**: WebAuthn (`@simplewebauthn/server` in the functions, `@simplewebauthn/browser` loaded
  only on the unlock screen), user verification required, relying party = the site's own host
  (`APP_ORIGINS`). Credentials and the one-time challenge are in `users/{uid}/secrets/passkeys`
  (server-only). The challenge is used up on every check, so an answer can't be replayed.
- **Unlock**: `unlockStart` checks the pattern in a transaction (so parallel guesses can't skip the
  count) and only then hands out a passkey challenge that carries what it opens (`*`: every live
  private group the person is in; or one group). `unlockFinish` checks the passkey and returns those
  data keys; a group with no key yet gets one then (nothing of it can be encrypted before). The keys
  stay in memory only (`src/lib/vault-keys.ts`).
- **Tokens**: `"v1:" + base64url(iv ‖ AES-256-GCM)`, keys from the data key by HKDF, the group id as
  associated data (a token copied into another group won't open). The IV is an HMAC of the text, so
  the same text makes the same token: saving an expense again isn't a change in its history. The
  cost: two identical texts in one group look alike in the database. A private group's description
  is limited to 100 characters so its token fits the rules' 200.
- **Writes** go through `src/data/vault-repo.ts`, which seals the fields before either repo sees them
  and refuses a write to a private group that is locked on this device. **Reads**: every live query
  of a group passes through `openedWatch` (`src/lib/vault-open.ts`), which opens tokens with the key
  or shows 🔒, and reads again when the group opens or locks.
- **Demo mode** (`src/data/vault-demo.ts`): the callable's answers made on the device, without the
  passkey step, so the e2e suite runs the whole flow.
- **Emulators**: `npm run test:functions` writes a throwaway `VAULT_KEK` into the gitignored
  `functions/.secret.local` (`scripts/emulator-secrets.mjs`).

## Setup

`VAULT_KEK` is created by the deploy workflow the first time it runs (`.github/workflows/deploy.yml`,
like `AI_KEY_KEK`) and is never overwritten: a new value would lock every private group for good.
Secret Manager keeps every version, so a lost one can be restored. Rotation: set
`"<new>,<old>"` (newest first); keys and hashes move to the new one as people unlock; drop the old
one once every private group has been opened.

## Later

Wrapping the same data key for each member's device (passkey PRF) so the server can't open it on
its own, without re-encrypting anything.
