import { describe, expect, it } from 'vitest'
import { handlersOf, isReceived, type Kinded, sharesOf, spending } from './received'

describe('money received', () => {
  const spent: Kinded = { paidBy: { a: 900 }, splits: { a: 300, b: 300, c: 300 } }
  const got: Kinded = { kind: 'received', paidBy: { a: 500, b: 500 }, splits: { a: 1000 } }
  it('reads who handled the money and the shares the right way round', () => {
    expect(isReceived(got)).toBe(true)
    expect(isReceived(spent)).toBe(false)
    expect(handlersOf(spent)).toEqual({ a: 900 })
    expect(sharesOf(spent)).toEqual({ a: 300, b: 300, c: 300 })
    expect(handlersOf(got)).toEqual({ a: 1000 })
    expect(sharesOf(got)).toEqual({ a: 500, b: 500 })
  })
  it('keeps it out of spending', () => {
    expect(spending([spent, got])).toEqual([spent])
  })
})

describe('list words', () => {
  it('says lent / borrowed for an expense, get / pass on for money received', async () => {
    const { deltaWords, handledVerb } = await import('./received')
    expect(deltaWords({}, 100)).toBe('you lent')
    expect(deltaWords({}, -100)).toBe('you borrowed')
    expect(deltaWords({ kind: 'received' }, 100)).toBe('you get')
    expect(deltaWords({ kind: 'received' }, -100)).toBe('you pass on')
    expect(handledVerb({ kind: 'received' })).toBe('received')
    expect(handledVerb({})).toBe('paid')
  })
})
