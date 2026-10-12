import { describe, expect, it } from 'vitest'
import { lastMoneyAt, SETTLED_KEEP_MS, settledAWhile, type SettleView } from './settled-groups'

const now = 100 * 86_400_000
const view = (over: Partial<SettleView> = {}): SettleView => ({
  group: { type: 'trip', createdAt: 0 },
  me: 'a',
  net: { a: 0, b: 0 },
  expenses: [{ createdAt: now - 10 * 86_400_000 }],
  settlements: [],
  pending: [],
  waiting: [],
  ...over,
})

describe('settled groups', () => {
  it('lastMoneyAt is the newest expense or payment, else when the group was made', () => {
    expect(lastMoneyAt(view({ settlements: [{ createdAt: now - 1 }] }))).toBe(now - 1)
    expect(lastMoneyAt(view({ expenses: [], group: { type: 'trip', createdAt: 5 } }))).toBe(5)
  })
  it('hides once you have been square for a week', () => {
    expect(settledAWhile(view(), now)).toBe(true)
    expect(settledAWhile(view({ settlements: [{ createdAt: now - SETTLED_KEEP_MS + 1 }] }), now)).toBe(false)
  })
  it('stays while you owe or are owed, while something waits on an OK, and always for a wallet', () => {
    expect(settledAWhile(view({ net: { a: -100, b: 100 } }), now)).toBe(false)
    expect(settledAWhile(view({ pending: [{}] }), now)).toBe(false)
    expect(settledAWhile(view({ waiting: [{}] }), now)).toBe(false)
    expect(settledAWhile(view({ group: { type: 'personal', createdAt: 0 } }), now)).toBe(false)
  })
})
