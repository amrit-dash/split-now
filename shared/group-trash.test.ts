import { describe, expect, it } from 'vitest'
import { TRASH_DAYS, daysLeft, isDeletedGroup, purgeAt, purgeDue } from './group-trash'

const DAY = 86_400_000

describe('group trash', () => {
  it('knows a deleted group by deletedAt', () => {
    expect(isDeletedGroup({})).toBe(false)
    expect(isDeletedGroup({ deletedAt: 5 })).toBe(true)
  })
  it(`keeps it ${TRASH_DAYS} days, then it is due for the purge`, () => {
    const at = 1_000_000
    expect(purgeAt(at)).toBe(at + TRASH_DAYS * DAY)
    expect(purgeDue({ deletedAt: at }, at + TRASH_DAYS * DAY - 1)).toBe(false)
    expect(purgeDue({ deletedAt: at }, at + TRASH_DAYS * DAY)).toBe(true)
    expect(purgeDue({}, Number.MAX_SAFE_INTEGER)).toBe(false)
  })
  it('counts whole days left, never 0 while it can still be restored', () => {
    const at = 0
    expect(daysLeft(at, 0)).toBe(TRASH_DAYS)
    expect(daysLeft(at, DAY / 2)).toBe(TRASH_DAYS)
    expect(daysLeft(at, (TRASH_DAYS - 1) * DAY + 1)).toBe(1)
    expect(daysLeft(at, TRASH_DAYS * DAY)).toBe(0)
  })
})
