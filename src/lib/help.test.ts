import { describe, expect, it } from 'vitest'
import { boldParts, clampStep, guideLayout, type HelpShot, markBox, nextStep, plain, relatedOf, searchHelp, STORY_BEATS } from './help'
import SHOTS from './help-shots.json'
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
      const all = [s.title, s.summary, ...(s.steps ?? []).map((x) => x.text), ...(s.story?.beats ?? []), ...s.points].join(' ')
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
  it('lists the explainers and the main features first, then each chapter without them and without empty ones', () => {
    const g = guideLayout(CHAPTERS, SECTIONS)
    expect(g.stories.map((s) => s.id)).toEqual([
      'how-it-works',
      'balances-explained',
      'simplify-explained',
      'splits-add-up',
      'private-groups-explained',
      'auto-capture-explained',
    ])
    expect(g.core.length).toBe(10)
    const rest = g.chapters.flatMap((c) => c.sections)
    expect(rest.some((s) => s.core || s.story)).toBe(false)
    expect(g.chapters.every((c) => c.sections.length > 0)).toBe(true)
    expect(g.stories.length + g.core.length + rest.length).toBe(SECTIONS.filter((s) => !s.unlisted).length)
    // Help about Help isn't on Help's own front page, but links and search still reach it
    expect(g.chapters.flatMap((c) => c.sections).some((s) => s.id === 'help-guide')).toBe(false)
    expect(searchHelp('What’s new', SECTIONS)[0].id).toBe('help-guide')
  })
})

describe('the explainers', () => {
  it('each has a picture that draws one beat per caption, and no steps beside it', () => {
    const stories = SECTIONS.filter((s) => s.story)
    expect(stories.length).toBeGreaterThanOrEqual(6)
    for (const s of stories) {
      const story = s.story!
      expect(STORY_BEATS[story.kind], s.id).toBeDefined()
      expect(story.beats.length, s.id).toBe(STORY_BEATS[story.kind])
      expect(s.steps, s.id).toBeUndefined()
      for (const b of story.beats) expect(b.length, s.id).toBeGreaterThan(20)
    }
  })
  it('the guide’s search reads their captions too', () => {
    expect(searchHelp('paisa', SECTIONS)[0].id).toBe('splits-add-up')
    expect(searchHelp('seesaw level', SECTIONS).length).toBe(0)
    expect(searchHelp('tangle', SECTIONS)[0].id).toBe('simplify-explained')
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
  it('every scene belongs to a section, and every section with steps plays one that has each step’s mark', () => {
    for (const id of Object.keys(SCENES))
      expect(
        SECTIONS.some((s) => s.id === id),
        id,
      ).toBe(true)
    for (const s of SECTIONS.filter((x) => x.steps?.length)) {
      expect(SCENES[s.id], s.id).toBeDefined()
      for (const st of s.steps ?? []) expect(SCENE_MARKS[s.id], `${s.id}: ${st.mark}`).toContain(st.mark)
    }
  })
})

describe('the screenshots', () => {
  const shots = SHOTS as Record<string, HelpShot>
  const fsModule = 'node:fs'
  it('belong to sections, mark steps that exist, and have their picture in public/help', async () => {
    const { existsSync } = (await import(/* @vite-ignore */ fsModule)) as { existsSync: (p: URL) => boolean }
    for (const [id, shot] of Object.entries(shots)) {
      const s = SECTIONS.find((x) => x.id === id)
      expect(s, id).toBeDefined()
      expect(shot.marks.length, id).toBeGreaterThan(0)
      for (const m of shot.marks) {
        expect(m.step, id).toBeGreaterThanOrEqual(1)
        expect(m.step, id).toBeLessThanOrEqual(s?.steps?.length ?? 0)
        for (const v of [m.x, m.y, m.w, m.h]) expect(v >= 0 && v <= 1, id).toBe(true)
      }
      expect(existsSync(new URL(`../../public/help/${id}.webp`, import.meta.url)), id).toBe(true)
    }
  })
  it('a marker’s outline is the part with room around it, inside the picture', () => {
    expect(markBox({ step: 1, x: 0.5, y: 0.5, w: 0.2, h: 0.1 })).toEqual({ left: 38.8, top: 43.2, width: 22.4, height: 13.6 })
    expect(markBox({ step: 1, x: 0.05, y: 0.02, w: 0.1, h: 0.04 })).toEqual({ left: 0, top: 0, width: 11.2, height: 5.8 })
  })
})
