import { describe, expect, it } from 'vitest'
import { IDLE_PREFETCH, load, routeKey } from './routes'

describe('routeKey', () => {
  it('maps every lazy route in App.tsx to its chunk', () => {
    expect(routeKey('/add')).toBe('ExpenseForm')
    expect(routeKey('/groups/g1/expenses/e1/edit')).toBe('ExpenseForm')
    expect(routeKey('/groups/new')).toBe('GroupForm')
    expect(routeKey('/groups/g1/edit')).toBe('GroupForm')
    expect(routeKey('/groups/import')).toBe('ImportGroup')
    expect(routeKey('/groups/g1/settle')).toBe('SettleUp')
    expect(routeKey('/groups/g1/expenses/e1')).toBe('ExpenseDetail')
    expect(routeKey('/groups/g1')).toBe('GroupDetail')
    expect(routeKey('/groups/g1/')).toBe('GroupDetail')
    expect(routeKey('/friends')).toBe('SettleAll')
    expect(routeKey('/settle')).toBe('SettleAll')
    expect(routeKey('/settle/with/u:abc')).toBe('SettleUp')
    expect(routeKey('/insights')).toBe('Insights')
    expect(routeKey('/profile')).toBe('Profile')
    expect(routeKey('/inbox')).toBe('Inbox')
    expect(routeKey('/scan')).toBe('Scan')
    expect(routeKey('/split')).toBe('SplitBill')
    expect(routeKey('/share')).toBe('Share')
    expect(routeKey('/capture')).toBe('Capture')
    expect(routeKey('/capture/c1')).toBe('Capture')
    expect(routeKey('/join/ABCD1234')).toBe('Join')
    expect(routeKey('/t')).toBe('Table')
    expect(routeKey('/t/XYZ')).toBe('Table')
    expect(routeKey('/settings/auto-capture')).toBe('AutoCaptureSetup')
    expect(routeKey('/settings')).toBe('Settings')
    expect(routeKey('/settings/ai')).toBe('Settings')
    expect(routeKey('/admin')).toBe('Admin')
    expect(routeKey('/admin/users')).toBe('Admin')
  })

  it('returns nothing for eager screens and unknown paths', () => {
    expect(routeKey('/')).toBeUndefined()
    expect(routeKey('/groups')).toBeUndefined()
    expect(routeKey('/nope')).toBeUndefined()
    expect(routeKey('/groupsx')).toBeUndefined()
  })

  it('only prefetches screens that exist', () => {
    for (const k of IDLE_PREFETCH) expect(typeof load[k]).toBe('function')
  })
})
