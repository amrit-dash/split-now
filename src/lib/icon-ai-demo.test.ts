import { describe, expect, it } from 'vitest'
import { demoIcons } from './icon-ai-demo'

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
