import { describe, expect, it } from 'vitest'
import { cleanSvg } from '../../../shared/svg-icon'
import { cleanIconRequest, cleanPickRequest, iconPrompt, normaliseIcons, parseIconText, parsePick, pickPrompt } from './icon-ai'

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

describe('the automatic icon’s AI pick', () => {
  const r = cleanPickRequest({ title: ' Toit <b>', kind: 'expense', choices: ['🍽️', '🍕', 'pizza', '🍕', '🚕'], categories: ['food', 'transport', 'Bad!'] })
  it('keeps a clean title and only lists it can trust', () => {
    expect(r).toEqual({ title: 'Toit b', kind: 'expense', choices: ['🍽️', '🍕', '🚕'], categories: ['food', 'transport'] })
    expect(cleanPickRequest({ title: 'x', choices: ['pizza'] })).toBeNull()
    expect(cleanPickRequest({ title: ' ', choices: ['🍕'] })).toBeNull()
    expect(cleanPickRequest({ title: 'x', choices: Array.from({ length: 400 }, (_, i) => String.fromCodePoint(0x1f300 + i)) })?.choices.length).toBe(300)
  })
  it('asks for one line: the pick and the others with how well each fits, the app’s own preferred, any single emoji allowed', () => {
    const p = pickPrompt(r!)
    expect(p).toContain('🍽️ 🍕 🚕')
    expect(p).toContain('food, transport')
    expect(p).toContain('EMOJI <emoji> <rating> ALSO <emoji> <rating> <emoji> <rating> CATEGORY <category>')
    expect(p).toContain('any single standard emoji')
    expect(p).not.toContain('TYPE')
  })
  it('reads the answer, with or without the variation selector; an emoji outside the list is kept, a category outside it is not', () => {
    expect(parsePick('EMOJI 🍽️ CATEGORY food', r!)).toEqual({ emoji: '🍽️', category: 'food' })
    expect(parsePick('EMOJI: 🍽 CATEGORY: Food', r!)).toEqual({ emoji: '🍽️', category: 'food' })
    expect(parsePick('```\nEMOJI 🦄 CATEGORY rent\n```', r!)).toEqual({ emoji: '🦄' })
    // the owner's examples: an icon that isn't the app's, and a second one to offer
    expect(parsePick('EMOJI 🐝 ALSO 🇱🇰', r!)).toEqual({ emoji: '🐝', alt: '🇱🇰', alts: ['🇱🇰'] })
    expect(parsePick('EMOJI 🍯 ALSO 🐝 CATEGORY food', r!)).toEqual({ emoji: '🍯', alt: '🐝', alts: ['🐝'], category: 'food' })
    // several to offer: only those rated 75 or more, best first, none the pick's, none twice, text skipped
    expect(parsePick('EMOJI 🐝 95 ALSO 🇱🇰 80 🍯 90 🌴 60 🐝 99 CATEGORY food', r!)).toEqual({ emoji: '🐝', alt: '🍯', alts: ['🍯', '🇱🇰'], category: 'food' })
    expect(parsePick('EMOJI 🍯 95 ALSO 🐝 85%, honey, 🥞 40', r!)).toEqual({ emoji: '🍯', alt: '🐝', alts: ['🐝'] })
    // nothing rated well enough: the pick alone
    expect(parsePick('EMOJI 🍯 95 ALSO 🥞 40 🍵 30', r!)).toEqual({ emoji: '🍯' })
    // ratings left out: each counts as fitting, at most five
    expect(parsePick('EMOJI 🐝 ALSO 🇱🇰 🍯 🌴 🌸 🌺 🌻', r!).alts).toEqual(['🇱🇰', '🍯', '🌴', '🌸', '🌺'])
    // the same emoji twice, text, or two emoji in one place: no alternative, nothing made up
    expect(parsePick('EMOJI 🍯 ALSO 🍯', r!)).toEqual({ emoji: '🍯' })
    expect(parsePick('EMOJI honey ALSO 🐝🍯', r!)).toEqual({ emoji: null })
    // the list echoed back by a model that ran out of room: no guess from it
    expect(parsePick('* List check: 🍽️ 🍕 🚕', r!)).toEqual({ emoji: null })
    expect(parsePick('EMOJI none', r!)).toEqual({ emoji: null })
    expect(parsePick('I would pick 🚕 here', r!)).toEqual({ emoji: '🚕' })
    const g = cleanPickRequest({ title: 'Kasol', kind: 'group', choices: ['🏔️'], types: ['trip'] })!
    expect(parsePick('EMOJI 🏔️ TYPE trip', g)).toEqual({ emoji: '🏔️', type: 'trip' })
    expect(parsePick('EMOJI 🏔️ TYPE personal', g)).toEqual({ emoji: '🏔️' })
  })
})
