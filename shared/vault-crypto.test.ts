import { describe, expect, it } from 'vitest'
import { fitForToken, hasToken, isToken, openDeep, openText, openToken, plainBytesFor, sealText, vaultKey } from './vault-crypto'

const dek = btoa(String.fromCharCode(...new Array(32).fill(7)))
const other = btoa(String.fromCharCode(...new Array(32).fill(9)))

describe('vault tokens', () => {
  it('round-trips text, unicode included, and is the same token for the same text', async () => {
    const k = await vaultKey('g1', dek)
    const t = await sealText(k, 'Dinner at Thalassa 🍽️ — दाल')
    expect(isToken(t)).toBe(true)
    expect(t).not.toContain('Dinner')
    expect(await openToken(k, t)).toBe('Dinner at Thalassa 🍽️ — दाल')
    expect(await sealText(k, 'Dinner at Thalassa 🍽️ — दाल')).toBe(t)
    expect(await sealText(k, 'Dinner at Thalassa')).not.toBe(t)
    expect(await sealText(k, '')).toBe('')
  })
  it('opens only with the same group and key', async () => {
    const k = await vaultKey('g1', dek)
    const t = await sealText(k, 'Hotel')
    expect(await openToken(await vaultKey('g2', dek), t)).toBeNull()
    expect(await openToken(await vaultKey('g1', other), t)).toBeNull()
    expect(await openToken(k, `${t.slice(0, -2)}AA`)).toBeNull()
    await expect(vaultKey('g1', 'c2hvcnQ=')).rejects.toThrow()
  })
  it('opens tokens inside other text, and shows locked ones as locked', async () => {
    const k = await vaultKey('g1', dek)
    const t = await sealText(k, 'Dinner')
    const line = `Asha added “${t}” (₹500)`
    expect(hasToken(line)).toBe(true)
    expect(await openText(line, k)).toBe('Asha added “Dinner” (₹500)')
    expect(await openText(line, null)).toBe('Asha added “🔒” (₹500)')
    expect(await openText('no tokens here', null)).toBe('no tokens here')
  })
  it('opens a whole document, leaving untouched ones as they were', async () => {
    const k = await vaultKey('g1', dek)
    const e = { id: 'e1', amount: 500, description: await sealText(k, 'Cab'), splitInput: { items: [{ name: await sealText(k, 'Tea'), amount: 100 }] } }
    const cache = new Map<string, string>()
    const o = await openDeep(e, k, '🔒', cache)
    expect(o).toEqual({ id: 'e1', amount: 500, description: 'Cab', splitInput: { items: [{ name: 'Tea', amount: 100 }] } })
    expect(cache.size).toBe(2)
    const plain = { id: 'e2', description: 'Lunch' }
    expect(await openDeep(plain, k)).toBe(plain)
  })
  it('knows how long a text may be for a field cap', async () => {
    const k = await vaultKey('g1', dek)
    const cap = 200
    const max = plainBytesFor(cap)
    expect((await sealText(k, 'x'.repeat(max))).length).toBeLessThanOrEqual(cap)
    expect(fitForToken('x'.repeat(max + 10), cap)).toHaveLength(max)
    expect(new TextEncoder().encode(fitForToken('दाल'.repeat(100), cap)).length).toBeLessThanOrEqual(max)
    expect(fitForToken('short', cap)).toBe('short')
  })
})
