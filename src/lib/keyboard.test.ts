import { describe, expect, it } from 'vitest'
import { chatViewportBox, opensKeyboard, strayScroll } from './keyboard'

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

describe('strayScroll', () => {
  it('scrolls back a page that iOS left past its end once the keyboard has gone', () => {
    // The full-screen chat: nothing to scroll, but iOS left it 100px down.
    expect(strayScroll(100, 844, 844, false)).toBe(0)
    // A long page scrolled past its end.
    expect(strayScroll(1300, 2000, 800, false)).toBe(1200)
  })

  it('leaves a scroll within the page alone', () => {
    expect(strayScroll(0, 844, 844, false)).toBeNull()
    expect(strayScroll(600, 2000, 800, false)).toBeNull()
    expect(strayScroll(1200, 2000, 800, false)).toBeNull()
    expect(strayScroll(1200.6, 2000, 800, false)).toBeNull()
  })

  it('leaves the page alone while typing (iOS needs the extra scroll to show the field)', () => {
    expect(strayScroll(300, 844, 844, true)).toBeNull()
  })
})
