import { describe, expect, it } from 'vitest'
import { cleanIconImage, ICON_IMAGE_MAX, pictureCost, pictureModelsFrom, picturePlan, picturePlanModels, picturePrompt } from './icon-ai'

const user = { aiEnabled: true, aiIcons: true, aiSource: 'auto' }

describe('whose key draws a picture', () => {
  it('the person’s own key whenever they added one, even with the free AI as their default', () => {
    expect(picturePlan({ user, hasOwnKey: true, appPictures: true })).toBe('own')
    expect(picturePlan({ user: { ...user, aiSource: 'own' }, hasOwnKey: true, appPictures: false })).toBe('own')
  })
  it('the shared key only when the admin allows pictures on it', () => {
    expect(picturePlan({ user, hasOwnKey: false, appPictures: true })).toBe('app')
    expect(picturePlan({ user, hasOwnKey: false, appPictures: false })).toBeNull()
    expect(picturePlan({ user: { ...user, aiSource: 'app' }, hasOwnKey: true, appPictures: true })).toBe('app')
    expect(picturePlan({ user: { ...user, aiSource: 'own' }, hasOwnKey: false, appPictures: true })).toBeNull()
  })
  it('nothing with AI or AI icons switched off', () => {
    expect(picturePlan({ user: { ...user, aiIcons: false }, hasOwnKey: true, appPictures: true })).toBeNull()
    expect(picturePlan({ user: { ...user, aiEnabled: false }, hasOwnKey: true, appPictures: true })).toBeNull()
  })
})

describe('a stored picture', () => {
  it('is a small image data: URL and nothing else', () => {
    expect(cleanIconImage('data:image/webp;base64,AAAA')).toBe('data:image/webp;base64,AAAA')
    expect(cleanIconImage('data:image/svg+xml;base64,AAAA')).toBeNull()
    expect(cleanIconImage('https://x.test/a.png')).toBeNull()
    expect(cleanIconImage(`data:image/png;base64,${'A'.repeat(ICON_IMAGE_MAX)}`)).toBeNull()
    expect(cleanIconImage('data:image/png;base64,AA"onload=')).toBeNull()
  })
  it('the prompt names the title and asks for no words', () => {
    expect(picturePrompt({ title: 'Goa trip', kind: 'group' })).toContain('"Goa trip"')
    expect(picturePrompt({ title: 'Ferry', kind: 'expense', category: 'Transport' })).toMatch(/No text/)
  })
})

describe('picture models', () => {
  const gen = ['generateContent']
  const list = [
    { name: 'models/gemini-3-pro-image', displayName: 'Nano Banana Pro', supportedGenerationMethods: gen },
    { name: 'models/nano-banana-pro-preview', displayName: 'Nano Banana Pro', supportedGenerationMethods: gen },
    { name: 'models/gemini-3-pro-image-preview', displayName: 'Nano Banana Pro', supportedGenerationMethods: gen },
    { name: 'models/gemini-3.1-flash-lite-image', displayName: 'x', supportedGenerationMethods: gen },
    { name: 'models/gemini-2.5-flash-image', displayName: 'Nano Banana', supportedGenerationMethods: gen },
    { name: 'models/gemini-9-flash-image', displayName: 'Nano Banana 9', supportedGenerationMethods: gen },
    { name: 'models/imagen-4.0-generate-001', displayName: 'Imagen', supportedGenerationMethods: ['predict'] },
    { name: 'models/gemini-3.5-flash-lite', displayName: 'Flash Lite', supportedGenerationMethods: gen },
  ]
  it('lists what the key can draw with: cheapest known first, no retired, no twins, no text models', () => {
    expect(pictureModelsFrom(list).map((m) => m.id)).toEqual(['gemini-3.1-flash-lite-image', 'gemini-3-pro-image', 'gemini-9-flash-image'])
    expect(pictureModelsFrom(list)[0]).toMatchObject({ label: 'Nano Banana 2 Lite', usd: 0.0336 })
    expect(pictureModelsFrom(list)[2]).toEqual({ id: 'gemini-9-flash-image', label: 'Nano Banana 9' })
  })
  it('tries the chosen model first, then the recommended ones', () => {
    expect(picturePlanModels('')).toEqual(['gemini-3.1-flash-lite-image', 'gemini-nano-banana-2.1', 'gemini-3.1-flash-image'])
    expect(picturePlanModels('gemini-3-pro-image')).toEqual(['gemini-3-pro-image', 'gemini-3.1-flash-lite-image', 'gemini-nano-banana-2.1'])
    expect(picturePlanModels('gemini-nano-banana-2.1')).toEqual(['gemini-nano-banana-2.1', 'gemini-3.1-flash-lite-image', 'gemini-3.1-flash-image'])
  })
  it('says what a picture costs on the model in use', () => {
    expect(pictureCost()).toBe('about US$0.03')
    expect(pictureCost('gemini-3-pro-image')).toBe('about US$0.13')
    expect(pictureCost('gemini-3.1-flash-image')).toBe('about US$0.07')
    expect(pictureCost('gemini-9-flash-image')).toBe('US$0.03 to US$0.13')
  })
})

describe('picture prices in the person’s currency', () => {
  it('shows their money first, the dollars after; dollars alone without a rate or for dollar users', async () => {
    const { priceText, pictureCost, setPriceCurrency } = await import('./icon-ai')
    setPriceCurrency(null)
    expect(priceText(0.03)).toBe('US$0.03')
    expect(pictureCost('nope')).toBe('US$0.03 to US$0.13')
    setPriceCurrency({ currency: 'INR', perUsd: 84 })
    expect(priceText(0.03)).toMatch(/^₹2\.52 \(US\$0\.03\)$/)
    expect(pictureCost()).toMatch(/^about ₹2\.52 \(US\$0\.03\)$/)
    expect(pictureCost('nope')).toMatch(/^₹2\.52 to ₹11 \(US\$0\.03 to US\$0\.13\)$/)
    setPriceCurrency({ currency: 'USD', perUsd: 1 })
    expect(priceText(0.03)).toBe('US$0.03')
    setPriceCurrency(null)
  })
})
