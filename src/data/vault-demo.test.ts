import { describe, expect, it } from 'vitest'
import { demoVault, privateProfile } from './vault-demo'

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
    // with no universal pattern, removing its own would leave nothing that opens it for them
    await expect(v({ op: 'groupPattern', groupId: 'g', pattern: null, ordered: true, current: 'TL' })).rejects.toThrow('universal pattern first')
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
  it('someone added with no universal pattern can’t open it until it gets its own pattern, which is then kept', async () => {
    const added: string[] = []
    const v = demoVault(
      mem(),
      undefined,
      () => ['g'],
      undefined,
      async (_g, who) => void added.push(who),
    )
    await v({ op: 'setUniversal', pattern: 'TTLTLL', ordered: true })
    await v({ op: 'create', groupId: 'g' })
    expect(await v({ op: 'addContact', groupId: 'g', uid: 'seed_ananya' })).toEqual({ ok: true, opens: false })
    expect(added).toEqual(['seed_ananya'])
    expect(await v({ op: 'status', groupId: 'g' })).toMatchObject({ group: { hasPattern: false, noUniversal: ['seed_ananya'] } })
    await v({ op: 'groupPattern', groupId: 'g', pattern: 'TLT', ordered: true, current: 'TTLTLL' })
    // still without a universal pattern (removing its own would lock them out), and now it opens for them
    expect(await v({ op: 'status', groupId: 'g' })).toMatchObject({ group: { hasPattern: true, noUniversal: ['seed_ananya'] } })
    expect(await v({ op: 'addContact', groupId: 'g', uid: 'seed_meera' })).toEqual({ ok: true, opens: true })
  })
  it('everyone else in a group, however they came in, counts as having no universal pattern', async () => {
    const v = demoVault(mem(), undefined, () => [], undefined, undefined, { others: (g) => (g === 'g' ? ['seed_meera'] : []) })
    expect(await v({ op: 'status', groupId: 'g', convert: true })).toMatchObject({ group: { keyReady: false, hasPattern: false, noUniversal: ['seed_meera'] } })
    expect((await v<{ group: object }>({ op: 'status', groupId: 'h' })).group).toEqual({ keyReady: false, hasPattern: false })
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
    const profile: string[] = []
    const v = demoVault(mem(), undefined, () => ['a'], undefined, undefined, { made: () => made, setPrivate: (to) => profile.push(to) })
    await v({ op: 'setUniversal', pattern: 'TTLTLL', ordered: true })
    expect(profile.at(-1)).toBe('on')
    expect(await v({ op: 'status', made: true })).toMatchObject({ made: 1, on: true })
    await expect(v({ op: 'stop', current: 'TTLTLL' })).rejects.toMatchObject({ details: { made: 1 } })
    made = 0
    await expect(v({ op: 'stop', current: 'LLTTLT' })).rejects.toThrow('not it')
    await v({ op: 'stop', current: 'TTLTLL' })
    expect(profile.at(-1)).toBe('off')
    const stopped = await v({ op: 'status' })
    expect(stopped).toMatchObject({ off: true, universal: false })
    expect(stopped).not.toHaveProperty('on')
    await expect(v({ op: 'create', groupId: 'n' })).rejects.toThrow('stopped')
    await expect(v({ op: 'convert', groupId: 'n', on: true })).rejects.toThrow('stopped')
    // a universal pattern starts them again
    await v({ op: 'setUniversal', pattern: 'LLTTLT', ordered: true })
    expect(profile.at(-1)).toBe('on')
    expect(await v({ op: 'status' })).not.toHaveProperty('off')
  })
  it('private groups start off; start turns them on without a pattern, and stop turns them off again', async () => {
    const profile: string[] = []
    const v = demoVault(mem(), undefined, () => [], undefined, undefined, { made: () => 0, setPrivate: (to) => profile.push(to) })
    const first = await v({ op: 'status' })
    expect(first).not.toHaveProperty('on')
    expect(first).not.toHaveProperty('off')
    expect(profile).toEqual([])
    await v({ op: 'start' })
    expect(profile).toEqual(['on'])
    expect(await v({ op: 'status' })).toMatchObject({ on: true, universal: false })
    // on, with no universal pattern: stopping asks for none
    await v({ op: 'stop' })
    expect(profile.at(-1)).toBe('off')
    expect(await v({ op: 'status' })).toMatchObject({ off: true })
    // and on again
    await v({ op: 'start' })
    const again = await v({ op: 'status' })
    expect(again).toMatchObject({ on: true })
    expect(again).not.toHaveProperty('off')
  })
  it('counts someone from before as on: a universal pattern, or a private group they made', async () => {
    // a 8.6 demo's state: a universal pattern, nothing saying on
    const s = mem()
    const profile: string[] = []
    const v = demoVault(s, undefined, () => [], undefined, undefined, { made: () => 0, setPrivate: (to) => profile.push(to) })
    await v({ op: 'setUniversal', pattern: 'TTLTLL', ordered: true })
    const saved = JSON.parse(s.m.get('sn-demo-vault') as string)
    delete saved.on
    s.m.set('sn-demo-vault', JSON.stringify(saved))
    profile.length = 0
    expect(await v({ op: 'status' })).toMatchObject({ on: true })
    expect(profile).toEqual(['on'])
    expect(JSON.parse(s.m.get('sn-demo-vault') as string).on).toBe(true)
    // a private group they made, with no universal pattern
    const made: string[] = []
    const w = demoVault(mem(), undefined, () => [], undefined, undefined, { made: () => 1, setPrivate: (to) => made.push(to) })
    expect(await w({ op: 'status' })).toMatchObject({ on: true, universal: false })
    expect(made).toEqual(['on'])
  })
  it('making a private group turns them on', async () => {
    const profile: string[] = []
    const v = demoVault(mem(), undefined, () => [], undefined, undefined, { made: () => 0, setPrivate: (to) => profile.push(to) })
    await v({ op: 'create', groupId: 'a', pattern: 'TL', ordered: true })
    expect(profile).toEqual(['on'])
    const w = demoVault(mem(), undefined, () => [], undefined, undefined, { made: () => 0, setPrivate: (to) => profile.push(to) })
    await w({ op: 'convert', groupId: 'b', on: true, pattern: 'TL' })
    expect(profile).toEqual(['on', 'on'])
  })
  it('mirrors on and off on the profile, never both', () => {
    const p: { uid: string; privateGroupsOn?: boolean } = { uid: 'me' }
    expect(privateProfile(p, 'on')).toEqual({ uid: 'me', privateGroupsOn: true })
    expect(privateProfile({ uid: 'me', privateGroupsOff: true }, 'on')).toEqual({ uid: 'me', privateGroupsOn: true })
    expect(privateProfile({ uid: 'me', privateGroupsOn: true }, 'off')).toEqual({ uid: 'me', privateGroupsOff: true })
    const on = { uid: 'me', privateGroupsOn: true }
    expect(privateProfile(on, 'on')).toBe(on)
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
