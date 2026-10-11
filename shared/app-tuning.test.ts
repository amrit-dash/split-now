import { describe, expect, it } from 'vitest'
import { DEFAULT_TUNING, resolveTuning, setTuning, TUNING_META, TUNING_NAMES, tuning } from './app-tuning'

describe('app tuning', () => {
  it('defaults: 20 updates a page, 15 live per group, 30 days in Recently deleted', () => {
    expect(DEFAULT_TUNING).toEqual({ inboxPageSize: 20, activityWindow: 15, trashDays: 30 })
    for (const k of TUNING_NAMES) expect(TUNING_META[k].default).toBeGreaterThanOrEqual(TUNING_META[k].min)
  })
  it('keeps valid values and replaces missing or out-of-range ones', () => {
    expect(resolveTuning({ inboxPageSize: 40, activityWindow: 999, trashDays: 14.5 })).toEqual({ ...DEFAULT_TUNING, inboxPageSize: 40 })
    expect(resolveTuning(null)).toEqual(DEFAULT_TUNING)
  })
  it('the app reads the live copy', () => {
    setTuning({ ...DEFAULT_TUNING, trashDays: 14 })
    expect(tuning().trashDays).toBe(14)
    setTuning(DEFAULT_TUNING)
  })
})
