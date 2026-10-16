import { describe, expect, it } from 'vitest'
import { cleanIconImage, ICON_IMAGE_MAX, picturePlan, picturePrompt } from './icon-ai'

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
