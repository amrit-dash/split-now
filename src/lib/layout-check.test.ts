import { describe, expect, it } from 'vitest'
import { layoutProblem, type LayoutSample } from './layout-check'

const fine: LayoutSample = {
  route: '/',
  from: '/t/ABC',
  when: '500',
  innerW: 360,
  innerH: 740,
  clientW: 360,
  scrollW: 360,
  vvW: 360,
  vvH: 740,
  vvScale: 1,
  vvLeft: 0,
  vvTop: 0,
  scrollX: 0,
  scrollY: 0,
  navBottom: 740,
  navHeight: 70,
  insetBottom: 24,
}

describe('layoutProblem', () => {
  it('nothing to say when it fits', () => {
    expect(layoutProblem(fine)).toBeNull()
  })
  it('names what is off, with the measurements', () => {
    const line = layoutProblem({ ...fine, scrollW: 372, vvScale: 0.97, scrollX: 12, navBottom: 716, wide: 'div.card' })
    expect(line).toBe(
      'layout wide+zoomed+shifted+nav-off-bottom: /t/ABC → / @500 | win=360x740 client=360 scroll=372 vv=360x740@0.97+0,0 at=12,0 nav=716/70 inset=24 wide=div.card',
    )
  })
  it('Chrome widening the page to fit stray overflow (owner’s phone: 387 on a 384 screen) is named', () => {
    expect(layoutProblem({ ...fine, innerW: 387, clientW: 384, scrollW: 384, navBottom: 740 })).toMatch(/^layout widened: /)
  })
  it('a page without the tab bar is only checked for width, zoom and shift', () => {
    expect(layoutProblem({ ...fine, navBottom: undefined, navHeight: undefined })).toBeNull()
  })
  it('fits Logs’ 500 characters', () => {
    expect(layoutProblem({ ...fine, scrollW: 999, wide: 'x'.repeat(900) })?.length).toBe(500)
  })
})
