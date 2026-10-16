/*
 * Callable `vault`: private groups (docs/VAULT.md). One function, several steps (`op`):
 *
 *  - status         { groupId? }                     → this person's setup (passkey, universal pattern),
 *                                                       tries left / locked until, and for a group: key
 *                                                       made, own pattern set
 *  - passkeyOptions { purpose: 'register' | 'auth' } → WebAuthn options; the challenge is kept for 5 minutes
 *  - passkeyRegister { response }                    → a passkey (Face ID, fingerprint, screen lock) for
 *                                                       this person on this site, kept in users/{uid}/secrets/passkeys
 *  - setUniversal   { pattern, ordered, auth }       → this person's universal pattern (needs the passkey)
 *  - unlockStart    { pattern, groupId? }            → checks the pattern first (wrong ones count towards a
 *                                                       lockout); only a right one gets a passkey challenge
 *  - unlockFinish   { auth | register }              → the data keys: every private group the person is in
 *                                                       (universal pattern on the Groups screen), or one group
 *  - groupPattern   { groupId, pattern, ordered, auth } → set, change or (pattern null) remove a group's own pattern
 *  - create         { groupId }                      → a new private group's first data key, for its member
 *                                                       on the phone that made it (only while it has none)
 *
 * The data key is sealed with the VAULT_KEK secret in vaultKeys/{groupId}, which no client can
 * read; patterns are stored only as peppered scrypt hashes (lib/vault-core.ts): a person's universal
 * one in users/{uid}/secrets/vault, a group's own one in vaultKeys/{groupId}. A passkey proves it's
 * this person on a device they set up; the pattern proves they know the secret. The passkey is
 * asked for only after a right pattern, so a wrong guess never reaches Face ID.
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
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { db } from './admin'
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
  transports?: AuthenticatorTransportFuture[]
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
  group?: { keyReady: boolean; hasPattern: boolean; ordered?: boolean }
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

const passkeysRef = (uid: string) => db().doc(`users/${uid}/secrets/passkeys`)
const personRef = (uid: string) => db().doc(`users/${uid}/secrets/vault`)
const keyRef = (gid: string) => db().doc(`vaultKeys/${gid}`)

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

const ordered = (v: unknown): boolean => v !== false

export const vault = onCall({ region: REGION, secrets: [VAULT_KEK], enforceAppCheck: ENFORCE_APP_CHECK, timeoutSeconds: 30, maxInstances: 10 }, async (req) => {
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
      if (gid) await privateGroup(gid, uid)
      const { rpID } = rp(req)
      const [person, passkeys, key] = await Promise.all([personRef(uid).get(), passkeysRef(uid).get(), gid ? keyRef(gid).get() : undefined])
      const p = (person.data() ?? {}) as PersonDoc
      const k = key?.data() as VaultKeyDoc | undefined
      const locked = lockedOut(p.tries, Date.now())
      return {
        serverReady: kekList().length > 0,
        hasPasskey: mineHere((passkeys.data() ?? {}) as PasskeyDoc, rpID).length > 0,
        universal: !!p.pattern,
        ...(p.pattern ? { ordered: p.pattern.ordered !== false } : {}),
        triesLeft: locked ? 0 : triesLeft(p.tries),
        ...(locked ? { lockedUntil: p.tries?.lockedUntil } : {}),
        ...(gid ? { group: { keyReady: !!k, hasPattern: !!k?.pattern, ...(k?.pattern ? { ordered: k.pattern.ordered !== false } : {}) } } : {}),
      } satisfies VaultStatus
    }
    case 'setUniversal': {
      const problem = typeof data.pattern === 'string' ? patternProblem(data.pattern) : patternProblem('')
      if (problem) throw new HttpsError('invalid-argument', problem)
      const list = keks()
      await checkPasskey(uid, req, data.auth as AuthenticationResponseJSON)
      await personRef(uid).set(
        { pattern: hashPattern(data.pattern as string, pepperOf(list[0]), undefined, ordered(data.ordered)), setAt: Date.now(), tries: FieldValue.delete() },
        { merge: true },
      )
      logger.info('vault universal pattern set', { uid })
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
      const list = keks()
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
      const list = keks()
      const dek = newDataKey()
      // create(), not keyOf(): a key that already exists is never handed out without a pattern and a passkey.
      await keyRef(gid)
        .create({ wrapped: wrapKey(dek, list[0]), createdBy: uid, createdAt: Date.now() } satisfies VaultKeyDoc)
        .catch(() => {
          throw new HttpsError('already-exists', 'This group already has its key. Unlock it with your pattern.')
        })
      logger.info('vault key made', { groupId: gid, uid })
      return { dek }
    }
    default:
      throw new HttpsError('invalid-argument', 'Unknown step.')
  }
})
