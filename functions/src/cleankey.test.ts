import { describe, expect, it } from 'vitest'
import { cleanKey } from './ai'

describe('cleanKey', () => {
  it('strips whitespace, quotes and NAME= prefixes from pasted keys', () => {
    expect(cleanKey('  AIzaSy abc\n123 ')).toBe('AIzaSyabc123')
    expect(cleanKey('GEMINI_API_KEY="AIzaSyabc"')).toBe('AIzaSyabc')
  })
})
