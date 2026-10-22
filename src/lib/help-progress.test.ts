import { describe, expect, it } from 'vitest'
import { celebration, earnsPro, helpProgress, MAX_DONE, parseHelpProgress, sectionFinished, withDone } from './help-progress'

describe('parseHelpProgress', () => {
  it('keeps unique non-empty ids, drops anything else', () => {
    expect(parseHelpProgress(null)).toEqual({ done: [] })
    expect(parseHelpProgress({ done: ['a', 'a', '', 3, 'b'] })).toEqual({ done: ['a', 'b'] })
    expect(parseHelpProgress({ done: 'a' })).toEqual({ done: [] })
  })
  it('caps the list', () => {
    expect(parseHelpProgress({ done: Array.from({ length: MAX_DONE + 5 }, (_, i) => `s${i}`) }).done).toHaveLength(MAX_DONE)
  })
})

describe('helpProgress', () => {
  const shown = ['a', 'b', 'c', 'd']
  it('counts only the sections shown, rounding down', () => {
    expect(helpProgress({ done: [] }, shown)).toEqual({ done: 0, total: 4, pct: 0 })
    expect(helpProgress({ done: ['a', 'gone'] }, shown)).toEqual({ done: 1, total: 4, pct: 25 })
    expect(helpProgress({ done: ['a', 'b', 'c'] }, ['a', 'b', 'c', 'd', 'e', 'f'])).toEqual({ done: 3, total: 6, pct: 50 })
    expect(helpProgress({ done: ['a', 'b'] }, ['a', 'b', 'c']).pct).toBe(66)
  })
  it('a smaller guide (Simple) can reach 100 on its own', () => {
    const p = { done: ['a', 'b'] }
    expect(earnsPro(helpProgress(p, ['a', 'b']).pct)).toBe(true)
    expect(earnsPro(helpProgress(p, shown).pct)).toBe(false)
  })
  it('an empty guide is 0, not 100', () => {
    expect(helpProgress({ done: [] }, []).pct).toBe(0)
  })
})

describe('withDone and sectionFinished', () => {
  it('adds once', () => {
    const p = withDone({ done: ['a'] }, 'b')
    expect(p.done).toEqual(['a', 'b'])
    expect(withDone(p, 'a')).toBe(p)
  })
  it('steps: the last one shown; text: scrolled to the end', () => {
    expect(sectionFinished({ steps: 3, step: 1, scrolledToEnd: true })).toBe(false)
    expect(sectionFinished({ steps: 3, step: 2, scrolledToEnd: false })).toBe(true)
    expect(sectionFinished({ steps: 0, step: 0, scrolledToEnd: true })).toBe(true)
    expect(sectionFinished({ steps: 0, step: 0, scrolledToEnd: false })).toBe(false)
  })
})

describe('celebration', () => {
  it('offers Pro at 100% once, thanks after claiming, nothing for someone already Pro', () => {
    expect(celebration(100, false, false)).toBe('claim')
    expect(celebration(99, false, false)).toBeNull()
    expect(celebration(100, true, false)).toBeNull()
    expect(celebration(100, true, true)).toBe('claimed')
  })
})
