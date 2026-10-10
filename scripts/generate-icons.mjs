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
//   icons/<accent>/               pwa-192, pwa-512, pwa-maskable-512 and apple-touch-icon again for every
//                                 accent but the default, tinted with its brand-600 → duo-600 (the tab
//                                 icon's runtime tint) on a brand-700 field. The app points its manifest
//                                 and Apple icon links at them, so an install takes the accent's colours.
import sharp from 'sharp'
import { mkdir, readFile } from 'node:fs/promises'

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8')
const out = (f) => new URL(`../public/${f}`, import.meta.url).pathname

const svg = await read('../public/favicon.svg')
if (!/<svg\b/.test(svg)) throw new Error('public/favicon.svg is not an SVG')

// --- The mark, as strings -----------------------------------------------------------------

// The background rect: the first self-closing <rect …/> with an rx attribute after <defs>
// (a rect inside a <mask> or <clipPath> in the defs is part of the mark, not the background).
const defsEnd = svg.indexOf('</defs>')
const head = defsEnd >= 0 ? svg.slice(0, defsEnd + '</defs>'.length) : ''
const body = svg.slice(head.length)
const RECT = /<rect\b[^>]*\brx\s*=\s*(["'])[^"']*\1[^>]*\/>\s*/
if (!RECT.test(body)) throw new Error('favicon.svg must have a <rect … rx="…"/> background (after <defs>) before the mark')

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

/** The SVG split at the end of <defs>: everything before (gradients) and the shapes after. */
function split(s) {
  const end = s.indexOf('</defs>')
  const h = end >= 0 ? s.slice(0, end + '</defs>'.length) : ''
  return { head: h, body: s.slice(h.length) }
}

/** The SVG with its first two gradient stops recoloured (src/lib/accent.ts tintIconSvg does the same for the tab icon). */
function tint(s, from, to) {
  const colours = [from, to]
  let i = 0
  const res = s.replace(/(<stop\b[^>]*?\bstop-color\s*=\s*)(["'])[^"']*\2/g, (m, pre, q) => (i < 2 ? `${pre}${q}${colours[i++]}${q}` : m))
  if (i !== 2) throw new Error('favicon.svg needs two gradient stops to tint')
  return res
}

/** A CSS colour as #rrggbb: hex passes through, oklch(L% C h) is converted (clipped to sRGB). */
function toHex(v) {
  v = v.trim()
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase()
  const m = v.match(/^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+|none)\)$/)
  if (!m) throw new Error(`cannot convert ${v}`)
  const L = +m[1] / 100,
    C = +m[2],
    h = m[3] === 'none' ? 0 : (+m[3] * Math.PI) / 180
  const a = C * Math.cos(h),
    b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ]
  const gam = (x) => {
    x = Math.min(1, Math.max(0, x))
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
  }
  return `#${lin
    .map((x) =>
      Math.round(gam(x) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
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

// The four coloured outputs for one tint of the source, written as `<prefix>pwa-192.png` and so on.
const MASKABLE_MARK = 0.46
async function colourIcons(src, field, prefix = '') {
  const { head: h, body: b } = split(src)
  // Square corners (rx / ry of the background rect → 0), and the background alone, square: what
  // fills an Android adaptive icon edge to edge.
  const squareBody = b.replace(RECT, (rect) => rect.replace(/\b(rx|ry)\s*=\s*(["'])[^"']*\2/g, '$1=$2' + '0$2'))
  const square = h + squareBody
  const fieldSvg = h + squareBody.replace(/(<rect\b[^>]*\/>)[\s\S]*(<\/svg>)/, '$1$2')
  await render(src, 192)
    .png()
    .toFile(out(`${prefix}pwa-192.png`))
  await render(src, 512)
    .png()
    .toFile(out(`${prefix}pwa-512.png`))

  // Maskable: Android fills its shape (circle, squircle, rounded square) with this image and shows
  // roughly the middle 66-80% of it, so the gradient runs to every edge (no flat square behind a
  // rounded tile, which is what looked like a box) and the mark sits well inside the 80% safe circle.
  // MASKABLE_MARK is the mark's width as a share of the icon: 0.46 reads like the iOS icon (0.66 of a
  // tile that iOS shows whole) once the launcher has cut its shape, and clears the tightest crop.
  const fieldPng = await render(fieldSvg, 512).png().toBuffer()
  const maskMark = await (await fitMark(markOnly, 512, 512 * MASKABLE_MARK, undefined, 'width')).toBuffer()
  await sharp(fieldPng)
    .composite([{ input: maskMark }])
    .png()
    .toFile(out(`${prefix}pwa-maskable-512.png`))

  // Apple: iOS masks the corners itself and dislikes alpha, so flatten on the tile's own colour.
  await render(square, 180)
    .flatten({ background: field })
    .png()
    .toFile(out(`${prefix}apple-touch-icon.png`))
}

const field = await brand700()
await colourIcons(svg, field)

// Monochrome: white on transparent. The badge fills most of its 96 px (status-bar glyphs are tiny);
// the 512 version keeps the same margin Android expects of a maskable icon.
await (await fitMark(whiteMark, 96, 96 * 0.92)).toFile(out('badge-96.png'))
await (await fitMark(whiteMark, 512, 512 * 0.8)).toFile(out('pwa-mono-512.png'))

// --- Per-accent install icons -------------------------------------------------------------
// Each accent's brand-600 / duo-600 / brand-700 from src/index.css, converted to hex (sharp's SVG
// renderer does not read oklch()).
const css = await read('../src/index.css')
const accentIds = [...css.matchAll(/&\[data-accent='([a-z]+)'\]\s*\{/g)].map((m) => m[1])
for (const id of accentIds) {
  const block = css.match(new RegExp(`&\\[data-accent='${id}'\\]\\s*\\{([^}]*)\\}`))[1]
  const step = (name) => {
    const v = block.match(new RegExp(`--color-${name}:\\s*([^;]+);`))?.[1]
    if (!v) throw new Error(`${id}: no --color-${name}`)
    return toHex(v)
  }
  const tinted = tint(svg, step('brand-600'), step('duo-600'))
  await mkdir(out(`icons/${id}`), { recursive: true })
  await colourIcons(tinted, step('brand-700'), `icons/${id}/`)
}

console.log(`Icons generated from public/favicon.svg (apple field ${field}; accents ${accentIds.join(', ')})`)
