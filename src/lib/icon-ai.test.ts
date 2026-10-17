import { describe, expect, it } from 'vitest'
import {
  aiRowShown,
  drawnByLine,
  autoPickOffered,
  pictureCostFor,
  pictureModelOptions,
  iconAiOffered,
  iconAiProblem,
  iconFace,
  pictureNote,
  pictureOffer,
  pictureProblem,
  pictureTestLine,
  pictureTestNote,
} from './icon-ai'

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

describe('the automatic icon with AI', () => {
  const auto = { ...base, prefs: { ...prefs, aiIconAuto: true } }
  it('rides on the same keys, under its own switches', () => {
    expect(autoPickOffered(auto)).toBe(true)
    expect(autoPickOffered({ ...auto, prefs: { ...auto.prefs, aiIconAuto: false } })).toBe(false)
    // Suggest with AI turned off doesn't turn this off
    expect(autoPickOffered({ ...auto, prefs: { ...auto.prefs, aiIcons: false } })).toBe(true)
    expect(autoPickOffered({ ...auto, flag: false })).toBe(false)
    expect(autoPickOffered({ ...auto, vault: true })).toBe(false)
    expect(autoPickOffered({ ...auto, mode: 'demo', prefs: null, online: false })).toBe(true)
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
    // Google's own refusal (no billing on the key) is not our daily limit
    expect(pictureProblem({ unavailable: true, reason: 'picture_billing' }, false)).toMatch(/turn on billing/)
    expect(pictureProblem({ unavailable: true, reason: 'quota' }, false)).toMatch(/limit/)
    expect(pictureProblem(null, false)).toMatch(/connection/)
    expect(pictureProblem({ image: 'x' }, false)).toMatch(/Couldn’t use/)
    expect(pictureProblem({ image: 'x' }, true)).toBeNull()
  })
  it('tells a spent credit from no billing from a rate limit, and keeps the key’s fixes off Split Now’s key', () => {
    expect(pictureProblem({ unavailable: true, reason: 'picture_credit' }, false)).toMatch(/prepaid Google credit has run out/)
    expect(pictureProblem({ unavailable: true, reason: 'picture_busy' }, false)).toMatch(/Wait a minute/)
    expect(pictureProblem({ unavailable: true, reason: 'picture_credit' }, false, 'app')).toMatch(/Split Now’s AI can’t draw/)
    expect(pictureProblem({ unavailable: true, reason: 'picture_billing' }, false, 'app')).not.toMatch(/billing/)
    expect(pictureProblem({ unavailable: true, reason: 'picture_busy' }, false, 'app')).toMatch(/Wait a minute/)
  })
})

describe('Test pictures', () => {
  it('says it is billed, with the chosen model’s price', () => {
    expect(pictureTestNote('', 'your')).toMatch(/billed to your key: about US\$0\.03/)
    expect(pictureTestNote('gemini-3-pro-image', 'Split Now’s')).toMatch(/Split Now’s key: about US\$0\.13/)
  })
  it('names the model, the time and the cost, or why Google refused', () => {
    expect(pictureTestLine({ ok: true, model: 'gemini-3.1-flash-lite-image', ms: 3240 })).toBe('Nano Banana 2 Lite drew this in 3.2 s · about US$0.03')
    expect(pictureTestLine({ ok: false, model: 'models/gemini-3-pro-image', reason: 'picture_credit' })).toMatch(/^Nano Banana Pro: .*prepaid/)
    expect(pictureTestLine({ ok: false, model: 'gemini-x-image', reason: 'model' })).toBe('gemini-x-image: This key can’t use that model. Choose another one.')
    expect(pictureTestLine({ ok: false, model: 'gemini-x-image', reason: 'server' })).toMatch(/couldn’t draw/)
  })
})

describe('when the sheet offers AI', () => {
  it('only for typed words, when nothing matches or after a wait', () => {
    expect(aiRowShown({ query: '', results: 0, idle: true })).toBe(false)
    expect(aiRowShown({ query: 'a', results: 0, idle: true })).toBe(false)
    expect(aiRowShown({ query: 'zorb', results: 0, idle: false })).toBe(true)
    expect(aiRowShown({ query: 'ferry', results: 3, idle: false })).toBe(false)
    expect(aiRowShown({ query: 'ferry', results: 3, idle: true })).toBe(true)
  })
})

describe('choosing the picture model', () => {
  it('Recommended first, then what the key lists with price and speed; a chosen one the key dropped stays', () => {
    const o = pictureModelOptions(
      [
        { id: 'gemini-3-pro-image', label: 'Nano Banana Pro', usd: 0.134, speed: 'about 14 s' },
        { id: 'gemini-9-image', label: 'New' },
      ],
      'gemini-old-image',
    )
    expect(o[0]).toEqual({ value: '', label: 'Recommended (Nano Banana 2 Lite)', hint: 'about US$0.03 a picture · about 3 s' })
    // every model is offered; a dear one says it buys nothing at icon size
    expect(o[1]).toEqual({
      value: 'gemini-3-pro-image',
      label: 'Nano Banana Pro',
      hint: 'about US$0.13 a picture · about 14 s · costs more, no difference at icon size',
    })
    expect(o[2]).toEqual({ value: 'gemini-9-image', label: 'New', hint: undefined })
    expect(o[3]).toEqual({ value: 'gemini-old-image', label: 'gemini-old-image' })
    expect(pictureModelOptions(null, '').length).toBe(1)
  })
  it('the cost line follows whose key draws and its model', () => {
    expect(pictureCostFor({ via: 'own', ownModel: 'gemini-3-pro-image', appModel: '' })).toBe('about US$0.13')
    expect(pictureCostFor({ via: 'app', ownModel: 'gemini-3-pro-image', appModel: '' })).toBe('about US$0.03')
    expect(pictureCostFor({ via: 'app', appModel: 'gemini-3.1-flash-image' })).toBe('about US$0.07')
    expect(pictureCostFor({ via: null })).toBe('about US$0.03')
  })
})

describe('under a drawn picture', () => {
  it('names the model and its cost', () => {
    expect(drawnByLine('gemini-3.1-flash-lite-image')).toBe('Nano Banana 2 Lite · about US$0.03')
    expect(drawnByLine('models/gemini-3-pro-image')).toBe('Nano Banana Pro · about US$0.13')
    expect(drawnByLine('gemini-9-image')).toBe('gemini-9-image')
    expect(drawnByLine(undefined)).toBeNull()
  })
})
