/*
 * Callable `vault`: private groups (docs/VAULT.md). One function, several steps (`op`):
 *
 *  - status         { groupId?, made?, convert? }    → this person's setup (passkey, universal pattern,
 *                                                       on, stopped), tries left / locked until, and for a
 *                                                       group: key made, own pattern set; `made`: how many
 *                                                       private groups they made would keep them from stopping;
 *                                                       with a group, who else in it has no universal pattern
 *                                                       (`convert`: a group its creator may make private).
 *                                                       Someone from before private groups started off who
 *                                                       has a universal pattern or made one is marked on here
 *  - start          {}                                → this person turns private groups on (Settings →
 *                                                       Encrypted groups): the app offers to make them
 *                                                       (users/{uid}.privateGroupsOn). Needs no pattern: one
 *                                                       is chosen per group, or set later
 *  - passkeyOptions { purpose: 'register' | 'auth' } → WebAuthn options; the challenge is kept for 5 minutes
 *  - passkeyRegister { response }                    → a passkey (Face ID, fingerprint, screen lock) for
 *                                                       this person on this site, kept in users/{uid}/secrets/passkeys
 *  - setUniversal   { pattern, ordered, current?, auth } → this person's universal pattern (needs the passkey,
 *                                                       and the current one to change it)
 *  - unlockStart    { pattern, groupId? }            → checks the pattern first (wrong ones count towards a
 *                                                       lockout); only a right one gets a passkey challenge
 *  - unlockFinish   { auth | register }              → the data keys: every private group the person is in
 *                                                       (universal pattern on the Groups screen), or one group
 *  - groupPattern   { groupId, pattern, ordered, current, auth } → set, change or (pattern null) remove a group's own
 *                                                       pattern; `current` is a pattern that opens it for them
 *  - create         { groupId, pattern?, ordered? }  → a new private group's first data key, for its member
 *                                                       on the phone that made it (only while it has none);
 *                                                       its name, emoji and people's names are sealed with it,
 *                                                       and its own pattern set when one was chosen
 *  - stop           { current?, auth? }               → this person stops using private groups: their
 *                                                       universal pattern and passkeys are deleted and the app
 *                                                       stops offering private groups (users/{uid}.privateGroupsOff).
 *                                                       Refused while they're in a live private group they made;
 *                                                       other people's open with those groups' own patterns.
 *                                                       `start` (or setting a universal pattern) turns them on again
 *  - joinStatus     { code }                          → where this person stands with a private group's invite
 *  - requestJoin    { code }                          → asks to join it (nobody joins a private group from its
 *                                                       invite); its creator is told
 *  - decideJoin     { groupId, uid, approve, memberId?, auth } → its creator lets them in (as a new person, or
 *                                                       into a placeholder), or not
 *  - addContact     { groupId, uid, auth }            → its creator adds someone they share another group with
 *  - convert        { groupId, on, auth }            → its creator turns an existing group private, or back:
 *                                                       every document's words sealed (or opened) here, with
 *                                                       the Admin SDK, since the rules let no one rewrite
 *                                                       other people's comments, chat or the activity log
 *
 * Private groups start off for everyone (the owner's call): the app offers to make one only to someone
 * who turned them on. Being off never keeps anyone out of a private group someone else added them
 * to: it opens with its own pattern and their passkey, and joining, the Inbox and the locks ask
 * nothing about it. The on state is the server's (users/{uid}/secrets/vault `on`, mirrored to
 * users/{uid}.privateGroupsOn for the app to read); `start`, `setUniversal`, `create`, `convert`
 * and the backfill in `status` set it, `stop` clears it.
 *
 * The data key is sealed with the VAULT_KEK secret in vaultKeys/{groupId}, which no client can
 * read; patterns are stored only as peppered scrypt hashes (lib/vault-core.ts): a person's universal
 * one in users/{uid}/secrets/vault, a group's own one in vaultKeys/{groupId}. A passkey proves it's
 * this person on a device they set up; the pattern proves they know the secret. The passkey is
 * asked for only after a right pattern, so a wrong guess never reaches Face ID. A passkey can be
 * added by anyone signed in on the phone (it is the phone's own screen lock), so it never stands in
 * for the pattern: changing a pattern takes one that already opens it (counted like any try).
 */
import { logger } from 'firebase-functions/logger'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { FieldValue } from 'firebase-admin/firestore'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { db } from './admin'
import { sendToUser } from './push'
import { vaultKey, type VaultKey } from '../../shared/vault-crypto'
import { blocksStopping, openDoc, privateGroupsOn, sealDoc, type ConvertKind, withoutUniversal } from '../../shared/vault-convert'
import { inviteNameFor } from '../../shared/names'
import { MEMBER_COLORS, accountName, admission, joinGate, memberIdFor, sharesAGroup, type JoinRequestDoc } from './lib/join-core'
import { APP_ORIGINS, ENFORCE_APP_CHECK, REGION } from './config'
import { flagOn } from './lib/limits'
import { parseKekList, type Sealed } from './lib/seal'
import {
  afterWrong,
  groupPatternProblem,
  hashPattern,
  lockedOut,
  newDataKey,
  patternMatchesAny,
  patternProblem,
  pepperOf,
  rpFor,
  triesLeft,
  unwrapKey,
  wrapKey,
  type PatternHash,
  type TryState,
} from './lib/vault-core'

export const VAULT_KEK = defineSecret('VAULT_KEK')

const CHALLENGE_MS = 5 * 60_000
const MAX_PASSKEYS = 10

interface StoredPasskey {
  id: string
  publicKey: string
  counter: number
  /** as the authenticator reported them (14 types them as plain strings, unknown ones included) */
  transports?: string[]
  rpID: string
  createdAt: number
  lastUsedAt?: number
}

/** 'unlock' challenges are handed out only after a right pattern, and carry what they open. */
type Purpose = 'register' | 'auth' | 'unlock'

interface PasskeyDoc {
  credentials?: StoredPasskey[]
  challenge?: string
  challengeAt?: number
  challengePurpose?: Purpose
  /** for 'unlock': '*' (every private group the person is in) or one group's id */
  challengeScope?: string
  /** the ceremony the challenge was made for, so an answer of the other kind is refused */
  challengeKind?: 'register' | 'auth'
}

/** A person's own vault settings (users/{uid}/secrets/vault; server-only). */
interface PersonDoc {
  pattern?: PatternHash
  setAt?: number
  /** wrong patterns, universal or a group's, counted together */
  tries?: TryState
  /** turned private groups on (op `start`, a universal pattern, or a private group they made) */
  on?: boolean
  onAt?: number
  /** stopped using private groups (op `stop`): no new ones until they turn them on again */
  off?: boolean
  offAt?: number
}

interface VaultKeyDoc {
  wrapped: Sealed
  /** the group's own pattern: optional since 8.0 (7.1 groups all have one, in order) */
  pattern?: PatternHash
  createdBy: string
  createdAt: number
  patternChangedAt?: number
  patternChangedBy?: string
}

export type VaultStatus = {
  /** VAULT_KEK is set, so keys can be made and opened */
  serverReady: boolean
  hasPasskey: boolean
  universal: boolean
  /** the universal pattern follows its sequence */
  ordered?: boolean
  triesLeft: number
  lockedUntil?: number
  /** `noUniversal`: the others in it with no universal pattern (without its own pattern they can't open it) */
  group?: { keyReady: boolean; hasPattern: boolean; ordered?: boolean; noUniversal?: string[] }
  /** turned private groups on: the app offers to make them */
  on?: boolean
  /** stopped using private groups */
  off?: boolean
  /** asked with `made`: the live private groups they made and are in (each keeps them from stopping) */
  made?: number
}

function caller(req: CallableRequest): string {
  if (!req.auth || req.auth.token.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated', 'Sign in first')
  return req.auth.uid
}

const kekList = (): Buffer[] => parseKekList(VAULT_KEK.value() || undefined)

function keks(): Buffer[] {
  const list = kekList()
  if (!list.length) {
    logger.error('VAULT_KEK is not set: private groups can’t be opened (docs/FIREBASE_SETUP.md)')
    throw new HttpsError('failed-precondition', 'Private groups aren’t set up on this server yet.')
  }
  return list
}

function rp(req: CallableRequest) {
  const r = rpFor(req.rawRequest?.headers?.origin as string | undefined, APP_ORIGINS)
  if (!r) throw new HttpsError('failed-precondition', 'Open Split Now from its own address to use passkeys.')
  return r
}

const groupId = (v: unknown): string => {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(v)) throw new HttpsError('invalid-argument', 'Which group?')
  return v
}

/** A live private group the person is in. */
const isOpenable = (g: FirebaseFirestore.DocumentData | undefined, uid: string): boolean =>
  !!g && Array.isArray(g.memberUids) && g.memberUids.includes(uid) && g.vault === true && typeof g.deletedAt !== 'number'

/** The group, when the caller is in it and it's a live private group. */
async function privateGroup(gid: string, uid: string) {
  const g = (await db().doc(`groups/${gid}`).get()).data()
  if (!g || !Array.isArray(g.memberUids) || !g.memberUids.includes(uid)) throw new HttpsError('permission-denied', 'You’re not in this group.')
  if (g.vault !== true) throw new HttpsError('failed-precondition', 'This group isn’t private.')
  if (typeof g.deletedAt === 'number') throw new HttpsError('failed-precondition', 'This group is in Recently deleted.')
  return g
}

/** Of these people, the ones with a universal pattern (each opens every private group they're in). */
async function withUniversal(uids: string[]): Promise<Set<string>> {
  if (!uids.length) return new Set()
  const docs = await db().getAll(...uids.map(personRef))
  return new Set(uids.filter((_, i) => !!(docs[i].data() as PersonDoc | undefined)?.pattern))
}

/** Whether someone just added can open the group: its own pattern, or their universal one. */
async function opensFor(gid: string, who: string): Promise<boolean> {
  const [key, person] = await Promise.all([keyRef(gid).get(), personRef(who).get()])
  return !!(key.data() as VaultKeyDoc | undefined)?.pattern || !!(person.data() as PersonDoc | undefined)?.pattern
}

/** A shared group its creator may make private (asked with status `convert`: who in it would have no way in). */
async function convertibleGroup(gid: string, uid: string) {
  const g = (await db().doc(`groups/${gid}`).get()).data()
  if (!g || !Array.isArray(g.memberUids) || !g.memberUids.includes(uid)) throw new HttpsError('permission-denied', 'You’re not in this group.')
  if (g.createdBy !== uid) throw new HttpsError('permission-denied', 'Only the person who made this group can make it private.')
  if (typeof g.deletedAt === 'number') throw new HttpsError('failed-precondition', 'This group is in Recently deleted.')
  return g
}

/** How many live private groups this person made and is still in (shared/vault-convert.ts blocksStopping). */
async function madePrivate(uid: string): Promise<number> {
  const groups = await db().collection('groups').where('memberUids', 'array-contains', uid).get()
  return groups.docs.filter((d) => blocksStopping(d.data(), uid)).length
}

const OFF_TEXT = 'You stopped using private groups. Turn them on again in Settings → Encrypted groups.'
/** A private group must open with something: the person's universal pattern, or its own (chosen as it's made private). */
const NO_PATTERN_TEXT = 'Choose how it opens first: your universal pattern, or its own pattern.'
const NO_PASSKEY_TEXT = 'Add a passkey first: Face ID, a fingerprint or your screen lock.'
/** Removing a group's own pattern leaves it opening with universal patterns only: the remover needs one, or they'd be locked out. */
const REMOVE_NEEDS_UNIVERSAL = 'Set your universal pattern first: without its own pattern, that’s what opens it.'

const passkeysRef = (uid: string) => db().doc(`users/${uid}/secrets/passkeys`)
const personRef = (uid: string) => db().doc(`users/${uid}/secrets/vault`)
const keyRef = (gid: string) => db().doc(`vaultKeys/${gid}`)

/**
 * Private groups on for this person: on the server's own record, and on their profile for the app
 * (users/{uid}.privateGroupsOn; the app only reads it, to decide what to offer). Turning on also
 * ends a stop.
 */
async function markOn(uid: string) {
  const now = Date.now()
  await Promise.all([
    personRef(uid).set({ on: true, onAt: now, off: FieldValue.delete(), offAt: FieldValue.delete() }, { merge: true }),
    db().doc(`users/${uid}`).set({ privateGroupsOn: true, privateGroupsOff: FieldValue.delete() }, { merge: true }),
  ])
}

const mineHere = (doc: PasskeyDoc, rpID: string) => (doc.credentials ?? []).filter((c) => c.rpID === rpID)

async function newChallenge(uid: string, req: CallableRequest, purpose: Purpose, scope?: string) {
  const { rpID } = rp(req)
  const doc = ((await passkeysRef(uid).get()).data() ?? {}) as PasskeyDoc
  const mine = mineHere(doc, rpID)
  // An unlock on a site where this person has no passkey yet makes one (Face ID or the screen lock), then opens.
  const register = purpose === 'register' || (purpose === 'unlock' && mine.length === 0)
  const options = register
    ? await generateRegistrationOptions({
        rpName: 'Split Now',
        rpID,
        userName: req.auth?.token.email ?? uid,
        userID: new TextEncoder().encode(uid),
        attestationType: 'none',
        excludeCredentials: mine.map((c) => ({ id: c.id, transports: c.transports })),
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      })
    : await generateAuthenticationOptions({
        rpID,
        userVerification: 'required',
        allowCredentials: mine.map((c) => ({ id: c.id, transports: c.transports })),
      })
  await passkeysRef(uid).set(
    {
      challenge: options.challenge,
      challengeAt: Date.now(),
      challengePurpose: purpose,
      challengeKind: register ? 'register' : 'auth',
      challengeScope: scope ?? FieldValue.delete(),
    },
    { merge: true },
  )
  return { options, hasPasskey: mine.length > 0, register }
}

/** Takes the stored challenge (once) for `purpose`, or refuses. */
function freshChallenge(doc: PasskeyDoc, purpose: Purpose, kind: 'register' | 'auth'): string {
  // 7.1 challenges have no kind: theirs follows from the purpose.
  const made = doc.challengeKind ?? (doc.challengePurpose === 'register' ? 'register' : 'auth')
  if (!doc.challenge || doc.challengePurpose !== purpose || made !== kind || Date.now() - (doc.challengeAt ?? 0) > CHALLENGE_MS)
    throw new HttpsError('deadline-exceeded', 'That took too long. Try again.')
  return doc.challenge
}

const USED_UP = {
  challenge: FieldValue.delete(),
  challengeAt: FieldValue.delete(),
  challengePurpose: FieldValue.delete(),
  challengeScope: FieldValue.delete(),
  challengeKind: FieldValue.delete(),
}

/** Verifies a new passkey against the stored challenge and keeps it. Returns the challenge's scope. */
async function registerPasskey(uid: string, req: CallableRequest, response: RegistrationResponseJSON | undefined, purpose: Purpose) {
  if (!response || typeof response !== 'object' || typeof response.id !== 'string') throw new HttpsError('unauthenticated', 'Confirm with your passkey first.')
  const { origin, rpID } = rp(req)
  const ref = passkeysRef(uid)
  const doc = ((await ref.get()).data() ?? {}) as PasskeyDoc
  const expectedChallenge = freshChallenge(doc, purpose, 'register')
  // The challenge is used up whatever happens next, so a response can't be tried twice.
  await ref.set(USED_UP, { merge: true })
  const v = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true }).catch(
    (e: Error) => {
      logger.warn('passkey register refused', { uid, error: e.message })
      throw new HttpsError('permission-denied', 'That passkey couldn’t be checked. Try again.')
    },
  )
  if (!v.verified || !v.registrationInfo) throw new HttpsError('permission-denied', 'That passkey couldn’t be checked. Try again.')
  const c = v.registrationInfo.credential
  const entry: StoredPasskey = {
    id: c.id,
    publicKey: Buffer.from(c.publicKey).toString('base64'),
    counter: c.counter,
    ...(c.transports ? { transports: c.transports } : {}),
    rpID,
    createdAt: Date.now(),
  }
  const credentials = [...(doc.credentials ?? []).filter((x) => x.id !== c.id), entry].slice(-MAX_PASSKEYS)
  await ref.set({ credentials }, { merge: true })
  return doc.challengeScope
}

/** Checks a passkey assertion against this person's passkeys for this site; refuses otherwise. Returns the challenge's scope. */
async function checkPasskey(uid: string, req: CallableRequest, response: AuthenticationResponseJSON | undefined, purpose: Purpose = 'auth') {
  if (!response || typeof response !== 'object' || typeof response.id !== 'string') throw new HttpsError('unauthenticated', 'Confirm with your passkey first.')
  const { origin, rpID } = rp(req)
  const ref = passkeysRef(uid)
  const doc = ((await ref.get()).data() ?? {}) as PasskeyDoc
  const expectedChallenge = freshChallenge(doc, purpose, 'auth')
  // The challenge is used up either way, so an assertion can't be replayed.
  await ref.set(USED_UP, { merge: true })
  const cred = (doc.credentials ?? []).find((c) => c.id === response.id && c.rpID === rpID)
  if (!cred) throw new HttpsError('permission-denied', 'That passkey isn’t set up for you here.')
  const v = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: { id: cred.id, publicKey: new Uint8Array(Buffer.from(cred.publicKey, 'base64')), counter: cred.counter, transports: cred.transports },
  }).catch((e: Error) => {
    logger.warn('passkey check refused', { uid, error: e.message })
    throw new HttpsError('permission-denied', 'That passkey couldn’t be checked. Try again.')
  })
  if (!v.verified) throw new HttpsError('permission-denied', 'That passkey couldn’t be checked. Try again.')
  const credentials = (doc.credentials ?? []).map((c) => (c.id === cred.id ? { ...c, counter: v.authenticationInfo.newCounter, lastUsedAt: Date.now() } : c))
  await ref.set({ credentials }, { merge: true })
  return doc.challengeScope
}

/**
 * The pattern step, inside a transaction so parallel guesses can't skip the lockout. The person's
 * universal pattern opens what was asked (every private group, or this one); a group's own pattern
 * opens only that group. A wrong one is counted, on the person, whichever was meant; a right one
 * clears the count. Returns what a passkey will then open.
 */
async function checkPattern(uid: string, gid: string | undefined, pattern: unknown, list: Buffer[]): Promise<string> {
  const now = Date.now()
  const out = await db().runTransaction(async (tx) => {
    const pSnap = await tx.get(personRef(uid))
    const kSnap = gid ? await tx.get(keyRef(gid)) : undefined
    const person = (pSnap.data() ?? {}) as PersonDoc
    const key = kSnap?.data() as VaultKeyDoc | undefined
    if (!person.pattern && !key?.pattern) return { none: true as const }
    if (lockedOut(person.tries, now)) return { locked: person.tries?.lockedUntil }
    const p = typeof pattern === 'string' ? pattern : ''
    const universal = person.pattern ? patternMatchesAny(p, person.pattern, list) : { ok: false, rehash: false }
    const own = !universal.ok && key?.pattern ? patternMatchesAny(p, key.pattern, list) : { ok: false, rehash: false }
    if (!universal.ok && !own.ok) {
      const next = afterWrong(person.tries, now)
      tx.set(personRef(uid), { tries: next }, { merge: true })
      return { wrong: next }
    }
    // after a VAULT_KEK rotation: store the hash again with the newest key
    tx.set(
      personRef(uid),
      {
        tries: FieldValue.delete(),
        ...(universal.rehash && person.pattern ? { pattern: hashPattern(p, pepperOf(list[0]), undefined, person.pattern.ordered !== false) } : {}),
      },
      { merge: true },
    )
    if (own.rehash && key?.pattern && gid) tx.update(keyRef(gid), { pattern: hashPattern(p, pepperOf(list[0]), undefined, key.pattern.ordered !== false) })
    return { scope: universal.ok ? (gid ?? '*') : (gid as string) }
  })
  if ('none' in out) throw new HttpsError('failed-precondition', 'Set up encrypted groups first: Settings → Encrypted groups.')
  if ('locked' in out) throw new HttpsError('resource-exhausted', 'Too many wrong patterns. Try again later.', { lockedUntil: out.locked })
  if ('wrong' in out && out.wrong)
    throw new HttpsError('permission-denied', 'That’s not it.', { triesLeft: triesLeft(out.wrong), lockedUntil: out.wrong.lockedUntil })
  return (out as { scope: string }).scope
}

/** A group's data key, made the first time it's needed (a group with no key has nothing encrypted yet). */
async function keyOf(gid: string, uid: string, list: Buffer[]): Promise<string> {
  const ref = keyRef(gid)
  const snap = await ref.get()
  if (!snap.exists) {
    const dek = newDataKey()
    const doc: VaultKeyDoc = { wrapped: wrapKey(dek, list[0]), createdBy: uid, createdAt: Date.now() }
    // create() fails when it exists: two members opening at once get one key, not two.
    const made = await ref.create(doc).then(
      () => true,
      () => false,
    )
    if (made) {
      logger.info('vault key made', { groupId: gid, uid })
      return dek
    }
    return keyOf(gid, uid, list)
  }
  const opened = unwrapKey((snap.data() as VaultKeyDoc).wrapped, list)
  if (!opened) throw new HttpsError('internal', 'This group’s key can’t be opened. Ask the app’s admin.')
  if (opened.rewrap) await ref.update({ wrapped: wrapKey(opened.dek, list[0]) })
  return opened.dek
}

/** The keys a passed unlock opens: one group, or every live private group the person is in. */
async function keysFor(uid: string, scope: string, list: Buffer[]): Promise<Record<string, string>> {
  if (scope !== '*') {
    await privateGroup(scope, uid)
    return { [scope]: await keyOf(scope, uid, list) }
  }
  const groups = await db().collection('groups').where('memberUids', 'array-contains', uid).get()
  const ids = groups.docs.filter((d) => isOpenable(d.data(), uid)).map((d) => d.id)
  const keys = await Promise.all(ids.map(async (id) => [id, await keyOf(id, uid, list)] as const))
  return Object.fromEntries(keys)
}

/** The collections of a group whose documents hold words, and what each holds (shared/vault-convert.ts). */
const COLLECTIONS: [string, ConvertKind][] = [
  ['expenses', 'expense'],
  ['settlements', 'settlement'],
  ['chat', 'chat'],
  ['openItems', 'openItem'],
  ['activity', 'activity'],
  // who someone is and how to pay them (docs/VAULT.md): sealed like their name in the group
  ['profiles', 'profile'],
]

/**
 * One pass over a group: every document's words sealed (`seal`) or opened, the comments under each
 * expense and the group document itself included. Only what changes is written (a patch per
 * document), so a second pass, which catches a write that landed during the first, is cheap.
 * Answers how many documents changed.
 */
async function convertPass(gid: string, k: VaultKey, seal: boolean, opts: { groupOnly?: boolean } = {}): Promise<number> {
  const writer = db().bulkWriter()
  let changed = 0
  const one = async (ref: FirebaseFirestore.DocumentReference, kind: ConvertKind, doc: FirebaseFirestore.DocumentData) => {
    const patch = seal ? await sealDoc(k, kind, doc) : await openDoc(k, doc)
    if (!patch) return
    changed++
    // null in a patch is a field that goes (sealDoc drops an AI-drawn icon)
    void writer.update(ref, Object.fromEntries(Object.entries(patch).map(([f, v]) => [f, v === null ? FieldValue.delete() : v])))
  }
  const groupRef = db().doc(`groups/${gid}`)
  const g = await groupRef.get()
  if (g.exists) await one(groupRef, 'group', g.data() as FirebaseFirestore.DocumentData)
  // A new group has only its own document and its maker's profile copy (an older app may have written it in the clear).
  for (const [col, kind] of opts.groupOnly ? COLLECTIONS.filter(([c]) => c === 'profiles') : COLLECTIONS) {
    const snap = await groupRef.collection(col).get()
    for (const d of snap.docs) {
      await one(d.ref, kind, d.data())
      if (col === 'expenses') for (const c of (await d.ref.collection('comments').get()).docs) await one(c.ref, 'comment', c.data())
    }
  }
  await writer.close()
  return changed
}

/** Everyone else in the group hears that it changed: the creator made it private, or plain again. */
async function tellMembers(gid: string, uid: string, g: FirebaseFirestore.DocumentData, on: boolean) {
  const others = ((g.memberUids as string[] | undefined) ?? []).filter((u) => u !== uid)
  const name = inviteNameFor({ type: g.type, name: String(g.name ?? 'A group'), createdBy: g.createdBy, members: g.members })
  await Promise.all(
    others.map((u) =>
      sendToUser(u, ['expenses'], {
        title: on ? 'Split Now' : name,
        body: on ? 'A group you’re in is now private. Open it with your pattern.' : `${name} isn’t private any more.`,
        url: `/groups/${gid}`,
        tag: `group-${on ? 'private' : 'plain'}-${gid}`,
      }),
    ),
  )
}

/**
 * Turning a group private: marked private first (from then on no phone without its key can write
 * to it), then its key, then every document sealed, twice over (the second pass catches what was
 * written while the first ran), and its invite renamed. Answers the key, so the creator's phone
 * opens it at once.
 */
async function makePrivate(gid: string, uid: string, g: FirebaseFirestore.DocumentData, list: Buffer[], own?: { pattern: string; ordered: boolean }) {
  const ref = db().doc(`groups/${gid}`)
  await ref.update({ vault: true, updatedAt: Date.now() })
  const dek = await keyOf(gid, uid, list)
  // Its own pattern, set with the key: the creator knows it, and tells the group in person.
  if (own)
    await keyRef(gid).update({
      pattern: hashPattern(own.pattern, pepperOf(list[0]), undefined, own.ordered),
      patternChangedAt: Date.now(),
      patternChangedBy: uid,
    })
  const k = await vaultKey(gid, dek)
  const first = await convertPass(gid, k, true)
  const second = await convertPass(gid, k, true)
  if (typeof g.inviteCode === 'string')
    await db().doc(`invites/${g.inviteCode}`).set({ groupId: gid, groupName: 'A private group', emoji: '🔒', placeholders: {}, vault: true })
  logger.info('vault group made private', { groupId: gid, uid, docs: first, again: second })
  await tellMembers(gid, uid, g, true).catch((e) => logger.warn('vault convert push', { groupId: gid, error: (e as Error).message }))
  return { dek }
}

/**
 * Turning private off: every document opened while the group is still private (phones with the
 * key may still write tokens, which a later pass opens), then marked plain, opened once more, its
 * key deleted and its invite named again.
 */
async function makePlain(gid: string, uid: string, g: FirebaseFirestore.DocumentData, list: Buffer[]) {
  const ref = db().doc(`groups/${gid}`)
  const dek = await keyOf(gid, uid, list)
  const k = await vaultKey(gid, dek)
  const first = await convertPass(gid, k, false)
  await ref.update({ vault: FieldValue.delete(), updatedAt: Date.now() })
  const second = await convertPass(gid, k, false)
  await keyRef(gid).delete()
  const opened = (await ref.get()).data() ?? g
  if (typeof g.inviteCode === 'string')
    await db()
      .doc(`invites/${g.inviteCode}`)
      .set(
        {
          groupId: gid,
          groupName: inviteNameFor({ type: opened.type, name: String(opened.name ?? 'Group'), createdBy: opened.createdBy, members: opened.members }),
          emoji: String(opened.emoji ?? ''),
          vault: FieldValue.delete(),
        },
        { merge: true },
      )
  logger.info('vault group made plain', { groupId: gid, uid, docs: first, again: second })
  await tellMembers(gid, uid, opened, false).catch((e) => logger.warn('vault convert push', { groupId: gid, error: (e as Error).message }))
  return { ok: true as const }
}

// ---- joining a private group (lib/join-core.ts) ------------------------------------------

const requestRef = (gid: string, uid: string) => db().doc(`groups/${gid}/joinRequests/${uid}`)

/** A private group from its invite code; refuses an invite that isn't one. */
async function privateByCode(code: unknown) {
  if (typeof code !== 'string' || !/^[A-Za-z0-9]{8,32}$/.test(code)) throw new HttpsError('invalid-argument', 'That invite link isn’t right.')
  const gid = (await db().doc(`invites/${code}`).get()).get('groupId')
  const snap = typeof gid === 'string' ? await db().doc(`groups/${gid}`).get() : null
  const g = snap?.data()
  if (!snap || !g || g.inviteCode !== code || typeof g.deletedAt === 'number') throw new HttpsError('not-found', 'This invite link no longer works.')
  if (g.vault !== true) throw new HttpsError('failed-precondition', 'This group isn’t private: join it from the invite.')
  return { gid: snap.id, g }
}

/** What someone is called in a group they're let into: their account name, sealed with its key. */
async function sealedNameOf(uid: string, fallback: string, k: VaultKey): Promise<string> {
  const p = (await db().doc(`users/${uid}`).get()).data()
  return (await sealDoc(k, 'group', { name: accountName(p?.displayName, fallback) }))?.name as string
}

const keyFor = async (gid: string, uid: string, list: Buffer[]) => vaultKey(gid, await keyOf(gid, uid, list))

/** The creator, of a live private group, or a refusal. */
async function ownGroup(gid: string, uid: string) {
  const g = await privateGroup(gid, uid)
  if (g.createdBy !== uid) throw new HttpsError('permission-denied', 'Only the person who made this private group can decide who joins.')
  return g
}

async function joinStatus(uid: string, code: unknown) {
  const { gid, g } = await privateByCode(code)
  if ((g.memberUids as string[] | undefined)?.includes(uid)) return { status: 'member' as const, groupId: gid }
  const r = (await requestRef(gid, uid).get()).data() as JoinRequestDoc | undefined
  const gate = joinGate(r, Date.now())
  if (gate.kind === 'pending') return { status: 'pending' as const }
  if (gate.kind === 'cooldown') return { status: 'declined' as const, retryAt: gate.retryAt }
  return { status: 'none' as const }
}

async function requestJoin(uid: string, req: CallableRequest, code: unknown) {
  const { gid, g } = await privateByCode(code)
  if ((g.memberUids as string[] | undefined)?.includes(uid)) return { status: 'member' as const, groupId: gid }
  const ref = requestRef(gid, uid)
  const gate = joinGate((await ref.get()).data() as JoinRequestDoc | undefined, Date.now())
  if (gate.kind === 'pending') return { status: 'pending' as const }
  if (gate.kind === 'cooldown')
    throw new HttpsError('resource-exhausted', 'Your last request was declined. You can ask again tomorrow.', { retryAt: gate.retryAt })
  const k = await keyFor(gid, String(g.createdBy), keks())
  const doc: JoinRequestDoc = { uid, name: await sealedNameOf(uid, String(req.auth?.token.name ?? ''), k), status: 'pending', createdAt: Date.now() }
  await ref.set(doc)
  logger.info('vault join asked', { groupId: gid, uid })
  await sendToUser(String(g.createdBy), ['expenses'], {
    title: 'Split Now',
    body: 'Someone asked to join a private group. Open the Inbox to decide.',
    url: '/inbox',
    tag: `join-${gid}-${uid}`,
  }).catch((e) => logger.warn('join push', { error: (e as Error).message }))
  return { status: 'pending' as const }
}

async function decideJoin(uid: string, req: CallableRequest, data: Record<string, unknown>) {
  const gid = groupId(data.groupId)
  const who = typeof data.uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(data.uid) ? data.uid : ''
  if (!who) throw new HttpsError('invalid-argument', 'Whose request?')
  await ownGroup(gid, uid)
  await checkPasskey(uid, req, data.auth as AuthenticationResponseJSON)
  const approve = data.approve === true
  const placeholder = typeof data.memberId === 'string' ? data.memberId : undefined
  const now = Date.now()
  const out = await db().runTransaction(async (tx) => {
    const gRef = db().doc(`groups/${gid}`)
    const [gs, rs] = await Promise.all([tx.get(gRef), tx.get(requestRef(gid, who))])
    const g = gs.data()
    const r = rs.data() as JoinRequestDoc | undefined
    if (!g || !r || r.status !== 'pending') return { gone: true as const }
    if (!approve) {
      tx.update(rs.ref, { status: 'declined', decidedAt: now, decidedBy: uid })
      return { declined: true as const }
    }
    const a = admission((g.members ?? {}) as Record<string, Record<string, unknown>>, who, r.name, placeholder, Math.random().toString(36).slice(2, 6))
    if ('taken' in a) throw new HttpsError('failed-precondition', 'That person in the group is taken now. Pick another, or add them as new.')
    const { memberId, entry } = a
    tx.update(gRef, { [`members.${memberId}`]: entry, memberUids: FieldValue.arrayUnion(who), updatedAt: now })
    tx.update(rs.ref, { status: 'approved', decidedAt: now, decidedBy: uid, memberId })
    return { approved: memberId }
  })
  if ('gone' in out) throw new HttpsError('not-found', 'That request isn’t waiting any more.')
  logger.info(approve ? 'vault join approved' : 'vault join declined', { groupId: gid, uid, who })
  await sendToUser(who, ['expenses'], {
    title: 'Split Now',
    body: approve ? 'You were added to a private group.' : 'Your request to join a private group wasn’t accepted.',
    url: approve ? `/groups/${gid}` : '/',
    tag: approve ? `group-added-${gid}` : `join-declined-${gid}`,
  }).catch((e) => logger.warn('join push', { error: (e as Error).message }))
  // Let in with nothing to open it with: the app offers its creator to give it its own pattern.
  return approve ? { ok: true as const, opens: await opensFor(gid, who) } : { ok: true as const }
}

async function addContact(uid: string, req: CallableRequest, data: Record<string, unknown>) {
  const gid = groupId(data.groupId)
  const who = typeof data.uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(data.uid) ? data.uid : ''
  if (!who || who === uid) throw new HttpsError('invalid-argument', 'Who should be added?')
  const g = await ownGroup(gid, uid)
  if ((g.memberUids as string[]).includes(who)) return { ok: true as const }
  const mine = await db().collection('groups').where('memberUids', 'array-contains', uid).get()
  if (
    !sharesAGroup(
      mine.docs.map((d) => ({ id: d.id, ...(d.data() as { memberUids?: string[]; deletedAt?: unknown }) })),
      uid,
      who,
      gid,
    )
  )
    throw new HttpsError('permission-denied', 'You can add someone directly only if you’re in another group with them. Add them by name instead.')
  await checkPasskey(uid, req, data.auth as AuthenticationResponseJSON)
  const k = await keyFor(gid, uid, keks())
  const name = await sealedNameOf(who, 'Member', k)
  const members = (g.members ?? {}) as Record<string, Record<string, unknown>>
  const memberId = memberIdFor(members, who, Math.random().toString(36).slice(2, 6))
  const { removedAt: _r, ...prev } = members[memberId] ?? {}
  await db()
    .doc(`groups/${gid}`)
    .update({
      [`members.${memberId}`]: { ...prev, name, uid: who, color: MEMBER_COLORS[Object.keys(members).length % MEMBER_COLORS.length] },
      memberUids: FieldValue.arrayUnion(who),
      updatedAt: Date.now(),
    })
  logger.info('vault contact added', { groupId: gid, uid, who })
  await sendToUser(who, ['expenses'], {
    title: 'Split Now',
    body: 'You were added to a private group.',
    url: `/groups/${gid}`,
    tag: `group-added-${gid}`,
  }).catch((e) => logger.warn('join push', { error: (e as Error).message }))
  return { ok: true as const, opens: await opensFor(gid, who) }
}

const ordered = (v: unknown): boolean => v !== false

// 300 s: `convert` rewrites every document of a group; every other step answers in a second or two.
export const vault = onCall(
  { region: REGION, secrets: [VAULT_KEK], enforceAppCheck: ENFORCE_APP_CHECK, timeoutSeconds: 300, memory: '512MiB', maxInstances: 10 },
  async (req) => {
    const uid = caller(req)
    if (!(await flagOn('vaults'))) throw new HttpsError('failed-precondition', 'Private groups are switched off right now.')
    const data = (req.data ?? {}) as Record<string, unknown>
    switch (data.op) {
      case 'passkeyOptions': {
        const { options, hasPasskey } = await newChallenge(uid, req, data.purpose === 'register' ? 'register' : 'auth')
        return { options, hasPasskey }
      }
      case 'passkeyRegister':
        await registerPasskey(uid, req, data.response as RegistrationResponseJSON, 'register')
        return { ok: true as const }
      case 'status': {
        const gid = data.groupId === undefined ? undefined : groupId(data.groupId)
        // `convert`: a group not private yet, asked by its creator before making it private.
        const g = gid ? await (data.convert === true ? convertibleGroup(gid, uid) : privateGroup(gid, uid)) : undefined
        const { rpID } = rp(req)
        const [person, passkeys, key, profile] = await Promise.all([
          personRef(uid).get(),
          passkeysRef(uid).get(),
          gid ? keyRef(gid).get() : undefined,
          db().doc(`users/${uid}`).get(),
        ])
        const p = (person.data() ?? {}) as PersonDoc
        // Counted when asked, and for someone neither on nor off, whose own private groups may make them on.
        const made = data.made === true || (!p.on && !p.off && !p.pattern) ? await madePrivate(uid) : undefined
        const on = privateGroupsOn(p, made)
        // The backfill: marked on once, and the profile's copy put right when it's missing.
        if (on && (!p.on || profile.get('privateGroupsOn') !== true)) await markOn(uid)
        const k = key?.data() as VaultKeyDoc | undefined
        // Who else in it has no universal pattern: without its own pattern they can't open it (one read per person).
        const others = g ? (g.memberUids as string[]).filter((u) => u !== uid) : []
        const noUniversal = g ? withoutUniversal(g.memberUids as string[], await withUniversal(others), uid) : []
        const locked = lockedOut(p.tries, Date.now())
        return {
          serverReady: kekList().length > 0,
          hasPasskey: mineHere((passkeys.data() ?? {}) as PasskeyDoc, rpID).length > 0,
          universal: !!p.pattern,
          ...(p.pattern ? { ordered: p.pattern.ordered !== false } : {}),
          triesLeft: locked ? 0 : triesLeft(p.tries),
          ...(locked ? { lockedUntil: p.tries?.lockedUntil } : {}),
          ...(gid
            ? {
                group: {
                  keyReady: !!k,
                  hasPattern: !!k?.pattern,
                  ...(k?.pattern ? { ordered: k.pattern.ordered !== false } : {}),
                  ...(noUniversal.length ? { noUniversal } : {}),
                },
              }
            : {}),
          ...(on ? { on: true } : {}),
          ...(p.off ? { off: true } : {}),
          ...(data.made === true ? { made } : {}),
        } satisfies VaultStatus
      }
      case 'setUniversal': {
        const problem = typeof data.pattern === 'string' ? patternProblem(data.pattern) : patternProblem('')
        if (problem) throw new HttpsError('invalid-argument', problem)
        const list = keks()
        // Changing it takes the current one: someone holding the unlocked phone could add a passkey and set their own.
        const was = ((await personRef(uid).get()).data() ?? {}) as PersonDoc
        if (was.pattern) await checkPattern(uid, undefined, data.current, list)
        await checkPasskey(uid, req, data.auth as AuthenticationResponseJSON)
        await personRef(uid).set(
          {
            pattern: hashPattern(data.pattern as string, pepperOf(list[0]), undefined, ordered(data.ordered)),
            setAt: Date.now(),
            tries: FieldValue.delete(),
          },
          { merge: true },
        )
        // Someone with a universal pattern has private groups on (and someone who stopped starts again).
        await markOn(uid)
        logger.info('vault universal pattern set', { uid })
        return { ok: true as const }
      }
      case 'start': {
        // Only what the app offers changes: nothing is set up, and every private group opens as before.
        await markOn(uid)
        logger.info('vault started', { uid })
        return { ok: true as const }
      }
      case 'unlockStart': {
        const gid = data.groupId === undefined ? undefined : groupId(data.groupId)
        if (gid) await privateGroup(gid, uid)
        const scope = await checkPattern(uid, gid, data.pattern, keks())
        const { options, register } = await newChallenge(uid, req, 'unlock', scope)
        return { options, register }
      }
      case 'unlockFinish': {
        const list = keks()
        const scope = data.register
          ? await registerPasskey(uid, req, data.register as RegistrationResponseJSON, 'unlock')
          : await checkPasskey(uid, req, data.auth as AuthenticationResponseJSON, 'unlock')
        if (!scope) throw new HttpsError('deadline-exceeded', 'That took too long. Try again.')
        return { keys: await keysFor(uid, scope, list) }
      }
      case 'groupPattern': {
        const gid = groupId(data.groupId)
        await privateGroup(gid, uid)
        const remove = data.pattern === null
        if (!remove) {
          const problem = typeof data.pattern === 'string' ? groupPatternProblem(data.pattern) : groupPatternProblem('')
          if (problem) throw new HttpsError('invalid-argument', problem)
        }
        if (remove && !(((await personRef(uid).get()).data() ?? {}) as PersonDoc).pattern) throw new HttpsError('failed-precondition', REMOVE_NEEDS_UNIVERSAL)
        const list = keks()
        // Only someone who can already open it sets, changes or removes its pattern (their universal one or its own).
        await checkPattern(uid, gid, data.current, list)
        await checkPasskey(uid, req, data.auth as AuthenticationResponseJSON)
        const dek = await keyOf(gid, uid, list)
        await keyRef(gid).update({
          pattern: remove ? FieldValue.delete() : hashPattern(data.pattern as string, pepperOf(list[0]), undefined, ordered(data.ordered)),
          patternChangedAt: Date.now(),
          patternChangedBy: uid,
        })
        logger.info(remove ? 'vault group pattern removed' : 'vault group pattern set', { groupId: gid, uid })
        return { dek }
      }
      case 'create': {
        const gid = groupId(data.groupId)
        await privateGroup(gid, uid)
        const own = data.pattern === undefined || data.pattern === null ? undefined : data.pattern
        if (own !== undefined) {
          const problem = typeof own === 'string' ? groupPatternProblem(own) : groupPatternProblem('')
          if (problem) throw new HttpsError('invalid-argument', problem)
        }
        const person = (await personRef(uid).get()).data() as PersonDoc | undefined
        if (person?.off) throw new HttpsError('failed-precondition', OFF_TEXT)
        // A key that exists already answers as before (create() below still settles a race).
        if (own === undefined && !person?.pattern) {
          if ((await keyRef(gid).get()).exists) throw new HttpsError('already-exists', 'This group already has its key. Unlock it with your pattern.')
          throw new HttpsError('failed-precondition', NO_PATTERN_TEXT)
        }
        // The passkey comes with the pattern: a private group opens with both, so it's made only by
        // someone who has one here (Settings → Encrypted groups, or the setup card's ＋).
        const passkeys = ((await passkeysRef(uid).get()).data() ?? {}) as PasskeyDoc
        if (!mineHere(passkeys, rp(req).rpID).length) throw new HttpsError('failed-precondition', NO_PASSKEY_TEXT)
        const list = keks()
        const dek = newDataKey()
        const now = Date.now()
        // create(), not keyOf(): a key that already exists is never handed out without a pattern and a passkey.
        // Its own pattern, when one was chosen as it was made: the person making it knows it, nobody else has it yet.
        await keyRef(gid)
          .create({
            wrapped: wrapKey(dek, list[0]),
            createdBy: uid,
            createdAt: now,
            ...(own !== undefined
              ? { pattern: hashPattern(own as string, pepperOf(list[0]), undefined, ordered(data.ordered)), patternChangedAt: now, patternChangedBy: uid }
              : {}),
          } satisfies VaultKeyDoc)
          .catch(() => {
            throw new HttpsError('already-exists', 'This group already has its key. Unlock it with your pattern.')
          })
        logger.info('vault key made', { groupId: gid, uid })
        // Its own document's words, sealed with the new key (made before the key existed, so in the clear).
        await convertPass(gid, await vaultKey(gid, dek), true, { groupOnly: true })
        // Someone who made a private group has them on (an older app offers the switch to everyone).
        if (!person?.on) await markOn(uid)
        return { dek }
      }
      case 'joinStatus':
        return joinStatus(uid, data.code)
      case 'requestJoin':
        return requestJoin(uid, req, data.code)
      case 'decideJoin':
        return decideJoin(uid, req, data)
      case 'addContact':
        return addContact(uid, req, data)
      case 'convert': {
        const gid = groupId(data.groupId)
        const on = data.on === true
        const g = (await db().doc(`groups/${gid}`).get()).data()
        if (!g || !Array.isArray(g.memberUids) || !g.memberUids.includes(uid)) throw new HttpsError('permission-denied', 'You’re not in this group.')
        if (g.createdBy !== uid) throw new HttpsError('permission-denied', 'Only the person who made the group can change this.')
        if (typeof g.deletedAt === 'number') throw new HttpsError('failed-precondition', 'This group is in Recently deleted.')
        if (g.type === 'personal') throw new HttpsError('failed-precondition', 'A personal wallet can’t be private.')
        // Already as asked: nothing to do (a second tap, or another phone did it first).
        if ((g.vault === true) === on) return { ok: true as const }
        // Its own pattern, chosen as it's made private (optional when the creator has a universal one).
        const own = on && typeof data.pattern === 'string' ? data.pattern : undefined
        if (on) {
          const person = (await personRef(uid).get()).data() as PersonDoc | undefined
          if (person?.off) throw new HttpsError('failed-precondition', OFF_TEXT)
          if (own !== undefined) {
            const problem = groupPatternProblem(own)
            if (problem) throw new HttpsError('invalid-argument', problem)
          } else if (!person?.pattern) throw new HttpsError('failed-precondition', NO_PATTERN_TEXT)
        }
        const list = keks()
        await checkPasskey(uid, req, data.auth as AuthenticationResponseJSON)
        if (!on) return makePlain(gid, uid, g, list)
        const out = await makePrivate(gid, uid, g, list, own === undefined ? undefined : { pattern: own, ordered: ordered(data.ordered) })
        // As for `create`: making a private group turns them on.
        if (!(((await personRef(uid).get()).data() ?? {}) as PersonDoc).on) await markOn(uid)
        return out
      }
      case 'stop': {
        // First what holds it up (no try spent on a pattern that can't help yet).
        const made = await madePrivate(uid)
        if (made > 0) throw new HttpsError('failed-precondition', 'Turn off private, or delete, the private groups you made first.', { made })
        const person = ((await personRef(uid).get()).data() ?? {}) as PersonDoc
        // As for changing it: the current pattern, then the passkey (someone holding the phone can't do this alone).
        if (person.pattern) {
          await checkPattern(uid, undefined, data.current, keks())
          await checkPasskey(uid, req, data.auth as AuthenticationResponseJSON)
        }
        // Wrong tries are kept: a lockout doesn't end by stopping.
        await personRef(uid).set(
          { pattern: FieldValue.delete(), setAt: FieldValue.delete(), on: FieldValue.delete(), onAt: FieldValue.delete(), off: true, offAt: Date.now() },
          { merge: true },
        )
        await passkeysRef(uid).delete()
        await db().doc(`users/${uid}`).set({ privateGroupsOff: true, privateGroupsOn: FieldValue.delete() }, { merge: true })
        logger.info('vault stopped', { uid })
        return { ok: true as const }
      }
      default:
        throw new HttpsError('invalid-argument', 'Unknown step.')
    }
  },
)
