import { describe, expect, it } from 'vitest'
import { normaliseChatIntent } from './chat-ai'

const names = ['Rahul', 'Priya S.']
const tools = ['settle', 'pay', 'expense', 'balances']

describe('normaliseChatIntent', () => {
  it('a known tool the app offered, amounts as hundredths, names only from the list', () => {
    expect(normaliseChatIntent({ tool: 'pay', amount: 250.5, to: ['rahul', 'Bob', 'Rahul'] }, names, tools)).toEqual({
      tool: 'pay',
      amount: 25050,
      to: ['Rahul'],
    })
    expect(normaliseChatIntent({ tool: 'settle', to: ['priya s.'] }, names, tools)).toEqual({ tool: 'settle', to: ['Priya S.'] })
    expect(normaliseChatIntent({ tool: 'balances', amount: 5, to: ['Rahul'] }, names, tools)).toEqual({ tool: 'balances' })
  })
  it('anything else is none', () => {
    expect(normaliseChatIntent({ tool: 'open' }, names, tools)).toEqual({ tool: 'none' })
    expect(normaliseChatIntent({ tool: 'hack' }, names, tools)).toEqual({ tool: 'none' })
    expect(normaliseChatIntent(null, names, tools)).toEqual({ tool: 'none' })
  })
  it('no amount when it is not a positive, sane number', () => {
    expect(normaliseChatIntent({ tool: 'pay', amount: -3 }, names, tools)).toEqual({ tool: 'pay' })
    expect(normaliseChatIntent({ tool: 'expense', amount: 1e12 }, names, tools)).toEqual({ tool: 'expense' })
    expect(normaliseChatIntent({ tool: 'pay', amount: 'lots' }, names, tools)).toEqual({ tool: 'pay' })
  })
})
