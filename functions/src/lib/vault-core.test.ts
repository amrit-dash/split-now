import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  afterWrong,
  FREE_TRIES,
  hashPattern,
  lockedOut,
  newDataKey,
  patternMatchesAny,
  patternProblem,
  pepperOf,
  rpFor,
  triesLeft,
  unwrapKey,
  validPattern,
  wrapKey,
} from './vault-core'

const kek = randomBytes(32)
const old = randomBytes(32)

describe('vault pattern', () => {
  it('is 6 to 32 taps and long presses, mixed', () => {
    expect(validPattern('TTLTLL')).toBe(true)
    expect(validPattern('TTLTL')).toBe(false)
    expect(validPattern('TTLTLX')).toBe(false)
    expect(validPattern('T'.repeat(33))).toBe(false)
    expect(validPattern(123456)).toBe(false)
    expect(patternProblem('TTTTTT')).toBe('Mix taps and long presses.')
    expect(patternProblem('TTLTLL')).toBeNull()
  })
  it('is stored only as a salted, peppered hash; order matters', () => {
    const h = hashPattern('TTLTLL', pepperOf(kek))
    expect(h.hash).not.toContain('TTLTLL')
    expect(patternMatchesAny('TTLTLL', h, [kek])).toEqual({ ok: true, rehash: false })
    expect(patternMatchesAny('TTLTTL', h, [kek]).ok).toBe(false)
    expect(patternMatchesAny('LLTLTT', h, [kek]).ok).toBe(false)
    // the same pattern in another group hashes differently
    expect(hashPattern('TTLTLL', pepperOf(kek)).hash).not.toBe(h.hash)
  })
  it('still opens after a key rotation, and asks to re-hash', () => {
    const h = hashPattern('TTLTLL', pepperOf(old))
    expect(patternMatchesAny('TTLTLL', h, [kek, old])).toEqual({ ok: true, rehash: true })
    expect(patternMatchesAny('TTLTLL', h, [kek]).ok).toBe(false)
  })
})

describe('lockout', () => {
  it('gives 5 tries, then locks for 15 minutes, doubling up to a day', () => {
    let s = undefined as ReturnType<typeof afterWrong> | undefined
    for (let i = 1; i < FREE_TRIES; i++) {
      s = afterWrong(s, 0)
      expect(lockedOut(s, 0)).toBe(false)
    }
    expect(triesLeft(s)).toBe(1)
    s = afterWrong(s, 0)
    expect(s.lockedUntil).toBe(15 * 60_000)
    expect(lockedOut(s, 14 * 60_000)).toBe(true)
    expect(lockedOut(s, 15 * 60_000)).toBe(false)
    expect(triesLeft(s)).toBe(0)
    s = afterWrong(s, 0)
    expect(s.lockedUntil).toBe(30 * 60_000)
    for (let i = 0; i < 20; i++) s = afterWrong(s, 0)
    expect(s.lockedUntil).toBe(24 * 60 * 60_000)
  })
})

describe('data key', () => {
  it('is sealed with the KEK and opens with it, or an older one during a rotation', () => {
    const dek = newDataKey()
    expect(Buffer.from(dek, 'base64')).toHaveLength(32)
    const w = wrapKey(dek, old)
    expect(JSON.stringify(w)).not.toContain(dek)
    expect(unwrapKey(w, [kek, old])).toEqual({ dek, rewrap: true })
    expect(unwrapKey(w, [kek])).toBeUndefined()
  })
})

describe('passkey relying party', () => {
  it('is the app host, for known origins only', () => {
    const allowed = ['https://split-now.web.app', 'http://localhost:5173']
    expect(rpFor('https://split-now.web.app', allowed)).toEqual({ origin: 'https://split-now.web.app', rpID: 'split-now.web.app' })
    expect(rpFor('http://localhost:5173', allowed)?.rpID).toBe('localhost')
    expect(rpFor('https://evil.example', allowed)).toBeNull()
    expect(rpFor(undefined, allowed)).toBeNull()
  })
})
