import { describe, expect, it } from 'vitest'
import { demoIconPick, demoIcons } from './icon-ai-demo'

describe('demo AI icons', () => {
  it('three emoji led by the best match, and two clean drawings', () => {
    const r = demoIcons({ title: 'Ferry to Havelock', kind: 'expense' })
    expect(r.emoji).toHaveLength(3)
    expect(r.emoji[0]).toBe('⛴️')
    expect(r.svgs).toHaveLength(2)
    for (const s of r.svgs) expect(s.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
  })
  it('a title with no match still gets three', () => {
    expect(demoIcons({ title: 'Zzz', kind: 'group' }).emoji).toEqual(['✨', '🧾', '📌'])
  })
})

describe('the demo’s automatic pick goes beyond the catalogue, with a second icon', () => {
  it('Sri Lanka bees: 🇱🇰 or 🐝, and the other one offered', () => {
    const r = demoIconPick({ title: 'Sri Lanka bees', kind: 'group', choices: ['✈️'] })
    expect(r).toMatchObject({ emoji: '🇱🇰', alt: '🐝' })
    expect(demoIconPick({ title: 'honey', kind: 'expense', choices: ['🍽️'] })).toMatchObject({ emoji: '🍯' })
  })
})
