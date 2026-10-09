import { describe, expect, it } from 'vitest'
import { SWIPE_FLICK, dragOffset, isTap, lockAxis, settleOpen, velocityOf } from './swipe'

describe('lockAxis', () => {
  it('waits until the drag leaves the slop', () => {
    expect(lockAxis(0, 0)).toBeUndefined()
    expect(lockAxis(5, -7)).toBeUndefined()
  })
  it('takes a mostly horizontal drag', () => {
    expect(lockAxis(-20, 4)).toBe('x')
    expect(lockAxis(15, -10)).toBe('x')
  })
  it('leaves a vertical or diagonal drag to the page scroll', () => {
    expect(lockAxis(2, 20)).toBe('y')
    expect(lockAxis(-12, 11)).toBe('y')
    expect(lockAxis(10, 10)).toBe('y')
  })
})

describe('dragOffset', () => {
  it('follows the finger between closed and open', () => {
    expect(dragOffset(0, -40, 88)).toBe(-40)
    expect(dragOffset(-88, 30, 88)).toBe(-58)
  })
  it('rubber-bands past either end', () => {
    expect(dragOffset(0, 40, 88)).toBe(10)
    expect(dragOffset(0, -128, 88)).toBe(-98)
    expect(dragOffset(-88, -40, 88)).toBe(-98)
  })
})

describe('settleOpen', () => {
  it('opens past 40% from closed, stays shut below', () => {
    expect(settleOpen(-36, 88, 0, false)).toBe(true)
    expect(settleOpen(-30, 88, 0, false)).toBe(false)
  })
  it('an open row closes once dragged back past 40%', () => {
    expect(settleOpen(-60, 88, 0, true)).toBe(true)
    expect(settleOpen(-50, 88, 0, true)).toBe(false)
  })
  it('a flick decides on its own', () => {
    expect(settleOpen(-5, 88, -SWIPE_FLICK, false)).toBe(true)
    expect(settleOpen(-80, 88, SWIPE_FLICK, true)).toBe(false)
  })
  it('never opens with no actions', () => {
    expect(settleOpen(-50, 0, -1, false)).toBe(false)
  })
})

describe('isTap / velocityOf', () => {
  it('a small wobble is still a tap', () => {
    expect(isTap(3, -4)).toBe(true)
    expect(isTap(9, 0)).toBe(false)
  })
  it('measures px per ms', () => {
    expect(velocityOf(100, 0, 50, 100)).toBe(-0.5)
    expect(velocityOf(1, 5, 9, 5)).toBe(0)
  })
})
