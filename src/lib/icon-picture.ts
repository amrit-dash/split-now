import { cleanIconImage, ICON_IMAGE_MAX } from '../../shared/icon-ai'

/*
 * "Draw a picture" comes back as a full-size image (a 1K square, a megabyte or more). Kept as it
 * is it would make every list that shows the expense heavy, so the phone draws it into a small
 * square and keeps that: WebP where the browser can write it, else PNG, small enough for the
 * document (ICON_IMAGE_MAX). The browser does the decoding; nothing of the original is kept.
 *
 * Image models can't paint transparency, so the prompt asks for a flat magenta backdrop
 * (shared/icon-ai.ts picturePrompt) and the phone keys it out here: whatever flat colour the four
 * corners agree on (magenta, or the white a model sometimes paints anyway) is cleared from the
 * edges inwards, so a white spot inside the object stays. Then the object is cropped and scaled to
 * fill the icon, the way an emoji fills its tile, instead of sitting small on a white card.
 */

/** Sizes tried, largest first, until the picture fits. Icons are drawn at 40 to 56 px. */
export const PICTURE_SIZES = [112, 96, 72] as const
/** The keying is done on a square this big: plenty for a 112 px icon, quick on any phone. */
export const WORK_SIZE = 256
/** Room left around the object, as a share of the icon (an emoji leaves about this much). */
export const PICTURE_PAD = 0.06

/** The data: URL to keep for this attempt, or null when it's too big or isn't an image the app keeps. */
export const keepPicture = (dataUrl: string): string | null => (dataUrl.length <= ICON_IMAGE_MAX ? cleanIconImage(dataUrl) : null)

/** RGBA pixels, as in an ImageData. */
export interface Pixels {
  data: Uint8ClampedArray
  width: number
  height: number
}
export type Rgb = readonly [number, number, number]
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Below this alpha a pixel already counts as see-through. */
const CLEAR = 16
/** Corners within this distance of each other are one flat backdrop. */
const CORNER_SPREAD = 40
/** Distance to the backdrop at or under which a pixel is cleared fully, and over which it is kept (soft in between). */
export const KEY_NEAR = 60
export const KEY_FAR = 120

const distance = (d: Uint8ClampedArray, i: number, c: Rgb) => Math.hypot(d[i] - c[0], d[i + 1] - c[1], d[i + 2] - c[2])

/**
 * The flat colour behind the object: the average of the four corners (a few pixels in) when they
 * agree. 'clear' when the corners are already see-through, null when there is no flat backdrop
 * (the object runs to the edges), and then nothing is keyed.
 */
export function backdropOf(p: Pixels): Rgb | 'clear' | null {
  const inset = Math.min(2, Math.floor(Math.min(p.width, p.height) / 4))
  const spots = [
    [inset, inset],
    [p.width - 1 - inset, inset],
    [inset, p.height - 1 - inset],
    [p.width - 1 - inset, p.height - 1 - inset],
  ].map(([x, y]) => (y * p.width + x) * 4)
  if (spots.every((i) => p.data[i + 3] < CLEAR)) return 'clear'
  if (spots.some((i) => p.data[i + 3] < CLEAR)) return null
  const mean = [0, 1, 2].map((k) => spots.reduce((s, i) => s + p.data[i + k], 0) / spots.length) as unknown as Rgb
  return spots.every((i) => distance(p.data, i, mean) <= CORNER_SPREAD) ? mean : null
}

/**
 * Clears the backdrop in place: a flood from every edge pixel through pixels close to `color`, so
 * only backdrop joined to the edges goes. Pixels near the colour go fully clear; ones further off
 * (the soft rim of the object) keep part of their alpha, with the backdrop's tint taken back out
 * of their colour so no magenta fringe is left.
 */
export function keyOut(p: Pixels, color: Rgb): void {
  const { data, width, height } = p
  const seen = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  const near = (n: number) => data[n * 4 + 3] < CLEAR || distance(data, n * 4, color) <= KEY_FAR
  const push = (n: number) => {
    if (seen[n] || !near(n)) return
    seen[n] = 1
    queue[tail++] = n
  }
  for (let x = 0; x < width; x++) {
    push(x)
    push((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    push(y * width)
    push(y * width + width - 1)
  }
  while (head < tail) {
    const n = queue[head++]
    const x = n % width
    const i = n * 4
    const d = data[i + 3] < CLEAR ? 0 : distance(data, i, color)
    if (d <= KEY_NEAR) data[i + 3] = 0
    else {
      const a = (d - KEY_NEAR) / (KEY_FAR - KEY_NEAR)
      // The rim pixel was object over backdrop: take the backdrop's share back out.
      for (let k = 0; k < 3; k++) data[i + k] = Math.max(0, Math.min(255, Math.round((data[i + k] - color[k] * (1 - a)) / a)))
      data[i + 3] = Math.round(data[i + 3] * a)
    }
    if (x > 0) push(n - 1)
    if (x < width - 1) push(n + 1)
    if (n >= width) push(n - width)
    if (n < width * (height - 1)) push(n + width)
  }
}

/** The smallest box holding every pixel that shows (alpha over a faint threshold), or null when nothing does. */
export function opaqueBox(p: Pixels, minAlpha = 24): Box | null {
  let x0 = p.width
  let y0 = p.height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++) {
      if (p.data[(y * p.width + x) * 4 + 3] < minAlpha) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

/** Where a box goes in a `size` square: as big as fits inside the padding, aspect kept, centred. */
export function fitBox(box: Box, size: number, pad = PICTURE_PAD): Box {
  const room = size * (1 - 2 * pad)
  const scale = room / Math.max(box.w, box.h)
  const w = box.w * scale
  const h = box.h * scale
  return { x: (size - w) / 2, y: (size - h) / 2, w, h }
}

/**
 * Keys out the backdrop and finds the object, on pixels the size of WORK_SIZE: the part of the
 * work square to draw into the icon, and whether the pixels changed. keyed false (the whole
 * square, untouched) when no backdrop could be told apart, or the key ate the object (it was
 * the backdrop's colour).
 */
export function cutOut(p: Pixels): { box: Box; keyed: boolean } {
  const whole = { box: { x: 0, y: 0, w: p.width, h: p.height }, keyed: false }
  const bg = backdropOf(p)
  if (!bg) return whole
  // Named, not spread: an ImageData's width and height are getters a spread leaves behind.
  const work = { data: bg === 'clear' ? p.data : p.data.slice(), width: p.width, height: p.height }
  if (bg !== 'clear') keyOut(work, bg)
  const box = opaqueBox(work)
  if (!box || box.w * box.h < p.width * p.height * 0.02) return whole
  p.data.set(work.data)
  return { box, keyed: true }
}

export async function shrinkPicture(base64: string, mimeType: string): Promise<string | null> {
  const img = new Image()
  img.decoding = 'async'
  img.src = `data:${mimeType};base64,${base64}`
  try {
    await img.decode()
  } catch {
    return null
  }
  const work = document.createElement('canvas')
  work.width = WORK_SIZE
  work.height = WORK_SIZE
  const wctx = work.getContext('2d', { willReadFrequently: true })
  if (!wctx) return null
  wctx.drawImage(img, 0, 0, WORK_SIZE, WORK_SIZE)
  const pixels = wctx.getImageData(0, 0, WORK_SIZE, WORK_SIZE)
  const { box, keyed } = cutOut(pixels)
  if (keyed) wctx.putImageData(pixels, 0, 0)
  for (const size of PICTURE_SIZES) {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const to = keyed ? fitBox(box, size) : { x: 0, y: 0, w: size, h: size }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(work, box.x, box.y, box.w, box.h, to.x, to.y, to.w, to.h)
    // WebP and PNG keep the see-through background; JPEG can't, so it is the last try, on white.
    for (const type of ['image/webp', 'image/png']) {
      const kept = keepPicture(canvas.toDataURL(type, 0.85))
      if (kept) return kept
    }
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    const kept = keepPicture(canvas.toDataURL('image/jpeg', 0.82))
    if (kept) return kept
  }
  return null
}
