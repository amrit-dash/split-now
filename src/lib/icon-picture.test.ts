import { describe, expect, it } from 'vitest'
import { keepPicture, PICTURE_SIZES } from './icon-picture'

describe('the kept picture', () => {
  it('only a small image data: URL is kept', () => {
    expect(keepPicture('data:image/webp;base64,AAAA')).toBe('data:image/webp;base64,AAAA')
    // a browser that can't write WebP answers PNG for toDataURL('image/webp'): still an image
    expect(keepPicture('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
    expect(keepPicture(`data:image/jpeg;base64,${'A'.repeat(30_000)}`)).toBeNull()
    expect(keepPicture('data:,')).toBeNull()
  })
  it('tries smaller squares, largest first', () => {
    expect([...PICTURE_SIZES]).toEqual([...PICTURE_SIZES].sort((a, b) => b - a))
  })
})
