import { describe, expect, it } from 'vitest'
import { edgeFade } from './edge-fade'

describe('edgeFade', () => {
  it('is none when the row fits, or is only a rounding pixel over', () => {
    expect(edgeFade({ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 })).toBe('none')
    expect(edgeFade({ scrollLeft: 0, scrollWidth: 301, clientWidth: 300 })).toBe('none')
    expect(edgeFade({ scrollLeft: 0, scrollWidth: 200, clientWidth: 300 })).toBe('none')
  })
  it('fades the end at the start, both in the middle and the start at the end', () => {
    expect(edgeFade({ scrollLeft: 0, scrollWidth: 600, clientWidth: 300 })).toBe('end')
    expect(edgeFade({ scrollLeft: 150, scrollWidth: 600, clientWidth: 300 })).toBe('both')
    expect(edgeFade({ scrollLeft: 300, scrollWidth: 600, clientWidth: 300 })).toBe('start')
    expect(edgeFade({ scrollLeft: 299.5, scrollWidth: 600, clientWidth: 300 })).toBe('start')
  })
  it('is none for a row not laid out yet', () => {
    expect(edgeFade({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 })).toBe('none')
  })
})
