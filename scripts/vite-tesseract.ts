/**
 * Self-hosts the Tesseract.js worker and WASM cores under /tesseract/ so receipt OCR
 * doesn't depend on a CDN and keeps working offline once the files have been cached
 * (see workbox runtimeCaching in vite.config.ts). Dev: served from node_modules.
 * Build: emitted as assets (kept out of the precache: they are big).
 *
 * Only the LSTM cores are shipped (we always use OEM 1), as Emscripten glue (.js) + binary
 * (.wasm) pairs rather than the single-file *.wasm.js builds: the binary is ~1 MB gzip smaller
 * per core and the browser compiles it while it streams, instead of base64-decoding 3.9 MB of
 * JS inside the worker. src/lib/ocr.ts picks the core this device can run and points
 * tesseract.js at the glue file; the glue fetches its .wasm from the worker's directory.
 *
 * The English language data (~2.9 MB) still comes from the jsDelivr CDN on first use;
 * tesseract.js caches it in IndexedDB and the service worker caches the response too.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { Plugin } from 'vite'

const require = createRequire(import.meta.url)

const CORES = ['lstm', 'simd-lstm', 'relaxedsimd-lstm']

function files(): Record<string, string> {
  const tjs = path.dirname(require.resolve('tesseract.js/package.json'))
  const core = path.dirname(require.resolve('tesseract.js-core/package.json'))
  const out: Record<string, string> = { 'worker.min.js': path.join(tjs, 'dist/worker.min.js') }
  for (const c of CORES) {
    for (const ext of ['js', 'wasm']) out[`tesseract-core-${c}.${ext}`] = path.join(core, `tesseract-core-${c}.${ext}`)
  }
  return out
}

export function tesseractAssets(): Plugin {
  return {
    name: 'split-it:tesseract-assets',
    configureServer(server) {
      const map = files()
      server.middlewares.use('/tesseract/', (req, res, next) => {
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0]
        const src = map[name]
        if (!src) return next()
        // application/wasm lets the browser use streaming compilation (what Hosting sends too).
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
        res.end(readFileSync(src))
      })
    },
    generateBundle() {
      for (const [name, src] of Object.entries(files())) {
        this.emitFile({ type: 'asset', fileName: `tesseract/${name}`, source: readFileSync(src) })
      }
    },
  }
}
