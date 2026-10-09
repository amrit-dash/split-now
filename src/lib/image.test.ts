import { describe, expect, it } from 'vitest'
import { centerSquare, isImageType } from './image'

describe('centerSquare', () => {
  it('crops the middle of landscape and portrait images', () => {
    expect(centerSquare(400, 300)).toEqual({ sx: 50, sy: 0, size: 300 })
    expect(centerSquare(300, 401)).toEqual({ sx: 0, sy: 51, size: 300 })
    expect(centerSquare(256, 256)).toEqual({ sx: 0, sy: 0, size: 256 })
  })
})

describe('isImageType', () => {
  it('accepts image types and the blank type some pickers send', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/heic', 'image/svg+xml', 'IMAGE/WEBP', '']) expect(isImageType(t)).toBe(true)
  })
  it('refuses anything else a share or picker might hand over', () => {
    for (const t of ['text/html', 'application/pdf', 'image/', 'image/png;x=<b>', 'video/mp4']) expect(isImageType(t)).toBe(false)
  })
})
