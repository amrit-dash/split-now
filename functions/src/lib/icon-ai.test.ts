import { describe, expect, it } from 'vitest'
import { cleanSvg } from '../../../shared/svg-icon'
import { cleanIconRequest, iconPrompt, normaliseIcons, parseIconText } from './icon-ai'

describe('AI icons', () => {
  it('the request is a short title with no markup', () => {
    expect(cleanIconRequest({ title: '  Ferry <b>to</b>\nHavelock ', kind: 'expense', category: 'Transport!' })).toEqual({
      title: 'Ferry b to /b Havelock',
      kind: 'expense',
      category: 'Transport',
    })
    expect(cleanIconRequest({ title: 'Goa', kind: 'group', category: 'x' })).toEqual({ title: 'Goa', kind: 'group' })
    expect(cleanIconRequest({ title: '   ' })).toBeNull()
    expect(cleanIconRequest(null)).toBeNull()
    expect(cleanIconRequest({ title: 'x'.repeat(200) })?.title).toHaveLength(80)
  })
  it('the prompt’s own examples pass the cleaner', () => {
    const p = iconPrompt({ title: 'x', kind: 'expense', category: 'Food & drink' })
    const examples = [...p.matchAll(/<svg[\s\S]*?<\/svg>/g)].map((m) => m[0]).filter((s) => s.includes('<path'))
    expect(examples).toHaveLength(2)
    for (const e of examples) expect(cleanSvg(e)).not.toBeNull()
    expect(p).toContain('"Food & drink"')
    expect(iconPrompt({ title: 'x', kind: 'group' })).toContain('a group')
  })
  it('keeps single emoji and clean drawings only, without repeats', () => {
    const ok = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#f59e0b"/></svg>'
    const r = normaliseIcons({
      emoji: ['⛴️', '⛴️', 'ferry', '🌊🌊', '⚓', 7, '🚢'],
      svgs: [ok, ok, '<svg><script/></svg>', 'not svg', '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="#0ea5e9"/></svg>'],
    })
    expect(r.emoji).toEqual(['⛴️', '⚓', '🚢'])
    expect(r.svgs).toHaveLength(2)
    expect(normaliseIcons('nonsense')).toEqual({ emoji: [], svgs: [] })
  })
})

describe('reading the plain-text answer', () => {
  const ok = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#f59e0b"/></svg>'
  it('the EMOJI line and every drawing, wherever they sit', () => {
    const r = parseIconText(`EMOJI: ⛴️ 🌊 ⚓\n${ok}\n\`\`\`svg\n${ok.replace('#f59e0b', '#0ea5e9')}\n\`\`\`\nHope these help`)
    expect(r.emoji).toEqual(['⛴️', '🌊', '⚓'])
    expect(r.svgs).toHaveLength(2)
  })
  it('one broken drawing doesn’t spoil the rest; a missing label still finds the emoji', () => {
    const r = parseIconText(`**Emoji**: 🏖️🌴🍹\n<svg><script>x</script></svg>\n${ok}`)
    expect(r.emoji).toEqual(['🏖️', '🌴', '🍹'])
    expect(r.svgs).toHaveLength(1)
    expect(parseIconText(`🏖️ 🌴\n${ok}`).emoji).toEqual(['🏖️', '🌴'])
    expect(parseIconText('nothing useful')).toEqual({ emoji: [], svgs: [] })
  })
  it('the prompt asks for that shape, not JSON', () => {
    expect(iconPrompt({ title: 'x', kind: 'group' })).toMatch(/Start your answer with EMOJI:/)
    expect(iconPrompt({ title: 'x', kind: 'group' })).not.toMatch(/Return JSON/)
  })
})
