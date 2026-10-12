import { describe, expect, it } from 'vitest'
import { FLAG_GAPS, FLAG_SECTIONS, LIMIT_GAPS, onCount, sectionGaps } from './admin-sections'
import { ALL_ON } from './flags'

describe('admin sections', () => {
  it('every flag and every limit is in exactly one section', () => {
    expect(FLAG_GAPS()).toEqual({ missing: [], twice: [] })
    expect(LIMIT_GAPS()).toEqual({ missing: [], twice: [] })
  })
  it('sectionGaps finds missing and doubled names', () => {
    expect(sectionGaps(['a', 'b', 'c'], [{ id: 'x', title: 'X', hint: '', keys: ['a', 'a', 'b'] }])).toEqual({ missing: ['c'], twice: ['a'] })
  })
  it('section ids are unique', () => {
    expect(new Set(FLAG_SECTIONS.map((s) => s.id)).size).toBe(FLAG_SECTIONS.length)
  })
})

describe('onCount', () => {
  it('says all on, all off, or how many', () => {
    expect(onCount(ALL_ON, ['nudges', 'payLinks'])).toBe('All on')
    expect(onCount({ ...ALL_ON, nudges: false, payLinks: false }, ['nudges', 'payLinks'])).toBe('All off')
    expect(onCount({ ...ALL_ON, nudges: false }, ['nudges', 'payLinks', 'budgetAlerts'])).toBe('2 of 3 on')
    expect(onCount(ALL_ON, ['autoCapture'])).toBe('On')
    expect(onCount({ ...ALL_ON, autoCapture: false }, ['autoCapture'])).toBe('Off')
  })
})
