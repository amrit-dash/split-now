import { describe, expect, it, vi } from 'vitest'
import { sealText, vaultKey } from './vault-crypto'
import { lockVault, setVaultKey } from './vault-keys'
import { mayHaveTokens, openedWatch, openOnce } from './vault-open'
import { isSealed, sealedLook } from './vault-scramble'

const dek = btoa(String.fromCharCode(...new Array(32).fill(3)))
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('opening a private group', () => {
  it('passes ordinary documents straight through', () => {
    const got: unknown[] = []
    const plain = [{ description: 'Dinner' }]
    const w = openedWatch<typeof plain, undefined>('g0', (cb) => {
      cb(plain)
      return () => {}
    })
    w((v) => got.push(v))
    expect(got).toEqual([plain])
    expect(got[0]).toBe(plain)
    expect(mayHaveTokens(plain)).toBe(false)
  })
  it('shows tokens as locked, then opens them on unlock and locks them again', async () => {
    lockVault()
    const k = await vaultKey('g1', dek)
    const docs = [{ id: 'e1', description: await sealText(k, 'Hotel') }]
    const seen: string[] = []
    const off = openedWatch<typeof docs, undefined>('g1', (cb) => {
      cb(docs)
      return () => {}
    })((v) => seen.push(v[0].description))
    // locked: the token's own characters, never the text
    const looked = sealedLook(docs[0].description)
    await vi.waitFor(() => expect(seen).toEqual([looked]))
    expect(isSealed(seen[0])).toBe(true)
    expect(seen[0]).not.toContain('Hotel')
    setVaultKey(k)
    await vi.waitFor(() => expect(seen.at(-1)).toBe('Hotel'))
    lockVault('g1')
    await vi.waitFor(() => expect(seen.at(-1)).toBe(looked))
    off()
    const count = seen.length
    setVaultKey(k)
    await tick()
    expect(seen).toHaveLength(count) // unsubscribed: no more snapshots
    expect(await openOnce('g1', { text: docs[0].description })).toEqual({ text: 'Hotel' })
    lockVault()
  })
})
