// Regenerates Help's screenshots from the running app in demo mode:
//   public/help/<theme>/<accent>/<section>.webp   one clipped screenshot per section that has one, in
//                                                 every theme and accent, so it matches the person's app
//   src/lib/help-shots.json      each one's size and where its numbered markers go (fractions of the image)
//
// Run: npm run help:media                  starts `vite --mode e2e` on a free port, then stops it
//      npm run help:media -- --url http://127.0.0.1:5173   uses a demo server that is already running
//      npm run help:media -- --only add-expense,split-types   just these sections
//
// Each shot below opens a screen, sets it up, and names the parts each step is about (a marker per
// step number). The picture is cropped to those parts plus a margin, full width, so it shows the
// significant area and not the whole phone. Re-run it after UI changes those screens show; the
// unit test (src/lib/help.test.ts) checks every marker's step exists and every picture is there.
// Same stability as scripts/readme-media.mjs: a fixed clock, a seeded Math.random, toasts hidden.
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import sharp from 'sharp'

const ROOT = new URL('..', import.meta.url).pathname
// Every theme and accent the app offers, each accent with its default ink (the text colour on it),
// read from src/lib/accent.ts so a new accent is shot without editing this file.
const THEMES = ['light', 'dark']
const ACCENT_INKS = [...readFileSync(join(ROOT, 'src/lib/accent.ts'), 'utf8').matchAll(/\{ id: '([a-z]+)', label: '[^']+', ink: '(light|dark)'/g)].map((m) => ({
  id: m[1],
  ink: m[2],
}))
const OUT = join(ROOT, 'public/help')
const DATA = join(ROOT, 'src/lib/help-shots.json')

const argv = process.argv.slice(2)
const arg = (name) => {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (i < 0) return undefined
  return argv[i].includes('=') ? argv[i].slice(argv[i].indexOf('=') + 1) : argv[i + 1]
}
const only = arg('only')?.split(',').filter(Boolean)

/** A phone width, tall enough that a whole form fits without scrolling; drawn at 2× and saved at 1.5× (crisp, small). */
const W = 360
const H = 1600
const SCALE = 2
const SAVE = 1.5
const MARGIN = 16
const NOW = new Date('2026-10-08T09:30:00+05:30')

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })
}

async function startServer() {
  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
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
  return { url, stop: () => child.pid && process.kill(-child.pid, 'SIGTERM') }
}

function initScript() {
  let s = 0x5eed
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  try {
    localStorage.setItem('splitit-theme', 'light')
    localStorage.setItem('splitit-accent', 'violet')
    // Help's pictures show the whole app: steps cover Advanced-only features too (docs/SIMPLE_MODE.md).
    localStorage.setItem('splitnow-mode', 'advanced')
  } catch {
    /* storage blocked */
  }
  const css = `
    *, *::before, *::after { caret-color: transparent !important; }
    *:focus, *:focus-visible { outline: none !important; --tw-ring-shadow: 0 0 #0000 !important; }
    .toast-stack, .install-banner, [data-testid='update-banner'], [data-testid='offline-pill'], [data-testid='whats-new-banner'] { display: none !important; }
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

async function settle(page, { quiet = 600, max = 6000, extra = 250 } = {}) {
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
  await page.evaluate(() => document.activeElement?.blur?.())
  await page.mouse.move(-10, -10).catch(() => {})
  await page.waitForTimeout(extra)
}

const byId = (page, id) => page.getByTestId(id).first()

/*
 * The shots. `go` opens and sets up the screen; `marks` maps a step number (1-based, as Help numbers
 * them) to the part it's about; `within` crops to one element (a sheet) instead of the page.
 */
const SHOTS = [
  {
    id: 'create-group',
    go: async (page, url) => {
      await page.goto(`${url}/groups/new`)
      await page
        .getByRole('radiogroup', { name: 'What are you creating?' })
        .getByRole('radio', { name: /^Group/ })
        .click()
      await page.getByLabel('Name', { exact: true }).fill('Goa trip')
    },
    marks: (page) => ({
      2: page.getByRole('radiogroup', { name: 'What are you creating?' }),
      3: byId(page, 'group-icon'),
      4: byId(page, 'member-add'),
      5: byId(page, 'group-more'),
      6: byId(page, 'group-save'),
    }),
  },
  {
    id: 'add-expense',
    go: async (page, url) => {
      await page.goto(`${url}/add?group=g_goa`)
      await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Beach shack dinner')
      await page.getByLabel('Amount', { exact: true }).or(page.getByPlaceholder('0.00')).first().fill('4850')
    },
    marks: (page) => ({
      2: byId(page, 'group-picker'),
      3: page.getByRole('textbox', { name: 'Description', exact: true }),
      4: byId(page, 'amount-currency'),
      5: byId(page, 'payer-summary'),
      6: byId(page, 'split-summary'),
      7: byId(page, 'expense-save'),
    }),
  },
  {
    id: 'split-types',
    go: async (page, url) => {
      await page.goto(`${url}/add?group=g_goa`)
      await page.getByLabel('Amount', { exact: true }).or(page.getByPlaceholder('0.00')).first().fill('4850')
      await byId(page, 'split-summary').click()
      await byId(page, 'split-sheet').waitFor()
    },
    marks: (page) => {
      const sheet = byId(page, 'split-sheet')
      return {
        2: sheet.getByRole('radio', { name: /^Equally/ }),
        3: sheet.getByRole('radio', { name: /^Exact/ }),
        4: sheet.getByRole('radio', { name: /^By items/ }),
        6: byId(page, 'split-done'),
      }
    },
  },
  {
    id: 'settle-up-upi',
    go: async (page, url) => {
      await page.goto(`${url}/groups/g_gig/settle?from=me&to=p_meera`)
      // Meera has no payment details in the demo: type her UPI ID, as you would after asking, to show the QR card.
      await byId(page, 'settle-record').waitFor()
      await byId(page, 'manual-upi').fill('meera@okicici')
    },
    marks: (page) => ({ 2: page.getByText('Payer', { exact: true }).first(), 3: byId(page, 'upi-card'), 4: byId(page, 'settle-record') }),
  },
  {
    id: 'scan-receipt',
    go: async (page, url) => {
      await page.goto(`${url}/scan`)
    },
    marks: (page) => ({ 2: page.getByRole('button', { name: /Camera/ }).first() }),
  },
  {
    id: 'quick-add',
    go: async (page, url) => {
      await page.goto(url)
      await byId(page, 'nav-create').click()
      await byId(page, 'create-quick-add-input').fill('dinner 1200 with Rohan and Priya in Goa, I paid')
    },
    within: 'create-quick-add',
    marks: (page) => ({
      2: byId(page, 'create-quick-add-input'),
      // the group it goes into: the chip for a group named in the line, else the picker ("Into Goa Trip")
      3: byId(page, 'create-quick-add-group-chip')
        .or(byId(page, 'create-quick-add').getByRole('button', { name: /Into|Goa/ }))
        .first(),
      4: byId(page, 'create-quick-add-go'),
    }),
  },
  {
    id: 'icons-and-ai',
    go: async (page, url) => {
      await page.goto(`${url}/add?group=g_goa`)
      await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Ferry to Havelock')
      await byId(page, 'expense-icon').click({ button: 'right' })
      await byId(page, 'icon-sheet').waitFor()
      await byId(page, 'icon-search').fill('anchor')
      await byId(page, 'icon-ai-suggest').waitFor()
    },
    marks: (page) => ({ 3: byId(page, 'icon-search'), 4: byId(page, 'icon-ai-suggest'), 5: byId(page, 'icon-auto') }),
  },
  {
    id: 'insights',
    go: async (page, url) => {
      await page.goto(`${url}/insights`)
    },
    marks: (page) => ({ 2: byId(page, 'insight-filters') }),
  },
  {
    id: 'auto-capture-setup',
    go: async (page, url) => {
      await page.goto(`${url}/settings/auto-capture`)
    },
    marks: (page) => ({ 2: byId(page, 'capture-start-ios') }),
  },
  {
    id: 'private-groups-setup',
    go: async (page, url) => {
      await page.goto(`${url}/settings/vault`)
      // Private groups start off: the setup card shows once they're turned on.
      await page.getByTestId('vault-turn-on').or(page.getByTestId('vault-setup-status')).first().waitFor()
      if (await byId(page, 'vault-turn-on').isVisible()) await byId(page, 'vault-turn-on').click()
    },
    marks: (page) => ({ 2: byId(page, 'vault-line-passkey'), 3: byId(page, 'vault-universal-open') }),
  },
  {
    id: 'money-received',
    go: async (page, url) => {
      await page.goto(`${url}/add?group=g_goa`)
    },
    marks: (page) => ({ 1: byId(page, 'expense-kind').getByRole('radio', { name: /Money received/ }) }),
  },
  {
    id: 'receipt-photos',
    go: async (page, url) => {
      await page.goto(`${url}/add?group=g_goa`)
    },
    marks: (page) => ({ 1: byId(page, 'receipt-attach'), 2: byId(page, 'expense-save') }),
  },
  {
    id: 'help-guide',
    go: async (page, url) => {
      await page.goto(`${url}/help`)
    },
    marks: (page) => ({ 2: byId(page, 'help-search'), 3: byId(page, 'help-tabs') }),
  },
]

async function box(loc, { optional = false } = {}) {
  try {
    await loc.waitFor({ state: 'visible', timeout: optional ? 3000 : 8000 })
  } catch (e) {
    if (optional) return null
    throw e
  }
  return loc.boundingBox()
}

/** A crop shorter than this (CSS px) shows too little around a lone control. */
const MIN_CROP = 300

async function main() {
  const server = arg('url') ? { url: arg('url'), stop: () => {} } : await startServer()
  const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM || '/opt/pw-browsers/chromium' })
  const data = (() => {
    try {
      return JSON.parse(readFileSync(DATA, 'utf8'))
    } catch {
      return {}
    }
  })()
  await mkdir(OUT, { recursive: true })
  try {
    for (const shot of SHOTS) {
      if (only && !only.includes(shot.id)) continue
      const context = await browser.newContext({
        viewport: { width: W, height: H },
        deviceScaleFactor: SCALE,
        isMobile: true,
        hasTouch: true,
        colorScheme: 'light',
        locale: 'en-IN',
        timezoneId: 'Asia/Kolkata',
        reducedMotion: 'reduce',
      })
      await context.addInitScript(initScript)
      const page = await context.newPage()
      await page.clock.install({ time: NOW })
      await page.goto(server.url)
      await page.getByTestId('demo-name').fill('Asha')
      await page.getByTestId('demo-start').click()
      await page.getByTestId('home-greeting').waitFor()
      await shot.go(page, server.url)
      // The tab bar is fixed to the bottom of the tall window and would sit over the form.
      await page.addStyleTag({ content: "nav[aria-label='Main'] { display: none !important; }" })
      await settle(page)
      const marks = []
      for (const [step, loc] of Object.entries(shot.marks(page))) {
        const b = await box(loc, { optional: true })
        if (b) marks.push({ step: Number(step), ...b })
        else console.warn(`  ${shot.id}: step ${step} isn't on screen, no marker`)
      }
      // The crop: one element (a sheet), or the band of the page that holds every marked part.
      let crop
      if (shot.within) crop = await box(byId(page, shot.within))
      else {
        // room above the first part for its heading (a sheet's title, a card's label)
        const top = Math.max(0, Math.min(...marks.map((m) => m.y)) - MARGIN * 4)
        const bottom = Math.min(H, Math.max(...marks.map((m) => m.y + m.height)) + MARGIN * 2)
        const grow = Math.max(0, MIN_CROP - (bottom - top))
        const y = Math.max(0, top - grow / 2)
        crop = { x: 0, y, width: W, height: Math.min(H - y, bottom - top + grow) }
      }
      crop = { x: Math.max(0, crop.x), y: Math.max(0, crop.y), width: Math.min(W, crop.width), height: Math.min(H - Math.max(0, crop.y), crop.height) }
      const w = Math.round(crop.width * SAVE)
      const h = Math.round(crop.height * SAVE)
      // The same screen in every theme and accent: only colours change, so the crop and the
      // markers found above fit them all. Set on <html> the way the app does (theme.ts, accent.ts).
      for (const theme of THEMES) {
        for (const a of ACCENT_INKS) {
          await page.evaluate(
            ([dark, id, ink]) => {
              const root = document.documentElement
              root.classList.toggle('dark', dark)
              root.setAttribute('data-accent', id)
              root.setAttribute('data-ink', ink)
            },
            [theme === 'dark', a.id, a.ink],
          )
          await page.waitForTimeout(60)
          const buf = await page.screenshot({ type: 'png', clip: crop, animations: 'disabled' })
          await mkdir(join(OUT, theme, a.id), { recursive: true })
          await writeFile(join(OUT, theme, a.id, `${shot.id}.webp`), await sharp(buf).resize(w, h, { kernel: 'lanczos3' }).webp({ quality: 82 }).toBuffer())
        }
      }
      const f = (n) => Math.round(n * 1000) / 1000
      data[shot.id] = {
        w,
        h,
        marks: marks.map((m) => ({
          step: m.step,
          x: f((m.x - crop.x + m.width / 2) / crop.width),
          y: f((m.y - crop.y + m.height / 2) / crop.height),
          w: f(m.width / crop.width),
          h: f(m.height / crop.height),
        })),
      }
      console.log(`  ${shot.id}: ${w}×${h}, ${marks.length} markers, ${THEMES.length * ACCENT_INKS.length} pictures`)
      await context.close()
    }
  } finally {
    await browser.close()
    server.stop()
  }
  const sorted = Object.fromEntries(
    Object.keys(data)
      .sort()
      .map((k) => [k, data[k]]),
  )
  await writeFile(DATA, `${JSON.stringify(sorted, null, 2)}\n`)
  console.log(`  wrote ${DATA.replace(ROOT, '')}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
