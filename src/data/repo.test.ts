import { describe, expect, it } from 'vitest'
import type { Group } from '@/types'
import { changedSettings, type GroupSettings } from './repo'

const base = { id: 'g', name: 'Trip', archived: true, archivedBy: ['me'] } as unknown as Group

describe('changedSettings', () => {
  it('keeps only what changed', () => {
    expect(changedSettings(base, { name: 'Trip', emoji: '🏖️' })).toEqual({ emoji: '🏖️' })
  })
  it("never writes the personal archive fields, so one person can't archive the group for everyone", () => {
    const patch = { archived: false, archivedBy: [] } as unknown as GroupSettings
    expect(changedSettings(base, patch)).toEqual({})
  })
})
