import { describe, expect, it } from 'vitest'
import { isSealed, newKek, parseKek, parseKekList, readStoredKey, seal, storedKeyFields, unseal } from './seal'

describe('seal', () => {
  const kek = parseKek(newKek())!
  it('round-trips and never stores the plaintext', () => {
    const s = seal('AIzaSyExampleKey1234567890', kek)
    expect(isSealed(s)).toBe(true)
    expect(JSON.stringify(s)).not.toContain('AIzaSy')
    expect(unseal(s, kek)).toBe('AIzaSyExampleKey1234567890')
    expect(seal('x', kek).iv).not.toBe(seal('x', kek).iv)
  })
  it('rejects a wrong key or tampered data', () => {
    const s = seal('secret', kek)
    expect(() => unseal(s, parseKek(newKek())!)).toThrow()
    expect(() => unseal({ ...s, ct: s.ct.slice(0, -2) + 'AA' }, kek)).toThrow()
  })
  it('parses base64 or hex KEKs of 32 bytes only', () => {
    expect(parseKek(newKek())).toHaveLength(32)
    expect(parseKek('a'.repeat(64))).toHaveLength(32)
    expect(parseKek('short')).toBeUndefined()
    expect(parseKek('')).toBeUndefined()
    expect(parseKek(undefined)).toBeUndefined()
  })
  it('reads legacy plaintext and asks for a re-seal; keeps plaintext when no KEK is set', () => {
    expect(readStoredKey({ key: 'plain' }, [kek])).toEqual({ key: 'plain', reseal: true })
    expect(readStoredKey({ key: 'plain' }, [])).toEqual({ key: 'plain', reseal: false })
    expect(readStoredKey({ sealed: seal('k', kek) }, [kek])).toEqual({ key: 'k', reseal: false })
    expect(readStoredKey(undefined, [kek])).toEqual({ reseal: false })
    expect(readStoredKey({}, [kek])).toEqual({ key: undefined, reseal: false })
    expect(storedKeyFields('k', [])).toEqual({ key: 'k' })
    expect(isSealed(storedKeyFields('k', [kek]).sealed)).toBe(true)
  })
  it('rotation: a comma-separated list, newest first; older keys read, newest seals', () => {
    const old = newKek()
    const next = newKek()
    const keks = parseKekList(`${next},${old},junk`)
    expect(keks).toHaveLength(2)
    const s = seal('k', parseKek(old)!)
    expect(readStoredKey({ sealed: s }, keks)).toEqual({ key: 'k', reseal: true })
    expect(readStoredKey({ sealed: s }, [keks[0]])).toEqual({ reseal: false })
    expect(readStoredKey({ sealed: storedKeyFields('k', keks).sealed }, [keks[0]])).toEqual({ key: 'k', reseal: false })
  })
})
