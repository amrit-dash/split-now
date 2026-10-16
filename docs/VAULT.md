# Private groups (vault)

A private group keeps its words away from everyone who isn't in it: the server, a database export,
a console reader and someone looking at a phone it's locked on. Flag `vaults` (Admin → Flags →
Groups); on by default like every flag, server-enforced in the `vault` callable.

## What people see

- **New group → Private group** (a switch beside More options). Chosen once, when the group is
  made; it can't be turned off or on later (`firestore.rules` keeps `vault` as it was created).
- The first person to open it **sets the pattern**: at least 6 taps and long presses, in order,
  entered twice. Everyone in the group uses the same pattern, told in person. Anyone in the group
  can **change it** later (group ⋯ → Change pattern: the current one, the new one twice).
- Opening it takes the **pattern and a passkey** (Face ID, a fingerprint or the screen lock).
  Someone's first private group on a site registers a passkey; synced passkeys (iCloud Keychain,
  Google Password Manager) work on their other devices too, and the key lives on the server, so
  uninstalling the app or a new phone loses nothing.
- Wrong patterns: 5 tries, then a lockout of 15 minutes that doubles with each further wrong try,
  up to a day (per person, per group, kept on the server).
- An open group **locks again** when the app goes to the background, after `tuning.vaultLockMinutes`
  idle (Admin → Limits → App, 1–60, default 5), on sign-out and on a reload. The lock button in the
  group's header locks it at once.
- While locked, nothing of the group shows outside it: no balance on its row ("locked"), nothing in
  Home's totals (a line says so), the Inbox, Insights or Settle up across groups. Its pushes say only
  "Something new in this private group".

## What is encrypted

On the phone, with the group's data key (`src/lib/vault-fields.ts`): expense descriptions, notes,
item names and flag reasons; payment notes and flag reasons; comments; chat messages; open items'
titles and notes. Activity lines and history quote those as tokens, so they're encrypted too.

Readable to the server, on purpose: amounts, splits and who paid (balances, reminders, nudges,
budget alerts and the rules' checks need them), people's names, the group's name and emoji,
dates and categories. The app still hides amounts while the group is locked.

Not in private groups (yet): receipt photos and payment screenshots are not uploaded (Scan reads the
bill on the phone and the photo stays there); the AI doesn't read their bills or chat (Scan in Add
expense uses the phone's own reader, chat suggestions use the built-in rules only); merchant memory
doesn't learn from them. Encrypted photos need a CORS setting on the Storage bucket so the app can
download and decrypt them; that's the next step. The Scan tab (outside a group) still reads with the
AI before a group is picked, so scan from Add expense inside a private group instead.

## How it works

- **Data key**: 32 random bytes per group, made by the `vault` callable when the pattern is first set,
  stored only sealed with the `VAULT_KEK` secret (AES-256-GCM, `functions/src/lib/seal.ts`) in
  `vaultKeys/{groupId}`, which no client can read or write. Deleting the group for good deletes it
  (`onGroupDeleted`), and nothing that was encrypted can be opened again.
- **Pattern**: never stored; an scrypt hash with a per-group salt, peppered with the KEK so a copy of
  the database alone can't be brute-forced (`functions/src/lib/vault-core.ts`). A KEK rotation keeps
  working: the old hash still opens, and is stored again with the newest key.
- **Passkey**: WebAuthn (`@simplewebauthn/server` in the functions, `@simplewebauthn/browser` loaded
  only on the unlock screen), user verification required, relying party = the site's own host
  (`APP_ORIGINS`). Credentials and the one-time challenge are in `users/{uid}/secrets/passkeys`
  (server-only). The challenge is used up on every check, so an answer can't be replayed.
- **Unlock** (`vault` op `unlock`): passkey, then the lockout, then the pattern in a transaction (so
  parallel guesses can't skip the count), then the data key is returned. It stays in memory only
  (`src/lib/vault-keys.ts`).
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

## Setup

`VAULT_KEK` is created by the deploy workflow the first time it runs (`.github/workflows/deploy.yml`,
like `AI_KEY_KEK`) and is never overwritten: a new value would lock every private group for good.
Secret Manager keeps every version, so a lost one can be restored. Rotation: set
`"<new>,<old>"` (newest first); keys and hashes move to the new one as people unlock; drop the old
one once every private group has been opened.

## Later

Wrapping the same data key for each member's device (passkey PRF) so the server can't open it on
its own, without re-encrypting anything; encrypted photos.
