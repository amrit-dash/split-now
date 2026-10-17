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
  it('a group’s own pattern opens only that group', async () => {
    const v = demoVault(mem(), undefined, () => ['a', 'b'])
    // a private group must open with something: no universal pattern and none of its own is refused
    await expect(v({ op: 'create', groupId: 'a' })).rejects.toThrow('Choose how it opens')
    // setting its own takes a pattern that already opens the group: with none at all, there is nothing to prove
    await expect(v({ op: 'groupPattern', groupId: 'a', pattern: 'TL', ordered: true, current: '' })).rejects.toThrow('Set up')
    await v({ op: 'setUniversal', pattern: 'TTLTLL', ordered: true })
    const { dek } = await v<{ dek: string }>({ op: 'create', groupId: 'a' })
    await expect(v({ op: 'create', groupId: 'a' })).rejects.toThrow('already')
    await expect(v({ op: 'groupPattern', groupId: 'a', pattern: 'TL', ordered: true, current: 'LLTTLT' })).rejects.toMatchObject({ details: { triesLeft: 4 } })
    await v({ op: 'groupPattern', groupId: 'a', pattern: 'TL', ordered: true, current: 'TTLTLL' })
    expect(await v({ op: 'status', groupId: 'a' })).toMatchObject({ group: { keyReady: true, hasPattern: true, ordered: true } })
    expect(await v<Keys>({ op: 'unlockStart', pattern: 'TL', groupId: 'a' })).toEqual({ keys: { a: dek } })
    await expect(v({ op: 'unlockStart', pattern: 'LT', groupId: 'a' })).rejects.toThrow('not it')
    await expect(v({ op: 'unlockStart', pattern: 'TL', groupId: 'b' })).rejects.toThrow('not it')
    // its own pattern is enough to change or remove it
    await v({ op: 'groupPattern', groupId: 'a', pattern: null, ordered: true, current: 'TL' })
    expect(await v({ op: 'status', groupId: 'a' })).toMatchObject({ group: { keyReady: true, hasPattern: false } })
  })
  it('making a group private needs a pattern to open it: the universal one, or its own chosen there', async () => {
    const converted: string[] = []
    const v = demoVault(
      mem(),
      undefined,
      () => [],
      async (id, on) => void converted.push(`${id}:${on}`),
    )
    await expect(v({ op: 'convert', groupId: 'g', on: true })).rejects.toThrow('Choose how it opens')
    await expect(v({ op: 'convert', groupId: 'g', on: true, pattern: '', ordered: true })).rejects.toThrow()
    await v({ op: 'convert', groupId: 'g', on: true, pattern: 'TL', ordered: false })
    expect(converted).toEqual(['g:true'])
    expect(await v({ op: 'status', groupId: 'g' })).toMatchObject({ universal: false, group: { keyReady: true, hasPattern: true, ordered: false } })
  })
  it('changing the universal pattern takes the current one', async () => {
    const v = demoVault(mem(), undefined, () => ['a'])
    await v({ op: 'setUniversal', pattern: 'TTLTLL', ordered: true })
    await expect(v({ op: 'setUniversal', pattern: 'LLTTLT', ordered: true })).rejects.toMatchObject({ details: { triesLeft: 4 } })
    await expect(v({ op: 'setUniversal', pattern: 'LLTTLT', ordered: true, current: 'TLTLTL' })).rejects.toThrow('not it')
    await v({ op: 'setUniversal', pattern: 'LLTTLT', ordered: true, current: 'TTLTLL' })
    await expect(v({ op: 'unlockStart', pattern: 'LLTTLT' })).resolves.toMatchObject({ keys: { a: expect.any(String) } })
  })
  it('a group’s own pattern chosen as it is made opens it, without anyone’s universal pattern', async () => {
    const v = demoVault(mem(), undefined, () => ['a'])
    await expect(v({ op: 'create', groupId: 'a', pattern: '', ordered: true })).rejects.toThrow()
    const { dek } = await v<{ dek: string }>({ op: 'create', groupId: 'a', pattern: 'TLL', ordered: false })
    expect(await v({ op: 'status', groupId: 'a' })).toMatchObject({ universal: false, group: { hasPattern: true, ordered: false } })
    expect(await v<Keys>({ op: 'unlockStart', pattern: 'LTL', groupId: 'a' })).toEqual({ keys: { a: dek } })
  })
  it('stopping: held up by private groups they made, takes the current pattern, then no new ones until they start again', async () => {
    let made = 1
    const off: boolean[] = []
    const v = demoVault(mem(), undefined, () => ['a'], undefined, undefined, { made: () => made, setOff: (o) => off.push(o) })
    await v({ op: 'setUniversal', pattern: 'TTLTLL', ordered: true })
    expect(await v({ op: 'status', made: true })).toMatchObject({ made: 1 })
    await expect(v({ op: 'stop', current: 'TTLTLL' })).rejects.toMatchObject({ details: { made: 1 } })
    made = 0
    await expect(v({ op: 'stop', current: 'LLTTLT' })).rejects.toThrow('not it')
    await v({ op: 'stop', current: 'TTLTLL' })
    expect(off).toEqual([true])
    expect(await v({ op: 'status' })).toMatchObject({ off: true, universal: false })
    await expect(v({ op: 'create', groupId: 'n' })).rejects.toThrow('stopped')
    await expect(v({ op: 'convert', groupId: 'n', on: true })).rejects.toThrow('stopped')
    // a universal pattern starts them again
    await v({ op: 'setUniversal', pattern: 'LLTTLT', ordered: true })
    expect(off).toEqual([true, false])
    expect(await v({ op: 'status' })).not.toHaveProperty('off')
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
