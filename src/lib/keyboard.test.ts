import { describe, expect, it } from 'vitest'
import { chatViewportBox, missingHeight, opensKeyboard, tallestHeights, tapsToToggle } from './keyboard'

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

describe('missingHeight', () => {
  const phone = { width: 393, height: 852 }

  it('is how far short of the screen iOS says the app is, once the keyboard has gone', () => {
    expect(missingHeight({ width: 393, height: 809 }, phone, false)).toBe(43)
    expect(missingHeight({ width: 852, height: 350 }, phone, false)).toBe(43)
  })

  it('is 0 at full height, while typing, for a narrower window, or for an unbelievable gap', () => {
    expect(missingHeight({ width: 393, height: 852 }, phone, false)).toBe(0)
    expect(missingHeight({ width: 393, height: 851.4 }, phone, false)).toBe(0)
    expect(missingHeight({ width: 393, height: 500 }, phone, true)).toBe(0)
    expect(missingHeight({ width: 507, height: 1000 }, { width: 1024, height: 1366 }, false)).toBe(0)
    expect(missingHeight({ width: 393, height: 500 }, phone, false)).toBe(0)
  })
})

describe('tapsToToggle', () => {
  it('toggles on the fifth tap within three seconds, then starts over', () => {
    let taps: number[] = []
    for (const t of [0, 400, 800, 1200]) {
      const r = tapsToToggle(taps, t)
      expect(r.toggle).toBe(false)
      taps = r.taps
    }
    expect(tapsToToggle(taps, 1600)).toEqual({ taps: [], toggle: true })
  })

  it('forgets taps older than three seconds', () => {
    expect(tapsToToggle([0, 100, 200, 300], 3400)).toEqual({ taps: [3400], toggle: false })
    expect(tapsToToggle([0, 100, 200, 300], 3200)).toEqual({ taps: [300, 3200], toggle: false })
  })
})
