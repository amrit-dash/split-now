import { describe, expect, it } from 'vitest'
import { memberEntryPatch, sharedPartChanged, sharedProfileCopy, stableJson } from './profile-share'

const photo = 'https://example.com/a.jpg'

describe('sharedProfileCopy', () => {
  it('copies the shared part, leaving absent fields out', () => {
    expect(sharedProfileCopy({ displayName: 'Asha', payment: { upi: 'a@ok' }, photoURL: photo, currency: 'INR', proAt: 5 })).toEqual({
      displayName: 'Asha',
      payment: { upi: 'a@ok' },
      photoURL: photo,
      currency: 'INR',
      collect: true,
      pro: true,
    })
    const bare = sharedProfileCopy({ displayName: 'Asha', photoURL: 'http://x/a.jpg', currency: 'inr', collectInHome: false })
    expect(bare).toEqual({ displayName: 'Asha', payment: {}, collect: false })
    expect(Object.values(bare).includes(undefined)).toBe(false)
  })
  it('shares Dev only for an admin who shows it', () => {
    expect('dev' in sharedProfileCopy({ displayName: 'A' })).toBe(false)
    expect(sharedProfileCopy({ displayName: 'A' }, true).dev).toBe(true)
    expect('dev' in sharedProfileCopy({ displayName: 'A', devHidden: true }, true)).toBe(false)
  })
})

describe('stableJson', () => {
  it('ignores key order and undefined', () => {
    expect(stableJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: undefined } })).toBe(stableJson({ a: { d: [1, { x: 1, y: 2 }] }, b: 1 }))
    expect(stableJson({ a: 1 })).not.toBe(stableJson({ a: 2 }))
  })
})

describe('sharedPartChanged', () => {
  const p = { displayName: 'Asha', payment: { upi: 'a@ok' }, photoURL: photo }
  it('is false for writes groups never see', () => {
    expect(sharedPartChanged(p, { ...p, voiceTried: 9 } as typeof p)).toBe(false)
    expect(sharedPartChanged(p, { ...p, photoURL: 'http://x/a.jpg' })).toBe(true)
  })
  it('notices the name, photo, payment and badges', () => {
    expect(sharedPartChanged(p, { ...p, displayName: 'Asha R' })).toBe(true)
    expect(sharedPartChanged(p, { ...p, photoURL: undefined })).toBe(true)
    expect(sharedPartChanged(p, { ...p, payment: { upi: 'b@ok' } })).toBe(true)
    expect(sharedPartChanged(p, { ...p, proAt: 3 })).toBe(true)
    expect(sharedPartChanged(p, { ...p, devHidden: true })).toBe(true)
  })
  it('a new profile counts, a deleted one does not', () => {
    expect(sharedPartChanged(undefined, p)).toBe(true)
    expect(sharedPartChanged(p, undefined)).toBe(false)
  })
})

describe('memberEntryPatch', () => {
  it('null when the entry already says it', () => {
    expect(memberEntryPatch({ name: 'Asha', photoURL: photo, pro: true }, { displayName: 'Asha', photoURL: photo, proAt: 1 })).toBeNull()
  })
  it('names, photos and marks; removes what no longer shows', () => {
    expect(memberEntryPatch({ name: 'A', photoURL: photo, pro: true, dev: true }, { displayName: ' Asha ' })).toEqual({ name: 'Asha' })
    expect(memberEntryPatch({ name: 'Asha' }, { displayName: 'Asha', photoURL: photo }, { admin: true })).toEqual({ name: 'Asha', photoURL: photo, dev: true })
  })
  it('a blank profile name keeps the entry name; long names are cut to 100', () => {
    expect(memberEntryPatch({ name: 'Asha' }, { displayName: '  ', photoURL: photo })).toEqual({ name: 'Asha', photoURL: photo })
    expect(memberEntryPatch({ name: 'A' }, { displayName: 'x'.repeat(150) })?.name).toHaveLength(100)
  })
  it('data: photos only where allowed (demo)', () => {
    const data = 'data:image/png;base64,xx'
    expect(memberEntryPatch({ name: 'A' }, { displayName: 'A', photoURL: data })).toBeNull()
    expect(memberEntryPatch({ name: 'A' }, { displayName: 'A', photoURL: data }, { allowData: true })).toEqual({ name: 'A', photoURL: data })
  })
})
