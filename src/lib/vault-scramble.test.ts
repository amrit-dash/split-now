import { describe, expect, it } from 'vitest'
import { ANIMALS, animalsFor, currencySymbol, gibberish, isSealed, SCRAMBLE_CHARS, scrambledAmount, SEALED_MARK, sealedLook } from './vault-scramble'

describe('vault scramble', () => {
  const inSet = (t: string) => [...t].every((c) => c === ' ' || SCRAMBLE_CHARS.includes(c))
  it('gibberish is stable for a seed, differs between seeds, and mixes letters, digits and symbols', () => {
    expect(gibberish('g1')).toBe(gibberish('g1'))
    expect(gibberish('g1')).not.toBe(gibberish('g2'))
    expect(gibberish('g1', 14).length).toBeLessThanOrEqual(14)
    const lots = Array.from({ length: 40 }, (_, i) => gibberish(`s${i}`, 20)).join('')
    expect(inSet(lots)).toBe(true)
    expect(lots).toMatch(/[A-Za-z]/)
    expect(lots).toMatch(/[0-9]/)
    expect(lots).toMatch(/[#%&*@§$!?+=~^]/)
  })
  it('an amount: the given symbol, then scrambled characters, never all digits', () => {
    const a = scrambledAmount('g1', '$')
    expect(a).toBe(scrambledAmount('g1', '$'))
    expect(a.startsWith('$')).toBe(true)
    for (let i = 0; i < 300; i++) {
      const a = scrambledAmount(`x${i}`, '₹')
      expect(a).toMatch(/^₹([^.,]{1,2},)?[^.,]{1,3}\.[^.,]{2}$/u)
      const body = a.slice(1).replace(',', '').replace('.', '')
      expect(inSet(body)).toBe(true)
      expect(body).toMatch(/[^0-9]/)
    }
  })
  it('a locked name is its ciphertext when sealed, else made up', async () => {
    const { lockedText } = await import('./vault-scramble')
    const look = sealedLook(`v1:${'Q'.repeat(60)}`)
    expect(lockedText(look, 'g1')).toBe(look)
    expect(lockedText('Goa trip', 'g1')).toBe(gibberish('g1', 14))
    expect(lockedText(undefined, 'g1')).toBe(gibberish('g1', 14))
  })
  it('a token shows as its own ciphertext, about as long as its text, marked as sealed', () => {
    // a token for a 6-byte text: 28 bytes of overhead, base64url
    const token = `v1:${'Q2lwaGVydGV4dGJ5dGVzMTIzNDU2Nzg5MGFiY2RlZmdoaQ'.slice(0, 46)}`
    const look = sealedLook(token)
    expect(look).toBe(sealedLook(token))
    expect(isSealed(look)).toBe(true)
    expect(isSealed('Dinner')).toBe(false)
    const shown = look.slice(SEALED_MARK.length)
    expect(inSet(shown)).toBe(true)
    expect(shown.length).toBeGreaterThanOrEqual(3)
    expect(shown.length).toBeLessThanOrEqual(8)
    expect(sealedLook('v1:AAAA' + 'B'.repeat(200)).length).toBeLessThanOrEqual(41)
  })
  it('animals: the same ones each time, no repeats while there are enough', () => {
    const a = animalsFor('g1', 5)
    expect(a).toEqual(animalsFor('g1', 5))
    expect(new Set(a).size).toBe(5)
    for (const x of a) expect(ANIMALS).toContain(x)
    expect(animalsFor('g1', 20)).toHaveLength(20)
  })
  it('a currency symbol', () => {
    expect(currencySymbol('INR')).toBe('₹')
    expect(currencySymbol('USD', 'en-US')).toBe('$')
    expect(currencySymbol('XXX1')).toBe('XXX1')
  })
})
