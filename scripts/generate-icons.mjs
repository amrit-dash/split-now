// Generates PWA / Apple icons from public/favicon.svg. Run: npm run icons
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url))
const out = (f) => new URL(`../public/${f}`, import.meta.url).pathname

await sharp(svg).resize(192, 192).png().toFile(out('pwa-192.png'))
await sharp(svg).resize(512, 512).png().toFile(out('pwa-512.png'))

// Maskable: full-bleed background with the glyph inside the 80% safe zone.
const square = Buffer.from(String(svg).replace('rx="112"', 'rx="0"'))
const glyph = await sharp(square).resize(400, 400).png().toBuffer()
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#7c3aed' } })
  .composite([{ input: glyph, gravity: 'center' }])
  .png()
  .toFile(out('pwa-maskable-512.png'))

// Apple touch icon: no transparency, iOS applies its own corner mask.
await sharp(square).resize(180, 180).flatten({ background: '#7c3aed' }).png().toFile(out('apple-touch-icon.png'))
console.log('Icons generated')
