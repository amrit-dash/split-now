// The repository's social preview (Settings → General → Social preview), 1280×640, from the app icon.
// Run: node scripts/social-preview.mjs → docs/assets/social-preview.png, then upload it in the repo settings.
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
const logo = readFileSync('public/favicon.svg', 'utf8').replace('<svg ', '<svg x="120" y="200" width="240" height="240" ')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640">
<defs>
 <radialGradient id="glow" cx="0.2" cy="0.5" r="0.6"><stop offset="0" stop-color="#7c3aed" stop-opacity="0.45"/><stop offset="1" stop-color="#7c3aed" stop-opacity="0"/></radialGradient>
 <radialGradient id="glow2" cx="0.95" cy="1" r="0.55"><stop offset="0" stop-color="#db2777" stop-opacity="0.28"/><stop offset="1" stop-color="#db2777" stop-opacity="0"/></radialGradient>
 <linearGradient id="t" x1="0" x2="1"><stop offset="0" stop-color="#c4b5fd"/><stop offset="1" stop-color="#f9a8d4"/></linearGradient>
</defs>
<rect width="1280" height="640" fill="#0b0a14"/>
<rect width="1280" height="640" fill="url(#glow)"/>
<rect width="1280" height="640" fill="url(#glow2)"/>
${logo}
<g font-family="Inter, sans-serif">
 <text x="430" y="300" font-size="112" font-weight="800" fill="#fff" letter-spacing="-3">Split Now</text>
 <text x="434" y="372" font-size="40" font-weight="500" fill="#cbd5e1">Spending is wise, splitting is free.</text>
 <text x="434" y="430" font-size="40" font-weight="700" fill="url(#t)">Split Now!</text>
 <text x="434" y="520" font-size="26" font-weight="500" fill="#94a3b8">Free, open-source bill splitting · scan receipts · settle up over UPI</text>
</g></svg>`
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile('docs/assets/social-preview.png')
