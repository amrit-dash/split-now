import { describe, expect, it } from 'vitest'
import { fieldScrollDelta, opensKeyboard } from './keyboard'

describe('fieldScrollDelta', () => {
  const view = { viewTop: 0, viewHeight: 400 }
  it('centres a field pinned at the bottom of the visible area', () => {
    // 48px field ending at the keyboard edge (400): centre 376 → move down by 176
    expect(fieldScrollDelta({ top: 352, bottom: 400, ...view })).toBe(176)
  })
  it('leaves a field that is already in the middle band alone', () => {
    expect(fieldScrollDelta({ top: 180, bottom: 228, ...view })).toBe(0)
  })
  it('brings a field above the view down into the middle (negative delta)', () => {
    expect(fieldScrollDelta({ top: -30, bottom: 18, ...view })).toBe(-206)
  })
  it('respects a scrolled visual viewport', () => {
    expect(fieldScrollDelta({ top: 452, bottom: 500, viewTop: 100, viewHeight: 400 })).toBe(176)
  })
  it('shows the top of a field taller than most of the view', () => {
    expect(fieldScrollDelta({ top: 300, bottom: 700, ...view })).toBe(260)
  })
  it('no view, no scroll', () => {
    expect(fieldScrollDelta({ top: 10, bottom: 50, viewTop: 0, viewHeight: 0 })).toBe(0)
  })
})

describe('opensKeyboard', () => {
  it('text-like inputs and textareas, not buttons or checkboxes', () => {
    expect(opensKeyboard({ tagName: 'INPUT', type: 'email' })).toBe(true)
    expect(opensKeyboard({ tagName: 'INPUT', type: '' })).toBe(true)
    expect(opensKeyboard({ tagName: 'TEXTAREA' })).toBe(true)
    expect(opensKeyboard({ tagName: 'INPUT', type: 'checkbox' })).toBe(false)
    expect(opensKeyboard({ tagName: 'INPUT', type: 'text', readOnly: true })).toBe(false)
    expect(opensKeyboard({ tagName: 'BUTTON' })).toBe(false)
    expect(opensKeyboard({ tagName: 'DIV', isContentEditable: true })).toBe(true)
    expect(opensKeyboard(null)).toBe(false)
  })
})
