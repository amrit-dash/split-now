// Generates every raster icon from public/favicon.svg. Run: npm run icons
//
// The only thing it assumes about the SVG: the first shape is the tile background, a
// `<rect … rx="…" …/>` (full-bleed, rounded corners), and everything after it is the mark.
// Outputs (all in public/):
//   pwa-192.png, pwa-512.png      the whole tile (background + mark) — manifest `any` icons
//   pwa-maskable-512.png          the tile's own background, full-bleed with square corners (Android
//                                 cuts its own shape), and the mark centred at MASKABLE_MARK of the
//                                 width, so it looks like the iOS icon under any launcher mask
//   apple-touch-icon.png (180)    the tile with square corners and no alpha (iOS rounds it itself)
//   badge-96.png                  a white silhouette of the mark on transparent (notification
//                                 `badge` and the manifest shortcut icons: Android keeps only the alpha)
//   pwa-mono-512.png              the same silhouette at 512 for `purpose: 'monochrome'` (Android 13 themed icons)
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8')
const out = (f) => new URL(`../public/${f}`, import.meta.url).pathname

const svg = await read('../public/favicon.svg')
if (!/<svg\b/.test(svg)) throw new Error('public/favicon.svg is not an SVG')

// --- The three variants of the source, as strings ---------------------------------------

// The background rect: the first self-closing <rect …/> with an rx attribute after <defs>
// (a rect inside a <mask> or <clipPath> in the defs is part of the mark, not the background).
const defsEnd = svg.indexOf('</defs>')
const head = defsEnd >= 0 ? svg.slice(0, defsEnd + '</defs>'.length) : ''
const body = svg.slice(head.length)
const RECT = /<rect\b[^>]*\brx\s*=\s*(["'])[^"']*\1[^>]*\/>\s*/
if (!RECT.test(body)) throw new Error('favicon.svg must have a <rect … rx="…"/> background (after <defs>) before the mark')

/** Square corners: rx (and ry) of the background rect → 0. */
const squareTile = head + body.replace(RECT, (rect) => rect.replace(/\b(rx|ry)\s*=\s*(["'])[^"']*\2/g, '$1=$2' + '0$2'))

/** The background alone, square: what fills an Android adaptive icon edge to edge. */
const fieldOnly =
  head + body.replace(RECT, (rect) => rect.replace(/\b(rx|ry)\s*=\s*(["'])[^"']*\2/g, '$1=$2' + '0$2')).replace(/(<rect\b[^>]*\/>)[\s\S]*(<\/svg>)/, '$1$2')

/** The mark alone on a transparent canvas. */
const markOnly = head + body.replace(RECT, '')

/**
 * The mark as a flat white silhouette: every fill / stroke colour becomes white (fill="none"
 * stays none). Masks and clip paths are left as they are: they are luminance / geometry, and
 * a cut-out (a black shape in a mask) must stay a cut-out.
 */
function whiten(s) {
  const KEEP = /<(mask|clipPath)\b[\s\S]*?<\/\1>/g
  const paint = (part) =>
    part.replace(/\b(fill|stroke)\s*=\s*(["'])(?!none\2)[^"']*\2/g, '$1=$2#fff$2').replace(/\b(fill|stroke)\s*:\s*(?!none\b)[^;"']+/g, '$1:#fff')
  let outp = '',
    last = 0
  for (const m of s.matchAll(KEEP)) {
    outp += paint(s.slice(last, m.index)) + m[0]
    last = m.index + m[0].length
  }
  outp += paint(s.slice(last))
  // Shapes with no fill of their own inherit from the root: make that white too.
  return outp.replace(/<svg\b(?![^>]*\bfill=)/, '<svg fill="#fff"')
}
const whiteMark = whiten(markOnly)

// --- Colours -----------------------------------------------------------------------------

// The Apple icon is flattened on the brand's 700 step (it has no alpha), read from the default accent
// in src/index.css so it follows the brand if the palette ever moves; ICON_BG=#rrggbb overrides it.
async function brand700() {
  if (process.env.ICON_BG) return process.env.ICON_BG
  try {
    const css = await read('../src/index.css')
    const m = css.match(/@theme static\s*\{[^}]*?--color-brand-700:\s*([^;]+);/s)
    if (m) return m[1].trim()
  } catch {
    /* fall through */
  }
  return '#6d28d9'
}

// --- Rendering helpers --------------------------------------------------------------------

const render = (s, size) => sharp(Buffer.from(s), { density: 72 * Math.max(1, size / 512) }).resize(size, size)

/**
 * Rasterises `s` at a high resolution, trims the transparent margin and scales the result so
 * that the mark's bounding box fits a circle of `fit` px across: that circle is what every mask
 * shape keeps, so nothing is clipped whatever the mark's outline. Returns a centred `size` canvas.
 */
async function fitMark(s, size, fit, background = { r: 0, g: 0, b: 0, alpha: 0 }, by = 'diagonal') {
  const big = await render(s, 2048).png().toBuffer()
  const { data, info } = await sharp(big)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .png()
    .toBuffer({ resolveWithObject: true })
  // 'diagonal' keeps any outline inside a circle of `fit`; 'width' sizes the larger side to `fit`.
  const scale = fit / (by === 'width' ? Math.max(info.width, info.height) : Math.hypot(info.width, info.height))
  const w = Math.max(1, Math.round(info.width * scale)),
    h = Math.max(1, Math.round(info.height * scale))
  const mark = await sharp(data).resize(w, h, { fit: 'fill' }).png().toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
}

// --- Outputs ------------------------------------------------------------------------------

await render(svg, 192).png().toFile(out('pwa-192.png'))
await render(svg, 512).png().toFile(out('pwa-512.png'))

// Maskable: Android fills its shape (circle, squircle, rounded square) with this image and shows
// roughly the middle 66-80% of it, so the gradient runs to every edge (no flat square behind a
// rounded tile, which is what looked like a box) and the mark sits well inside the 80% safe circle.
// MASKABLE_MARK is the mark's width as a share of the icon: 0.46 reads like the iOS icon (0.66 of a
// tile that iOS shows whole) once the launcher has cut its shape, and clears the tightest crop.
const MASKABLE_MARK = 0.46
const field = await brand700()
const fieldPng = await render(fieldOnly, 512).png().toBuffer()
const maskMark = await (await fitMark(markOnly, 512, 512 * MASKABLE_MARK, undefined, 'width')).toBuffer()
await sharp(fieldPng)
  .composite([{ input: maskMark }])
  .png()
  .toFile(out('pwa-maskable-512.png'))

// Apple: iOS masks the corners itself and dislikes alpha, so flatten on the tile's own colour.
await render(squareTile, 180).flatten({ background: field }).png().toFile(out('apple-touch-icon.png'))

// Monochrome: white on transparent. The badge fills most of its 96 px (status-bar glyphs are tiny);
// the 512 version keeps the same margin Android expects of a maskable icon.
await (await fitMark(whiteMark, 96, 96 * 0.92)).toFile(out('badge-96.png'))
await (await fitMark(whiteMark, 512, 512 * 0.8)).toFile(out('pwa-mono-512.png'))

console.log(`Icons generated from public/favicon.svg (apple field ${field})`)
