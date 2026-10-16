import { describe, expect, it } from 'vitest'
import { demoVault } from './vault-demo'

const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('demo vault', () => {
  it('sets a pattern once, opens with it, counts wrong tries and locks out', async () => {
    let t = 0
    const v = demoVault(mem(), () => t)
    expect(await v({ op: 'status', groupId: 'g' })).toMatchObject({ setUp: false, hasPasskey: true, triesLeft: 5 })
    await expect(v({ op: 'setup', groupId: 'g', pattern: 'TTTTTT' })).rejects.toThrow('Mix taps')
    const { dek } = await v<{ dek: string }>({ op: 'setup', groupId: 'g', pattern: 'TTLTLL' })
    await expect(v({ op: 'setup', groupId: 'g', pattern: 'TLTLTL' })).rejects.toThrow('already')
    expect((await v<{ dek: string }>({ op: 'unlock', groupId: 'g', pattern: 'TTLTLL' })).dek).toBe(dek)
    for (let i = 4; i >= 1; i--) await expect(v({ op: 'unlock', groupId: 'g', pattern: 'LLLLLT' })).rejects.toMatchObject({ details: { triesLeft: i } })
    await expect(v({ op: 'unlock', groupId: 'g', pattern: 'LLLLLT' })).rejects.toMatchObject({ details: { triesLeft: 0, lockedUntil: 15 * 60_000 } })
    await expect(v({ op: 'unlock', groupId: 'g', pattern: 'TTLTLL' })).rejects.toThrow('Too many')
    t = 16 * 60_000
    expect((await v<{ dek: string }>({ op: 'unlock', groupId: 'g', pattern: 'TTLTLL' })).dek).toBe(dek)
    await v({ op: 'changePattern', groupId: 'g', pattern: 'TTLTLL', next: 'LTLTLT' })
    await expect(v({ op: 'unlock', groupId: 'g', pattern: 'TTLTLL' })).rejects.toThrow('not the pattern')
    expect((await v<{ dek: string }>({ op: 'unlock', groupId: 'g', pattern: 'LTLTLT' })).dek).toBe(dek)
  })
})
