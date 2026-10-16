import { cleanIconImage, ICON_IMAGE_MAX } from '../../shared/icon-ai'

/*
 * "Draw a picture" comes back as a full-size image (a 1K square, a megabyte or more). Kept as it
 * is it would make every list that shows the expense heavy, so the phone draws it into a small
 * square and keeps that: WebP where the browser can write it, else JPEG, small enough for the
 * document (ICON_IMAGE_MAX). The browser does the decoding; nothing of the original is kept.
 */

/** Sizes tried, largest first, until the picture fits. Icons are drawn at 40 to 56 px. */
export const PICTURE_SIZES = [112, 96, 72] as const

/** The data: URL to keep for this attempt, or null when it's too big or isn't an image the app keeps. */
export const keepPicture = (dataUrl: string): string | null => (dataUrl.length <= ICON_IMAGE_MAX ? cleanIconImage(dataUrl) : null)

export async function shrinkPicture(base64: string, mimeType: string): Promise<string | null> {
  const img = new Image()
  img.decoding = 'async'
  img.src = `data:${mimeType};base64,${base64}`
  try {
    await img.decode()
  } catch {
    return null
  }
  for (const size of PICTURE_SIZES) {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    ctx.drawImage(img, 0, 0, size, size)
    for (const type of ['image/webp', 'image/jpeg']) {
      const kept = keepPicture(canvas.toDataURL(type, 0.82))
      if (kept) return kept
    }
  }
  return null
}
