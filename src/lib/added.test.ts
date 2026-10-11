import { describe, expect, it } from 'vitest'
import { addedLine, EDIT_QUIET_MS } from './added'

const fmt = { dateTime: (ms: number) => `T${ms}`, date: (ms: number) => `D${ms}` }

describe('addedLine', () => {
  it('who and when', () => {
    expect(addedLine({ createdAt: 1 }, 'Ananya', fmt)).toBe('Added by Ananya on T1')
    expect(addedLine({ createdAt: 1 }, undefined, fmt)).toBe('Added on T1')
  })
  it('mentions an edit only when it came later', () => {
    expect(addedLine({ createdAt: 0, updatedAt: EDIT_QUIET_MS }, 'you', fmt)).toBe('Added by you on T0')
    expect(addedLine({ createdAt: 0, updatedAt: EDIT_QUIET_MS + 1 }, 'you', fmt)).toBe(`Added by you on T0 · edited D${EDIT_QUIET_MS + 1}`)
  })
})
