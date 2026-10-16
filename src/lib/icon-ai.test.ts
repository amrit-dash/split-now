import { describe, expect, it } from 'vitest'
import { iconAiOffered, iconAiProblem, iconFace, pictureNote, pictureOffer, pictureProblem } from './icon-ai'

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

describe('Draw a picture', () => {
  it('on the person’s own key whenever they added one, even with the free AI as the default', () => {
    expect(pictureOffer({ ...base, hasOwnKey: true })).toBe('own')
    expect(pictureOffer({ ...base, hasOwnKey: true, prefs: { ...prefs, aiSource: 'app' } })).toBeNull()
  })
  it('on the shared key only where the admin allows pictures', () => {
    expect(pictureOffer(base)).toBeNull()
    expect(pictureOffer({ ...base, status: { app: { images: 'available', engine: 'gemini', pictures: 'available' } } })).toBe('app')
    expect(pictureOffer({ ...base, prefs: { ...prefs, aiSource: 'own' }, status: { app: { images: 'available', pictures: 'available' } } })).toBeNull()
  })
  it('never in a private group, with the switches off, or offline', () => {
    expect(pictureOffer({ ...base, hasOwnKey: true, vault: true })).toBeNull()
    expect(pictureOffer({ ...base, hasOwnKey: true, flag: false })).toBeNull()
    expect(pictureOffer({ ...base, hasOwnKey: true, online: false })).toBeNull()
    expect(pictureOffer({ ...base, mode: 'demo' })).toBe('app')
  })
  it('a picture wins over a drawn icon, and a private group shows only the emoji', () => {
    const svg = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#f59e0b"/></svg>'
    expect(iconFace({ iconImage: 'data:image/webp;base64,AAAA', iconSvg: svg, emoji: '🍕' })).toEqual({ src: 'data:image/webp;base64,AAAA' })
    expect(iconFace({ iconImage: 'javascript:alert(1)', emoji: '🍕' })).toEqual({ emoji: '🍕' })
    expect(iconFace({ iconImage: 'data:image/webp;base64,AAAA', emoji: '🍕', vault: true })).toEqual({ emoji: '🍕' })
  })
})

describe('what the picture row says', () => {
  it('who pays, before asking', () => {
    expect(pictureNote('own', 'about US$0.03')).toBe('Billed to your Gemini key, about US$0.03 a picture')
    expect(pictureNote('app', 'x')).toMatch(/Split Now/)
  })
  it('why nothing came back', () => {
    expect(pictureProblem({ unavailable: true, reason: 'blocked' }, false)).toMatch(/wouldn’t draw/)
    expect(pictureProblem({ unavailable: true, reason: 'bad_key' }, false)).toMatch(/rejected/)
    expect(pictureProblem({ unavailable: true, reason: 'quota' }, false)).toMatch(/limit/)
    expect(pictureProblem(null, false)).toMatch(/connection/)
    expect(pictureProblem({ image: 'x' }, false)).toMatch(/Couldn’t use/)
    expect(pictureProblem({ image: 'x' }, true)).toBeNull()
  })
})
