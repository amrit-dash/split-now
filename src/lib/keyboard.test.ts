import { describe, expect, it } from 'vitest'
import { chatViewportBox, needsHeal, opensKeyboard, tallestHeights } from './keyboard'

describe('chatViewportBox', () => {
  it('fills the screen when there is no visual viewport', () => {
    expect(chatViewportBox(null, 800, true)).toBeNull()
    expect(chatViewportBox({ height: 0, offsetTop: 0 }, 800, true)).toBeNull()
  })

  it('follows the visible area when the keyboard is up (resized and panned)', () => {
    expect(chatViewportBox({ height: 412.4, offsetTop: 301.6 }, 800, true)).toEqual({ height: 412, top: 302 })
  })

  it('fills the screen when nothing is being typed, even if the viewport still reads keyboard-sized', () => {
    // iOS can keep the shrunken viewport after the keyboard closes: the box must not stop mid-screen.
    expect(chatViewportBox({ height: 500, offsetTop: 0 }, 800, false)).toBeNull()
    expect(chatViewportBox({ height: 500, offsetTop: 120 }, 800, false)).toBeNull()
  })

  it('fills the screen when typing takes nothing from it (hardware keyboard, desktop)', () => {
    expect(chatViewportBox({ height: 800, offsetTop: 0 }, 800, true)).toBeNull()
    expect(chatViewportBox({ height: 799.4, offsetTop: 0 }, 800, true)).toBeNull()
  })

  it('never moves above the top (overscroll bounce reports a negative offset)', () => {
    expect(chatViewportBox({ height: 700, offsetTop: -12 }, 800, true)).toEqual({ height: 700, top: 0 })
  })
})

describe('opensKeyboard', () => {
  it('is true for text fields and editable content', () => {
    expect(opensKeyboard({ tagName: 'TEXTAREA' })).toBe(true)
    expect(opensKeyboard({ tagName: 'INPUT', type: 'text' })).toBe(true)
    expect(opensKeyboard({ tagName: 'input', type: 'search' })).toBe(true)
    expect(opensKeyboard({ tagName: 'INPUT' })).toBe(true)
    expect(opensKeyboard({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('is false for nothing, buttons, toggles and read-only fields', () => {
    expect(opensKeyboard(null)).toBe(false)
    expect(opensKeyboard({ tagName: 'BODY' })).toBe(false)
    expect(opensKeyboard({ tagName: 'BUTTON' })).toBe(false)
    expect(opensKeyboard({ tagName: 'INPUT', type: 'checkbox' })).toBe(false)
    expect(opensKeyboard({ tagName: 'INPUT', type: 'text', readOnly: true })).toBe(false)
    expect(opensKeyboard({ tagName: 'TEXTAREA', readOnly: true })).toBe(false)
  })
})

describe('tallestHeights', () => {
  it('keeps the tallest height per width, each orientation on its own', () => {
    let seen = tallestHeights({}, 393, 852)
    seen = tallestHeights(seen, 393, 809)
    expect(seen).toEqual({ 393: 852 })
    seen = tallestHeights(seen, 852.4, 393)
    expect(seen).toEqual({ 393: 852, 852: 393 })
  })

  it('returns the same object when nothing grew', () => {
    const seen = { 393: 852 }
    expect(tallestHeights(seen, 393, 800)).toBe(seen)
  })
})

describe('needsHeal', () => {
  it('is true once the keyboard has gone and the app is still short of its height', () => {
    expect(needsHeal(809, 852, false)).toBe(true)
  })

  it('is false while typing, at full height, within a few pixels, or with nothing seen yet', () => {
    expect(needsHeal(809, 852, true)).toBe(false)
    expect(needsHeal(852, 852, false)).toBe(false)
    expect(needsHeal(848, 852, false)).toBe(false)
    expect(needsHeal(809, undefined, false)).toBe(false)
  })

  it('does not try again at a height a re-measure already failed to fix', () => {
    expect(needsHeal(809, 852, false, 809)).toBe(false)
    expect(needsHeal(790, 852, false, 809)).toBe(true)
  })
})
