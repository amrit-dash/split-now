// Regenerates the README and link-preview media from the running app in demo mode:
//   docs/assets/screens/*.png      the phone screenshots in the README grid (360×779)
//   docs/assets/hero.png           the README banner (1600×860)
//   docs/assets/social-preview.png GitHub's social preview (1280×640; upload it in Settings → General)
//   public/og-image.jpg            the link preview index.html points at (1200×630)
//   docs/assets/demo.svg           the animated demo, vector, with names and amounts read from the app
//
// Run: npm run readme:media                 starts `vite --mode e2e` on a free port, then stops it
//      npm run readme:media -- --url http://127.0.0.1:5173   uses a server that is already running (demo mode)
//      npm run readme:media -- --port 5341                    starts vite on this port instead of a free one
//      npm run readme:media -- --only dark-home,hero          just these outputs (screen names, hero, social, og, demo)
//
// Needs a Chromium for Playwright (E2E_CHROMIUM, default /opt/pw-browsers/chromium; locally
// `npx playwright install chromium` and E2E_CHROMIUM=$(node -e "console.log(require('playwright').chromium.executablePath())")).
// Nothing here is built or deployed; it only writes the files.
//
// Stability: the clock is fixed to a Thursday morning in October 2026 (the demo seeds dates relative
// to "today"), Math.random is seeded so the card's drifting shapes start from the same place, and every
// still waits until the page's text stops changing (the count-up numbers) before it is taken.
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'

const ROOT = new URL('..', import.meta.url).pathname
const ASSETS = join(ROOT, 'docs/assets')
const SCREENS = join(ASSETS, 'screens')

const argv = process.argv.slice(2)
const arg = (name) => {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (i < 0) return undefined
  return argv[i].includes('=') ? argv[i].slice(argv[i].indexOf('=') + 1) : argv[i + 1]
}
const only = arg('only')?.split(',').filter(Boolean)
const want = (name) => !only || only.includes(name)

/** The phone: 360×779 CSS px (the README size), drawn at 2× and downscaled for crisp text. */
const W = 360
const H = 779
const SCALE = 2
/** Corner radius of the phone screen in the PNGs (transparent outside), at 1×. */
const RADIUS = 30
/** The fixed "now": a Thursday morning, so the greeting and the demo's relative dates never drift. */
const NOW = new Date('2026-10-08T09:30:00+05:30')

// --- Server ---------------------------------------------------------------------------------

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (s.address())
      s.close(() => resolve(port))
    })
  })
}

async function startServer() {
  const port = arg('port') ? Number(arg('port')) : await freePort()
  const url = `http://127.0.0.1:${port}`
  // Same env as playwright.config.ts: empty Firebase keys mean the demo (localStorage) repo, whatever .env.local says.
  const env = {
    ...process.env,
    VITE_FIREBASE_API_KEY: '',
    VITE_FIREBASE_PROJECT_ID: '',
    VITE_FIREBASE_APP_ID: '',
    VITE_USE_EMULATORS: 'false',
    VITE_APPCHECK_SITE_KEY: '',
  }
  const child = spawn('npx', ['vite', '--mode', 'e2e', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: ROOT,
    env,
    stdio: 'ignore',
    detached: true,
  })
  const deadline = Date.now() + 90_000
  for (;;) {
    try {
      if ((await fetch(url)).ok) break
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`vite did not start on ${url}`)
    await new Promise((r) => setTimeout(r, 300))
  }
  // detached + negative pid: stop npx and the vite it started together.
  return { url, stop: () => child.pid && process.kill(-child.pid, 'SIGTERM') }
}

// --- Page helpers ---------------------------------------------------------------------------

/**
 * Before any app code runs: a seeded Math.random (stable drifting shapes), the theme and the default
 * violet accent (src/lib/theme.ts, src/lib/accent.ts), and a style that hides what never belongs in
 * a README still: focus rings, the text caret, toasts, the install and update banners.
 */
function initScript({ theme }) {
  let s = 0x5eed
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  try {
    localStorage.setItem('splitit-theme', theme)
    localStorage.setItem('splitit-accent', 'violet')
    localStorage.removeItem('splitit-ink')
    localStorage.removeItem('splitit-duo')
  } catch {
    /* storage blocked: the app falls back to its defaults */
  }
  const css = `
    *, *::before, *::after { caret-color: transparent !important; }
    *:focus, *:focus-visible { outline: none !important; --tw-ring-shadow: 0 0 #0000 !important; }
    .toast-stack, .install-banner, [data-testid='update-banner'], [data-testid='offline-pill'] { display: none !important; }
    ::-webkit-scrollbar { display: none; }
  `
  const add = () => {
    const el = document.createElement('style')
    el.textContent = css
    document.head.appendChild(el)
  }
  if (document.head) add()
  else document.addEventListener('DOMContentLoaded', add)
}

async function newPhone(browser, { theme }) {
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: SCALE,
    isMobile: true,
    hasTouch: true,
    colorScheme: theme,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    reducedMotion: 'no-preference',
  })
  await context.addInitScript(initScript, { theme })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.warn(`  page error: ${e.message}`))
  await page.clock.install({ time: NOW })
  return { context, page }
}

/** Until the page's text has not changed for `quiet` ms: count-ups finished, lazy chunks in, fonts loaded. */
async function settle(page, { quiet = 700, max = 8000, extra = 300 } = {}) {
  await page.evaluate(() => document.fonts.ready)
  const start = Date.now()
  let last = ''
  let since = Date.now()
  while (Date.now() - start < max) {
    const text = await page.evaluate(() => document.body.innerText)
    if (text !== last) {
      last = text
      since = Date.now()
    } else if (Date.now() - since >= quiet) break
    await page.waitForTimeout(100)
  }
  await page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur?.())
  await page.mouse.move(-10, -10).catch(() => {})
  await page.waitForTimeout(extra)
}

/** The phone screen as a PNG at 1×, with rounded corners (transparent outside), like a device frame without the frame. */
async function phonePng(buf) {
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="${RADIUS}" ry="${RADIUS}"/></svg>`,
  )
  return sharp(buf)
    .resize(W, H, { kernel: 'lanczos3' })
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png({ compressionLevel: 9, palette: false })
    .toBuffer()
}

/** Raw 2× captures, kept for the banners (which want the sharper pixels). */
const raw = new Map()
/** What the animated demo shows, read from the app (see demoData). */
let demo

async function shot(page, name) {
  const buf = await page.screenshot({ type: 'png', animations: 'allow' })
  raw.set(name, buf)
  if (!want(name)) return
  const out = join(SCREENS, `${name}.png`)
  await writeFile(out, await phonePng(buf))
  console.log(`  wrote ${out.replace(ROOT, '')}`)
}

async function signIn(page, url) {
  await page.goto(url)
  await page.getByTestId('demo-name').fill('Amrit')
  await page.getByTestId('demo-start').click()
  await page.getByTestId('home-greeting').waitFor()
  // The demo seeds a nudge from Meera; it is a real card, but on Home it pushes the balance card and
  // the groups half off the screen, and Balances already shows Remind and Nudge.
  const dismiss = page.getByTestId('nudge-card').getByTestId('nudge-dismiss')
  if (await dismiss.count()) {
    await dismiss.first().click()
    await page.getByTestId('nudge-card').waitFor({ state: 'detached' })
  }
}

/** Open the group's Balances tab with the graph open; returns the graph section. */
async function openGraph(page, url) {
  await page.goto(`${url}/groups/g_goa`)
  await page.getByTestId('group-tabs').getByRole('radio', { name: 'Balances' }).click()
  const graph = page.getByTestId('group-graph')
  await graph.waitFor()
  if ((await graph.getAttribute('data-open')) === null) await graph.getByRole('button', { name: /Show as a graph/ }).click()
  return graph
}

/** Scroll so the graph drawing (the biggest SVG in the section) ends just above the tab bar. */
async function scrollGraphIntoView(graph) {
  await graph.evaluate((el, bottom) => {
    const svgs = [...el.querySelectorAll('svg')]
    const area = (s) => s.getBoundingClientRect().width * s.getBoundingClientRect().height
    const big = svgs.sort((a, b) => area(b) - area(a))[0] ?? el
    window.scrollTo({ top: big.getBoundingClientRect().bottom + window.scrollY - bottom, behavior: 'instant' })
  }, H - 124)
  await graph.page().waitForTimeout(150)
}

// --- The stills -----------------------------------------------------------------------------

async function darkScreens(browser, url) {
  const { context, page } = await newPhone(browser, { theme: 'dark' })

  console.log('dark-login')
  await page.goto(url)
  await page.getByTestId('demo-name').waitFor()
  await settle(page)
  await shot(page, 'dark-login')

  await signIn(page, url)

  console.log('dark-home')
  await settle(page, { extra: 2600 }) // let the cheque be signed once
  await shot(page, 'dark-home')

  console.log('dark-create')
  await page.getByTestId('nav-create').click()
  const sheet = page.getByRole('dialog')
  await sheet.getByTestId('create-quick-add').getByRole('textbox', { name: 'Quick add' }).fill('Dinner 1800 with Rohan and Priya')
  await settle(page, { extra: 500 })
  await shot(page, 'dark-create')
  await page.keyboard.press('Escape')

  console.log('dark-add')
  await page.goto(`${url}/add?group=g_goa`)
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Dinner at Thalassa')
  await page.getByLabel('Amount', { exact: true }).or(page.getByPlaceholder('0.00')).first().fill('2400')
  await settle(page)
  await shot(page, 'dark-add')

  console.log('dark-graph')
  const graph = await openGraph(page, url)
  await page.waitForTimeout(400) // the section's open transition
  await scrollGraphIntoView(graph)
  await settle(page, { extra: 1500 })
  await shot(page, 'dark-graph')

  console.log('dark-balances')
  await page.goto(`${url}/settle`)
  await page.getByTestId('settle-all').waitFor()
  await settle(page)
  await shot(page, 'dark-balances')

  console.log('dark-settle')
  // You owe Meera for the Coldplay tickets. She has no payment details in the demo, so type a UPI ID
  // (as you would after asking her) and show the UPI card with its QR code and app buttons.
  await page.goto(`${url}/groups/g_gig/settle?from=me&to=p_meera`)
  await page.getByTestId('settle-record').waitFor()
  await page.getByTestId('manual-upi').fill('meera@okicici')
  const upi = page.getByTestId('upi-card').first()
  await upi.waitFor()
  await upi.evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 150, behavior: 'instant' }))
  await settle(page)
  await shot(page, 'dark-settle')

  console.log('dark-insights')
  await page.goto(`${url}/insights`)
  await page.getByRole('heading', { level: 1 }).waitFor()
  await settle(page, { quiet: 1200, extra: 1200 })
  await shot(page, 'dark-insights')

  console.log('dark-split')
  await page.goto(`${url}/split`)
  await page.getByRole('heading', { level: 1 }).waitFor()
  await settle(page)
  await shot(page, 'dark-split')

  console.log('dark-scan')
  await page.goto(`${url}/scan`)
  await page.getByRole('heading', { level: 1 }).waitFor()
  await settle(page)
  await shot(page, 'dark-scan')

  console.log('dark-members')
  await page.goto(`${url}/groups/g_goa/members`)
  await page.getByTestId('members-list').waitFor()
  await settle(page)
  await shot(page, 'dark-members')

  if (want('demo')) {
    console.log('demo data')
    demo = await demoData(page, url)
  }
  await context.close()
}

async function lightScreens(browser, url) {
  const { context, page } = await newPhone(browser, { theme: 'light' })
  console.log('light-home')
  await signIn(page, url)
  await settle(page, { extra: 2600 })
  await shot(page, 'light-home')
  await context.close()
}

// --- Banners: hero, GitHub social preview, link preview --------------------------------------

/**
 * One composition, three sizes: the icon, name, tagline and feature lines on the left, three tilted
 * phones (light Home, the dark settle-up graph, dark Insights) on the right, drawn as an HTML page
 * with CSS 3D transforms and screenshotted. `text` and `phones` scale the two halves; x/y place them.
 * The social preview keeps everything 40px inside its edges (GitHub crops toward the centre).
 */
const BANNERS = [
  { name: 'hero', file: join(ASSETS, 'hero.png'), w: 1600, h: 860, text: 1, tx: 100, ty: 190, phones: 1, px: 684, py: 0 },
  { name: 'social', file: join(ASSETS, 'social-preview.png'), w: 1280, h: 640, text: 0.82, tx: 72, ty: 118, phones: 0.78, px: 520, py: -40 },
  // The link preview stays text-only (the owner's call): chat apps show it small, where three
  // phones turn to noise and the name and tagline are what should read.
  { name: 'og', file: join(ROOT, 'public/og-image.jpg'), w: 1200, h: 630, textOnly: true },
]

/** The text-only card: the app icon, name, tagline and one feature line on the dark ink background. */
function textCardHtml(b, icon, font) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: 'Inter'; src: url('file://${font}') format('woff2'); font-weight: 100 900; }
    html, body { margin: 0; width: ${b.w}px; height: ${b.h}px; overflow: hidden; }
    body {
      font-family: Inter, sans-serif; color: #fff; display: flex; align-items: center; gap: 64px; padding: 0 96px; box-sizing: border-box;
      background:
        radial-gradient(${b.w * 0.6}px ${b.h * 0.9}px at 20% 50%, rgba(124, 58, 237, 0.45), transparent 70%),
        radial-gradient(${b.w * 0.55}px ${b.h * 0.8}px at 95% 100%, rgba(219, 39, 119, 0.28), transparent 70%),
        #0b0a14;
    }
    .icon { width: 230px; height: 230px; flex: none; }
    .icon svg { width: 100%; height: 100%; display: block; }
    h1 { font-size: 104px; font-weight: 800; letter-spacing: -0.03em; margin: 0 0 22px; line-height: 1; white-space: nowrap; }
    .tag { font-size: 38px; font-weight: 500; color: #cbd5e1; margin: 0; line-height: 1.3; }
    .tag b { font-weight: 700; background: linear-gradient(90deg, #c4b5fd, #f9a8d4); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .line { font-size: 25px; font-weight: 500; color: #94a3b8; margin: 34px 0 0; white-space: nowrap; }
  </style></head><body>
    <div class="icon">${icon}</div>
    <div>
      <h1>Split Now</h1>
      <p class="tag">Spending is wise, splitting is free.<br><b>Split Now!</b></p>
      <p class="line">Free and open source · scan bills · settle up over UPI</p>
    </div>
  </body></html>`
}

async function banner(browser, b) {
  const icon = readFileSync(join(ROOT, 'public/favicon.svg'), 'utf8')
  const font = join(ROOT, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')
  const img = (name) => `data:image/png;base64,${raw.get(name).toString('base64')}`
  const html = b.textOnly
    ? textCardHtml(b, icon, font)
    : `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: 'Inter'; src: url('file://${font}') format('woff2'); font-weight: 100 900; }
    html, body { margin: 0; width: ${b.w}px; height: ${b.h}px; overflow: hidden; }
    body {
      font-family: Inter, sans-serif; color: #fff; position: relative;
      background:
        radial-gradient(${b.w * 0.56}px ${b.h * 0.7}px at 0% 100%, rgba(192, 38, 211, 0.45), transparent 70%),
        radial-gradient(${b.w * 0.56}px ${b.h * 0.8}px at 100% 0%, rgba(124, 58, 237, 0.55), transparent 70%),
        linear-gradient(120deg, #3b0764 0%, #4c1d95 45%, #2e1065 100%);
    }
    .copy { position: absolute; left: ${b.tx}px; top: ${b.ty}px; --k: ${b.text}; }
    .icon { width: calc(var(--k) * 112px); height: calc(var(--k) * 112px); }
    .icon svg { width: 100%; height: 100%; display: block; }
    h1 { font-size: calc(var(--k) * 92px); font-weight: 800; letter-spacing: -0.02em; margin: calc(var(--k) * 34px) 0 calc(var(--k) * 18px); line-height: 1; white-space: nowrap; }
    .tag { font-size: calc(var(--k) * 38px); font-weight: 700; line-height: 1.26; margin: 0 0 calc(var(--k) * 34px);
      background: linear-gradient(90deg, #f0abfc, #e9d5ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .lines { font-size: calc(var(--k) * 24px); font-weight: 500; line-height: 1.42; color: #e9d5ff; opacity: 0.92; white-space: nowrap; }
    .stage { position: absolute; left: ${b.px}px; top: ${b.py}px; width: 880px; height: 860px; transform: scale(${b.phones}); transform-origin: 0 0; }
    .persp { position: absolute; inset: 0; perspective: 2200px; }
    .phone { position: absolute; width: 280px; height: 606px; border-radius: 40px; padding: 9px;
      background: linear-gradient(145deg, #3f3a52, #15131f 60%);
      box-shadow: 0 40px 80px -20px rgba(10, 0, 30, 0.75), 0 0 0 1.5px rgba(255, 255, 255, 0.12) inset; }
    .phone img { width: 100%; height: 100%; border-radius: 32px; display: block; object-fit: cover; }
    .p1 { left: 24px; top: 150px; transform: rotateY(22deg) rotateZ(5deg) rotateX(4deg); z-index: 1; }
    .p2 { left: 300px; top: 112px; transform: rotateY(-4deg) translateZ(30px); z-index: 2; }
    .p3 { left: 574px; top: 150px; transform: rotateY(-22deg) rotateZ(-5deg) rotateX(4deg); z-index: 3; }
  </style></head><body>
    <div class="copy">
      <div class="icon">${icon}</div>
      <h1>Split Now</h1>
      <p class="tag">Spending is wise,<br>splitting is free.<br>Split Now!</p>
      <div class="lines">Free, open-source bill splitting<br>UPI settle-ups · bill scanning<br>Live table splits · optional AI</div>
    </div>
    <div class="stage"><div class="persp">
      <div class="phone p1"><img src="${img('light-home')}"></div>
      <div class="phone p2"><img src="${img('dark-graph')}"></div>
      <div class="phone p3"><img src="${img('dark-insights')}"></div>
    </div></div>
  </body></html>`
  const dir = await mkdtemp(join(tmpdir(), 'readme-banner-'))
  const file = join(dir, 'banner.html')
  await writeFile(file, html)
  const context = await browser.newContext({ viewport: { width: b.w, height: b.h }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.goto(`file://${file}`)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(200)
  const buf = await page.screenshot({ type: 'png' })
  await context.close()
  await rm(dir, { recursive: true, force: true })
  // The link preview is a JPEG on purpose (see index.html): the service worker precaches *.png.
  const image = sharp(buf).removeAlpha()
  await (b.file.endsWith('.jpg') ? image.jpeg({ quality: 86, mozjpeg: true }) : image.png({ compressionLevel: 9 })).toFile(b.file)
  console.log(`  wrote ${b.file.replace(ROOT, '')}`)
}

// --- Demo: an animated SVG -------------------------------------------------------------------

/**
 * What the animated demo shows, read from the demo app so the names and amounts match the screenshots:
 * Home's greeting, balance card, groups and latest activity, and the Goa trip's payments simplified
 * and original.
 */
async function demoData(page, url) {
  await page.goto(url)
  await page.getByTestId('home-greeting').waitFor()
  await settle(page)
  const home = await page.evaluate(() => {
    const text = (sel) => /** @type {HTMLElement} */ (document.querySelector(sel))?.innerText.trim() ?? ''
    const greet = text('[data-testid=home-greeting]').split('\n').filter(Boolean)
    // "You are owed ₹69,219.66. See who owes you": the amount, from the tile's label.
    const tiles = [...document.querySelectorAll('a[href="/settle"][aria-label^="You "]')].map(
      (a) => a.getAttribute('aria-label')?.match(/^You (?:are owed|owe) (.+?)\. See/)?.[1] ?? '',
    )
    const rows = [...document.querySelectorAll('a[href^="/groups/"]')].map((a) => /** @type {HTMLElement} */ (a).innerText.split('\n').filter((l) => l.trim()))
    return { part: greet[0], hello: greet[1], net: text('[data-testid=home-net]'), owed: tiles[0], owe: tiles[1], rows }
  })
  const groups = home.rows
    .filter((l) => l.some((x) => /^you (are owed|owe)$/.test(x)))
    .slice(0, 3)
    .map((l) => ({ emoji: l[0], name: l[1], label: l.find((x) => /^you (are owed|owe)$/.test(x)), amount: l[l.length - 1] }))
  const act = home.rows.find((l) => l.length === 3 && / · /.test(l[2]))
  const graph = await openGraph(page, url)
  await page.waitForTimeout(400)
  await settle(page)
  const payments = () =>
    graph.evaluate((el) =>
      [...el.querySelectorAll('ul[aria-label=Payments] li')].map((li) => {
        const l = /** @type {HTMLElement} */ (li).innerText.split('\n').filter((x) => x.trim())
        return { from: l[l.length - 3], to: l[l.length - 2], amount: l[l.length - 1] }
      }),
    )
  const simplified = await payments()
  const youGetBack = await graph.evaluate((el) => /** @type {HTMLElement} */ (el).innerText.match(/YOU GET BACK\s*\n\s*(\S+)/i)?.[1] ?? '')
  await graph.getByRole('radio', { name: /^Original/ }).click()
  await page.waitForTimeout(1500)
  const original = await payments()
  const group = await page.getByRole('heading', { level: 1 }).first().innerText()
  return {
    part: home.part,
    hello: home.hello,
    net: home.net,
    owed: home.owed,
    owe: home.owe,
    groups,
    activity: act && { icon: act[0], text: act[1], meta: act[2] },
    group,
    youGetBack,
    simplified,
    original,
  }
}

const esc = (t) =>
  String(t ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
const num = (money) => Number.parseFloat(String(money).replace(/[^\d.]/g, '')) || 0
const r1 = (n) => Math.round(n * 10) / 10

/**
 * The demo as a self-contained animated SVG (CSS keyframes plus one SMIL animateMotion): GitHub shows
 * README SVGs through <img>, which runs CSS and SMIL animation but no scripts and no external files.
 * One 12 s loop: Home with the card's drifting shapes and the cheque being signed, then the group's
 * settle-up graph, Simplified → Original → Simplified, and back to Home. Vector, so it stays sharp
 * at any size, with none of a GIF's banding.
 */
function demoSvg(d) {
  const W2 = 300
  const H2 = 650
  const SIG = 'M17.2 19.9 c0.7-2.3 1.9-2.8 2.2-0.7 c0.25 1.8 1 2 1.75 0.2 c0.7-1.7 1.5-1.9 2 0.2 c0.4 1.3 1.15 1.25 2.05-0.4'
  const sym = (d.youGetBack.match(/^[^\d]+/) ?? ['₹'])[0]
  const compact = (v) => {
    const a = Math.abs(v)
    const s = a >= 1000 ? `${(a / 1000).toFixed(1).replace(/\.0$/, '')}K` : `${Math.round(a)}`
    return `${v < 0 ? '−' : '+'}${sym}${s}`
  }

  // Nodes: you in the middle, everyone else (alphabetical, like the app's colours) round you.
  const others = [...new Set([...d.simplified, ...d.original].flatMap((p) => [p.from, p.to]))].filter((n) => n !== 'You').sort()
  const COLORS = ['#10b981', '#ec4899', '#f97316', '#0ea5e9', '#eab308', '#14b8a6']
  const C = { x: 150, y: 322 }
  const pos = { You: { ...C, color: 'url(#you)' } }
  others.forEach((n, i) => {
    const a = ((-150 + (360 * i) / others.length) * Math.PI) / 180
    pos[n] = { x: r1(C.x + 102 * Math.cos(a)), y: r1(C.y + 92 * Math.sin(a)), color: COLORS[i % COLORS.length] }
  })
  const net = new Map()
  for (const p of d.simplified) {
    net.set(p.to, (net.get(p.to) ?? 0) + num(p.amount))
    net.set(p.from, (net.get(p.from) ?? 0) - num(p.amount))
  }
  const max = Math.max(...[...d.simplified, ...d.original].map((p) => num(p.amount)))
  const edges = (list) =>
    list
      .map((p) => {
        const a = pos[p.from]
        const b = pos[p.to]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const len = Math.hypot(dx, dy)
        const ux = dx / len
        const uy = dy / len
        const ra = p.from === 'You' ? 25 : 19
        const rb = p.to === 'You' ? 25 : 19
        const sx = r1(a.x + ux * ra)
        const sy = r1(a.y + uy * ra)
        const ex = r1(b.x - ux * rb)
        const ey = r1(b.y - uy * rb)
        // A gentle bend away from the middle, so payments between two other people keep clear of you.
        const mx = (sx + ex) / 2
        const my = (sy + ey) / 2
        const out = (mx - C.x) * -uy + (my - C.y) * ux >= 0 ? 1 : -1
        const cx = r1(mx - uy * 12 * out)
        const cy = r1(my + ux * 12 * out)
        const tone = p.to === 'You' ? '#34d399' : p.from === 'You' ? '#fb7185' : '#a5a1c4'
        const w = r1(1.6 + (5 * num(p.amount)) / max)
        const path = `M${sx} ${sy}Q${cx} ${cy} ${ex} ${ey}`
        return `<path d="${path}" stroke="${tone}" stroke-width="${w}" opacity="${tone === '#a5a1c4' ? 0.22 : 0.3}"/><path class="flow" d="${path}" stroke="${tone}" stroke-width="${r1(w + 1.6)}"/>`
      })
      .join('')
  const rows = (list) =>
    list
      .map((p, i) => {
        const y = 484 + i * 17.5
        return `<text x="30" y="${y}" class="t11"><tspan class="${p.from === 'You' ? 'neg' : 'b'}">${esc(p.from)}</tspan><tspan class="mut"> → </tspan><tspan class="${p.to === 'You' ? 'pos' : 'b'}">${esc(p.to)}</tspan></text><text x="270" y="${y}" class="t11 b" text-anchor="end">${esc(p.amount)}</text>`
      })
      .join('')
  const node = (n) => {
    const p = pos[n]
    const me = n === 'You'
    const r = me ? 22 : 17
    const v = net.get(n) ?? 0
    // Your circle says "You" (your balance is the "You get back" line above). Everyone else's name
    // and balance, in words as the app's focus card puts it, sit on the outer side of their circle,
    // away from the payments.
    if (me)
      return `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${p.color}"/><text x="${p.x}" y="${r1(p.y + 4)}" class="t12 b" text-anchor="middle">You</text>`
    const sub = v < 0 ? `owes ${compact(v).slice(1)}` : v > 0 ? `gets ${compact(v).slice(1)}` : 'settled'
    const tone = v < 0 ? 'neg' : v > 0 ? 'pos' : 'mut'
    const y1 = p.y < C.y ? p.y - r - 18 : p.y + r + 13
    return `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${p.color}"/><text x="${p.x}" y="${r1(p.y + 5)}" class="t13 b" text-anchor="middle">${esc(n[0])}</text><text x="${p.x}" y="${r1(y1)}" class="t10 b" text-anchor="middle">${esc(n)}</text><text x="${p.x}" y="${r1(y1 + 12)}" class="t9 ${tone}" text-anchor="middle">${sub}</text>`
  }
  const groupRow = (g, i) => {
    const y = 316 + i * 60
    const tone = g.label === 'you owe' ? 'neg' : 'pos'
    return `${i ? `<path d="M22 ${y} H278" stroke="#ffffff" stroke-opacity="0.06"/>` : ''}<rect x="32" y="${y + 10}" width="40" height="40" rx="12" fill="#2a2342"/><text x="52" y="${y + 37}" class="t18" text-anchor="middle">${esc(g.emoji)}</text><text x="84" y="${y + 35}" class="t13 b">${esc(g.name.length > 15 ? `${g.name.slice(0, 14)}…` : g.name)}</text><text x="266" y="${y + 26}" class="t9 ${tone}" text-anchor="end">${esc(g.label)}</text><text x="266" y="${y + 42}" class="t13 b ${tone}" text-anchor="end">${esc(g.amount)}</text>`
  }
  // Lucide's icons (home, users, chart, user), 24-unit strokes.
  const ICON = {
    Home: '<path d="M3 10a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>',
    Groups: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    Insights: '<path d="M3 3v16a2 2 0 0 0 2 2h16M18 17V9M13 17V5M8 17v-3"/>',
    Profile: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  }
  const tab = (label, x, scene) => {
    const icon = (color, cls = '') =>
      `<g class="${cls}" transform="translate(${x - 9} 597) scale(0.75)" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[label]}</g><text x="${x}" y="630" class="t9 ${cls}" fill="${color}" text-anchor="middle">${label}</text>`
    return icon('#94a3b8') + (scene ? `<g class="${scene}">${icon('#c4b5fd')}</g>` : '')
  }
  const sOrig = d.original.length
  const sSimple = d.simplified.length

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W2}" height="${H2}" viewBox="0 0 ${W2} ${H2}" role="img" aria-label="Split Now: the Home balance card with drifting shapes and the cheque-signing settle icon, then a group's settle-up graph switching between simplified and original payments">
<!-- Generated by scripts/readme-media.mjs from the demo app (npm run readme:media). Do not edit by hand. -->
<style>
text{font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;fill:#f1f0f7}
.b{font-weight:700}.mut{fill:#94a3b8}.pos{fill:#34d399}.neg{fill:#fb7185}.on{fill:#fff}
.t9{font-size:9px}.t10{font-size:10px}.t11{font-size:11px}.t12{font-size:12px}.t13{font-size:13px}.t16{font-size:16px}.t18{font-size:18px}.t20{font-size:20px}.t22{font-size:22px}.t28{font-size:29px;font-weight:800;letter-spacing:-.02em}
.home,.graph,.nav-home,.nav-graph{animation:12s ease-in-out infinite}
.home,.nav-home{animation-name:home}.graph,.nav-graph{animation-name:graph}
@keyframes home{0%,40%{opacity:1;transform:none}44%,94%{opacity:0;transform:translateX(-22px)}98%,100%{opacity:1;transform:none}}
@keyframes graph{0%,40%{opacity:0;transform:translateX(22px)}44%,94%{opacity:1;transform:none}98%,100%{opacity:0;transform:translateX(22px)}}
.nav-home,.nav-graph{transform:none!important}
.blob{transform-box:fill-box;transform-origin:center;animation:ease-in-out infinite}
.b1{animation:d1 12s ease-in-out infinite}.b2{animation:d2 12s ease-in-out infinite}.b3{animation:d3 6s ease-in-out infinite}.b4{animation:d4 12s ease-in-out infinite}
@keyframes d1{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(46px,18px) scale(1.15)}66%{transform:translate(18px,42px) scale(.92)}}
@keyframes d2{0%,100%{transform:translate(0,0) scale(1)}40%{transform:translate(-52px,-22px) scale(1.12)}75%{transform:translate(-14px,-40px) scale(.95)}}
@keyframes d3{0%,100%{transform:translate(0,0)}50%{transform:translate(-26px,16px)}}
@keyframes d4{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(38px,-26px) scale(1.2)}}
.ink{stroke-dasharray:1;stroke-dashoffset:1;animation:sign 12s linear infinite}
@keyframes sign{0%,6%{stroke-dashoffset:1}17%,40%{stroke-dashoffset:0}44%,100%{stroke-dashoffset:1}}
.pen{opacity:0;animation:pen 12s linear infinite}
@keyframes pen{0%,4%{opacity:0}6%,17%{opacity:1}20%,100%{opacity:0}}
.flow{fill:none;stroke-linecap:round;stroke-dasharray:.1 9;animation:flow .8s linear infinite}
@keyframes flow{to{stroke-dashoffset:-9.1}}
.simple,.orig,.knob,.lo,.ls{animation:12s ease-in-out infinite}
.simple{animation-name:simple}.orig{animation-name:orig}.knob{animation-name:knob}.lo{animation-name:lo}.ls{animation-name:ls}
@keyframes simple{0%,62%{opacity:1}65%,84%{opacity:0}87%,100%{opacity:1}}
@keyframes orig{0%,62%{opacity:0}65%,84%{opacity:1}87%,100%{opacity:0}}
@keyframes knob{0%,62%{transform:translateX(0)}65%,84%{transform:translateX(-113px)}87%,100%{transform:translateX(0)}}
@keyframes lo{0%,62%{fill:#94a3b8}65%,84%{fill:#fff}87%,100%{fill:#94a3b8}}
@keyframes ls{0%,62%{fill:#fff}65%,84%{fill:#94a3b8}87%,100%{fill:#fff}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.graph,.nav-graph,.orig,.pen{opacity:0}.ink{stroke-dashoffset:0}}
</style>
<defs>
<linearGradient id="fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#c026d3"/></linearGradient>
<linearGradient id="you" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#6d28d9"/></linearGradient>
<linearGradient id="fab" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a855f7"/><stop offset="1" stop-color="#c026d3"/></linearGradient>
<radialGradient id="light"><stop offset="0" stop-color="#f5d0fe" stop-opacity=".55"/><stop offset="1" stop-color="#f5d0fe" stop-opacity="0"/></radialGradient>
<radialGradient id="dark"><stop offset="0" stop-color="#3b0764" stop-opacity=".6"/><stop offset="1" stop-color="#3b0764" stop-opacity="0"/></radialGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#a855f7" stop-opacity=".55"/><stop offset="1" stop-color="#a855f7" stop-opacity="0"/></radialGradient>
<clipPath id="screen"><rect x="7" y="7" width="286" height="636" rx="38"/></clipPath>
<clipPath id="card"><rect x="22" y="96" width="256" height="168" rx="26"/></clipPath>
</defs>
<rect width="300" height="650" rx="45" fill="#2a2638"/>
<rect x="1.5" y="1.5" width="297" height="647" rx="43.5" fill="none" stroke="#ffffff" stroke-opacity=".12"/>
<g clip-path="url(#screen)">
<rect x="7" y="7" width="286" height="636" fill="#0b0a14"/>

<g class="home">
<text x="26" y="48" class="t12 mut">${esc(d.part)}</text>
<text x="26" y="74" class="t22 b">${esc(d.hello)}</text>
<circle cx="256" cy="58" r="23" fill="none" stroke="#8b5cf6" stroke-opacity=".45" stroke-width="2"/>
<circle cx="256" cy="58" r="20" fill="url(#you)"/><text x="256" y="64" class="t16 b" text-anchor="middle">${esc(d.hello.replace(/^Hi,\s*/, '')[0] ?? 'A')}</text>
<rect x="22" y="96" width="256" height="168" rx="26" fill="url(#fill)"/>
<g clip-path="url(#card)">
<circle class="blob b1" cx="70" cy="120" r="90" fill="url(#light)"/>
<circle class="blob b2" cx="250" cy="250" r="110" fill="url(#dark)"/>
<circle class="blob b3" cx="220" cy="110" r="34" fill="#fff" fill-opacity=".08"/>
<circle class="blob b4" cx="60" cy="250" r="46" fill="#fff" fill-opacity=".07"/>
</g>
<text x="40" y="126" class="t12" fill-opacity=".9">Overall, you are owed</text>
<text x="40" y="160" class="t28">${esc(d.net)}</text>
<rect x="38" y="180" width="108" height="64" rx="16" fill="#fff" fill-opacity=".15"/>
<rect x="154" y="180" width="108" height="64" rx="16" fill="#fff" fill-opacity=".15"/>
<text x="50" y="203" class="t10" fill-opacity=".9">You are owed</text><text x="50" y="226" class="t13 b">${esc(d.owed)}</text>
<text x="166" y="203" class="t10" fill-opacity=".9">You owe</text><text x="166" y="226" class="t13 b">${esc(d.owe)}</text>
<g transform="translate(214 98) scale(1.45)" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
<rect x="3" y="7" width="25" height="16" rx="2.5" stroke-width="1.5"/>
<path d="M6 25.5h19" stroke-width="1.2" stroke-opacity=".6"/>
<text x="6.2" y="16" style="font-size:7px;font-weight:700;fill:#fff;stroke:none">${esc(sym)}</text>
<path d="M12 12.5h7M6 19.5h7" stroke-width="1.2" stroke-opacity=".7"/>
<path class="ink" d="${SIG}" pathLength="1" stroke-width="1.2"/>
<g class="pen"><g transform="rotate(35)"><path d="M0 0l-1.1-2.6h2.2z" fill="#fff" stroke="none"/><rect x="-1.2" y="-10.5" width="2.4" height="7.9" rx=".8" fill="#fff" stroke="none"/></g>
<animateMotion dur="12s" repeatCount="indefinite" path="${SIG}" keyPoints="0;0;1;1" keyTimes="0;0.06;0.17;1" calcMode="linear"/></g>
</g>
<text x="26" y="298" class="t16 b">Groups &amp; friends</text><text x="274" y="298" class="t12 b" fill="#c4b5fd" text-anchor="end">See all</text>
<rect x="22" y="312" width="256" height="${d.groups.length * 60 + 8}" rx="20" fill="#15131f"/>
${d.groups.map(groupRow).join('\n')}
${
  d.activity
    ? `<text x="26" y="${d.groups.length * 60 + 352}" class="t16 b">Recent activity</text>
<rect x="22" y="${d.groups.length * 60 + 364}" width="256" height="64" rx="20" fill="#15131f"/>
<text x="46" y="${d.groups.length * 60 + 401}" class="t16" text-anchor="middle">${esc(d.activity.icon)}</text>
<text x="66" y="${d.groups.length * 60 + 391}" class="t10">${esc(d.activity.text.length > 38 ? `${d.activity.text.slice(0, 37)}…` : d.activity.text)}</text>
<text x="66" y="${d.groups.length * 60 + 407}" class="t9 mut">${esc(d.activity.meta)}</text>`
    : ''
}
</g>

<g class="graph">
<path d="M30 40l-6 6 6 6" fill="none" stroke="#f1f0f7" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
<text x="44" y="53" class="t20 b">${esc(d.group)}</text>
<rect x="22" y="76" width="256" height="520" rx="22" fill="#15131f"/>
<text x="36" y="104" class="t13 b">Show as a graph</text>
<rect x="34" y="118" width="232" height="34" rx="12" fill="#0b0a14"/>
<rect class="knob" x="150" y="121" width="113" height="28" rx="10" fill="#2a2342"/>
<text x="93" y="139" class="t11 b lo" text-anchor="middle">Original (${sOrig})</text>
<text x="206" y="139" class="t11 b ls" text-anchor="middle">Simplified (${sSimple})</text>
<text x="36" y="180" class="t9 b mut" letter-spacing=".06em">YOU GET BACK</text>
<text x="36" y="203" class="t22 b pos">${esc(d.youGetBack)}</text>
<g fill="none">
<g class="simple">${edges(d.simplified)}</g>
<g class="orig">${edges(d.original)}</g>
</g>
${['You', ...others].map(node).join('\n')}
<path d="M34 466H266" stroke="#fff" stroke-opacity=".06"/>
<g class="simple">${rows(d.simplified)}</g>
<g class="orig">${rows(d.original)}</g>
</g>

<rect x="7" y="584" width="286" height="59" fill="#0f0d18"/>
<path d="M7 584.5H293" stroke="#fff" stroke-opacity=".07"/>
${tab('Home', 40, 'nav-home')}${tab('Groups', 95, 'nav-graph')}${tab('Insights', 205)}${tab('Profile', 260)}
<circle cx="150" cy="598" r="40" fill="url(#glow)"/>
<circle cx="150" cy="598" r="25" fill="url(#fab)"/>
<path d="M150 588v20M140 598h20" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
</g>
</svg>
`
}

// --- Main -----------------------------------------------------------------------------------

const server = arg('url') ? { url: arg('url').replace(/\/+$/, ''), stop: () => {} } : await startServer()
const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM || '/opt/pw-browsers/chromium' })
try {
  console.log(`Using ${server.url}`)
  const banners = BANNERS.filter((b) => want(b.name))
  const darkNames = [
    'dark-login',
    'dark-home',
    'dark-create',
    'dark-add',
    'dark-graph',
    'dark-balances',
    'dark-settle',
    'dark-insights',
    'dark-split',
    'dark-scan',
    'dark-members',
  ]
  if (darkNames.some(want) || banners.length || want('demo')) await darkScreens(browser, server.url)
  if (want('light-home') || banners.length) await lightScreens(browser, server.url)
  for (const b of banners) {
    console.log(b.name)
    await banner(browser, b)
  }
  if (want('demo')) {
    console.log('demo.svg')
    const out = join(ASSETS, 'demo.svg')
    await writeFile(out, demoSvg(demo))
    console.log(`  wrote ${out.replace(ROOT, '')}`)
  }
} finally {
  await browser.close()
  server.stop()
}
