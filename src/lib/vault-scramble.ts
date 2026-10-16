/*
 * How a locked private group looks (docs/VAULT.md): a lock instead of its icon, scrambled
 * characters instead of its name, its words and its amounts, animals instead of its people.
 * Everything scrambled mixes letters, digits and symbols. Text that is encrypted shows as its own
 * token (sealedLook: the ciphertext's characters, about as long as the hidden text); what has no
 * token (names until a group is converted, and amounts, which the server needs in the clear) is
 * made up from an id (gibberish, scrambledAmount), so it stays the same from one render to the
 * next and says nothing about what it hides. An amount always carries a letter or symbol, so
 * nobody reads one as a real balance.
 */

/** A small seeded generator (mulberry32 over a string hash). */
function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Every scrambled character comes from here: letters, digits and symbols. */
export const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#%&*@§$!?+=~^'
const NOT_DIGITS = SCRAMBLE_CHARS.replace(/[0-9]/g, '')

/** Words of scrambled characters, about `len` long: "Vr#k e5l@n". */
export function gibberish(seed: string, len = 10): string {
  const r = seeded(seed)
  let out = ''
  while (out.length < len) {
    const word = Array.from({ length: 3 + Math.floor(r() * 5) }, () => SCRAMBLE_CHARS[Math.floor(r() * SCRAMBLE_CHARS.length)]).join('')
    out += (out ? ' ' : '') + word
  }
  return out.slice(0, len).trimEnd()
}

/**
 * An amount that isn't one: `symbol` (the viewer's own currency, never the group's), then
 * scrambled characters in the shape of one, with its grouping and its decimals ("₹k#,9Q@.x4").
 * At least one character isn't a digit.
 */
export function scrambledAmount(seed: string, symbol = '₹'): string {
  const r = seeded(`${seed}:amount`)
  const pick = () => SCRAMBLE_CHARS[Math.floor(r() * SCRAMBLE_CHARS.length)]
  const n = 1 + Math.floor(r() * 5)
  const chars = [...Array.from({ length: n }, pick), pick(), pick()]
  if (chars.every((c) => /[0-9]/.test(c))) chars[Math.floor(r() * chars.length)] = NOT_DIGITS[Math.floor(r() * NOT_DIGITS.length)]
  const whole = chars.slice(0, n).join('')
  const grouped = whole.length > 3 ? `${whole.slice(0, -3)},${whole.slice(-3)}` : whole
  return `${symbol}${grouped}.${chars.slice(n).join('')}`
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** Marks text that came from a token (an invisible separator), so a screen can tell it from plain text. */
export const SEALED_MARK = '\u2063'

/**
 * A token as it shows while its group is locked: the ciphertext's own characters, mapped onto
 * SCRAMBLE_CHARS and cut to about the hidden text's length (a token is 28 bytes longer than its
 * text), with spaces where its bytes say. Starts with SEALED_MARK.
 */
export function sealedLook(token: string): string {
  const body = token.startsWith('v1:') ? token.slice(3) : token
  const len = Math.max(3, Math.min(40, Math.round((body.length * 3) / 4) - 28))
  let out = ''
  for (let i = 0; out.length < len && i < body.length; i++) {
    const v = B64.indexOf(body[i])
    const c = SCRAMBLE_CHARS[(Math.max(0, v) * 7 + i) % SCRAMBLE_CHARS.length]
    // about one word break in six, never two in a row or at the start
    out += out.length > 1 && v % 6 === 0 && !out.endsWith(' ') ? ' ' : c
  }
  return SEALED_MARK + out.trimEnd()
}

/** Whether text came from sealedLook (encrypted, shown locked). */
export const isSealed = (s: string): boolean => s.startsWith(SEALED_MARK)

export const ANIMALS = ['🦊', '🐼', '🐨', '🦉', '🐢', '🦔', '🐙', '🦦', '🐧', '🦁', '🐯', '🐸', '🐰', '🦒', '🐳', '🦜'] as const

/** An animal for each of `count` people, in a group's own order: the same animals every time, no two alike while there are enough. */
export function animalsFor(seed: string, count: number): string[] {
  const r = seeded(`${seed}:animals`)
  const pool = [...ANIMALS]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return Array.from({ length: count }, (_, i) => pool[i % pool.length])
}

/** The currency's symbol alone ("₹", "$", "€"), for scrambledAmount. */
export function currencySymbol(currency: string, locale = 'en-IN'): string {
  try {
    const part = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')
    return part?.value ?? currency
  } catch {
    return currency
  }
}
