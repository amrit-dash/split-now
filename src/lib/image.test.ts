import { describe, expect, it } from 'vitest'
import { centerSquare } from './image'

describe('centerSquare', () => {
  it('crops the middle of landscape and portrait images', () => {
    expect(centerSquare(400, 300)).toEqual({ sx: 50, sy: 0, size: 300 })
    expect(centerSquare(300, 401)).toEqual({ sx: 0, sy: 51, size: 300 })
    expect(centerSquare(256, 256)).toEqual({ sx: 0, sy: 0, size: 256 })
  })
})
