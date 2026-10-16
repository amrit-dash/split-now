import { describe, expect, it } from 'vitest'
import { demoVault } from './vault-demo'

const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}

type Keys = { keys: Record<string, string> }

describe('demo vault', () => {
  it('a universal pattern opens every private group; wrong tries count and lock out', async () => {
    let t = 0
    const v = demoVault(
      mem(),
      () => t,
      () => ['a', 'b'],
    )
    expect(await v({ op: 'status' })).toMatchObject({ serverReady: true, universal: false, triesLeft: 5 })
    await expect(v({ op: 'unlockStart', pattern: 'TTLTLL' })).rejects.toThrow('Set up')
    await expect(v({ op: 'setUniversal', pattern: 'TTTTTT', ordered: true })).rejects.toThrow('Mix taps')
    await v({ op: 'setUniversal', pattern: 'TTLTLL', ordered: true })
    const all = await v<Keys>({ op: 'unlockStart', pattern: 'TTLTLL' })
    expect(Object.keys(all.keys)).toEqual(['a', 'b'])
    // inside one group the universal pattern opens only that one, with the same key
    expect(await v<Keys>({ op: 'unlockStart', pattern: 'TTLTLL', groupId: 'a' })).toEqual({ keys: { a: all.keys.a } })
    for (let i = 4; i >= 1; i--) await expect(v({ op: 'unlockStart', pattern: 'LLTTLT' })).rejects.toMatchObject({ details: { triesLeft: i } })
    await expect(v({ op: 'unlockStart', pattern: 'LLTTLT' })).rejects.toMatchObject({ details: { triesLeft: 0, lockedUntil: 15 * 60_000 } })
    await expect(v({ op: 'unlockStart', pattern: 'TTLTLL' })).rejects.toThrow('Too many')
    t = 16 * 60_000
    expect((await v<Keys>({ op: 'unlockStart', pattern: 'TTLTLL' })).keys.b).toBe(all.keys.b)
  })
  it('with the sequence off, the counts are enough', async () => {
    const v = demoVault(mem(), undefined, () => ['a'])
    await v({ op: 'setUniversal', pattern: 'TTLTLL', ordered: false })
    expect(await v({ op: 'status' })).toMatchObject({ universal: true, ordered: false })
    await expect(v({ op: 'unlockStart', pattern: 'LLLTTT' })).resolves.toMatchObject({ keys: { a: expect.any(String) } })
    await expect(v({ op: 'unlockStart', pattern: 'LLTTTT' })).rejects.toThrow('not it')
  })
  it('a group’s own pattern opens only that group, for someone with no universal pattern', async () => {
    const v = demoVault(mem(), undefined, () => ['a', 'b'])
    const { dek } = await v<{ dek: string }>({ op: 'create', groupId: 'a' })
    await expect(v({ op: 'create', groupId: 'a' })).rejects.toThrow('already')
    await v({ op: 'groupPattern', groupId: 'a', pattern: 'TL', ordered: true })
    expect(await v({ op: 'status', groupId: 'a' })).toMatchObject({ universal: false, group: { keyReady: true, hasPattern: true, ordered: true } })
    expect(await v<Keys>({ op: 'unlockStart', pattern: 'TL', groupId: 'a' })).toEqual({ keys: { a: dek } })
    await expect(v({ op: 'unlockStart', pattern: 'LT', groupId: 'a' })).rejects.toThrow('not it')
    await expect(v({ op: 'unlockStart', pattern: 'TL', groupId: 'b' })).rejects.toThrow('Set up')
    await v({ op: 'groupPattern', groupId: 'a', pattern: null, ordered: true })
    expect(await v({ op: 'status', groupId: 'a' })).toMatchObject({ group: { keyReady: true, hasPattern: false } })
  })
  it('keeps 7.1’s per-group patterns as the groups’ own', async () => {
    const s = mem()
    const salt = 'c2FsdA=='
    const hash = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:TTLTLL`)))))
    s.setItem('sn-demo-vaults', JSON.stringify({ g: { hash, salt, dek: 'KEY' } }))
    const v = demoVault(s)
    expect(await v<Keys>({ op: 'unlockStart', pattern: 'TTLTLL', groupId: 'g' })).toEqual({ keys: { g: 'KEY' } })
  })
})
