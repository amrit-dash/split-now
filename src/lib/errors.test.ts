import { describe, expect, it } from 'vitest'
import { errText } from './errors'

describe('errText', () => {
  it('drops prefixes and codes', () => {
    expect(errText(new Error('That doesn’t look like a Gemini API key [400]'))).toBe('That doesn’t look like a Gemini API key')
    expect(errText(new Error('Firebase: Wrong password (auth/wrong-password).'))).toBe('Wrong password')
    expect(errText(new Error(''))).toBe('Something went wrong')
    expect(errText('plain')).toBe('plain')
  })
})
