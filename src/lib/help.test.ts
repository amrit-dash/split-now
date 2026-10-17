import { describe, expect, it } from 'vitest'
import { boldParts, clampStep, guideLayout, nextStep, plain, relatedOf, searchHelp } from './help'
import { CHAPTERS, SECTIONS } from './help-content'
import { baseOf, findMark, SCENE_MARKS, SCENES } from './help-scenes'

describe('the guide’s content', () => {
  it('every section has a unique id, a known chapter, a title, a summary and something to read', () => {
    const ids = SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of SECTIONS) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/)
      expect(CHAPTERS.some((c) => c.id === s.chapter)).toBe(true)
      expect(s.title.length).toBeGreaterThan(3)
      expect(s.summary.length).toBeGreaterThan(10)
      expect((s.steps?.length ?? 0) + s.points.length).toBeGreaterThan(0)
    }
  })
  it('the ten main features each have steps and a scene that knows every step’s mark', () => {
    const core = SECTIONS.filter((s) => s.core)
    expect(core.map((s) => s.id).sort()).toEqual(
      [
        'add-expense',
        'auto-capture-setup',
        'create-group',
        'icons-and-ai',
        'insights',
        'private-groups',
        'quick-add',
        'scan-receipt',
        'settle-up-upi',
        'split-types',
      ].sort(),
    )
    for (const s of core) {
      expect(s.steps?.length).toBeGreaterThanOrEqual(3)
      const marks = SCENE_MARKS[s.id]
      expect(marks, s.id).toBeDefined()
      for (const step of s.steps ?? []) expect(marks, `${s.id}: ${step.mark}`).toContain(step.mark)
    }
  })
  it('related links go to sections that exist, and never to themselves', () => {
    for (const s of SECTIONS) {
      for (const id of s.related ?? []) {
        expect(id).not.toBe(s.id)
        expect(
          SECTIONS.some((x) => x.id === id),
          `${s.id} → ${id}`,
        ).toBe(true)
      }
      expect(relatedOf(s, SECTIONS).length).toBe(s.related?.length ?? 0)
    }
  })
  it('copy follows the house style: no exclamation marks, no “token”', () => {
    for (const s of SECTIONS) {
      const all = [s.title, s.summary, ...(s.steps ?? []).map((x) => x.text), ...s.points].join(' ')
      expect(all, s.id).not.toMatch(/!/)
      expect(all, s.id).not.toMatch(/\btoken\b/i)
    }
  })
  it('“Try it” links are app paths', () => {
    for (const s of SECTIONS) if (s.open) expect(s.open.to).toMatch(/^\/[a-z/-]*$/)
  })
})

describe('the guide’s search', () => {
  it('finds by title first, then by summary and keywords, then by steps', () => {
    expect(searchHelp('settle', SECTIONS)[0].id).toBe('settle-up-upi')
    expect(searchHelp('refund', SECTIONS)[0].id).toBe('money-received')
    expect(searchHelp('gpay', SECTIONS)[0].id).toBe('settle-up-upi')
    expect(searchHelp('face id', SECTIONS).map((s) => s.id)).toContain('private-groups')
    expect(searchHelp('What’s new', SECTIONS)[0].id).toBe('help-guide')
  })
  it('every word must match; one letter or nothing finds nothing', () => {
    expect(searchHelp('scan zebra', SECTIONS)).toEqual([])
    expect(searchHelp('a', SECTIONS)).toEqual([])
    expect(searchHelp('  ', SECTIONS)).toEqual([])
  })
  it('word starts count, case and accents don’t', () => {
    expect(searchHelp('ICO', SECTIONS)[0].id).toBe('icons-and-ai')
  })
})

describe('the step player and the front page', () => {
  it('loops through the steps and keeps a stale index in range', () => {
    expect(nextStep(0, 3)).toBe(1)
    expect(nextStep(2, 3)).toBe(0)
    expect(nextStep(5, 0)).toBe(0)
    expect(clampStep(4, 3)).toBe(0)
    expect(clampStep(2, 3)).toBe(2)
  })
  it('bold words stand out; plain text drops the marks', () => {
    expect(boldParts('Tap **Save** now')).toEqual([
      { text: 'Tap ', bold: false },
      { text: 'Save', bold: true },
      { text: ' now', bold: false },
    ])
    expect(boldParts('**A**')).toEqual([{ text: 'A', bold: true }])
    expect(plain('Tap **Save**')).toBe('Tap Save')
  })
  it('lists the main features first, then each chapter without them and without empty ones', () => {
    const g = guideLayout(CHAPTERS, SECTIONS)
    expect(g.core.length).toBe(10)
    expect(g.chapters.flatMap((c) => c.sections).some((s) => s.core)).toBe(false)
    expect(g.chapters.every((c) => c.sections.length > 0)).toBe(true)
    expect(g.core.length + g.chapters.reduce((n, c) => n + c.sections.length, 0)).toBe(SECTIONS.length)
  })
})

describe('the scenes', () => {
  it('every mark is used once per scene, so a step points at one part', () => {
    for (const [id, marks] of Object.entries(SCENE_MARKS)) expect(new Set(marks).size, id).toBe(marks.length)
  })
  it('a sheet rises over the screen before it; a mark is found on its screen', () => {
    const s = SCENES['add-expense']
    expect(findMark(s, 'plus')).toEqual({ screen: 0, base: null, part: 3, item: 2 })
    expect(findMark(s, 'save')?.screen).toBe(2)
    expect(findMark(SCENES['split-types'], 'exact')).toEqual({ screen: 1, base: 0, part: 1, item: 1 })
    expect(findMark(s, 'nope')).toBeNull()
    expect(findMark(s, undefined)).toBeNull()
    expect(baseOf(SCENES['private-groups'], 3)).toBe(2)
    expect(baseOf(SCENES['private-groups'], 2)).toBeNull()
  })
  it('every scene belongs to a main feature', () => {
    for (const id of Object.keys(SCENES)) expect(SECTIONS.find((s) => s.id === id)?.core, id).toBe(true)
  })
})
