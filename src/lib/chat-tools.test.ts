import { describe, expect, it } from 'vitest'
import type { Member } from '@/types'
import {
  applyMention,
  CHAT_TOOLS,
  EVERYONE,
  listNames,
  matchCommands,
  matchMentions,
  mentionables,
  mentionParts,
  mentionQuery,
  mentionsIn,
  parseSlash,
  slashQuery,
  suggestionLabel,
  suggestTool,
  toolsFor,
  type SuggestCtx,
} from './chat-tools'

const members: Record<string, Member> = {
  me: { name: 'Asha Rao', uid: 'u1', color: '#000' },
  r1: { name: 'Rahul Sharma', color: '#111' },
  r2: { name: 'Rahul Verma', color: '#222' },
  p: { name: 'Priya', color: '#333' },
  pay: { name: 'Payal', color: '#444' },
  gone: { name: 'Old Friend', color: '#555', removedAt: 5 },
}
const list = mentionables(members, 'me')
const ctx: SuggestCtx = {
  tools: CHAT_TOOLS,
  members: Object.entries(members).map(([id, m]) => ({ id, name: m.name })),
  me: 'me',
  currency: 'INR',
  tagged: [],
  today: '2026-10-11',
}
const sugg = (text: string, tagged: string[] = []) => suggestTool(text, { ...ctx, tagged })

describe('tools and slash commands', () => {
  it('Open item only where open items are on', () => {
    expect(toolsFor({ openItemsOn: false }).map((t) => t.id)).not.toContain('open')
    expect(toolsFor({ openItemsOn: true }).map((t) => t.id)).toContain('open')
  })
  it('slashQuery: only while the box holds a command being typed', () => {
    expect(slashQuery('/')).toBe('')
    expect(slashQuery('/Se')).toBe('se')
    expect(slashQuery('/settle ')).toBeNull()
    expect(slashQuery('hi /se')).toBeNull()
  })
  it('matchCommands narrows as you type: command prefix first, then label words and aliases', () => {
    expect(matchCommands('', CHAT_TOOLS)).toHaveLength(CHAT_TOOLS.length)
    expect(matchCommands('se', CHAT_TOOLS).map((t) => t.id)).toEqual(['settle'])
    expect(matchCommands('owe', CHAT_TOOLS).map((t) => t.id)).toEqual(['settle', 'balances'])
    expect(matchCommands('zz', CHAT_TOOLS)).toEqual([])
  })
  it('parseSlash reads a whole command line, by command or alias', () => {
    expect(parseSlash('/pay 500 @Priya', CHAT_TOOLS)).toEqual({ tool: 'pay', rest: '500 @Priya' })
    expect(parseSlash('/SETTLE', CHAT_TOOLS)).toEqual({ tool: 'settle', rest: '' })
    expect(parseSlash('/split dinner 900', CHAT_TOOLS)).toEqual({ tool: 'expense', rest: 'dinner 900' })
    expect(parseSlash('/nope', CHAT_TOOLS)).toBeNull()
    expect(parseSlash('pay 500', CHAT_TOOLS)).toBeNull()
  })
})

describe('mentions', () => {
  it('everyone still in the group but you, by short name, then @everyone', () => {
    expect(list.map((p) => p.label)).toEqual(['Payal', 'Priya', 'Rahul S.', 'Rahul V.', 'everyone'])
    expect(mentionables({ me: members.me, p: members.p }, 'me').map((p) => p.id)).toEqual(['p'])
    // With you in it (to draw tags of you): the labels are the same on every phone.
    expect(mentionables(members, 'me', true).map((p) => p.label)).toEqual(['Asha', 'Payal', 'Priya', 'Rahul S.', 'Rahul V.', 'everyone'])
    const clash = { a: { name: 'Rahul Sharma', color: '#0' }, b: { name: 'Rahul Verma', color: '#1' } }
    expect(mentionables(clash, 'a').map((p) => p.label)).toEqual(['Rahul V.'])
  })
  it('mentionQuery finds the @word at the caret', () => {
    expect(mentionQuery('hey @ra', 7)).toEqual({ start: 4, query: 'ra' })
    expect(mentionQuery('@', 1)).toEqual({ start: 0, query: '' })
    expect(mentionQuery('mail a@b', 8)).toBeNull()
    expect(mentionQuery('hey @ra there', 13)).toBeNull()
  })
  it('matchMentions: any word of the name, and "all" for everyone', () => {
    expect(matchMentions('ra', list).map((p) => p.id)).toEqual(['r1', 'r2'])
    expect(matchMentions('v', list).map((p) => p.id)).toEqual(['r2'])
    expect(matchMentions('al', list).map((p) => p.id)).toEqual([EVERYONE])
  })
  it('applyMention swaps the typed part for the tag and moves the caret after it', () => {
    expect(applyMention('hey @ra', 4, 7, 'Rahul S.')).toEqual({ text: 'hey @Rahul S. ', caret: 14 })
    expect(applyMention('hey @rah please', 4, 8, 'Rahul S.')).toEqual({ text: 'hey @Rahul S. please', caret: 14 })
  })
  it('mentionsIn: the tags still in the text', () => {
    expect(mentionsIn('@Rahul S. and @Priya, pay up', list)).toEqual(['p', 'r1'])
    expect(mentionsIn('@all settle please', list)).toEqual([EVERYONE])
    expect(mentionsIn('Priya without the at', list)).toEqual([])
    expect(mentionsIn('@Priyanka', list)).toEqual([])
  })
  it('mentionParts marks the tags, longest label first', () => {
    expect(mentionParts('hi @Rahul S. and @Priya!', ['r1', 'p'], list)).toEqual([
      { text: 'hi ' },
      { text: '@Rahul S.', mention: 'r1' },
      { text: ' and ' },
      { text: '@Priya', mention: 'p' },
      { text: '!' },
    ])
    expect(mentionParts('@everyone go', [EVERYONE], list)).toEqual([{ text: '@everyone', mention: EVERYONE }, { text: ' go' }])
    expect(mentionParts('@Priya', undefined, list)).toEqual([{ text: '@Priya' }])
  })
})

describe('suggestTool', () => {
  it('settle up: everyone, or the people tagged or named', () => {
    expect(sugg('Hey, can you please settle the balances')).toEqual({ tool: 'settle' })
    expect(sugg('Can everyone settle up by Friday?')).toEqual({ tool: 'settle' })
    expect(sugg('@Priya can we square up', ['p'])).toEqual({ tool: 'settle', to: ['p'] })
    expect(sugg('Priya please clear the dues')).toEqual({ tool: 'settle', to: ['p'] })
    expect(sugg('Priya you owe me, right?')).toEqual({ tool: 'settle', to: ['p'] })
    expect(sugg('pay me back when you can')).toEqual({ tool: 'settle' })
  })
  it('Pay me with the amount, from someone or everyone; "pay" is never Payal', () => {
    expect(sugg('Can you ask @Priya to pay me 500', ['p'])).toEqual({ tool: 'pay', amount: 50000, to: ['p'] })
    expect(sugg('Everyone pay me ₹250 for the tickets')).toEqual({ tool: 'pay', amount: 25000 })
    expect(sugg('please pay me for the cab')).toEqual({ tool: 'pay' })
  })
  it('who owes whom, who paid, and something spent', () => {
    expect(sugg('who owes what now?')).toEqual({ tool: 'balances' })
    expect(sugg('who paid for the ferry?')).toEqual({ tool: 'open' })
    const e = sugg('We had lunch for 100 rupees')
    expect(e?.tool).toBe('expense')
    expect(e?.expense?.amount).toBe(10000)
  })
  it('nothing for plain talk, questions about spending, short lines or commands', () => {
    expect(sugg('see you at the airport')).toBeNull()
    expect(sugg('was lunch 500?')).toBeNull()
    expect(sugg('ok')).toBeNull()
    expect(sugg('/settle')).toBeNull()
    expect(suggestTool('settle up please', { ...ctx, tools: CHAT_TOOLS.filter((t) => t.id !== 'settle') })).toBeNull()
  })
  it('labels', () => {
    const name = (id: string) => (id === 'p' ? 'Priya' : 'Rahul')
    const money = (c: number) => `₹${c / 100}`
    expect(suggestionLabel({ tool: 'settle' }, name, money)).toBe('Ask everyone to settle up')
    expect(suggestionLabel({ tool: 'pay', amount: 50000, to: ['p'] }, name, money)).toBe('Ask Priya to pay you ₹500')
    expect(listNames(['A', 'B', 'C', 'D'])).toBe('A, B and 2 more')
    expect(listNames(['A', 'B'])).toBe('A and B')
  })
})
