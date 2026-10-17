import { describe, expect, it } from 'vitest'
import { canReach, EMPTY_SCROLL, parseScrollStore, rememberScroll, scrollPlan } from './scroll-memory'

describe('scrollPlan', () => {
  it('a new screen starts at the top, whether pushed or replaced', () => {
    expect(scrollPlan('push', '/help', '/help/approvals', undefined)).toEqual({ kind: 'top' })
    expect(scrollPlan('push', '/help/approvals', '/help/edit-group', { y: 900 })).toEqual({ kind: 'top' })
    // A form that saved and replaced itself with its group.
    expect(scrollPlan('replace', '/add?group=g1', '/groups/g1', undefined)).toEqual({ kind: 'top' })
    expect(scrollPlan('push', undefined, '/groups', undefined)).toEqual({ kind: 'top' })
  })
  it('a query change on the same screen leaves the page where it is', () => {
    expect(scrollPlan('replace', '/help', '/help?tab=new', undefined)).toEqual({ kind: 'keep' })
    expect(scrollPlan('push', '/settings/auto-capture', '/settings/auto-capture?step=2', undefined)).toEqual({ kind: 'keep' })
    expect(scrollPlan('push', '/groups/g1/', '/groups/g1?tab=balances', undefined)).toEqual({ kind: 'keep' })
  })
  it('back and forward restore the entry’s own position, or leave the page when there is none', () => {
    const pos = { y: 640, rows: { 'help-stories': 210 } }
    expect(scrollPlan('pop', '/help/approvals', '/help', pos)).toEqual({ kind: 'restore', pos })
    expect(scrollPlan('pop', undefined, '/help', undefined)).toEqual({ kind: 'keep' })
  })
})

describe('rememberScroll', () => {
  it('keeps one position per entry, the latest last', () => {
    let s = rememberScroll(EMPTY_SCROLL, 'a', { y: 10 })
    s = rememberScroll(s, 'b', { y: 20 })
    s = rememberScroll(s, 'a', { y: 30, rows: { r: 5 } })
    expect(s).toEqual({ keys: ['b', 'a'], at: { a: { y: 30, rows: { r: 5 } }, b: { y: 20 } } })
  })
  it('drops the oldest entries past the limit', () => {
    let s = EMPTY_SCROLL
    for (const k of ['a', 'b', 'c', 'd']) s = rememberScroll(s, k, { y: 1 }, 3)
    expect(s.keys).toEqual(['b', 'c', 'd'])
    expect(Object.keys(s.at).sort()).toEqual(['b', 'c', 'd'])
  })
  it('does not change the store it was given', () => {
    const s = rememberScroll(EMPTY_SCROLL, 'a', { y: 1 })
    rememberScroll(s, 'b', { y: 2 })
    expect(s.keys).toEqual(['a'])
  })
})

describe('parseScrollStore', () => {
  it('reads back what was stored', () => {
    const s = rememberScroll(rememberScroll(EMPTY_SCROLL, 'a', { y: 1 }), 'b', { y: 2, rows: { r: 3 } })
    expect(parseScrollStore(JSON.stringify(s))).toEqual(s)
  })
  it('is empty for nothing, junk or another shape, and skips broken entries', () => {
    expect(parseScrollStore(null)).toEqual(EMPTY_SCROLL)
    expect(parseScrollStore('{not json')).toEqual(EMPTY_SCROLL)
    expect(parseScrollStore('[1,2]')).toEqual(EMPTY_SCROLL)
    expect(parseScrollStore('null')).toEqual(EMPTY_SCROLL)
    expect(parseScrollStore(JSON.stringify({ keys: ['a', 'b', 3], at: { a: { y: 4 }, b: { y: 'x' } } }))).toEqual({ keys: ['a'], at: { a: { y: 4 } } })
  })
})

describe('canReach', () => {
  it('waits until the page is tall enough for the position', () => {
    expect(canReach(600, 1000, 844)).toBe(false)
    expect(canReach(600, 1500, 844)).toBe(true)
    expect(canReach(0, 300, 844)).toBe(true)
    expect(canReach(157, 1000, 844)).toBe(true)
  })
})
