import { describe, expect, it } from 'vitest'
import { TOAST_GAP, toastLift, topLift } from './toast-place'

describe('toastLift', () => {
  it('a sheet of half the screen or less: toasts sit just above it', () => {
    expect(toastLift({ top: 500, height: 300 }, 800)).toBe(300 + TOAST_GAP)
    expect(toastLift({ top: 400, height: 400 }, 800)).toBe(400 + TOAST_GAP)
  })
  it('a taller sheet: the usual lane', () => {
    expect(toastLift({ top: 399, height: 401 }, 800)).toBeNull()
  })
  it('a centred dialog (wider screens) counts from its top too', () => {
    expect(toastLift({ top: 250, height: 300 }, 800, 8)).toBe(558)
  })
  it('nothing measured yet: the usual lane', () => {
    expect(toastLift({ top: 0, height: 0 }, 800)).toBeNull()
    expect(toastLift({ top: 0, height: 100 }, 0)).toBeNull()
  })
})

describe('topLift', () => {
  it('the sheet on top decides', () => {
    expect(topLift([])).toBeNull()
    expect(topLift([200, null])).toBeNull()
    expect(topLift([null, 312])).toBe(312)
  })
})
