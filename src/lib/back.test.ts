import { describe, expect, it } from 'vitest'
import { backPlan } from './back'

describe('backPlan: history (the default)', () => {
  it('a plain path is the history mode: back where you came from', () => {
    // Help → section A → its related section B: back returns to A, then to the guide.
    const stack = ['/', '/profile', '/help', '/help/approvals', '/help/edit-group']
    expect(backPlan('/help', { stack, idx: 4, current: '/help/edit-group' })).toEqual({ kind: 'history', steps: 1 })
    expect(backPlan('/help', { stack, idx: 3, current: '/help/approvals' })).toEqual({ kind: 'history', steps: 1 })
    expect(backPlan({ to: '/help', mode: 'history' }, { stack, idx: 3, current: '/help/approvals' })).toEqual({ kind: 'history', steps: 1 })
  })
  it('opened cold (a deep link, a fresh tab, a PWA start): the fallback, in place of this entry', () => {
    expect(backPlan('/help', { stack: ['/help/approvals'], idx: 0, current: '/help/approvals' })).toEqual({ kind: 'path', to: '/help', replace: true })
    expect(backPlan('/groups', { stack: [], idx: undefined, current: '/groups/g1' })).toEqual({ kind: 'path', to: '/groups', replace: true })
  })
  it('a deep-linked section then a related one: back to the first, then the guide', () => {
    const stack = ['/help/approvals', '/help/edit-group']
    expect(backPlan('/help', { stack, idx: 1, current: '/help/edit-group' })).toEqual({ kind: 'history', steps: 1 })
    expect(backPlan('/help', { stack, idx: 0, current: '/help/approvals' })).toEqual({ kind: 'path', to: '/help', replace: true })
  })
  it('steps past entries of the same screen (a form that replaced itself with it, tab changes)', () => {
    const stack = ['/', '/groups/g1', '/groups/g1?tab=balances', '/groups/g1']
    expect(backPlan('/groups', { stack, idx: 3, current: '/groups/g1' })).toEqual({ kind: 'history', steps: 3 })
  })
  it('never steps further back than the start of the visit', () => {
    const stack = ['/groups/g1', '/groups/g1']
    expect(backPlan('/groups', { stack, idx: 1, current: '/groups/g1' })).toEqual({ kind: 'path', to: '/groups', replace: true })
  })
})

describe('backPlan: fixed', () => {
  const fixed = { to: '/groups', mode: 'fixed' } as const
  it('goes to its path whatever came before, replacing this entry', () => {
    const stack = ['/', '/groups/g1', '/groups/g1/edit', '/groups/g1/members']
    expect(backPlan(fixed, { stack, idx: 3, current: '/groups/g1/members' })).toEqual({ kind: 'path', to: '/groups', replace: true })
    expect(backPlan(fixed, { stack: [], idx: undefined, current: '/groups/g1' })).toEqual({ kind: 'path', to: '/groups', replace: true })
  })
  it('steps back when that path is the entry right behind, so the system back agrees and nothing loops', () => {
    const stack = ['/', '/groups?sort=amount', '/groups/g1']
    expect(backPlan(fixed, { stack, idx: 2, current: '/groups/g1' })).toEqual({ kind: 'history', steps: 1 })
  })
  it('on that path already, it does not step back onto itself', () => {
    expect(backPlan(fixed, { stack: ['/groups', '/groups'], idx: 1, current: '/groups' })).toEqual({ kind: 'path', to: '/groups', replace: true })
  })
})
