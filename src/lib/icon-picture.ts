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

/**
 * Sizes tried, largest first, until the picture fits. Icons are drawn at 40 to 56 px. Down to 56
 * before giving up see-through: Safari on iPhone can't write WebP, and a detailed PNG can be over
 * the cap at 72 px; the last resort (JPEG, which can't be see-through) is what put white squares
 * behind pictures.
 */
export const PICTURE_SIZES = [112, 96, 72, 64, 56] as const
/** The keying is done on a square this big: plenty for a 112 px icon, quick on any phone. */
export const WORK_SIZE = 256
/** Room left around the object, as a share of the icon (an emoji leaves about this much). */
export const PICTURE_PAD = 0.03

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
/** Border samples within this distance of their median colour are one flat backdrop. */
const BORDER_SPREAD = 60
/** How much of the border must be that one colour (the object may touch an edge here and there). */
const BORDER_SHARE = 0.6
/**
 * The same for a colour a model paints as a backdrop when it ignores the asked-for magenta (white,
 * off-white, light grey) and for magenta itself: 40% of the edge is enough (owner, 23 Oct 2026: a
 * picture whose object reaches the edges kept its white square). Other colours keep 60%, so a sky
 * or a field in the picture isn't taken for a backdrop.
 */
const BACKDROP_SHARE = 0.4

/** White, off-white or a light grey: what an image model paints behind an object when it ignores magenta. */
export const lightNeutral = (c: Rgb): boolean => Math.min(c[0], c[1], c[2]) >= 205 && Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) <= 28
/** Distance to the backdrop at or under which a pixel is cleared fully, and over which it is kept (soft in between). */
export const KEY_NEAR = 60
export const KEY_FAR = 120

const distance = (d: Uint8ClampedArray, i: number, c: Rgb) => Math.hypot(d[i] - c[0], d[i + 1] - c[1], d[i + 2] - c[2])

/**
 * A magenta-looking pixel: red and blue strong and alike, green well below both. Models paint
 * the asked-for #FF00FF with shading (#E040E0 in one corner, #FF10F0 in another), so magenta is
 * matched by its hue, not by one exact colour; real objects almost never have it.
 */
export function magentaish(r: number, g: number, b: number): boolean {
  const lo = Math.min(r, b)
  // Strict, so an object's own pinks and purples (a pink wheel, a violet bag) aren't taken for it.
  return lo > 140 && g < lo * 0.45 && Math.abs(r - b) < Math.max(r, b) * 0.3
}
const magentaAt = (d: Uint8ClampedArray, i: number) => d[i + 3] >= CLEAR && magentaish(d[i], d[i + 1], d[i + 2])

/** The pixel indexes (into data) of a ring just inside the edges, every few pixels. */
function borderSpots(p: Pixels): number[] {
  const inset = Math.min(Math.max(1, Math.round(Math.min(p.width, p.height) * 0.01)), Math.floor(Math.min(p.width, p.height) / 4))
  const step = Math.max(1, Math.floor(Math.min(p.width, p.height) / 32))
  const at = (x: number, y: number) => (y * p.width + x) * 4
  const out: number[] = []
  for (let x = inset; x < p.width - inset; x += step) out.push(at(x, inset), at(x, p.height - 1 - inset))
  for (let y = inset + step; y < p.height - inset - step; y += step) out.push(at(inset, y), at(p.width - 1 - inset, y))
  return out
}

/**
 * The flat colour behind the object, from a ring of samples just inside the edges: 'clear' when
 * they are mostly see-through already, the median colour when most of them agree (magenta by hue,
 * anything else by distance), else null: no flat backdrop, and then nothing is keyed.
 */
export function backdropOf(p: Pixels): Rgb | 'clear' | null {
  const spots = borderSpots(p)
  const share = (n: number) => n >= spots.length * BORDER_SHARE
  if (share(spots.filter((i) => p.data[i + 3] < CLEAR).length)) return 'clear'
  const solid = spots.filter((i) => p.data[i + 3] >= CLEAR)
  const median = (k: number) => {
    const v = solid.map((i) => p.data[i + k]).sort((a, b) => a - b)
    return v[v.length >> 1] ?? 0
  }
  const loose = (n: number) => n >= spots.length * BACKDROP_SHARE
  const magenta = solid.filter((i) => magentaAt(p.data, i))
  if (loose(magenta.length)) {
    const v = (k: number) => magenta.map((i) => p.data[i + k]).sort((a, b) => a - b)[magenta.length >> 1]
    return [v(0), v(1), v(2)]
  }
  // The edge's light neutral (white / off-white / light grey), when there's enough of it.
  const light = solid.filter((i) => lightNeutral([p.data[i], p.data[i + 1], p.data[i + 2]]))
  if (loose(light.length)) {
    const v = (k: number) => light.map((i) => p.data[i + k]).sort((a, b) => a - b)[light.length >> 1]
    return [v(0), v(1), v(2)]
  }
  const mid: Rgb = [median(0), median(1), median(2)]
  return share(solid.filter((i) => distance(p.data, i, mid) <= BORDER_SPREAD).length) ? mid : null
}

/**
 * Clears the backdrop in place: a flood from every edge pixel through backdrop pixels, so only
 * backdrop joined to the edges goes (on magenta, also from every magenta pixel: gaps inside). Pixels near the colour go fully clear; ones further off
 * (the soft rim of the object) keep part of their alpha, with the backdrop's tint taken back out
 * of their colour so no magenta fringe is left.
 */
export function keyOut(p: Pixels, color: Rgb): void {
  const { data, width, height } = p
  const seen = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  // On a magenta backdrop every magenta-looking pixel is backdrop, however the model shaded it.
  const byHue = magentaish(color[0], color[1], color[2])
  const gap = (i: number) => (data[i + 3] < CLEAR || (byHue && magentaAt(data, i)) ? 0 : distance(data, i, color))
  const near = (n: number) => gap(n * 4) <= KEY_FAR
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
  // Magenta inside the object is backdrop showing through a gap the edges can't reach (between
  // the lenses of glasses, a mug's handle): the prompt keeps magenta out of the object itself.
  if (byHue) for (let n = 0; n < width * height; n++) if (magentaAt(data, n * 4)) push(n)
  while (head < tail) {
    const n = queue[head++]
    const x = n % width
    const i = n * 4
    const d = gap(i)
    if (d <= KEY_NEAR) data[i + 3] = 0
    else {
      const a = (d - KEY_NEAR) / (KEY_FAR - KEY_NEAR)
      // The rim pixel was object over backdrop: take the backdrop's share back out.
      for (let k = 0; k < 3; k++) data[i + k] = Math.max(0, Math.min(255, Math.round((data[i + k] - color[k] * (1 - a)) / a)))
      data[i + 3] = Math.round(data[i + 3] * a)
    }
    // The flood goes on only through backdrop: a rim pixel is softened but not passed through, so
    // an object's own pink next to the backdrop loses at most its outer edge.
    if (d > KEY_NEAR) continue
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
    // WebP and PNG keep the see-through background (WebP at a lower quality too, before a smaller size).
    for (const [type, q] of [
      ['image/webp', 0.85],
      ['image/webp', 0.7],
      ['image/png', 1],
    ] as const) {
      const kept = keepPicture(canvas.toDataURL(type, q))
      if (kept) return kept
    }
  }
  // Nothing see-through fits: JPEG at the smallest size. A keyed picture can't keep its cut-out
  // there, so it goes on the tile's dark-neutral instead of a white square.
  const size = PICTURE_SIZES[PICTURE_SIZES.length - 1]
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  if (keyed) {
    ctx.fillStyle = '#f1f5f9'
    ctx.fillRect(0, 0, size, size)
  }
  const to = keyed ? fitBox(box, size) : { x: 0, y: 0, w: size, h: size }
  ctx.drawImage(work, box.x, box.y, box.w, box.h, to.x, to.y, to.w, to.h)
  return keepPicture(canvas.toDataURL('image/jpeg', 0.82))
}
