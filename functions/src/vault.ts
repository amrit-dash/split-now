/*
 * Callable `vault`: private groups (docs/VAULT.md). One function, several steps (`op`):
 *
 *  - status        { groupId }                      → is the group set up, does this person have a
 *                                                      passkey for this site, tries left / locked until
 *  - passkeyOptions { purpose: 'register' | 'auth' } → WebAuthn options; the challenge is kept for 5 minutes
 *  - passkeyRegister { response }                   → a passkey (Face ID, fingerprint, screen lock) for
 *                                                      this person on this site, kept in users/{uid}/secrets/passkeys
 *  - setup         { groupId, pattern, auth }       → the group's first pattern and a fresh data key
 *                                                      (once; any member of the private group)
 *  - unlock        { groupId, pattern, auth }       → the group's data key, after the passkey and the
 *                                                      pattern pass; wrong patterns count towards a lockout
 *  - changePattern { groupId, pattern, next, auth } → a new pattern for everyone (the old one first)
 *
 * The data key is sealed with the VAULT_KEK secret in vaultKeys/{groupId}, which no client can
 * read; the pattern is stored only as a peppered scrypt hash (lib/vault-core.ts). A passkey proves
 * it's this person on a device they set up; the pattern proves they know the group's secret.
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

interface PasskeyDoc {
  credentials?: StoredPasskey[]
  challenge?: string
  challengeAt?: number
  challengePurpose?: 'register' | 'auth'
}

interface VaultKeyDoc {
  wrapped: Sealed
  pattern: PatternHash
  tries?: Record<string, TryState>
  createdBy: string
  createdAt: number
  patternChangedAt?: number
  patternChangedBy?: string
}

export type VaultStatus = {
  setUp: boolean
  hasPasskey: boolean
  triesLeft: number
  lockedUntil?: number
}

function caller(req: CallableRequest): string {
  if (!req.auth || req.auth.token.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated', 'Sign in first')
  return req.auth.uid
}

function keks(): Buffer[] {
  const list = parseKekList(VAULT_KEK.value() || undefined)
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

/** The group, when the caller is in it and it's a live private group. */
async function privateGroup(gid: string, uid: string) {
  const g = (await db().doc(`groups/${gid}`).get()).data()
  if (!g || !Array.isArray(g.memberUids) || !g.memberUids.includes(uid)) throw new HttpsError('permission-denied', 'You’re not in this group.')
  if (g.vault !== true) throw new HttpsError('failed-precondition', 'This group isn’t private.')
  if (typeof g.deletedAt === 'number') throw new HttpsError('failed-precondition', 'This group is in Recently deleted.')
  return g
}

const passkeysRef = (uid: string) => db().doc(`users/${uid}/secrets/passkeys`)
const keyRef = (gid: string) => db().doc(`vaultKeys/${gid}`)

async function passkeyOptions(uid: string, req: CallableRequest, purpose: 'register' | 'auth') {
  const { rpID } = rp(req)
  const doc = ((await passkeysRef(uid).get()).data() ?? {}) as PasskeyDoc
  const mine = (doc.credentials ?? []).filter((c) => c.rpID === rpID)
  const options =
    purpose === 'register'
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
  await passkeysRef(uid).set({ challenge: options.challenge, challengeAt: Date.now(), challengePurpose: purpose }, { merge: true })
  return { options, hasPasskey: mine.length > 0 }
}

/** Takes the stored challenge (once) for `purpose`, or refuses. */
function freshChallenge(doc: PasskeyDoc, purpose: 'register' | 'auth'): string {
  if (!doc.challenge || doc.challengePurpose !== purpose || Date.now() - (doc.challengeAt ?? 0) > CHALLENGE_MS)
    throw new HttpsError('deadline-exceeded', 'That took too long. Try again.')
  return doc.challenge
}

async function registerPasskey(uid: string, req: CallableRequest, response: RegistrationResponseJSON) {
  const { origin, rpID } = rp(req)
  const ref = passkeysRef(uid)
  const doc = ((await ref.get()).data() ?? {}) as PasskeyDoc
  const expectedChallenge = freshChallenge(doc, 'register')
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
  await ref.set({ credentials, challenge: FieldValue.delete(), challengeAt: FieldValue.delete(), challengePurpose: FieldValue.delete() }, { merge: true })
  return { ok: true as const }
}

/** Checks a passkey assertion against this person's passkeys for this site; refuses otherwise. */
async function checkPasskey(uid: string, req: CallableRequest, response: AuthenticationResponseJSON | undefined) {
  if (!response || typeof response !== 'object' || typeof response.id !== 'string') throw new HttpsError('unauthenticated', 'Confirm with your passkey first.')
  const { origin, rpID } = rp(req)
  const ref = passkeysRef(uid)
  const doc = ((await ref.get()).data() ?? {}) as PasskeyDoc
  const expectedChallenge = freshChallenge(doc, 'auth')
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
  // The challenge is used up either way, so an assertion can't be replayed.
  await ref.set({ credentials, challenge: FieldValue.delete(), challengeAt: FieldValue.delete(), challengePurpose: FieldValue.delete() }, { merge: true })
}

/**
 * The pattern step, inside a transaction so parallel guesses can't skip the lockout: a wrong one
 * is counted, a right one clears the count. Returns the data key when `wantKey`.
 */
async function checkPattern(gid: string, uid: string, pattern: unknown, list: Buffer[]): Promise<{ dek: string; doc: VaultKeyDoc }> {
  const ref = keyRef(gid)
  const now = Date.now()
  const out = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('failed-precondition', 'This group’s pattern isn’t set yet.')
    const doc = snap.data() as VaultKeyDoc
    const tries = doc.tries?.[uid]
    if (lockedOut(tries, now)) return { locked: tries?.lockedUntil }
    const m = typeof pattern === 'string' ? patternMatchesAny(pattern, doc.pattern, list) : { ok: false, rehash: false }
    if (!m.ok) {
      const next = afterWrong(tries, now)
      tx.update(ref, { [`tries.${uid}`]: next })
      return { wrong: next }
    }
    const opened = unwrapKey(doc.wrapped, list)
    if (!opened) throw new HttpsError('internal', 'This group’s key can’t be opened. Ask the app’s admin.')
    tx.update(ref, {
      [`tries.${uid}`]: FieldValue.delete(),
      // after a VAULT_KEK rotation: store both again with the newest key
      ...(m.rehash ? { pattern: hashPattern(pattern as string, pepperOf(list[0])) } : {}),
      ...(opened.rewrap ? { wrapped: wrapKey(opened.dek, list[0]) } : {}),
    })
    return { dek: opened.dek, doc }
  })
  if ('locked' in out) throw new HttpsError('resource-exhausted', 'Too many wrong patterns. Try again later.', { lockedUntil: out.locked })
  if ('wrong' in out && out.wrong)
    throw new HttpsError('permission-denied', 'That’s not the pattern.', { triesLeft: triesLeft(out.wrong), lockedUntil: out.wrong.lockedUntil })
  return out as { dek: string; doc: VaultKeyDoc }
}

export const vault = onCall({ region: REGION, secrets: [VAULT_KEK], enforceAppCheck: ENFORCE_APP_CHECK, timeoutSeconds: 30, maxInstances: 10 }, async (req) => {
  const uid = caller(req)
  if (!(await flagOn('vaults'))) throw new HttpsError('failed-precondition', 'Private groups are switched off right now.')
  const data = (req.data ?? {}) as Record<string, unknown>
  switch (data.op) {
    case 'passkeyOptions':
      return passkeyOptions(uid, req, data.purpose === 'register' ? 'register' : 'auth')
    case 'passkeyRegister':
      return registerPasskey(uid, req, data.response as RegistrationResponseJSON)
    case 'status': {
      const gid = groupId(data.groupId)
      await privateGroup(gid, uid)
      const { rpID } = rp(req)
      const [k, p] = await Promise.all([keyRef(gid).get(), passkeysRef(uid).get()])
      const tries = (k.get('tries') as Record<string, TryState> | undefined)?.[uid]
      const hasPasskey = ((p.get('credentials') as StoredPasskey[] | undefined) ?? []).some((c) => c.rpID === rpID)
      return {
        setUp: k.exists,
        hasPasskey,
        triesLeft: lockedOut(tries, Date.now()) ? 0 : triesLeft(tries),
        ...(lockedOut(tries, Date.now()) ? { lockedUntil: tries?.lockedUntil } : {}),
      } satisfies VaultStatus
    }
    case 'setup': {
      const gid = groupId(data.groupId)
      await privateGroup(gid, uid)
      const problem = typeof data.pattern === 'string' ? patternProblem(data.pattern) : patternProblem('')
      if (problem) throw new HttpsError('invalid-argument', problem)
      const list = keks()
      await checkPasskey(uid, req, data.auth as AuthenticationResponseJSON)
      const dek = newDataKey()
      const doc: VaultKeyDoc = { wrapped: wrapKey(dek, list[0]), pattern: hashPattern(data.pattern as string, pepperOf(list[0])), createdBy: uid, createdAt: Date.now() }
      // create() fails when it exists: two members setting it up at once get one key, not two.
      await keyRef(gid)
        .create(doc)
        .catch(() => {
          throw new HttpsError('already-exists', 'Someone already set this group’s pattern. Unlock it with theirs.')
        })
      logger.info('vault set up', { groupId: gid, uid })
      return { dek }
    }
    case 'unlock': {
      const gid = groupId(data.groupId)
      await privateGroup(gid, uid)
      const list = keks()
      await checkPasskey(uid, req, data.auth as AuthenticationResponseJSON)
      const { dek } = await checkPattern(gid, uid, data.pattern, list)
      return { dek }
    }
    case 'changePattern': {
      const gid = groupId(data.groupId)
      await privateGroup(gid, uid)
      const problem = typeof data.next === 'string' ? patternProblem(data.next) : patternProblem('')
      if (problem) throw new HttpsError('invalid-argument', problem)
      const list = keks()
      await checkPasskey(uid, req, data.auth as AuthenticationResponseJSON)
      const { dek } = await checkPattern(gid, uid, data.pattern, list)
      await keyRef(gid).update({ pattern: hashPattern(data.next as string, pepperOf(list[0])), patternChangedAt: Date.now(), patternChangedBy: uid, tries: {} })
      logger.info('vault pattern changed', { groupId: gid, uid })
      return { dek }
    }
    default:
      throw new HttpsError('invalid-argument', 'Unknown step.')
  }
})
