import { describe, expect, it } from 'vitest'
import { gapFrom, INTRO, resolveTeach, TEACH_START, teachNow, teachShown, teachVisit, TIPS } from './voice-teach'

describe('teaching hold + to talk', () => {
  it('first: the intro bubble, once', () => {
    const s = teachVisit(TEACH_START)
    expect(teachNow({ state: s, tried: false, voice: true })).toEqual({ kind: 'intro', ...INTRO })
    const after = teachShown(s, 'intro', 0)
    expect(after.intro).toBe(true)
    expect(teachNow({ state: after, tried: false, voice: true })).toBeNull()
  })
  it('then a Did you know? every 3rd to 5th visit, with different words, until it is tried', () => {
    let s = teachShown(teachVisit(TEACH_START), 'intro', 0) // next at visit 1 + 3
    const seen: string[] = []
    for (let visit = 2; visit <= 20; visit++) {
      s = teachVisit(s)
      const b = teachNow({ state: s, tried: false, voice: true })
      if (b) {
        expect(b.kind).toBe('tip')
        expect(b.title).toBe('Did you know?')
        expect(b.text).toMatch(/Try it now: press and hold \+\./)
        seen.push(b.text)
        s = teachShown(s, 'tip', 0.99)
      }
    }
    expect(seen.length).toBeGreaterThanOrEqual(3)
    expect(new Set(seen).size).toBe(seen.length)
    expect(seen[0]).toBe(TIPS[0])
  })
  it('never once the account tried it, nor where voice can’t work', () => {
    const due = { intro: true, visits: 9, nextAt: 5, tip: 0 }
    expect(teachNow({ state: due, tried: true, voice: true })).toBeNull()
    expect(teachNow({ state: TEACH_START, tried: false, voice: false })).toBeNull()
  })
  it('gaps are 3, 4 or 5', () => {
    expect(gapFrom(0)).toBe(3)
    expect(gapFrom(0.5)).toBe(4)
    expect(gapFrom(0.99)).toBe(5)
    expect(gapFrom(1)).toBe(5)
    expect(gapFrom(-1)).toBe(3)
  })
  it('reads a stored state safely', () => {
    expect(resolveTeach(null)).toEqual(TEACH_START)
    expect(resolveTeach({ intro: true, visits: 4, nextAt: 7, tip: 1 })).toEqual({ intro: true, visits: 4, nextAt: 7, tip: 1 })
    expect(resolveTeach({ intro: 'yes', visits: -2, nextAt: 1.5 })).toEqual(TEACH_START)
  })
})
