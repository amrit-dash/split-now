import { describe, expect, it } from 'vitest'
import { quickAiAllowed, quickRoute } from './quick-route'

const none = { kind: 'none' } as const
const fresh = { kind: 'new', name: 'Bali trip', text: 'Cab 300', phrase: 'in a new group bali trip' } as const

describe('quickRoute', () => {
  it('a plain line with an amount and known people stays on the phone', () => {
    expect(quickRoute('Dinner 1200 with Rahul, I paid', { amount: 120000, unmatched: [] }, none)).toEqual({ route: 'local' })
    expect(quickRoute('Groceries 640', { amount: 64000, unmatched: [] }, none)).toEqual({ route: 'local' })
  })
  it('"in a new group Bali trip" stays local: the grammar reads it and GroupForm makes the group', () => {
    expect(quickRoute('Cab 300 in a new group Bali trip with Kiran', { amount: 30000, unmatched: ['Kiran'] }, fresh)).toEqual({ route: 'local' })
  })
  it('asking for a group in a sentence goes to AI', () => {
    const line = 'create a group Goa trip with Rahul and Priya and add dinner 2400 paid by me split equally'
    expect(quickRoute(line, { amount: 240000, unmatched: ['add'] }, none)).toEqual({ route: 'ai', why: 'asks_for_group' })
    expect(quickRoute('Start a new trip Manali with Dev, cab 900', { amount: 90000, unmatched: [] }, none)).toMatchObject({ route: 'ai' })
    expect(quickRoute('set up a group for the flat and rent 30000', { amount: 3000000, unmatched: [] }, none)).toMatchObject({ route: 'ai' })
  })
  it('several steps, no amount, or names nobody in the group has go to AI', () => {
    expect(quickRoute('Lunch with Priya and then add cab 200', { amount: 20000, unmatched: [] }, none)).toEqual({ route: 'ai', why: 'several_steps' })
    expect(quickRoute('Dinner at Thalassa, I paid', { unmatched: [] }, none)).toEqual({ route: 'ai', why: 'no_amount' })
    expect(quickRoute('Cab 300 with Zoya', { amount: 30000, unmatched: ['Zoya'] }, none)).toEqual({ route: 'ai', why: 'unknown_people' })
  })
  it('words that only look like intent stay local', () => {
    expect(quickRoute('Group dinner 2400', { amount: 240000, unmatched: [] }, none)).toEqual({ route: 'local' })
    expect(quickRoute('Trip snacks 300, I paid', { amount: 30000, unmatched: [] }, none)).toEqual({ route: 'local' })
  })
})

describe('quickAiAllowed', () => {
  const on = { aiEnabled: true, aiQuickAdd: true, aiSource: 'auto' }
  const base = { mode: 'firebase' as const, flag: true, online: true, prefs: on, status: { app: { images: 'available' } }, hasOwnKey: false }
  it('needs the flag, the person’s switch under the master switch, a connection and a key', () => {
    expect(quickAiAllowed(base)).toBe(true)
    expect(quickAiAllowed({ ...base, flag: false })).toBe(false)
    expect(quickAiAllowed({ ...base, online: false })).toBe(false)
    expect(quickAiAllowed({ ...base, prefs: { ...on, aiQuickAdd: false } })).toBe(false)
    expect(quickAiAllowed({ ...base, prefs: { ...on, aiEnabled: false } })).toBe(false)
    expect(quickAiAllowed({ ...base, prefs: null })).toBe(false)
    expect(quickAiAllowed({ ...base, status: undefined })).toBe(false)
    expect(quickAiAllowed({ ...base, status: { app: { images: 'not_listed' } } })).toBe(false)
  })
  it('an own key works too, unless the person chose only Split Now’s key (and the other way round)', () => {
    const noShared = { ...base, status: { app: { images: 'off' } } }
    expect(quickAiAllowed({ ...noShared, hasOwnKey: true })).toBe(true)
    expect(quickAiAllowed({ ...noShared, hasOwnKey: true, prefs: { ...on, aiSource: 'app' } })).toBe(false)
    expect(quickAiAllowed({ ...base, prefs: { ...on, aiSource: 'own' } })).toBe(false)
  })
  it('the demo only asks the flag (its reader is on the phone)', () => {
    expect(quickAiAllowed({ ...base, mode: 'demo', prefs: null, status: null, online: false })).toBe(true)
    expect(quickAiAllowed({ ...base, mode: 'demo', flag: false })).toBe(false)
  })
})
