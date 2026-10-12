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

describe('addedLine: who edited it', () => {
  it('names the editor when the expense records one', () => {
    const x = { createdAt: 0, updatedAt: EDIT_QUIET_MS + 1, createdBy: 'ua', updatedBy: 'ub' }
    expect(addedLine(x, 'Ananya', fmt, 'Rahul')).toBe(`Added by Ananya on T0 · edited by Rahul on D${EDIT_QUIET_MS + 1}`)
    expect(addedLine({ ...x, updatedBy: 'ua' }, 'you', fmt, 'you')).toBe(`Added by you on T0 · edited by you on D${EDIT_QUIET_MS + 1}`)
  })
  it('someone else’s edit shows however soon it came; the author’s own quick fix doesn’t', () => {
    expect(addedLine({ createdAt: 0, updatedAt: 1000, createdBy: 'ua', updatedBy: 'ub' }, 'Ananya', fmt, 'Rahul')).toBe(
      'Added by Ananya on T0 · edited by Rahul on D1000',
    )
    expect(addedLine({ createdAt: 0, updatedAt: 1000, createdBy: 'ua', updatedBy: 'ua' }, 'Ananya', fmt, 'Ananya')).toBe('Added by Ananya on T0')
  })
  it('an old edit with no editor recorded still says it was edited', () => {
    expect(addedLine({ createdAt: 0, updatedAt: EDIT_QUIET_MS + 5, createdBy: 'ua' }, 'Ananya', fmt, undefined)).toBe(
      `Added by Ananya on T0 · edited D${EDIT_QUIET_MS + 5}`,
    )
  })
})
