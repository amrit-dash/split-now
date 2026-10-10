import { describe, expect, it } from 'vitest'
import { IDLE_PREFETCH, load, prefetchAfter, routeChunks, routeKey } from './routes'

describe('routeKey', () => {
  it('maps every lazy route in App.tsx to its chunk', () => {
    expect(routeKey('/add')).toBe('ExpenseForm')
    expect(routeKey('/groups/g1/expenses/e1/edit')).toBe('ExpenseForm')
    expect(routeKey('/groups/new')).toBe('GroupForm')
    expect(routeKey('/groups/g1/edit')).toBe('GroupForm')
    expect(routeKey('/groups/import')).toBe('ImportGroup')
    expect(routeKey('/groups/g1/settle')).toBe('SettleUp')
    expect(routeKey('/groups/g1/members')).toBe('GroupMembers')
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
    expect(routeKey('/r/abcdefghijkmnpqrstuvwxyz')).toBe('PayLink')
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

describe('routeChunks', () => {
  it('is the screen alone outside settings', () => {
    expect(routeChunks('/profile')).toEqual(['Profile'])
    expect(routeChunks('/groups/g1')).toEqual(['GroupDetail'])
    expect(routeChunks('/settings/auto-capture')).toEqual(['AutoCaptureSetup'])
    expect(routeChunks('/')).toEqual([])
    expect(routeChunks('/nope')).toEqual([])
  })

  it('adds the settings area inside the Settings chunk', () => {
    expect(routeChunks('/settings')).toEqual(['Settings'])
    expect(routeChunks('/settings/')).toEqual(['Settings'])
    expect(routeChunks('/settings/preferences')).toEqual(['Settings', 'SettingsPreferences'])
    expect(routeChunks('/settings/notifications/')).toEqual(['Settings', 'SettingsNotifications'])
    expect(routeChunks('/settings/automation')).toEqual(['Settings', 'SettingsAutomation'])
    expect(routeChunks('/settings/ai')).toEqual(['Settings', 'SettingsAi'])
    expect(routeChunks('/settings/data')).toEqual(['Settings', 'SettingsData'])
    expect(routeChunks('/settings/animations')).toEqual(['Settings', 'SettingsAnimations'])
    expect(routeChunks('/settings/admin')).toEqual(['Settings'])
    expect(routeChunks('/settings/constructor')).toEqual(['Settings'])
  })
})

describe('prefetchAfter', () => {
  it('fetches Settings and its areas from Profile, and the areas from Settings', () => {
    const areas = ['SettingsPreferences', 'SettingsNotifications', 'SettingsAutomation', 'SettingsAi', 'SettingsData', 'SettingsAnimations']
    expect(prefetchAfter('/profile')).toEqual(['Settings', ...areas])
    expect(prefetchAfter('/settings')).toEqual(areas)
    expect(prefetchAfter('/settings/data')).toEqual(areas)
    for (const k of prefetchAfter('/profile')) expect(typeof load[k]).toBe('function')
  })

  it('fetches nothing extra elsewhere', () => {
    expect(prefetchAfter('/')).toEqual([])
    expect(prefetchAfter('/groups/g1')).toEqual([])
    expect(prefetchAfter('/settings/auto-capture')).toEqual([])
  })
})
