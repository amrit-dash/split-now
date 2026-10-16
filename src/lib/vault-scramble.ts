/*
 * How a locked private group looks (docs/VAULT.md): a lock instead of its icon, letters instead
 * of its name and its words, animals instead of its people, symbols instead of its amounts. The
 * gibberish comes from the group's id, so it stays the same from one render to the next (no
 * flicker) and says nothing about what it hides. Amounts are symbols, never fake digits, so
 * nobody reads one as what they owe.
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

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'

/** Words of letters, about `len` long: "Vrok eslan". The first letter is a capital. */
export function gibberish(seed: string, len = 10): string {
  const r = seeded(seed)
  let out = ''
  while (out.length < len) {
    const word = Array.from({ length: 3 + Math.floor(r() * 5) }, () => LETTERS[Math.floor(r() * 26)]).join('')
    out += (out ? ' ' : '') + word
  }
  const s = out.slice(0, len).trimEnd()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const SYMBOLS = '#%&*@§'

/** An amount that isn't one: the currency's symbol, then symbols in the shape of a number ("₹#,%&*"). */
export function scrambledAmount(seed: string, symbol = '₹'): string {
  const r = seeded(`${seed}:amount`)
  const digits = Array.from({ length: 3 + Math.floor(r() * 3) }, () => SYMBOLS[Math.floor(r() * SYMBOLS.length)])
  const head = digits.slice(0, digits.length - 3).join('')
  const tail = digits.slice(-3).join('')
  return `${symbol}${head ? `${head},` : ''}${tail}`
}

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
