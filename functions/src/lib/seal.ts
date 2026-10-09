import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/*
 * Envelope encryption for API keys at rest (users/{uid}/secrets/gemini and private/geminiAppKey).
 * The key-encryption key (KEK) is 32 random bytes in Secret Manager (AI_KEY_KEK, see
 * docs/FIREBASE_SETUP.md): Firestore exports, backups and console readers then only ever see
 * ciphertext. AES-256-GCM, a fresh 96-bit IV per value, the tag stored alongside.
 *
 * Rotation: the secret holds a comma-separated list, newest first ("<new>,<old>"). Values are
 * sealed with the first key and read with any of them; a value read with an older key is
 * re-sealed with the newest on its next use. Drop the old key from the list after a week.
 */

export interface Sealed {
  /** format version */
  v: 1
  /** base64 IV (12 bytes) */
  iv: string
  /** base64 ciphertext */
  ct: string
  /** base64 GCM tag (16 bytes) */
  tag: string
}

const KEK_BYTES = 32

/** Parse a KEK from Secret Manager: base64 or hex of 32 bytes, else undefined. */
export function parseKek(raw: string | undefined): Buffer | undefined {
  const s = raw?.trim()
  if (!s) return undefined
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, 'hex')
  try {
    const b = Buffer.from(s, 'base64')
    return b.length === KEK_BYTES ? b : undefined
  } catch {
    return undefined
  }
}

/** The secret's value: one or more KEKs, newest first; bad entries are dropped. */
export function parseKekList(raw: string | undefined): Buffer[] {
  return (raw ?? '')
    .split(',')
    .map((k) => parseKek(k))
    .filter((k): k is Buffer => !!k)
}

/** A fresh KEK, printed once by the setup instructions (base64, 32 bytes). */
export const newKek = () => randomBytes(KEK_BYTES).toString('base64')

export function seal(plain: string, kek: Buffer): Sealed {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', kek, iv)
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return { v: 1, iv: iv.toString('base64'), ct: ct.toString('base64'), tag: c.getAuthTag().toString('base64') }
}

/** Throws on a wrong key or tampered data. */
export function unseal(s: Sealed, kek: Buffer): string {
  const d = createDecipheriv('aes-256-gcm', kek, Buffer.from(s.iv, 'base64'))
  d.setAuthTag(Buffer.from(s.tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(s.ct, 'base64')), d.final()]).toString('utf8')
}

export const isSealed = (v: unknown): v is Sealed =>
  !!v &&
  typeof v === 'object' &&
  (v as Sealed).v === 1 &&
  typeof (v as Sealed).iv === 'string' &&
  typeof (v as Sealed).ct === 'string' &&
  typeof (v as Sealed).tag === 'string'

/**
 * Read a stored key: a sealed value (with the newest KEK, or an older one during rotation), or
 * a legacy plaintext `key` field. Returns the plaintext and whether the document should be
 * rewritten (legacy, or sealed with an older KEK).
 */
export function readStoredKey(doc: { key?: unknown; sealed?: unknown } | undefined, keks: Buffer[]): { key?: string; reseal: boolean } {
  if (!doc) return { reseal: false }
  if (isSealed(doc.sealed)) {
    for (const [i, k] of keks.entries()) {
      try {
        return { key: unseal(doc.sealed, k), reseal: i > 0 }
      } catch {
        /* try the next */
      }
    }
    return { reseal: false }
  }
  const plain = typeof doc.key === 'string' && doc.key ? doc.key : undefined
  return { key: plain, reseal: !!plain && keks.length > 0 }
}

/** The fields to store for `key`: sealed when a KEK is configured, else (with a warning logged by the caller) plaintext. */
export function storedKeyFields(key: string, keks: Buffer[]): { sealed: Sealed; key?: undefined } | { key: string; sealed?: undefined } {
  return keks[0] ? { sealed: seal(key, keks[0]) } : { key }
}
