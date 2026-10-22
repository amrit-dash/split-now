import { describe, expect, it } from 'vitest'
import { probeBilling, silentWavBase64 } from './transcribe'

const reply = (status: number, body = '') => new Response(body, { status })

describe('silentWavBase64', () => {
  it('is a valid 16 kHz mono WAV of the asked length', () => {
    const b = Buffer.from(silentWavBase64(500), 'base64')
    expect(b.toString('ascii', 0, 4)).toBe('RIFF')
    expect(b.toString('ascii', 8, 12)).toBe('WAVE')
    expect(b.readUInt32LE(24)).toBe(16_000)
    expect(b.readUInt32LE(40)).toBe(16_000) // 8000 samples × 2 bytes
    expect(b.length).toBe(44 + 16_000)
  })
})

describe('probeBilling', () => {
  it('a billed key answers', async () => {
    const f = (async () => reply(200, '{"candidates":[]}')) as typeof fetch
    expect(await probeBilling('k', f, ['m1'])).toBe('billed')
  })
  it('a free key is refused with an allowance of 0', async () => {
    const f = (async () => reply(429, 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 0')) as typeof fetch
    expect(await probeBilling('k', f, ['m1'])).toBe('free')
  })
  it('a model the key can’t use moves on to the next; none saying either way is unknown', async () => {
    const seen: string[] = []
    const f = (async (url: string) => {
      seen.push(String(url))
      return String(url).includes('m2') ? reply(200) : reply(404, 'not found')
    }) as unknown as typeof fetch
    expect(await probeBilling('k', f, ['m1', 'm2'])).toBe('billed')
    expect(seen).toHaveLength(2)
    const none = (async () => reply(500)) as typeof fetch
    expect(await probeBilling('k', none, ['m1', 'm2'])).toBe('unknown')
  })
})
