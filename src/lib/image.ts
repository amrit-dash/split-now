/** Downscale an image so its longest side is at most `max` px. Returns a JPEG blob (or the input if already small). */
export async function downscale(file: Blob, max: number, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.type === 'image/jpeg') return file
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  return new Promise((res) => canvas.toBlob((b) => res(b ?? file), 'image/jpeg', quality))
}

/** The largest centred square inside a w×h image: source rect for a center crop. */
export function centerSquare(w: number, h: number): { sx: number; sy: number; size: number } {
  const size = Math.min(w, h)
  return { sx: Math.round((w - size) / 2), sy: Math.round((h - size) / 2), size }
}

/** Center-crop and scale an image to a `size`×`size` JPEG (profile photos). */
export async function squareJpeg(file: Blob, size = 256, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const { sx, sy, size: s } = centerSquare(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, sx, sy, s, s, 0, 0, size, size)
  bitmap.close?.()
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Couldn’t read that image'))), 'image/jpeg', quality))
}

/** Blob → data: URL (demo mode keeps profile photos in localStorage). */
export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.onerror = () => rej(r.error ?? new Error('Couldn’t read that image'))
    r.readAsDataURL(b)
  })
}

/**
 * Whether a picked or shared file may be shown as a photo. `accept="image/*"` is only a hint
 * to the picker, and the share target takes whatever the other app sends, so the type is
 * checked here. An empty type passes: some Android pickers leave it blank for photos. SVG is
 * refused: a bill or screenshot is never SVG, and an SVG can carry script.
 */
export const isImageType = (type: string) => type === '' || (/^image\/[\w.+-]+$/i.test(type) && !/svg/i.test(type))

/** The type a preview blob is given: the file's own image type, or JPEG when the picker left it blank. */
export const previewType = (type: string) => type || 'image/jpeg'

/**
 * A blob: URL to preview `file` in an <img>, or undefined when it isn't an image. A blob: URL
 * belongs to the app's own origin, so the bytes are copied into a fresh blob typed as the
 * checked image type: even if the URL were opened on its own, it could only render as an image,
 * never as a page that runs script.
 */
export function imagePreviewUrl(file: Blob): string | undefined {
  if (!isImageType(file.type)) return undefined
  return URL.createObjectURL(new Blob([file], { type: previewType(file.type) }))
}
