import { describe, expect, it } from 'vitest'
import { backdropOf, cutOut, fitBox, keepPicture, keyOut, opaqueBox, PICTURE_PAD, PICTURE_SIZES, type Pixels, type Rgb } from './icon-picture'

const MAGENTA: Rgb = [255, 0, 255]
const WHITE: Rgb = [255, 255, 255]

/** A square of `bg` with a filled rectangle of `fg` at x0..x1, y0..y1 (inclusive). */
function picture(size: number, bg: Rgb | null, fg: Rgb, [x0, y0, x1, y1]: number[]): Pixels {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1
      const c = inside ? fg : bg
      if (!c) continue
      data.set([c[0], c[1], c[2], 255], i)
    }
  return { data, width: size, height: size }
}
const alphaAt = (p: Pixels, x: number, y: number) => p.data[(y * p.width + x) * 4 + 3]
const set = (p: Pixels, x: number, y: number, c: Rgb) => p.data.set([c[0], c[1], c[2], 255], (y * p.width + x) * 4)

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

describe('backdropOf', () => {
  it('finds the flat colour the corners agree on', () => {
    expect(backdropOf(picture(20, MAGENTA, [200, 30, 30], [6, 6, 13, 13]))).toEqual(MAGENTA)
    // the white a model sometimes paints anyway is keyed the same way
    expect(backdropOf(picture(20, WHITE, [200, 30, 30], [6, 6, 13, 13]))).toEqual(WHITE)
  })
  it('says clear when the corners are already see-through', () => {
    expect(backdropOf(picture(20, null, [200, 30, 30], [6, 6, 13, 13]))).toBe('clear')
  })
  it('gives up when the object runs to the corners', () => {
    const p = picture(20, MAGENTA, [200, 30, 30], [6, 6, 13, 13])
    set(p, 17, 17, [10, 120, 10])
    expect(backdropOf(p)).toBeNull()
  })
})

describe('keyOut', () => {
  it('clears the backdrop and keeps the object', () => {
    const p = picture(20, MAGENTA, [200, 30, 30], [6, 6, 13, 13])
    keyOut(p, MAGENTA)
    expect(alphaAt(p, 0, 0)).toBe(0)
    expect(alphaAt(p, 19, 10)).toBe(0)
    expect(alphaAt(p, 10, 10)).toBe(255)
  })
  it('keeps backdrop-coloured spots inside the object (white spots on a white backdrop)', () => {
    const p = picture(20, WHITE, [200, 30, 30], [4, 4, 15, 15])
    set(p, 9, 9, WHITE)
    keyOut(p, WHITE)
    expect(alphaAt(p, 0, 0)).toBe(0)
    expect(alphaAt(p, 9, 9)).toBe(255)
  })
  it('a rim pixel half-way to the backdrop keeps part of its alpha, with the tint taken out', () => {
    const p = picture(20, MAGENTA, [200, 30, 30], [6, 6, 13, 13])
    // magenta blended into the object's red: a soft edge
    set(p, 5, 10, [240, 0, 150])
    keyOut(p, MAGENTA)
    const i = (10 * 20 + 5) * 4
    expect(p.data[i + 3]).toBeGreaterThan(0)
    expect(p.data[i + 3]).toBeLessThan(255)
    // less blue than the blend had: the magenta's share is gone
    expect(p.data[i + 2]).toBeLessThan(150)
  })
})

describe('opaqueBox / fitBox', () => {
  it('finds the box of what shows', () => {
    const p = picture(20, null, [200, 30, 30], [3, 5, 8, 15])
    expect(opaqueBox(p)).toEqual({ x: 3, y: 5, w: 6, h: 11 })
    expect(opaqueBox(picture(20, null, [0, 0, 0], [99, 99, 99, 99]))).toBeNull()
  })
  it('scales the box to fill the icon inside the padding, centred, aspect kept', () => {
    const to = fitBox({ x: 40, y: 60, w: 50, h: 100 }, 100)
    expect(to.h).toBeCloseTo(100 * (1 - 2 * PICTURE_PAD))
    expect(to.w).toBeCloseTo(to.h / 2)
    expect(to.x + to.w / 2).toBeCloseTo(50)
    expect(to.y).toBeCloseTo(100 * PICTURE_PAD)
  })
})

describe('cutOut', () => {
  it('a small object on magenta comes back cut out, to be scaled up', () => {
    const p = picture(40, MAGENTA, [200, 30, 30], [15, 15, 24, 24])
    expect(cutOut(p)).toEqual({ box: { x: 15, y: 15, w: 10, h: 10 }, keyed: true })
    expect(alphaAt(p, 0, 0)).toBe(0)
  })
  it('works on an ImageData, whose width and height are getters on its prototype', () => {
    const plain = picture(40, MAGENTA, [200, 30, 30], [15, 15, 24, 24])
    class FakeImageData {
      get width() {
        return 40
      }
      get height() {
        return 40
      }
      get data() {
        return plain.data
      }
    }
    expect(cutOut(new FakeImageData()).keyed).toBe(true)
  })
  it('a picture with no flat backdrop is left whole and untouched', () => {
    const p = picture(40, MAGENTA, [10, 120, 10], [0, 0, 39, 39])
    expect(cutOut(p)).toEqual({ box: { x: 0, y: 0, w: 40, h: 40 }, keyed: false })
  })
  it('an object the backdrop colour (keyed away to nothing) is kept whole', () => {
    const p = picture(40, MAGENTA, [250, 5, 250], [15, 15, 24, 24])
    expect(cutOut(p)).toEqual({ box: { x: 0, y: 0, w: 40, h: 40 }, keyed: false })
    expect(alphaAt(p, 0, 0)).toBe(255)
  })
})
