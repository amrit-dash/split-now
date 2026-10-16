import { describe, expect, it } from 'vitest'
import { iconAiOffered, iconAiProblem, iconFace } from './icon-ai'

const prefs = { aiEnabled: true, aiIcons: true, aiSource: 'auto', aiFreeOk: true }
const status = { app: { images: 'available', engine: 'gemma' } }
const base = { mode: 'firebase' as const, flag: true, online: true, vault: false, prefs, status, hasOwnKey: false }

describe('Suggest with AI', () => {
  it('is offered when a key can serve the person', () => {
    expect(iconAiOffered(base)).toBe(true)
    expect(iconAiOffered({ ...base, status: { app: { images: 'off' } }, hasOwnKey: true })).toBe(true)
  })
  it('never in a private group, nor with a switch off, offline or without a key', () => {
    expect(iconAiOffered({ ...base, vault: true })).toBe(false)
    expect(iconAiOffered({ ...base, mode: 'demo', vault: true })).toBe(false)
    expect(iconAiOffered({ ...base, flag: false })).toBe(false)
    expect(iconAiOffered({ ...base, online: false })).toBe(false)
    expect(iconAiOffered({ ...base, prefs: { ...prefs, aiIcons: false } })).toBe(false)
    expect(iconAiOffered({ ...base, prefs: { ...prefs, aiEnabled: false } })).toBe(false)
    expect(iconAiOffered({ ...base, prefs: { ...prefs, aiFreeOk: false } })).toBe(false)
    expect(iconAiOffered({ ...base, status: null })).toBe(false)
  })
  it('the demo answers on the phone', () => {
    expect(iconAiOffered({ ...base, mode: 'demo', online: false, prefs: null, status: undefined })).toBe(true)
  })
})

describe('an icon’s face', () => {
  const svg = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#f59e0b"/></svg>'
  it('a drawn icon is an image, cleaned again', () => {
    const f = iconFace({ iconSvg: svg, emoji: '🍕' })
    expect('src' in f && f.src.startsWith('data:image/svg+xml')).toBe(true)
  })
  it('the emoji when there is none, it isn’t clean, or the group is private', () => {
    expect(iconFace({ emoji: '🍕' })).toEqual({ emoji: '🍕' })
    expect(iconFace({ iconSvg: '<svg><script/></svg>', emoji: '🍕' })).toEqual({ emoji: '🍕' })
    expect(iconFace({ iconSvg: svg, emoji: '🍕', vault: true })).toEqual({ emoji: '🍕' })
  })
})

describe('when Suggest with AI comes back empty', () => {
  it('says why, or nothing when there is something to pick', () => {
    expect(iconAiProblem(null)).toMatch(/connection/)
    expect(iconAiProblem({ unavailable: true, reason: 'quota' })).toMatch(/limit/)
    expect(iconAiProblem({ unavailable: true, reason: 'needs_ok' })).toMatch(/free AI/)
    expect(iconAiProblem({ unavailable: true, reason: 'server' })).toMatch(/Try again/)
    expect(iconAiProblem({ emoji: [], svgs: [] })).toMatch(/No icons/)
    expect(iconAiProblem({ emoji: ['🍕'], svgs: [] })).toBeNull()
  })
})
