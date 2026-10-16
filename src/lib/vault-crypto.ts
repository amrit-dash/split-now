/*
 * Private groups (docs/VAULT.md): the words in a private group are stored as tokens,
 * "v1:" + base64url(iv ‖ AES-256-GCM ciphertext), made and read only on the phone with the group's
 * data key (which the vault callable hands over after the pattern and a passkey).
 *
 * Two keys come from the data key with HKDF: one encrypts, one makes the IV. The IV is an HMAC of
 * the text, so the same text always makes the same token: saving an expense again doesn't look
 * like a change to the history, and a token can be cached. The price is that two identical texts
 * in one group look alike to someone reading the database; nothing else about them shows.
 * The group id is bound in as associated data, so a token copied into another group won't open.
 *
 * A token is self-contained, so text that quotes one (an activity line: Asha added “v1:…”)
 * opens too: openText() replaces every token it can read. Uses WebCrypto (browsers, Node 22).
 */

export interface VaultKey {
  groupId: string
  enc: CryptoKey
  iv: CryptoKey
}

const TOKEN = /v1:[A-Za-z0-9_-]{24,}/g
const PREFIX = 'v1:'
const te = new TextEncoder()
const td = new TextDecoder()

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  const out = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
  return out
}

export const fromBase64 = (s: string): Uint8Array => fromB64url(s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))

/** The group's keys from its 32-byte data key (base64, as the vault callable returns it). */
export async function vaultKey(groupId: string, dekBase64: string): Promise<VaultKey> {
  const raw = fromBase64(dekBase64)
  if (raw.length !== 32) throw new Error('Not a group key')
  const base = await crypto.subtle.importKey('raw', raw as BufferSource, 'HKDF', false, ['deriveKey'])
  const hkdf = (info: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: te.encode('split-now vault'), info: te.encode(info) })
  const [enc, iv] = await Promise.all([
    crypto.subtle.deriveKey(hkdf('enc v1'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
    crypto.subtle.deriveKey(hkdf('iv v1'), base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']),
  ])
  return { groupId, enc, iv }
}

export const isToken = (s: unknown): s is string => typeof s === 'string' && s.startsWith(PREFIX) && new RegExp(`^${TOKEN.source}$`).test(s)

/** Whether a text holds any token (a locked group's text shows as locked). */
export const hasToken = (s: string): boolean => new RegExp(TOKEN.source).test(s)

export async function sealText(k: VaultKey, plain: string): Promise<string> {
  if (!plain) return plain
  const data = te.encode(plain)
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k.iv, new Uint8Array([...te.encode(k.groupId), 0, ...data])))
  const iv = mac.slice(0, 12)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(k.groupId) }, k.enc, data))
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv)
  out.set(ct, iv.length)
  return PREFIX + b64url(out)
}

/** The text of one token; null when it isn't one or doesn't open with this key. */
export async function openToken(k: VaultKey, token: string): Promise<string | null> {
  if (!isToken(token)) return null
  try {
    const bytes = fromB64url(token.slice(PREFIX.length))
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: te.encode(k.groupId) },
      k.enc,
      bytes.slice(12) as BufferSource,
    )
    return td.decode(pt)
  } catch {
    return null
  }
}

/**
 * Every token in `text` replaced: with its text when `k` opens it, else with `locked` (a string,
 * or what it makes of the token). A token the key can't open (another group's, or damaged) also
 * shows as `locked`.
 */
export type Locked = string | ((token: string) => string)

export async function openText(text: string, k: VaultKey | null, locked: Locked = '🔒', cache?: Map<string, string>): Promise<string> {
  const lockedFor = (t: string) => (typeof locked === 'string' ? locked : locked(t))
  const found = text.match(TOKEN)
  if (!found) return text
  const plain = new Map<string, string>()
  for (const t of new Set(found)) {
    const hit = cache?.get(t)
    if (hit !== undefined) plain.set(t, hit)
    else {
      const p = k ? await openToken(k, t) : null
      if (p !== null) cache?.set(t, p)
      plain.set(t, p ?? lockedFor(t))
    }
  }
  return text.replace(TOKEN, (t) => plain.get(t) ?? lockedFor(t))
}

/** Every string inside `value` (objects and arrays, any depth) opened with openText. Returns a copy only when something changed. */
export async function openDeep<T>(value: T, k: VaultKey | null, locked: Locked = '🔒', cache?: Map<string, string>): Promise<T> {
  if (typeof value === 'string') return (hasToken(value) ? await openText(value, k, locked, cache) : value) as T
  if (Array.isArray(value)) {
    let changed = false
    const out = await Promise.all(
      value.map(async (v) => {
        const o = await openDeep(v, k, locked, cache)
        if (o !== v) changed = true
        return o
      }),
    )
    return (changed ? out : value) as T
  }
  if (value && typeof value === 'object') {
    let changed = false
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) {
      const o = await openDeep(v, k, locked, cache)
      if (o !== v) changed = true
      out[key] = o
    }
    return (changed ? out : value) as T
  }
  return value
}

/** The longest text (UTF-8 bytes) whose token fits in `cap` characters: a private group's limit for a field. */
export const plainBytesFor = (cap: number): number => Math.floor(((cap - PREFIX.length) * 3) / 4) - 12 - 16

/** `s` cut (at a character boundary) so its token fits in `cap`; the form says so before it comes to that. */
export function fitForToken(s: string, cap: number): string {
  const max = plainBytesFor(cap)
  if (te.encode(s).length <= max) return s
  let out = ''
  for (const ch of s) {
    if (te.encode(out + ch).length > max) break
    out += ch
  }
  return out
}
