import { describe, expect, it } from 'vitest'
import { chatViewportBox } from './keyboard'

describe('chatViewportBox', () => {
  it('fills the window when there is no visual viewport', () => {
    expect(chatViewportBox(null, 800)).toEqual({ height: 800, top: 0 })
    expect(chatViewportBox({ height: 0, offsetTop: 0 }, 800)).toEqual({ height: 800, top: 0 })
  })

  it('follows the visible area when the keyboard is up (resized and panned)', () => {
    expect(chatViewportBox({ height: 412.4, offsetTop: 301.6 }, 800)).toEqual({ height: 412, top: 302 })
  })

  it('never moves above the top (overscroll bounce reports a negative offset)', () => {
    expect(chatViewportBox({ height: 700, offsetTop: -12 }, 800)).toEqual({ height: 700, top: 0 })
  })
})
